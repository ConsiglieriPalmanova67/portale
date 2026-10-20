// Pagina di un'estrazione (#/estrazione/<id>): conduce le fasi una dopo l'altra, secondo lo stato salvato.
//   indice    → il lettore propone la mappa delle sezioni, che si può correggere (mappa.js)
//   lettura   → i blocchi si leggono a pochi per volta (avanzamento.js)
//   revisione → controlli, celle modificabili, pagina del PDF accanto, importazione (revisione.js)
// Tutto lo stato sta nel deposito: uscendo e rientrando si riprende da dove si era.
// `ctx` è ciò che le fasi condividono: { stato, deposito, estrazione, documento, righe, attiva(), ridisegna(),
//   lettore() → il lettore vero o finto, file() → il PDF come Blob, aperto() → il PDF aperto dal lettore, salva(valori) }
import { deposito, inProva, caricaDati } from '../../dati/client.js';
import { ARCHIVIO_DOCUMENTI } from '../../dati/documenti.js';
import { costruisciModello } from '../../dati/modello.js';
import { esc } from '../../ui/html.js';
import { conferma } from '../assemblea/comuni.js';
import { tokenUsati } from '../../estrazione/lettura.js';
import { TIPI_ESTRAZIONE, STATI_ESTRAZIONE, aperta } from './avvio.js';
import { faseMappa } from './mappa.js';
import { faseLettura } from './avanzamento.js';
import { faseRevisione } from './revisione.js';

const numeri = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });
// In modalità prova il lettore finto ricorda quale blocco ha già fatto fallire: deve restare lo stesso finché la pagina è aperta.
const lettoriProva = new Map();
// L'estrazione appena avviata dalla pagina Documenti: solo per quella l'indice parte da solo.
let appenaAvviata = null;
export const segnaAvvio = (id) => { appenaAvviata = id; };

async function creaLettore(stato, estrazione) {
  if (inProva) {
    if (!lettoriProva.has(estrazione.id)) {
      const { creaLettoreProva } = await import('../../estrazione/lettore-prova.js');
      lettoriProva.set(estrazione.id, creaLettoreProva(stato.dati, { anno: estrazione.anno, oggi: stato.oggi }));
    }
    return lettoriProva.get(estrazione.id);
  }
  const [{ creaLettoreVero }, { supabase }] = await Promise.all([import('../../estrazione/lettore.js'), import('../../dati/deposito.js')]);
  return creaLettoreVero(supabase);
}

export async function estrazione(stato, contenitore, id) {
  let attiva = true;
  const uscite = [];
  stato.allUscita = () => {
    attiva = false;
    for (const f of uscite) f();
  };
  contenitore.innerHTML = `<div id="est-pagina" class="estrazione">
    <p><a href="#/documenti">← Documenti</a></p>
    <header class="testata" id="est-testata"><h1>Estrazione dei dati</h1></header>
    <div id="est-errore" class="avviso grave" role="alert" hidden></div>
    <div id="est-fase"><p class="nota">Caricamento…</p></div>
  </div>`;
  const $ = (selettore) => contenitore.querySelector(selettore);
  const errore = (testo, riprova) => {
    if (!attiva) return;
    $('#est-errore').innerHTML = `<span>${esc(testo)}</span> ${riprova ? '<button type="button" data-fai="riprova">Riprova</button>' : ''} <button type="button" class="secondario" data-fai="chiudi">Chiudi</button>`;
    $('#est-errore').hidden = false;
    $('#est-errore').onclick = (evento) => {
      if (!evento.target.dataset.fai) return;
      $('#est-errore').hidden = true;
      if (evento.target.dataset.fai === 'riprova') riprova();
    };
    $('#est-errore').scrollIntoView({ block: 'nearest' });
  };

  const cache = {};
  const unaVolta = (nome, crea) => () => (cache[nome] ??= crea().catch((e) => {
    delete cache[nome];
    throw e;
  }));
  const ctx = {
    stato, deposito, estrazione: null, documento: null, righe: [],
    attiva: () => attiva,
    allUscita: (f) => uscite.push(f),
    errore,
    lettore: unaVolta('lettore', () => creaLettore(stato, ctx.estrazione)),
    file: unaVolta('file', async () => {
      const risposta = await fetch(await deposito.urlFile(ARCHIVIO_DOCUMENTI, ctx.documento.file_path));
      if (!risposta.ok) throw new Error('il file del documento non si scarica dall\'archivio.');
      return risposta.blob();
    }),
    aperto: unaVolta('aperto', async () => (await ctx.lettore()).apri(await ctx.file())),
    // aggiorna la riga dell'estrazione nel deposito e nella pagina
    async salva(valori) {
      const [salvata] = await deposito.aggiorna('estrazioni', { id }, valori);
      Object.assign(ctx.estrazione, salvata ?? valori);
      disegnaTestata();
    },
    async rileggiRighe() {
      ctx.righe = (await deposito.leggi('estrazioni_blocchi', { estrazione_id: id })).sort((a, b) => a.pagina_da - b.pagina_da);
      disegnaTestata();
      return ctx.righe;
    },
    // dopo un'importazione la contabilità caricata all'ingresso non è più aggiornata
    async aggiornaDati() {
      stato.dati = await caricaDati();
      stato.modello = costruisciModello(stato.dati, stato.oggi);
    },
    ridisegna: () => disegna(),
    disegnaTestata: () => disegnaTestata(),
  };

  function disegnaTestata() {
    if (!attiva || !ctx.estrazione) return;
    const e = ctx.estrazione;
    const token = tokenUsati(e, ctx.righe);
    $('#est-testata').innerHTML = `
      <h1>Estrazione dei dati</h1>
      <p><strong>${esc(ctx.documento?.titolo ?? 'Documento non più in archivio')}</strong> — ${esc(TIPI_ESTRAZIONE[e.tipo] ?? e.tipo)}, esercizio ${esc(e.anno)}
        <span class="etichetta ${e.stato === 'importata' ? 'stato-presente' : e.stato === 'annullata' ? 'stato-respinto' : 'stato-avviso'}">${esc(STATI_ESTRAZIONE[e.stato] ?? e.stato)}</span></p>
      <p class="nota">Token usati finora: <strong>${numeri.format(token.ingresso)}</strong> in ingresso, <strong>${numeri.format(token.uscita)}</strong> in uscita${e.modello ? ` — lettore: ${esc(e.modello)}` : ''}.
        ${aperta(e) ? '<button type="button" class="secondario pericolo" id="est-annulla">Annulla l\'estrazione</button>' : ''}</p>`;
    $('#est-annulla')?.addEventListener('click', async () => {
      if (!(await conferma('Annullare questa estrazione? I dati letti finora restano da parte ma non si potranno più importare; per rileggere il documento se ne avvia una nuova (con un nuovo costo). Nulla cambia nella contabilità.', 'Annulla l\'estrazione'))) return;
      try {
        for (const f of uscite) f();
        await ctx.salva({ stato: 'annullata' });
        disegna();
      } catch (e2) {
        errore(`L'estrazione non è stata annullata: ${e2.message}`);
      }
    });
  }

  // La prima fase: far leggere l'indice. Parte da sola solo subito dopo l'avvio; se la pagina viene riaperta
  // con l'indice ancora da fare (lettura interrotta) si chiede di nuovo, perché è una chiamata a pagamento.
  function faseIndice(zona) {
    const avvia = async () => {
      zona.innerHTML = '<p class="avviso" role="status" id="est-indice">Lettura dell\'indice del documento: il lettore cerca le sezioni e le loro pagine…</p>';
      try {
        const lettore = await ctx.lettore();
        const documento = await ctx.aperto();
        const risposta = await lettore.indice(documento, (fatti, totale) => {
          if (attiva && totale > 1 && $('#est-indice')) $('#est-indice').textContent = `Lettura dell'indice del documento: parte ${fatti + 1} di ${totale} (il documento è pesante e si legge a pezzi)…`;
        });
        await ctx.salva({
          mappa: risposta.dati.sezioni, pagine: documento.pagine, modello: risposta.modello,
          token_ingresso: (ctx.estrazione.token_ingresso ?? 0) + risposta.token_ingresso, token_uscita: (ctx.estrazione.token_uscita ?? 0) + risposta.token_uscita,
          correzioni: { ...(ctx.estrazione.correzioni ?? {}), noteIndice: [risposta.dati.esercizio ? `Esercizio stampato: ${risposta.dati.esercizio}.` : '', risposta.dati.note].filter(Boolean).join(' ') },
        });
        if (attiva) disegna();
      } catch (e) {
        if (!attiva) return;
        zona.innerHTML = '<p class="avviso">L\'indice non è stato letto. <button type="button" id="est-leggi-indice">Leggi l\'indice</button></p>';
        $('#est-leggi-indice').addEventListener('click', avvia);
        errore(`Lettura dell'indice non riuscita: ${e.message}`);
      }
    };
    if (appenaAvviata === id) {
      appenaAvviata = null;
      avvia();
      return;
    }
    zona.innerHTML = `<p class="avviso">L'indice del documento non è ancora stato letto (la lettura è stata interrotta).
      <button type="button" id="est-leggi-indice">Leggi l'indice</button></p>`;
    $('#est-leggi-indice').addEventListener('click', avvia);
  }

  function disegna() {
    if (!attiva) return;
    disegnaTestata();
    const zona = $('#est-fase');
    // ogni fase mette i suoi gestori sulla zona: quelli della fase precedente non devono restare
    Object.assign(zona, { onclick: null, onchange: null, onkeydown: null });
    const e = ctx.estrazione;
    if (!ctx.documento) zona.innerHTML = '<p class="avviso grave">Il documento di questa estrazione non è più in archivio.</p>';
    else if (e.stato === 'annullata') zona.innerHTML = '<p class="avviso">Questa estrazione è stata annullata: nulla è stato importato. Per rileggere il documento avviane una nuova dalla pagina <a href="#/documenti">Documenti</a>.</p>';
    else if (e.stato === 'indice' && !e.mappa) faseIndice(zona);
    else if (e.stato === 'indice') faseMappa(ctx, zona);
    else if (e.stato === 'lettura') faseLettura(ctx, zona);
    else faseRevisione(ctx, zona);
  }

  try {
    const [[trovata], righe] = await Promise.all([deposito.leggi('estrazioni', { id }), deposito.leggi('estrazioni_blocchi', { estrazione_id: id })]);
    if (!attiva) return;
    if (!trovata) {
      $('#est-fase').innerHTML = '<p class="avviso">Estrazione non trovata.</p>';
      return;
    }
    const [documento] = await deposito.leggi('documenti', { id: trovata.documento_id });
    if (!attiva) return;
    Object.assign(ctx, { estrazione: trovata, documento: documento ?? null, righe: righe.sort((a, b) => a.pagina_da - b.pagina_da) });
    disegna();
  } catch (e) {
    errore(`Non è stato possibile leggere l'estrazione: ${e.message}`, () => estrazione(stato, contenitore, id));
  }
}
