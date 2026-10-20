// Confronto tra un fascicolo estratto e ciò che del suo esercizio è già nel database: serve al collaudo
// (rileggere un fascicolo già caricato a mano e vedere cifra per cifra cosa cambia) e a rileggere un documento.
// Funzione pura: usa lo stesso piano dell'importazione, così confronta esattamente ciò che verrebbe scritto.
import { leggibile, piatto } from './numeri.js';

// qui gli importi sono già nella forma del database ("1234.56"), non come stampati
const cent = (v) => Math.round(Number(v ?? 0) * 100) || 0;

// Confronto di due elenchi per chiave: tra le righe con la stessa chiave si appaiano quelle più somiglianti.
// → { uguali, differenze: [{ dove, estratto, database }] }
function appaia(estratte, registrate, chiaveDi, descrivi, campi) {
  const code = new Map();
  for (const r of registrate) {
    const k = chiaveDi(r);
    if (!code.has(k)) code.set(k, []);
    code.get(k).push(r);
  }
  const esito = { uguali: 0, differenze: [] };
  for (const e of estratte) {
    // più righe con la stessa chiave (lo stesso protocollo addebitato a più unità): si prende la più somigliante
    const coda = code.get(chiaveDi(e)) ?? [];
    const uguali = (r) => campi.filter(([uguale]) => uguale(e, r)).length;
    const scelta = coda.reduce((meglio, r, i) => (meglio < 0 || uguali(r) > uguali(coda[meglio]) ? i : meglio), -1);
    const gemella = scelta < 0 ? null : coda.splice(scelta, 1)[0];
    if (!gemella) {
      esito.differenze.push({ dove: descrivi(e), estratto: 'presente', database: '(manca)' });
      continue;
    }
    const diversi = campi.filter(([uguale]) => !uguale(e, gemella));
    if (!diversi.length) esito.uguali += 1;
    for (const [, mostra] of diversi) esito.differenze.push({ dove: descrivi(e), estratto: mostra(e), database: mostra(gemella) });
  }
  for (const rimaste of code.values()) {
    for (const r of rimaste) esito.differenze.push({ dove: descrivi(r), estratto: '(manca)', database: 'presente' });
  }
  return esito;
}
const campo = (nome, etichetta = nome) => [(a, b) => piatto(a[nome]) === piatto(b[nome]), (r) => `${etichetta}: ${r[nome] ?? '—'}`];
const soldi = (nome, etichetta = nome) => [(a, b) => cent(a[nome]) === cent(b[nome]), (r) => `${etichetta}: ${r[nome] === null || r[nome] === undefined ? '—' : leggibile(cent(r[nome]))}`];

// piano = pianoImportazione(...); db = le righe delle tabelle del database.
// → { sezioni: [{ nome, uguali, differenze }], differenze (numero totale), confrontabile (l'esercizio esiste) }
export function confrontaConDatabase({ piano, db }) {
  const righeDi = (nome) => piano.passi.find((p) => p.passo === nome).righe;
  const esercizio = (anno, tipo) => db.esercizi.find((e) => e.anno === anno && e.tipo === tipo);
  const consuntivo = esercizio(piano.anno, 'consuntivo');
  const preventivo = esercizio(piano.annoPreventivo, 'preventivo');
  const conti = new Map(db.conti.map((c) => [c.id, c]));
  const fornitori = new Map(db.fornitori.map((f) => [f.id, f.denominazione]));
  const unita = new Map(db.unita.map((u) => [u.id, u.codice]));
  const speseDb = (e) => (e ? db.spese.filter((s) => s.esercizio_id === e.id) : []).map((s) => ({
    ...s, gruppo: conti.get(s.conto_id)?.gruppo, sottoconto: conti.get(s.conto_id)?.sottoconto, fornitore: fornitori.get(s.fornitore_id) ?? null,
  }));
  const spesePiano = (tipo) => righeDi('spese').filter((s) => s.esercizio.tipo === tipo).map((s) => ({ ...s, gruppo: s.conto.gruppo, sottoconto: s.conto.sottoconto }));
  const delConsuntivo = (tabella) => (consuntivo ? db[tabella].filter((r) => r.esercizio_id === consuntivo.id) : []);
  const sezioni = [];
  const aggiungi = (nome, serve, esito) => {
    if (serve) sezioni.push({ nome, ...esito });
  };
  const tocca = (tabella) => piano.tocca.includes(tabella);

  aggiungi('Spese del consuntivo', tocca('spese'), appaia(spesePiano('consuntivo'), speseDb(consuntivo),
    (s) => `${piatto(s.gruppo)}|${piatto(s.sottoconto)}|${piatto(s.protocollo)}|${cent(s.importo)}`,
    (s) => `${s.gruppo} / ${s.sottoconto} — ${s.protocollo ?? 'senza protocollo'} (${leggibile(cent(s.importo))})`,
    [campo('descrizione'), campo('fornitore'), campo('numero_fattura', 'fattura'), campo('data_fattura', 'data fattura'), campo('data_pagamento', 'data pagamento')]));
  aggiungi(`Preventivo ${piano.annoPreventivo}`, righeDi('spese').some((s) => s.esercizio.tipo === 'preventivo'), appaia(spesePiano('preventivo'), speseDb(preventivo),
    (s) => `${piatto(s.gruppo)}|${piatto(s.sottoconto)}`, (s) => `${s.gruppo} / ${s.sottoconto}`, [soldi('importo')]));
  aggiungi('Posizioni delle unità', tocca('posizioni'), appaia(righeDi('posizioni'), delConsuntivo('posizioni').map((p) => ({ ...p, codice: unita.get(p.unita_id) })),
    (p) => `${p.unita_id}|${p.soggetto_id}|${p.ruolo}`, (p) => `${p.codice} (${p.ruolo})`,
    [soldi('totale_gestione', 'totale gestione'), soldi('saldo_precedente', 'saldo precedente'), soldi('rate_versate', 'rate versate'), soldi('saldo_finale', 'saldo finale')]));
  aggiungi('Situazione patrimoniale', tocca('stato_patrimoniale'), appaia(righeDi('stato_patrimoniale'), delConsuntivo('stato_patrimoniale'),
    (v) => `${v.lato}|${v.ordine}`, (v) => `${v.lato === 'attivita' ? 'Attività' : 'Passività'}, voce ${v.ordine}`, [campo('voce'), soldi('importo')]));
  aggiungi('Partite verso terzi', tocca('partite_terzi'), appaia(righeDi('partite_terzi'), delConsuntivo('partite_terzi'),
    (p) => `${p.tipo}|${piatto(p.protocollo)}|${cent(p.importo)}`, (p) => `${p.tipo} ${p.protocollo ?? 'senza protocollo'} (${leggibile(cent(p.importo))})`,
    [campo('controparte'), campo('descrizione')]));

  return { sezioni, differenze: sezioni.reduce((s, x) => s + x.differenze.length, 0), confrontabile: Boolean(consuntivo) };
}
