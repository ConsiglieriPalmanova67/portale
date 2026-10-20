import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costruisciModello, raggruppaSpese, perCodice } from '../../src/dati/modello.js';

const dati = {
  unita: [{ id: 'u10', codice: 'A10' }, { id: 'u2', codice: 'A2' }, { id: 'u109b', codice: 'A109.1' }, { id: 'u109', codice: 'A109' }],
  soggetti: [{ id: 's1', denominazione: 'ROSSI' }, { id: 's2', denominazione: 'BIANCHI' }, { id: 's3', denominazione: 'VERDI' }],
  titolarita: [
    { unita_id: 'u2', soggetto_id: 's1', ruolo: 'proprietario', dal: null, al: null },
    { unita_id: 'u10', soggetto_id: 's1', ruolo: 'proprietario', dal: '2024-10-08', al: null },
    { unita_id: 'u10', soggetto_id: 's2', ruolo: 'proprietario', dal: null, al: '2024-10-07' },
    { unita_id: 'u10', soggetto_id: 's3', ruolo: 'conduttore', dal: null, al: null },
    { unita_id: 'u109', soggetto_id: 's2', ruolo: 'proprietario', dal: null, al: null },
  ],
  tabelle_millesimali: [
    { id: 't10', nome: '10 - TV citofoni Torre 1', ambito: 'Torre 1' },
    { id: 't4', nome: '4 - Proprietà', ambito: 'condominio' },
    { id: 't2', nome: '2 - Ascensore Scala A', ambito: 'Scala A' },
  ],
  millesimi: [
    { unita_id: 'u2', tabella_id: 't4', valore: '10.500' },
    { unita_id: 'u10', tabella_id: 't4', valore: '1.250' },
    { unita_id: 'u10', tabella_id: 't2', valore: '30.000' },
    { unita_id: 'u10', tabella_id: 't10', valore: '1.000' },
    { unita_id: 'u109', tabella_id: 't4', valore: '20.000' },
  ],
};

test('ordina le unità per numero e non per testo', () => {
  const codici = ['A10', 'A2', 'A109.1', 'A109'].map((codice) => ({ codice })).sort(perCodice).map((u) => u.codice);
  assert.deepEqual(codici, ['A2', 'A10', 'A109', 'A109.1']);
});

test('distingue proprietari correnti, altri titolari e storico', () => {
  const m = costruisciModello(dati, '2025-06-01');
  const a10 = m.unitaPerCodice.get('A10');
  assert.deepEqual(a10.proprietari.map((p) => p.soggetto.denominazione), ['ROSSI']);
  assert.deepEqual(a10.altri.map((p) => [p.soggetto.denominazione, p.ruolo]), [['VERDI', 'conduttore']]);
  assert.deepEqual(a10.storico.map((p) => p.soggetto.denominazione), ['BIANCHI']);
});

test('una titolarità con inizio futuro non è né in corso né storico', () => {
  const prima = costruisciModello(dati, '2024-10-01').unitaPerCodice.get('A10');
  assert.deepEqual(prima.proprietari.map((p) => p.soggetto.denominazione), ['BIANCHI']);
  assert.deepEqual(prima.futuri.map((p) => p.soggetto.denominazione), ['ROSSI']);
  assert.deepEqual(prima.storico, []);
});

test('ricava scala e torre dai millesimi', () => {
  const m = costruisciModello(dati, '2025-06-01');
  assert.deepEqual(m.unitaPerCodice.get('A10').parti, ['Scala A', 'Torre 1']);
  assert.deepEqual(m.unitaPerCodice.get('A2').parti, []);
  assert.deepEqual(m.parti, ['Scala A', 'Torre 1']);
});

test('ordina le tabelle per numero e riconosce quella di proprietà', () => {
  const m = costruisciModello(dati, '2025-06-01');
  assert.deepEqual(m.tabelle.map((t) => t.id), ['t2', 't4', 't10']);
  assert.equal(m.tabellaProprieta.id, 't4');
  assert.equal(m.unitaPerCodice.get('A2').proprieta, 10.5);
});

test('le teste sommano i millesimi di proprietà delle unità dello stesso proprietario', () => {
  const m = costruisciModello(dati, '2025-06-01');
  assert.deepEqual(m.teste.map((t) => [t.etichetta, t.unita.map((u) => u.codice), t.proprieta]), [
    ['BIANCHI', ['A109'], 20],
    ['ROSSI', ['A2', 'A10'], 11.75],
  ]);
});

test('raggruppa le spese per gruppo e sottoconto con totali esatti', () => {
  const conti = [
    { id: 'c1', gruppo: 'SPESE GENERALI', sottoconto: 'GIARDINO' },
    { id: 'c2', gruppo: 'SPESE GENERALI', sottoconto: 'ACQUA' },
    { id: 'c3', gruppo: 'RISCALDAMENTO', sottoconto: 'METANO' },
  ];
  const spese = [
    { esercizio_id: 'e1', conto_id: 'c1', importo: '-0.10', fornitore_id: 'f1' },
    { esercizio_id: 'e1', conto_id: 'c1', importo: '-0.20', fornitore_id: null },
    { esercizio_id: 'e1', conto_id: 'c2', importo: '-100.00', fornitore_id: null },
    { esercizio_id: 'e1', conto_id: 'c3', importo: '50.00', fornitore_id: null },
    { esercizio_id: 'e2', conto_id: 'c3', importo: '-999.00', fornitore_id: null },
  ];
  const r = raggruppaSpese(spese, conti, [{ id: 'f1', denominazione: 'VIVAIO' }], 'e1');
  assert.equal(r.totale, -50.3);
  assert.deepEqual(r.gruppi.map((g) => [g.nome, g.totale]), [['SPESE GENERALI', -100.3], ['RISCALDAMENTO', 50]]);
  assert.deepEqual(r.gruppi[0].sottoconti.map((s) => [s.nome, s.totale, s.voci.length]), [['GIARDINO', -0.3, 2], ['ACQUA', -100, 1]]);
  assert.equal(r.gruppi[0].sottoconti[0].voci[0].fornitore, 'VIVAIO');
});
