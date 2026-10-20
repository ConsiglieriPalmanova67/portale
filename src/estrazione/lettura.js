// Conduce la lettura dei blocchi di un'estrazione: poche chiamate insieme, una riprova automatica sugli errori
// temporanei, e ogni blocco salvato nel deposito appena arriva. Così un'estrazione interrotta (anche chiudendo
// la pagina) riprende da dove era: i blocchi già fatti non si rileggono.
// Non sa come si legge un blocco: glielo dice il `lettore` (vero o finto), che ha
//   blocco(documento, blocco) → { dati, token_ingresso, token_uscita, modello }
// e segnala gli errori con ErroreLettura (temporaneo = vale la pena riprovare).
import { allineaBlocchi, chiaveBlocco, dividiBlocco } from './blocchi.js';

export const IN_PARALLELO = 3;
const ATTESA_RIPROVA = 2000;

export class ErroreLettura extends Error {
  constructor(messaggio, temporaneo = false) {
    super(messaggio);
    this.temporaneo = temporaneo;
  }
}

// Porta i blocchi dell'estrazione a corrispondere alla mappa: crea quelli che mancano, azzera quelli il cui
// intervallo è cambiato, toglie quelli che non servono più. → i blocchi, in ordine di pagina.
export async function preparaBlocchi(deposito, estrazioneId, mappa) {
  const esistenti = await deposito.leggi('estrazioni_blocchi', { estrazione_id: estrazioneId });
  const { daCreare, daRifare, daTogliere } = allineaBlocchi(mappa, esistenti);
  for (const b of daTogliere) await deposito.elimina('estrazioni_blocchi', { id: b.id });
  for (const b of daRifare) {
    await deposito.aggiorna('estrazioni_blocchi', { estrazione_id: estrazioneId, sezione: b.sezione, pagina_da: b.pagina_da },
      { pagina_a: b.pagina_a, parte: b.parte, stato: 'in_attesa', dati: null, errore: null });
  }
  if (daCreare.length) await deposito.inserisci('estrazioni_blocchi', daCreare.map(({ contesto, ...b }) => ({ ...b, estrazione_id: estrazioneId, stato: 'in_attesa' })));
  return (await deposito.leggi('estrazioni_blocchi', { estrazione_id: estrazioneId })).sort((a, b) => a.pagina_da - b.pagina_da);
}

// Divide un blocco di più pagine in blocchi di una pagina, tutti da leggere: serve quando la lettura del blocco
// intero supera il tempo massimo di una chiamata. I token già spesi restano in conto sul primo.
export async function dividiRiga(deposito, riga) {
  const [primo, ...altri] = dividiBlocco(riga);
  if (!altri.length) return;
  await deposito.aggiorna('estrazioni_blocchi', { id: riga.id }, { pagina_a: primo.pagina_a, stato: 'in_attesa', dati: null, errore: null });
  await deposito.inserisci('estrazioni_blocchi', altri.map((b) => ({ ...b, estrazione_id: riga.estrazione_id, stato: 'in_attesa' })));
}

// Legge i blocchi non ancora fatti (o solo quelli in `soloQuesti`, anche se già fatti: è la rilettura).
//   blocchi: come li dà blocchiDaRighe (servono `contesto` e le pagine); righe: le righe di estrazioni_blocchi
//   aggiorna(riga): chiamata a ogni cambio di stato di un blocco; fermati(): true per non cominciarne altri
// → { fatti, falliti, interrotta }
export async function leggiBlocchi({ lettore, documento, deposito, blocchi, righe, soloQuesti = null, aggiorna = () => {}, fermati = () => false, inParallelo = IN_PARALLELO, attesa = ATTESA_RIPROVA }) {
  const rigaDi = new Map(righe.map((r) => [chiaveBlocco(r), r]));
  const coda = blocchi.filter((b) => (soloQuesti ? soloQuesti.includes(chiaveBlocco(b)) : rigaDi.get(chiaveBlocco(b))?.stato !== 'fatto'));
  const esito = { fatti: 0, falliti: 0, interrotta: false };

  const salva = async (riga, valori) => {
    const [salvata] = await deposito.aggiorna('estrazioni_blocchi', { id: riga.id }, valori);
    Object.assign(riga, salvata ?? valori);
    aggiorna(riga);
  };

  async function leggiUno(blocco) {
    const riga = rigaDi.get(chiaveBlocco(blocco));
    await salva(riga, { stato: 'in_corso', errore: null, tentativi: (riga.tentativi ?? 0) + 1 });
    let risposta;
    try {
      try {
        risposta = await lettore.blocco(documento, blocco);
      } catch (errore) {
        if (!errore.temporaneo) throw errore;
        // una riprova sola, dopo una pausa: di più si lascia decidere a chi sta guardando
        await new Promise((risolvi) => { setTimeout(risolvi, attesa); });
        await salva(riga, { tentativi: riga.tentativi + 1 });
        risposta = await lettore.blocco(documento, blocco);
      }
    } catch (errore) {
      esito.falliti += 1;
      await salva(riga, { stato: 'errore', errore: errore.message || 'errore sconosciuto' });
      return;
    }
    esito.fatti += 1;
    // i token si sommano a quelli delle letture precedenti dello stesso blocco: il costo resta tutto in conto
    await salva(riga, {
      stato: 'fatto', dati: risposta.dati, errore: null,
      token_ingresso: (riga.token_ingresso ?? 0) + (risposta.token_ingresso ?? 0), token_uscita: (riga.token_uscita ?? 0) + (risposta.token_uscita ?? 0),
    });
  }

  let prossimo = 0;
  async function operaio() {
    while (prossimo < coda.length) {
      if (fermati()) {
        esito.interrotta = true;
        return;
      }
      const blocco = coda[prossimo];
      prossimo += 1;
      await leggiUno(blocco);
    }
  }
  await Promise.all(Array.from({ length: Math.min(inParallelo, coda.length) }, operaio));
  return esito;
}

// Token spesi da un'estrazione: quelli dell'indice (sulla riga dell'estrazione) più quelli di tutti i blocchi.
export function tokenUsati(estrazione, righe) {
  const somma = (campo) => Number(estrazione?.[campo] ?? 0) + righe.reduce((s, r) => s + Number(r[campo] ?? 0), 0);
  return { ingresso: somma('token_ingresso'), uscita: somma('token_uscita') };
}
