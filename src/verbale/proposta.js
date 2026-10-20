// Dal verbale letto alle proposte da confermare: esito e sintesi di ogni punto, cose da fare, nomine di consiglieri
// e amministratore. Funzioni pure, senza rete né DOM: nulla si scrive finché chi rivede non conferma.
import { normalizza } from '../ui/html.js';

// Esito letto → esito da registrare: true approvato, false respinto, null non deliberato o rinviato,
// undefined = il verbale non dice nulla da registrare (punto informativo o esito non indicato).
const ESITI_LETTI = { approvato: true, respinto: false, non_deliberato: null, rinviato: null };
export const esitoDaLettura = (esito) => (esito in ESITI_LETTI ? ESITI_LETTI[esito] : undefined);

// "15/03/2025" o "15.3.2025" → "2025-03-15"; qualunque altra forma ("entro marzo") → null.
export function dataIso(testo) {
  const m = String(testo ?? '').trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!m) return null;
  const [giorno, mese, anno] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const prova = new Date(Date.UTC(anno, mese - 1, giorno));
  if (prova.getUTCMonth() !== mese - 1 || prova.getUTCDate() !== giorno) return null;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

const parole = (testo) => normalizza(testo).split(/[^a-z']+/).filter((p) => p.length >= 3);

// I soggetti il cui nome contiene tutte le parole del nome letto ("Rossi Mario" trova "ROSSI MARIO - BIANCHI ANNA").
export function soggettiPerNome(nome, soggetti) {
  const cercate = parole(nome);
  if (!cercate.length) return [];
  return soggetti.filter((s) => {
    const sue = new Set(parole(s.denominazione));
    return cercate.every((p) => sue.has(p));
  });
}

const testo = (v) => String(v ?? '').trim();
const inCorso = (c, data) => (!c.inizio_mandato || c.inizio_mandato <= data) && (!c.fine_mandato || c.fine_mandato >= data);

// lettura: i dati del verbale (sezione "verbale" della funzione di lettura); assemblea e i suoi punti_odg;
// consiglieri, soggetti, amministratori: le righe del database; utenteId: l'utente che sta rivedendo.
export function proponi({ lettura, assemblea, punti, consiglieri, soggetti, amministratori, utenteId }) {
  const letti = [...(lettura?.punti ?? [])].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  const perOrdine = new Map(punti.map((p) => [p.ordine, p]));
  const proposte = letti.map((l, i) => {
    const ordine = Number.isInteger(l.ordine) && l.ordine > 0 ? l.ordine : i + 1;
    const punto = perOrdine.get(ordine) ?? null;
    const esito = esitoDaLettura(l.esito);
    // una votazione fatta nel portale non si tocca; un esito già registrato a mano si cambia solo se lo si sceglie
    const votato = Boolean(punto?.votato_il);
    return {
      ordine, letto: l, punto, esito, votato,
      aggiornaEsito: esito !== undefined && !votato && !punto?.esito,
      sintesi: testo(l.sintesi),
      todo: (l.cose_da_fare ?? []).filter((c) => testo(c.descrizione)).map((c) => ({
        descrizione: testo(c.descrizione),
        scadenza: dataIso(c.scadenza),
        responsabile: testo(c.responsabile),
        note: [testo(c.scadenza) && !dataIso(c.scadenza) && `Scadenza: ${testo(c.scadenza)}`, testo(c.importo) && `Importo: ${testo(c.importo)}`].filter(Boolean).join(' · '),
        // un punto non approvato non genera cose da fare, a meno che chi rivede non le scelga
        scelto: esito === true,
      })),
    };
  });

  const nomine = letti.flatMap((l) => (l.nomine ?? []).map((n) => ({ ...n, nome: testo(n.nome) }))).filter((n) => n.nome);
  const data = assemblea.data;

  const nominati = nomine.filter((n) => n.ruolo === 'consigliere');
  let consiglio = null;
  if (nominati.length) {
    const scelti = nominati.map((n) => {
      const candidati = soggettiPerNome(n.nome, soggetti);
      const soggettoId = candidati.length === 1 ? candidati[0].id : null;
      const gia = soggettoId ? consiglieri.find((c) => c.soggetto_id === soggettoId && inCorso(c, data)) ?? null : null;
      return { nome: n.nome, note: testo(n.note), candidati: candidati.map((s) => s.id), soggettoId, gia, scelto: true };
    });
    const confermati = new Set(scelti.map((s) => s.soggettoId).filter(Boolean));
    consiglio = {
      nominati: scelti,
      // chi aveva un mandato in corso e non è tra i nominati: si propone di chiuderlo il giorno prima dell'assemblea,
      // tranne per chi sta rivedendo (si toglierebbe l'accesso al portale)
      daChiudere: consiglieri.filter((c) => inCorso(c, data) && !confermati.has(c.soggetto_id)).map((c) => {
        const bloccato = Boolean(utenteId) && c.utente_id === utenteId;
        return { consigliere: c, bloccato, scelto: !bloccato };
      }),
    };
  }

  const nomina = nomine.find((n) => n.ruolo === 'amministratore');
  let amministratore = null;
  if (nomina) {
    const attuale = amministratori.find((a) => (!a.dal || a.dal <= data) && (!a.al || a.al >= data)) ?? null;
    const conferma = Boolean(attuale) && parole(attuale.denominazione).some((p) => parole(nomina.nome).includes(p));
    amministratore = {
      nome: nomina.nome, compenso: testo(nomina.compenso), durata: testo(nomina.durata), note: testo(nomina.note),
      attuale, conferma, scelto: true,
    };
  }

  // un'assemblea non costituita resta in archivio come seduta deserta: non conta per delibere e to-do
  return { seduta: lettura?.costituita === 'no' ? 'deserta' : null, punti: proposte, creaPunti: !punti.length && proposte.length > 0, consiglio, amministratore, altre: nomine.filter((n) => !['consigliere', 'amministratore'].includes(n.ruolo)) };
}

const giornoPrima = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Dalle proposte confermate alle scritture, in ordine. Ogni voce: { tabella, azione: 'inserisci'|'aggiorna', dove?, valori, descrizione }.
// I to-do dei punti da creare si collegano al punto con `ordine` (l'id si conosce solo dopo l'inserimento).
export function pianoScritture(proposta, assemblea) {
  const passi = [];
  const data = assemblea.data;
  if (proposta.seduta && !assemblea.esito_seduta) passi.push({ tabella: 'assemblee', azione: 'aggiorna', dove: { id: assemblea.id }, valori: { esito_seduta: proposta.seduta }, descrizione: 'Seduta segnata come andata deserta' });
  for (const p of proposta.punti) {
    const esito = p.aggiornaEsito && p.esito !== undefined ? { manuale: true, approvato: p.esito } : undefined;
    if (proposta.creaPunti) {
      passi.push({ tabella: 'punti_odg', azione: 'inserisci', valori: { assemblea_id: assemblea.id, ordine: p.ordine, testo: testo(p.letto.titolo) || `Punto ${p.ordine}`, tipo: 'delibera', note: p.sintesi || null, voti_testo: testo(p.letto.voti) || null, ...(esito ? { esito } : {}) }, descrizione: `Punto ${p.ordine}: creato dal verbale` });
    } else if (p.punto && (esito || p.sintesi)) {
      const voti = !p.votato && testo(p.letto.voti) ? { voti_testo: testo(p.letto.voti) } : {};
      passi.push({ tabella: 'punti_odg', azione: 'aggiorna', dove: { id: p.punto.id }, valori: { ...(esito ? { esito } : {}), ...(p.sintesi ? { note: p.sintesi } : {}), ...voti }, descrizione: `Punto ${p.ordine}: ${esito ? 'esito e ' : ''}sintesi della delibera` });
    }
    for (const t of p.todo.filter((x) => x.scelto)) {
      passi.push({ tabella: 'todo', azione: 'inserisci', ordinePunto: p.ordine, valori: { titolo: t.descrizione, descrizione: t.note || null, responsabile: t.responsabile || null, assemblea_id: assemblea.id, punto_id: p.punto?.id ?? null, data_apertura: assemblea.data, scadenza: t.scadenza, stato: 'aperto' }, descrizione: `To-do: ${t.descrizione}` });
    }
  }
  if (proposta.consiglio) {
    for (const n of proposta.consiglio.nominati.filter((x) => x.scelto && x.soggettoId && !x.gia)) {
      passi.push({ tabella: 'consiglieri', azione: 'inserisci', valori: { soggetto_id: n.soggettoId, nominativo: n.nome, inizio_mandato: data, assemblea_nomina_id: assemblea.id }, descrizione: `Nuovo mandato di consigliere: ${n.nome}` });
    }
    for (const c of proposta.consiglio.daChiudere.filter((x) => x.scelto && !x.bloccato)) {
      passi.push({ tabella: 'consiglieri', azione: 'aggiorna', dove: { id: c.consigliere.id }, valori: { fine_mandato: giornoPrima(data) }, descrizione: 'Chiusura di un mandato di consigliere' });
    }
  }
  const a = proposta.amministratore;
  if (a?.scelto && !a.conferma) {
    if (a.attuale && !a.attuale.al) passi.push({ tabella: 'amministratori', azione: 'aggiorna', dove: { id: a.attuale.id }, valori: { al: giornoPrima(data) }, descrizione: `Fine incarico: ${a.attuale.denominazione}` });
    passi.push({ tabella: 'amministratori', azione: 'inserisci', valori: { denominazione: a.nome, dal: data, compenso: a.compenso || null, assemblea_id: assemblea.id, note: [a.durata && `Durata: ${a.durata}`, a.note].filter(Boolean).join(' · ') || null }, descrizione: `Amministratore: ${a.nome}` });
  } else if (a?.scelto && a.conferma && a.compenso) {
    passi.push({ tabella: 'amministratori', azione: 'aggiorna', dove: { id: a.attuale.id }, valori: { compenso: a.compenso }, descrizione: `Conferma di ${a.attuale.denominazione}: compenso aggiornato` });
  }
  return passi;
}
