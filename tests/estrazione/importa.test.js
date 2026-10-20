// Controlli con il database, piano di importazione (ed esecuzione sul deposito in memoria), confronto estrazione/database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlliDatabase, stessoNome, tipoUnita, ruoloRiga } from '../../src/estrazione/controlli-db.js';
import { pianoImportazione, eseguiPiano } from '../../src/estrazione/importa.js';
import { confrontaConDatabase } from '../../src/estrazione/confronto.js';
import { daRisolvere } from '../../src/estrazione/controlli.js';
import { creaDepositoProva } from '../../src/dati/deposito-prova.js';
import { raggruppaSpese } from '../../src/dati/modello.js';
import { situazionePatrimoniale, raggruppaPartite } from '../../src/dati/contabilita.js';
import { fascicolo, codici, senzaOk, OGGI } from './aiuti.js';

const TABELLE = ['esercizi', 'conti', 'fornitori', 'spese', 'posizioni', 'stato_patrimoniale', 'partite_terzi', 'unita', 'soggetti', 'titolarita', 'tabelle_millesimali', 'millesimi'];
const leggiDb = async (deposito) => Object.fromEntries(await Promise.all(TABELLE.map(async (t) => [t, await deposito.leggi(t)])));
const righe = (piano, passo) => piano.passi.find((p) => p.passo === passo).righe;

test('piccoli riconoscimenti: nome troncato, tipo di unità, ruolo dalla colonna accanto al nome', () => {
  assert.ok(stessoNome('ROSSI MARCO - ROSSI', 'ROSSI Marco - ROSSI Anna'));
  assert.ok(stessoNome('FINTA SRL***', 'Finta S.r.l.') === false && stessoNome('FINTA SRL***', 'FINTA SRL'));
  assert.ok(!stessoNome('ROSSI REMO', 'ORTI Omar') && !stessoNome('', 'ORTI Omar'));
  assert.deepEqual(['Appartame', 'BOX', 'POSTO AU', 'Negozio', 'Pr', ''].map(tipoUnita), ['appartamento', 'box', 'posto auto', 'negozio', null, null]);
  assert.deepEqual(['Pr', 'Co', 'As', 'Box', 'ex Pr 120 gg'].map(ruoloRiga), ['proprietario', 'conduttore', 'assegnatario', 'proprietario', 'proprietario']);
});

test('controlli con il database: millesimi diversi da confermare uno per uno, intestatario diverso, saldi precedenti', () => {
  const { db, dati } = fascicolo({ conErrori: true });
  const esiti = controlliDatabase({ riparto: dati().riparto, db, anno: 2026, oggi: OGGI });
  assert.deepEqual(senzaOk(esiti).map((e) => [e.livello, e.codice, e.dove.riga, e.daConfermare]), [
    ['avviso', 'millesimi_diversi', 'A12', true], ['avviso', 'millesimi_diversi', 'A13', true], ['avviso', 'intestatario_diverso', 'A9#1', false],
  ]);
  assert.match(esiti.find((e) => e.dove.riga === 'A12').messaggio, /nel fascicolo 31,500 millesimi, in anagrafica 30,500/);
  assert.match(esiti.find((e) => e.codice === 'intestatario_diverso').messaggio, /«ROSSI REMO», in anagrafica il proprietario corrente è ORTI Omar\. Possibile cambio di proprietà/);
  assert.deepEqual(codici(esiti, 'ok'), ['unita_anagrafica', 'saldo_precedente']);
  // i millesimi diversi fermano l'importazione finché non si accettano; l'intestatario diverso no
  assert.equal(daRisolvere(esiti).length, 2);
  assert.equal(daRisolvere(esiti, Object.fromEntries(esiti.filter((e) => e.daConfermare).map((e) => [e.chiave, true]))).length, 0);
});

test('controlli con il database: unità sconosciuta o assente, saldo precedente diverso, tabella senza corrispondenza', () => {
  const { db, dati } = fascicolo();
  const celle = { 'riparto:9|righe.25.codice': 'A99', 'riparto:11|righe.25.codice': 'A99', 'riparto:12|righe.25.codice': 'A99', 'riparto:11|righe.0.celle.3.importo': '9,99' };
  const esiti = senzaOk(controlliDatabase({ riparto: dati({ celle }).riparto, db, anno: 2026, oggi: OGGI }));
  assert.deepEqual(esiti.map((e) => [e.livello, e.codice, e.dove.riga]), [['errore', 'unita_sconosciuta', 'A99'], ['errore', 'unita_assente', 'A26'], ['avviso', 'millesimi_diversi', 'A12'], ['avviso', 'millesimi_diversi', 'A13'], ['avviso', 'saldo_precedente', 'A1']]);
  assert.match(esiti[4].messaggio, /A1: il saldo precedente stampato è 9,99, ma il saldo finale del 2025 nel database è 1,80/);

  const senzaTabella = { ...db, tabelle_millesimali: db.tabelle_millesimali.filter((t) => t.id !== 'tab-torre-1') };
  const avvisi = senzaOk(controlliDatabase({ riparto: dati().riparto, db: senzaTabella, anno: 2026, oggi: OGGI }));
  assert.deepEqual(avvisi.map((e) => e.codice), ['millesimi_diversi', 'millesimi_diversi', 'tabella_non_trovata']);
  // senza un consuntivo dell'anno prima il controllo dei saldi non si fa
  assert.ok(!codici(controlliDatabase({ riparto: dati().riparto, db, anno: 2030, oggi: OGGI })).includes('saldo_precedente'));
});

test('piano di importazione: esercizi, conti e fornitori nuovi, spese, posizioni, tipi, patrimoniale, partite', () => {
  const { db, dati } = fascicolo();
  const piano = pianoImportazione({ estrazione: { anno: 2026 }, dati: dati(), db, oggi: OGGI });
  assert.deepEqual(piano.errori, []);
  assert.deepEqual(piano.esistenti, []);
  assert.deepEqual([piano.anno, piano.annoPreventivo], [2026, 2027]);
  assert.deepEqual(righe(piano, 'esercizi'), [
    { anno: 2026, tipo: 'consuntivo', inizio: '2026-01-01', fine: '2026-12-31' }, { anno: 2027, tipo: 'preventivo', inizio: '2027-01-01', fine: '2027-12-31' },
  ]);
  // il conto nuovo di un gruppo che esiste prende la tabella degli altri conti del gruppo; quello di un gruppo nuovo resta senza
  assert.deepEqual(righe(piano, 'conti'), [
    { gruppo: 'SPESE GENERALI', sottoconto: 'DISINFESTAZIONE', tabella_id: 'tab-generali' }, { gruppo: 'SPESE PERSONALI', sottoconto: 'SOLLECITI DI PAGAMENTO', tabella_id: null },
  ]);
  assert.deepEqual(righe(piano, 'fornitori').map((f) => f.denominazione), ['VERDE FINTO S.A.S.', 'DERATTIZZA FINTA S.R.L.']);
  const spese = righe(piano, 'spese');
  assert.equal(spese.length, 16 + 7);
  assert.deepEqual(spese[0], {
    esercizio: { anno: 2026, tipo: 'consuntivo' }, conto: { gruppo: 'SPESE GENERALI', sottoconto: 'PULIZIE' }, fornitore: 'PULITO ESEMPIO S.N.C.', protocollo: 'G12',
    descrizione: 'PULIZIA SCALE PRIMO QUADRIMESTRE', numero_fattura: 'Fatt. 14', data_fattura: '2026-02-10', data_pagamento: '2026-02-20', importo: '-1250.00',
  });
  assert.deepEqual(spese.at(-1), {
    esercizio: { anno: 2027, tipo: 'preventivo' }, conto: { gruppo: 'RISCALDAMENTO TORRE 1', sottoconto: 'GAS' }, fornitore: null, protocollo: null,
    descrizione: 'GAS', numero_fattura: null, data_fattura: null, data_pagamento: null, importo: '-6500.00',
  });
  const posizioni = righe(piano, 'posizioni');
  assert.equal(posizioni.length, 26);
  assert.deepEqual(posizioni[0], { unita_id: 'u01', codice: 'A1', soggetto_id: 's01', ruolo: 'proprietario', totale_gestione: '-432.63', saldo_precedente: '1.80', rate_versate: '430.00', saldo_finale: '-0.83' });
  // A5 ha cambiato proprietario a metà 2025: la posizione va a quello corrente
  assert.equal(posizioni[4].soggetto_id, 's07');
  assert.deepEqual(righe(piano, 'tipi_unita'), [{ unita_id: 'u26', codice: 'A26', tipo: 'box', prima: 'appartamento' }]);
  assert.deepEqual(righe(piano, 'stato_patrimoniale').map((v) => [v.lato, v.ordine, v.voce, v.importo]).slice(0, 4), [
    ['attivita', 1, 'Crediti v/condòmini', '1520.00'], ['attivita', 2, 'Crediti v/terzi', '395.00'], ['attivita', 3, 'Disponibilità: Banca di Prova c/c', '6200.10'], ['attivita', 4, 'cassa contanti', '80.00'],
  ]);
  assert.deepEqual(righe(piano, 'partite_terzi')[1], { tipo: 'credito', controparte: null, protocollo: 'P9', descrizione: 'RIMBORSO SPESE POSTALI', importo: '45.00' });
  assert.deepEqual(piano.avvisi.map((a) => a.slice(0, 30)), ['Conto nuovo «SPESE PERSONALI /', 'A3: più di un proprietario cor']);
  assert.deepEqual(piano.tocca, ['spese', 'posizioni', 'stato_patrimoniale', 'partite_terzi']);
});

test('piano di importazione: esercizio già presente, con il conto di quello che verrebbe sostituito', () => {
  const { db, dati } = fascicolo({ anno: 2025 });
  const piano = pianoImportazione({ estrazione: { anno: 2025 }, dati: dati(), db, oggi: OGGI });
  assert.deepEqual(piano.esistenti, [
    { anno: 2025, tipo: 'consuntivo', conteggi: { spese: 8, posizioni: 3, stato_patrimoniale: 8, partite_terzi: 6 } },
    { anno: 2026, tipo: 'preventivo', conteggi: { spese: 7 } },
  ]);
  assert.match(piano.riepilogo[0][1], /consuntivo 2025 \(già presente\), preventivo 2026 \(già presente\)/);
});

test('piano di importazione: ciò che non si può scrivere è un errore del piano, non una riga sbagliata', () => {
  const { db, dati } = fascicolo();
  const celle = { 'spese:5|voci.0.importo': 'illeggibile', 'riparto:9|righe.25.codice': 'A99', 'riparto:11|righe.25.codice': 'A99', 'riparto:12|righe.25.codice': 'A99', 'partite:3|righe.0.sezione': 'Varie' };
  const senzaProprietario = { ...db, titolarita: db.titolarita.filter((t) => t.unita_id !== 'u10') };
  const piano = pianoImportazione({ estrazione: { anno: 2026 }, dati: dati({ celle }), db: senzaProprietario, oggi: OGGI });
  assert.deepEqual(piano.errori.map((e) => e.slice(0, 44)), [
    'Spesa G12 (pagina 5): importo non leggibile («', 'A10: in anagrafica l\'unità non ha un propriet', 'Riparto: l\'unità A99 non è in anagrafica.', 'Partita G70: non si capisce se è un credito ',
  ].map((e) => e.slice(0, 44)));
  // solo le sezioni lette toccano il database
  const soloSpese = { ...dati(), riparto: null, patrimoniale: null, partite: null, preventivo: null };
  const ridotto = pianoImportazione({ estrazione: { anno: 2026 }, dati: soloSpese, db, oggi: OGGI });
  assert.deepEqual(ridotto.tocca, ['spese']);
  assert.equal(righe(ridotto, 'esercizi').length, 1);
});

test('piano di importazione: più righe per la stessa unità (proprietario e conduttore) diventano posizioni distinte', () => {
  const { db, dati } = fascicolo();
  const d = dati();
  // la riga di A4 si sdoppia: metà al proprietario, metà al conduttore (come nei fascicoli fino al 2024)
  const a4 = d.riparto.righe[3];
  const meta = (r, etichetta) => ({ ...r, etichetta, valori: Object.fromEntries(Object.entries(r.valori).map(([k, c]) => [k, { ...c, importo: k === 'totale_gestione' ? '-100,00' : '0,00' }])) });
  d.riparto.righe.splice(3, 1, meta(a4, 'Pr'), { ...meta(a4, 'Co'), n: 2 });
  const posizioni = righe(pianoImportazione({ estrazione: { anno: 2026 }, dati: d, db, oggi: OGGI }), 'posizioni').filter((p) => p.codice === 'A4');
  assert.deepEqual(posizioni.map((p) => [p.soggetto_id, p.ruolo, p.totale_gestione]), [['s04', 'proprietario', '-100.00'], ['s05', 'conduttore', '-100.00']]);
});

test('eseguiPiano: scrive tutto nel deposito, si può ripetere senza doppioni, e la contabilità lo ritrova', async () => {
  const { db, dati } = fascicolo();
  const deposito = creaDepositoProva(db);
  const piano = pianoImportazione({ estrazione: { anno: 2026 }, dati: dati(), db, oggi: OGGI });
  const passi = [];
  await eseguiPiano(deposito, piano, { avanza: (p) => passi.push(p) });
  assert.deepEqual(passi, ['esercizi', 'conti', 'fornitori', 'spese', 'posizioni', 'tipi_unita', 'stato_patrimoniale', 'partite_terzi']);

  const verifica = async () => {
    const dopo = await leggiDb(deposito);
    const consuntivo = dopo.esercizi.find((e) => e.anno === 2026 && e.tipo === 'consuntivo');
    const preventivo = dopo.esercizi.find((e) => e.anno === 2027 && e.tipo === 'preventivo');
    assert.equal(raggruppaSpese(dopo.spese, dopo.conti, dopo.fornitori, consuntivo.id).totale, -13369.65);
    assert.equal(raggruppaSpese(dopo.spese, dopo.conti, dopo.fornitori, preventivo.id).totale, -13680);
    assert.equal(dopo.posizioni.filter((p) => p.esercizio_id === consuntivo.id).length, 26);
    assert.equal(situazionePatrimoniale(dopo.stato_patrimoniale, consuntivo.id).quadra, true);
    assert.equal(raggruppaPartite(dopo.partite_terzi, { esercizioId: consuntivo.id, tipo: 'debito' }).totale, 333565);
    assert.equal(dopo.unita.find((u) => u.codice === 'A26').tipo, 'box');
    assert.equal(dopo.conti.length, db.conti.length + 2);
    assert.equal(dopo.fornitori.length, db.fornitori.length + 2);
    // gli altri esercizi non sono stati toccati
    assert.equal(dopo.spese.filter((s) => s.esercizio_id === 'es-2025').length, 8);
    return dopo;
  };
  const dopo = await verifica();

  // una seconda importazione senza conferma si ferma: l'esercizio ormai ha dati
  const piano2 = pianoImportazione({ estrazione: { anno: 2026 }, dati: dati(), db: dopo, oggi: OGGI });
  assert.equal(piano2.esistenti.length, 2);
  assert.deepEqual(righe(piano2, 'conti'), []);
  await assert.rejects(eseguiPiano(deposito, piano2), /l'esercizio ha già dati \(spese: 23 righe\)/);
  // con la conferma sostituisce: stesso risultato, nessun doppione
  await eseguiPiano(deposito, piano2, { sostituisci: true });
  await verifica();
});

test('eseguiPiano: un piano con errori non parte; un\'interruzione a metà si recupera ripetendo', async () => {
  const { db, dati } = fascicolo();
  const piano = pianoImportazione({ estrazione: { anno: 2026 }, dati: dati(), db, oggi: OGGI });
  await assert.rejects(eseguiPiano(creaDepositoProva(db), { ...piano, errori: ['Spesa X: importo non leggibile.'] }), /non può partire: Spesa X/);

  const deposito = creaDepositoProva(db);
  const fragile = { ...deposito, inserisci: (tabella, r) => (tabella === 'posizioni' ? Promise.reject(new Error('posizioni: connessione assente')) : deposito.inserisci(tabella, r)) };
  await assert.rejects(eseguiPiano(fragile, piano), /connessione assente/);
  assert.equal((await deposito.leggi('spese')).filter((s) => !s.esercizio_id.startsWith('es-')).length, 23);
  await eseguiPiano(deposito, piano, { sostituisci: true });
  const dopo = await leggiDb(deposito);
  assert.equal(dopo.spese.filter((s) => !s.esercizio_id.startsWith('es-')).length, 23);
  assert.equal(dopo.posizioni.filter((p) => !p.esercizio_id.startsWith('es-')).length, 26);
});

test('confronto estrazione/database: dopo l\'importazione nessuna differenza; poi si vede ogni cifra cambiata', async () => {
  const { db, dati } = fascicolo();
  const deposito = creaDepositoProva(db);
  const piano = pianoImportazione({ estrazione: { anno: 2026 }, dati: dati(), db, oggi: OGGI });
  assert.equal(confrontaConDatabase({ piano, db }).confrontabile, false);
  await eseguiPiano(deposito, piano);
  const dopo = await leggiDb(deposito);
  const uguale = confrontaConDatabase({ piano: pianoImportazione({ estrazione: { anno: 2026 }, dati: dati(), db: dopo, oggi: OGGI }), db: dopo });
  assert.deepEqual(uguale.sezioni.map((s) => [s.nome, s.uguali, s.differenze.length]), [
    ['Spese del consuntivo', 16, 0], ['Preventivo 2027', 7, 0], ['Posizioni delle unità', 26, 0], ['Situazione patrimoniale', 7, 0], ['Partite verso terzi', 6, 0],
  ]);
  assert.deepEqual([uguale.differenze, uguale.confrontabile], [0, true]);

  // una rilettura con qualche cifra diversa
  const celle = { 'spese:5|voci.1.importo': '-1.280,00', 'spese:8|voci.0.fornitore': 'GAS FINTO SRL', 'riparto:12|righe.3.celle.1.importo': '100,00', 'patrimoniale:2|attivita.3.importo': '90,00', 'preventivo:13|gruppi.2.voci.0.importo': '-6.000,00' };
  const diverso = confrontaConDatabase({ piano: pianoImportazione({ estrazione: { anno: 2026 }, dati: dati({ celle }), db: dopo, oggi: OGGI }), db: dopo });
  assert.deepEqual(diverso.sezioni.map((s) => s.differenze), [
    [{ dove: 'SPESE GENERALI / PULIZIE — G48 (-1.280,00)', estratto: 'presente', database: '(manca)' },
      { dove: 'RISCALDAMENTO TORRE 1 / GAS — G15 (-2.100,00)', estratto: 'fornitore: GAS FINTO SRL', database: 'fornitore: GAS FINTO S.R.L.' },
      { dove: 'SPESE GENERALI / PULIZIE — G48 (-1.250,00)', estratto: '(manca)', database: 'presente' }],
    [{ dove: 'RISCALDAMENTO TORRE 1 / GAS', estratto: 'importo: -6.000,00', database: 'importo: -6.500,00' }],
    [{ dove: 'A4 (proprietario)', estratto: 'saldo finale: 100,00', database: 'saldo finale: -15,08' }],
    [{ dove: 'Attività, voce 4', estratto: 'importo: 90,00', database: 'importo: 80,00' }],
    [],
  ]);
  assert.equal(diverso.differenze, 6);
});

test('controlli con il database: per un esercizio passato i millesimi diversi da quelli di oggi non fermano l\'importazione', () => {
  const { db, dati } = fascicolo({ conErrori: true });
  const conPiuRecente = { ...db, esercizi: [...db.esercizi, { id: 'futuro', anno: 2027, tipo: 'consuntivo' }] };
  const esiti = controlliDatabase({ riparto: dati().riparto, db: conPiuRecente, anno: 2026, oggi: OGGI });
  const diversi = esiti.filter((e) => e.codice === 'millesimi_diversi');
  assert.equal(diversi.length, 2);
  assert.ok(diversi.every((e) => !e.daConfermare && /nell'anagrafica di oggi/.test(e.messaggio)));
  assert.equal(daRisolvere(esiti).length, 0);
});
