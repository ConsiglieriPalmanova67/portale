// Fatti del verbale: dal contesto della seduta (il `ctx` descritto in testa a src/pagine/assemblea/dettaglio.js) e dai
// pochi campi scritti a mano, i dati già formattati (date «20/10/2026», ore «21:05», millesimi come nel Report) che
// componi.js trasforma nel testo del verbale secondo docs/verbale-modello.md. Funzioni pure, senza rete né DOM.
// I conteggi sono quelli del Report (src/pagine/assemblea/report.js): stesse funzioni, stessi dati.
//
// Forma dei fatti (stringhe vuote dove il portale non ha il dato, mai undefined):
//   condominio, titolo, tipo ('ordinaria'), convocazione ('prima' | 'seconda')
//   avviso { data, convocante }      primaConvocazione { data, ora, luogo, termineRispettato } solo in seconda, altrimenti null
//   seduta { data, ora, luogo, apertura, appello, chiusura }      presidente, segretario
//   ordineDelGiorno [{ numero, testo }]
//   appello null (non registrato) | { ora, tabella, aventiDiritto, diPersona, perDelega, presenti: { teste, millesimi },
//     elenco: [{ nominativo, unita, millesimi, delega: null | { delegato, esterno }, ora }] }
//   quorumRaggiunto true | false | null (appello non registrato)
//   movimenti [{ momento, ora, verso: 'entra' | 'esce', nominativo, unita, millesimi, delegato }] dopo l'appello, in ordine di tempo (fotografie della sala)
//   punti [{ id, numero, testo, informativo, candidati, sintesi, dichiarazioni, delibera, variazioni, variazioniDa, votazione }]
//     variazioni = i movimenti avvenuti dopo il voto precedente e prima del voto di questo punto
//     votazione null (non votato) | { chiusa, ora, tabella, tabellaParticolare, aventiDiritto, presenti,
//       favorevoli, contrari, astenuti, mancanti: { teste, millesimi, nominativi: [{ nominativo, unita, millesimi }] },
//       assenti: { teste, millesimi, elenco: [{ nominativo, unita, millesimi, orari }] },
//       maggioranza (etichetta), frazione ('1/3' | null), soglia (millesimi | null), unanimita (null | 'tutti' | 'intervenuti'),
//       norma, approvato, unanime, mancaMaggioranzaTeste, sottoSoglia, favorevoliSuperanoContrari, daVerificareContrari }
//   movimentiFinali   i movimenti dopo l'ultimo voto chiuso (tutti, se nessun voto è chiuso)
//   chiusura { ora, teste, millesimi }      allegati [{ numero, chiave, descrizione }]
import { statoSeduta } from '../assemblea/seduta.js';
import { MAGGIORANZE } from '../calcolo/maggioranze.js';
import { controllaPunto } from '../calcolo/regole-voto.js';
import { daInteri } from '../calcolo/numeri.js';
import { millesimi, data, ora, normalizza } from '../ui/html.js';
import { CONDOMINIO, TIPI, titoloAssemblea, statoDelPunto, orariAssente, oraBreve } from '../pagine/assemblea/comuni.js';

// Norma da citare quando nessuna regola del catalogo riguarda il punto: senza comma, per non scriverne uno sbagliato.
const NORMA_GENERALE = 'art. 1136 c.c.';

const peso = (interi) => millesimi(daInteri(interi));
const tempo = (iso) => (iso ? Date.parse(iso) : null);
const comeTesto = (valore) => (typeof valore === 'string' ? valore : '');
const oggetto = (valore) => Boolean(valore) && typeof valore === 'object' && !Array.isArray(valore);

export const campiVuoti = () => ({ presidente: '', segretario: '', convocante: '', allegati: '', punti: {} });

// I campi salvati (testo JSON di bozze_verbale). Qualunque cosa non valida diventa vuota: la bozza si apre comunque.
export function leggiCampi(testoJson) {
  let grezzi;
  try {
    grezzi = JSON.parse(testoJson);
  } catch {
    return campiVuoti();
  }
  if (!oggetto(grezzi)) return campiVuoti();
  const punti = {};
  for (const [id, p] of Object.entries(oggetto(grezzi.punti) ? grezzi.punti : {})) {
    if (oggetto(p)) punti[id] = { sintesi: comeTesto(p.sintesi), dichiarazioni: comeTesto(p.dichiarazioni), delibera: comeTesto(p.delibera) };
  }
  return {
    presidente: comeTesto(grezzi.presidente), segretario: comeTesto(grezzi.segretario),
    convocante: comeTesto(grezzi.convocante), allegati: comeTesto(grezzi.allegati), punti,
  };
}

// «Varie ed eventuali»: mai delibere, solo comunicazioni (modello, 3.4 E e 5.8).
export const puntoInformativo = (punto) => /varie ed eventuali/.test(normalizza(punto.testo));

const persona = (ctx, testa, interi) => ({ nominativo: testa.etichetta, unita: ctx.unitaDi(testa), millesimi: peso(interi) });
const somma = (elenco) => elenco.reduce((s, x) => s + x.peso, 0);

// L'appello è la sala com'era all'ora registrata con «Registra appello», come nel quorum del Report.
function appello(ctx) {
  const a = ctx.assemblea;
  if (!a.ora_appello) return { appello: null, quorumRaggiunto: null };
  const { righe, quorum } = fotografia(ctx, a.ora_appello);
  const conta = (elenco) => ({ teste: elenco.length, millesimi: peso(somma(elenco)) });
  const diPersona = righe.filter((r) => r.stato === 'presente');
  const perDelega = righe.filter((r) => r.stato === 'delega');
  const elenco = righe.filter((r) => r.stato !== 'assente').map((r) => ({
    ...persona(ctx, r.testa, r.peso),
    delega: r.stato === 'delega' ? { delegato: r.delegato.nome || 'delegato non indicato', esterno: !r.delegato.testa } : null,
    ora: ora(r.stato === 'delega' ? r.delegato.delega.ora_registrazione : r.oraIngresso),
  }));
  return {
    appello: {
      ora: ora(a.ora_appello), tabella: ctx.stato.modello.tabellaProprieta?.nome ?? '',
      aventiDiritto: { teste: quorum.testeTotali, millesimi: peso(quorum.pesoTotale) },
      diPersona: conta(diPersona), perDelega: conta(perDelega),
      presenti: { teste: quorum.testePresenti, millesimi: peso(quorum.pesoPresente) },
      elenco,
    },
    quorumRaggiunto: quorum.raggiunto,
  };
}

// Com'era la sala in un momento: la stessa funzione del quorum (seduta.js), con `adesso` = quel momento.
const fotografia = (ctx, adesso) => statoSeduta({
  assemblea: ctx.assemblea, teste: ctx.teste, presenze: ctx.presenze, deleghe: ctx.deleghe,
  millesimi: ctx.stato.dati.millesimi, tabellaProprietaId: ctx.stato.modello.tabellaProprieta?.id, adesso,
});
const inSala = (r) => r.stato !== 'assente';

// Ingressi e uscite dopo l'appello: a ogni momento registrato (ingresso, uscita, delega) si fotografa la sala e si
// elencano le teste che entrano o escono rispetto alla fotografia precedente. Così chi entra o esce con il suo
// delegato c'è, e una delega non valida (delegato non in sala) o in conflitto (delegante presente) non compare.
// Nello stesso momento il delegato viene prima dei suoi deleganti.
function movimenti(ctx) {
  const dopo = tempo(ctx.assemblea.ora_appello);
  if (dopo === null) return [];
  const momenti = [...new Set([
    ...ctx.presenze.flatMap((p) => [p.ora_ingresso, p.ora_uscita]),
    ...ctx.deleghe.map((d) => d.ora_registrazione),
  ].filter((iso) => iso && tempo(iso) > dopo))].sort((x, y) => tempo(x) - tempo(y));
  let prima = new Map(fotografia(ctx, ctx.assemblea.ora_appello).righe.map((r) => [r.testa.id, r]));
  const elenco = [];
  for (const momento of momenti) {
    const adesso = new Map(fotografia(ctx, momento).righe.map((r) => [r.testa.id, r]));
    const cambi = [];
    for (const [id, r] of adesso) {
      const prec = prima.get(id);
      if (!prec || inSala(prec) === inSala(r)) continue;
      // per chi entra conta la delega di adesso, per chi esce quella che aveva
      const via = inSala(r) ? r : prec;
      const delegato = via.stato === 'delega' ? via.delegato.nome || 'delegato non indicato' : null;
      cambi.push({ momento, ora: ora(momento), verso: inSala(r) ? 'entra' : 'esce', ...persona(ctx, r.testa, r.peso), delegato });
    }
    cambi.sort((x, y) => (x.delegato ? 1 : 0) - (y.delegato ? 1 : 0) || x.nominativo.localeCompare(y.nominativo, 'it'));
    elenco.push(...cambi);
    prima = adesso;
  }
  return elenco;
}

function votazione(ctx, punto) {
  const stato = statoDelPunto(ctx, punto);
  const { esito } = stato;
  // come nel Report: senza tabella o maggioranza, o senza voti e senza chiusura, il punto non è stato votato
  if (!esito || (!punto.votato_il && !stato.votanti.some((v) => v.voto))) return null;
  const gruppo = (voto, conteggio) => ({
    teste: conteggio.teste, millesimi: peso(conteggio.peso),
    nominativi: stato.votanti.filter((v) => v.voto === voto).map((v) => persona(ctx, v.testa, v.peso)),
  });
  const regola = MAGGIORANZE[punto.maggioranza];
  const quota = regola.quota;
  const tabellaProprietaId = ctx.stato.modello.tabellaProprieta?.id;
  const { favorevoli, contrari, presenti } = esito;
  // la norma della regola solo se il punto la rispetta (maggioranza e tabella giuste); altrimenti quella generale
  const controllo = controllaPunto(punto, { tabellaProprietaId });
  return {
    chiusa: Boolean(punto.votato_il),
    ora: ora(punto.votato_il),
    tabella: ctx.stato.modello.tabelle.find((t) => t.id === punto.tabella_id)?.nome ?? '',
    tabellaParticolare: punto.tabella_id !== tabellaProprietaId,
    aventiDiritto: stato.votanti.length + stato.assenti.length,
    presenti: { teste: presenti.teste, millesimi: peso(presenti.peso) },
    favorevoli: gruppo('favorevole', favorevoli),
    contrari: gruppo('contrario', contrari),
    astenuti: gruppo('astenuto', esito.astenuti),
    mancanti: gruppo(null, esito.nonEspressi),
    assenti: {
      teste: stato.assenti.length, millesimi: peso(somma(stato.assenti)),
      elenco: stato.assenti.map((x) => ({ ...persona(ctx, x.testa, x.peso), orari: orariAssente(ctx, x.testa.id) })),
    },
    maggioranza: regola.etichetta,
    frazione: quota ? `${quota[0]}/${quota[1]}` : null,
    // la soglia in millesimi, arrotondata in su come nella barra del quorum
    soglia: quota ? peso(Math.ceil((quota[0] * esito.pesoTotale) / quota[1])) : null,
    unanimita: quota ? null : regola.soloPresenti ? 'intervenuti' : 'tutti',
    norma: controllo.regola && !controllo.problemi.length ? controllo.regola.riferimento : NORMA_GENERALE,
    approvato: esito.approvato,
    unanime: esito.approvato && presenti.teste > 0 && favorevoli.teste === presenti.teste,
    mancaMaggioranzaTeste: !(2 * favorevoli.teste > presenti.teste),
    sottoSoglia: quota ? quota[1] * favorevoli.peso < quota[0] * esito.pesoTotale : false,
    favorevoliSuperanoContrari: favorevoli.peso > contrari.peso,
    // seconda convocazione con la soglia di 1/3: il portale approva, ma per il modello (Cass. 13856/2026) i millesimi
    // dei favorevoli devono superare quelli dei contrari. Non si cambia l'esito: si chiede di verificarlo.
    daVerificareContrari: ctx.assemblea.convocazione === 'seconda' && punto.maggioranza === 'terzo' && esito.approvato && !(favorevoli.peso > contrari.peso),
  };
}

// Ogni movimento va nel punto il cui voto (chiuso) lo segue; quelli dopo l'ultimo voto restano per la chiusura.
// variazioniDa: le variazioni del primo voto partono dall'appello, quelle degli altri dal voto precedente.
function distribuisci(punti, elenco) {
  const votati = punti.filter((p) => p.votazione?.chiusa).sort((x, y) => x.momento - y.momento);
  votati.forEach((p, i) => { p.variazioniDa = i ? 'votazione' : 'appello'; });
  const finali = [];
  for (const m of elenco) {
    const punto = votati.find((p) => tempo(m.momento) <= p.momento);
    if (punto) punto.variazioni.push(m);
    else finali.push(m);
  }
  return finali;
}

// Seconda convocazione in giorno diverso dalla prima e non oltre dieci giorni da essa (art. 1136, terzo comma, c.c.;
// art. 66, quarto comma, disp. att.): true o false se le due date sono note, altrimenti null.
function termineSeconda(a) {
  const [prima, seconda] = [Date.parse(`${a.prima_data}T00:00:00Z`), Date.parse(`${a.data}T00:00:00Z`)];
  if (!a.prima_data || !a.data || Number.isNaN(prima) || Number.isNaN(seconda)) return null;
  const giorni = (seconda - prima) / 86400000;
  return giorni >= 1 && giorni <= 10;
}

export function fattiVerbale(ctx, campi = campiVuoti()) {
  const a = ctx.assemblea;
  const seconda = a.convocazione === 'seconda';
  const scritti = campi.punti ?? {};
  const tutti = movimenti(ctx);
  const punti = ctx.punti.map((p, i) => {
    const informativo = puntoInformativo(p);
    const mano = scritti[p.id] ?? {};
    return {
      id: p.id, numero: i + 1, testo: p.testo, informativo,
      candidati: p.tipo === 'nomina_consiglieri' ? (p.candidati ?? []).map((c) => {
        const nome = ctx.stato.modello.soggetti.get(c.soggetto_id)?.denominazione ?? '?';
        return c.parte_rappresentata ? `${nome} (${c.parte_rappresentata})` : nome;
      }) : [],
      sintesi: comeTesto(mano.sintesi).trim(), dichiarazioni: comeTesto(mano.dichiarazioni).trim(), delibera: comeTesto(mano.delibera).trim(),
      variazioni: [], variazioniDa: 'appello',
      votazione: informativo ? null : votazione(ctx, p),
      momento: tempo(p.votato_il),
    };
  });
  const movimentiFinali = distribuisci(punti, tutti);
  for (const p of punti) delete p.momento;

  const allegati = [];
  const allega = (chiave, descrizione) => allegati.push({ numero: allegati.length + 1, chiave, descrizione });
  allega('avviso', `Avviso di convocazione${a.data_lettera ? ` del ${data(a.data_lettera)}` : ''}, con ordine del giorno.`);
  if (seconda) allega('deserta', `Annotazione di mancata costituzione della prima convocazione${a.prima_data ? ` del ${data(a.prima_data)}` : ''}.`);
  allega('report', 'Report delle presenze e delle votazioni generato dal portale.');
  if (ctx.deleghe.length) allega('deleghe', `Deleghe scritte (n. ${ctx.deleghe.length}).`);
  for (const riga of comeTesto(campi.allegati).split('\n').map((r) => r.trim()).filter(Boolean)) allega('altro', riga);

  const { quorum } = ctx.seduta;
  return {
    condominio: CONDOMINIO,
    titolo: titoloAssemblea(a),
    tipo: (TIPI[a.tipo] ?? '').toLowerCase(),
    convocazione: seconda ? 'seconda' : 'prima',
    avviso: { data: data(a.data_lettera), convocante: comeTesto(campi.convocante).trim() },
    primaConvocazione: seconda ? { data: data(a.prima_data), ora: oraBreve(a.prima_ora), luogo: a.prima_luogo ?? '', termineRispettato: termineSeconda(a) } : null,
    seduta: {
      data: data(a.data), ora: oraBreve(a.ora), luogo: a.luogo ?? '',
      apertura: ora(a.ora_apertura), appello: ora(a.ora_appello), chiusura: ora(a.ora_chiusura),
    },
    presidente: comeTesto(campi.presidente).trim(),
    segretario: comeTesto(campi.segretario).trim(),
    ordineDelGiorno: ctx.punti.map((p, i) => ({ numero: i + 1, testo: p.testo })),
    ...appello(ctx),
    movimenti: tutti,
    punti,
    movimentiFinali,
    chiusura: { ora: ora(a.ora_chiusura), teste: quorum.testePresenti, millesimi: peso(quorum.pesoPresente) },
    allegati,
  };
}
