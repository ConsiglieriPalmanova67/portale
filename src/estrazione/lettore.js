// Il lettore vero: nel browser divide il PDF nelle pagine che servono (con pdf-lib, caricata dalla rete solo
// quando serve) e le manda alla Edge Function `estrai`, che le fa leggere a Claude. La chiave dell'API sta
// solo nella funzione; qui si usa la sessione dell'utente. In modalità prova questo file non viene caricato.
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { unisciIndici } from './blocchi.js';
import { ErroreLettura } from './lettura.js';

const PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.esm.min.js';
const FUNZIONE = `${SUPABASE_URL}/functions/v1/estrai`;
// Per l'indice un documento pesante si manda a pezzi di circa questa dimensione: una richiesta sola sarebbe
// troppo grande per la funzione. I pezzi si leggono uno dopo l'altro e le mappe si riuniscono.
const PESO_PEZZO = 4 * 1024 * 1024;

let libreria = null;
async function pdfLib() {
  if (!libreria) {
    try {
      libreria = await import(PDFLIB);
    } catch {
      throw new ErroreLettura('Non è stato possibile caricare lo strumento che divide i PDF: controlla la connessione e riprova.', true);
    }
  }
  return libreria;
}

// Byte → base64, a pezzi (una stringa sola farebbe traboccare la pila con i file grandi).
function inBase64(byte) {
  let binario = '';
  for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(binario);
}

export function creaLettoreVero(supabase) {
  async function chiama(corpo) {
    const { data } = await supabase.auth.getSession();
    const gettone = data.session?.access_token;
    if (!gettone) throw new ErroreLettura('La sessione è scaduta: esci dal portale e rientra.');
    let risposta;
    try {
      risposta = await fetch(FUNZIONE, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gettone}`, apikey: SUPABASE_KEY }, body: JSON.stringify(corpo),
      });
    } catch {
      throw new ErroreLettura('Connessione assente o servizio di lettura non raggiungibile.', true);
    }
    let esito = null;
    try {
      esito = await risposta.json();
    } catch { /* la funzione risponde sempre in JSON: se non lo è, l'errore viene da più a monte */ }
    if (!risposta.ok) {
      const scaduta = risposta.status === 504 || risposta.status === 546;
      // il tempo massimo lo fa scattare la piattaforma, con un messaggio suo in inglese: qui vale il nostro
      const testo = esito?.errore ?? (scaduta ? 'La lettura ha superato il tempo massimo di una chiamata (150 secondi): il blocco ha troppi dati. Dividilo in pagine singole con «Dividi in pagine».' : null)
        ?? esito?.message ?? esito?.msg
        ?? (risposta.status === 404 ? 'La funzione di lettura non è ancora pubblicata sul progetto.'
            : risposta.status === 413 ? 'Le pagine inviate sono troppo pesanti per una sola richiesta.' : `Errore ${risposta.status} dal servizio di lettura.`);
      throw new ErroreLettura(testo, esito?.temporaneo ?? (risposta.status >= 500 && !scaduta));
    }
    if (!esito || typeof esito.dati !== 'object') throw new ErroreLettura('Il servizio di lettura ha dato una risposta vuota.', true);
    return esito;
  }

  return {
    finto: false,

    // `file` è un File o un Blob con il PDF intero. → { pagine, peso, estrai(numeri di pagina) → Uint8Array }
    async apri(file) {
      const { PDFDocument } = await pdfLib();
      let origine;
      try {
        origine = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      } catch {
        throw new ErroreLettura('Il file non è un PDF leggibile.');
      }
      return {
        pagine: origine.getPageCount(), peso: file.size,
        async estrai(numeri) {
          const nuovo = await PDFDocument.create();
          const copiate = await nuovo.copyPages(origine, numeri.map((n) => n - 1));
          for (const pagina of copiate) nuovo.addPage(pagina);
          return nuovo.save();
        },
      };
    },

    // La mappa delle sezioni. `avanza(fatti, totale)` segue i pezzi di un documento pesante.
    async indice(documento, avanza = () => {}) {
      const pezzi = Math.max(1, Math.ceil(documento.peso / PESO_PEZZO));
      const passo = Math.ceil(documento.pagine / pezzi);
      const risposte = [];
      for (let da = 1; da <= documento.pagine; da += passo) {
        avanza(risposte.length, Math.ceil(documento.pagine / passo));
        const pagine = Array.from({ length: Math.min(passo, documento.pagine - da + 1) }, (_, i) => da + i);
        risposte.push(await chiama({ azione: 'indice', pdf: inBase64(await documento.estrai(pagine)), pagine }));
      }
      const somma = (campo) => risposte.reduce((s, r) => s + (r[campo] ?? 0), 0);
      return {
        dati: {
          sezioni: unisciIndici(risposte.map((r) => r.dati)), esercizio: risposte.map((r) => r.dati.esercizio).find(Boolean) ?? '',
          note: risposte.map((r) => r.dati.note).filter(Boolean).join(' '),
        },
        token_ingresso: somma('token_ingresso'), token_uscita: somma('token_uscita'), modello: risposte[0]?.modello ?? null,
      };
    },

    // Un verbale: poche pagine, lette tutte insieme.
    async verbale(documento) {
      const pagine = Array.from({ length: documento.pagine }, (_, i) => i + 1);
      return chiama({ azione: 'blocco', sezione: 'verbale', pagine, pdf: inBase64(await documento.estrai(pagine)) });
    },

    // Un blocco: le sue pagine, precedute dall'eventuale pagina di contesto.
    async blocco(documento, b) {
      const pagine = [...(b.contesto ? [b.contesto] : []), ...Array.from({ length: b.pagina_a - b.pagina_da + 1 }, (_, i) => b.pagina_da + i)];
      return chiama({ azione: 'blocco', sezione: b.sezione, parte: b.parte ?? null, contesto: b.contesto ?? null, pagine, pdf: inBase64(await documento.estrai(pagine)) });
    },
  };
}
