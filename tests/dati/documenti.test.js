import { ePdf } from '../../src/dati/documenti.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percorsoDocumento, archivioUnico, filtraArchivio, raggruppaPerAnno, LIMITE_FILE } from '../../src/dati/documenti.js';

test('percorsoDocumento: <anno o "senza-anno">/<id>.<estensione>', () => {
  assert.equal(percorsoDocumento('abc', 2025, 'pdf'), '2025/abc.pdf');
  assert.equal(percorsoDocumento('abc', null, 'jpg'), 'senza-anno/abc.jpg');
  assert.equal(percorsoDocumento('abc', '', 'bin'), 'senza-anno/abc.bin');
  assert.equal(LIMITE_FILE, 45 * 1024 * 1024);
});

const assemblee = [
  { id: 'a25', data: '2025-05-20', tipo: 'ordinaria', convocazione_path: 'convocazioni/a25.pdf', data_lettera: '2025-04-28' },
  { id: 'a24', data: '2024-04-18', tipo: 'ordinaria', convocazione_path: null, data_lettera: null },
];
const verbali = [
  { id: 'v25', assemblea_id: 'a25', file_path: 'a25/v25.pdf', stato: 'definitivo' },
  { id: 'v24', assemblea_id: 'a24', file_path: null, stato: 'bozza' }, // solo testo: niente file da scaricare
  { id: 'vx', assemblea_id: 'sparita', file_path: 'x/vx.pdf', stato: 'bozza' },
];
const documenti = [
  { id: 'd1', titolo: 'Rendiconto consuntivo 2025', tipo: 'rendiconto', anno: 2025, data_documento: '2026-03-10', assemblea_id: 'a25', file_path: '2025/d1.pdf', nome_file: 'rendiconto.pdf', note: 'Bozza' },
  { id: 'd2', titolo: 'Regolamento di condominio', tipo: 'altro', anno: null, data_documento: null, assemblea_id: null, file_path: 'senza-anno/d2.pdf', nome_file: null, note: null },
  { id: 'd3', titolo: 'Preventivo 2025', tipo: 'preventivo', anno: 2025, data_documento: '2025-04-01', assemblea_id: 'sparita', file_path: '2025/d3.pdf', nome_file: 'prev.pdf', note: null },
];
const titoloAssemblea = (a) => `Assemblea del ${a.data}`;
const voci = () => archivioUnico({ documenti, assemblee, verbali, titoloAssemblea });

test('archivioUnico: i documenti caricati più convocazioni e verbali già presenti altrove, in sola lettura', () => {
  const tutte = voci();
  assert.deepEqual(tutte.map((v) => [v.chiave, v.origine, v.tipo, v.anno, v.bucket, v.percorso]), [
    ['documento:d1', 'documento', 'rendiconto', 2025, 'documenti', '2025/d1.pdf'],
    ['documento:d2', 'documento', 'altro', null, 'documenti', 'senza-anno/d2.pdf'],
    ['documento:d3', 'documento', 'preventivo', 2025, 'documenti', '2025/d3.pdf'],
    ['convocazione:a25', 'convocazione', 'convocazione', 2025, 'verbali', 'convocazioni/a25.pdf'],
    ['verbale:v25', 'verbale', 'verbale', 2025, 'verbali', 'a25/v25.pdf'],
    // il verbale di un'assemblea che non c'è più resta raggiungibile, senza anno
    ['verbale:vx', 'verbale', 'verbale', null, 'verbali', 'x/vx.pdf'],
  ]);
  const perChiave = Object.fromEntries(tutte.map((v) => [v.chiave, v]));
  assert.equal(perChiave['convocazione:a25'].titolo, 'Convocazione — Assemblea del 2025-05-20');
  assert.equal(perChiave['convocazione:a25'].data, '2025-04-28');
  assert.equal(perChiave['verbale:v25'].titolo, 'Verbale — Assemblea del 2025-05-20');
  assert.equal(perChiave['verbale:v25'].data, '2025-05-20');
  assert.equal(perChiave['verbale:v25'].assemblea.id, 'a25');
  assert.equal(perChiave['verbale:vx'].assemblea, null);
  assert.equal(perChiave['documento:d1'].assemblea.id, 'a25');
  assert.equal(perChiave['documento:d1'].documento.id, 'd1');
  assert.equal(perChiave['documento:d3'].assemblea, null); // collegata a un'assemblea che non c'è più
});

test('filtraArchivio: per tipo e per titolo', () => {
  const chiavi = (filtri) => filtraArchivio(voci(), filtri).map((v) => v.chiave);
  assert.equal(chiavi({}).length, 6);
  assert.deepEqual(chiavi({ tipo: 'verbale' }), ['verbale:v25', 'verbale:vx']);
  assert.deepEqual(chiavi({ testo: 'RENDICÒNTO' }), ['documento:d1']);
  assert.deepEqual(chiavi({ testo: '2025', tipo: 'preventivo' }), ['documento:d3']);
  assert.deepEqual(chiavi({ testo: 'inesistente' }), []);
});

test('filtraArchivio: per sezione della pagina Documenti (categoria), anche insieme agli altri filtri', () => {
  const chiavi = (filtri) => filtraArchivio(voci(), filtri).map((v) => v.chiave);
  assert.deepEqual(chiavi({ categoria: 'assemblee' }), ['convocazione:a25', 'verbale:v25', 'verbale:vx']);
  assert.deepEqual(chiavi({ categoria: 'rendiconti' }), ['documento:d1', 'documento:d3']);
  assert.deepEqual(chiavi({ categoria: 'rendiconti', tipo: 'preventivo' }), ['documento:d3']);
  assert.deepEqual(chiavi({ categoria: 'regolamento' }), []); // d2 è di tipo «altro»: compare solo in «Tutti»
  assert.deepEqual(chiavi({ categoria: 'inesistente' }).length, 6); // sezione sconosciuta: nessun filtro
  assert.deepEqual(chiavi({ categoria: 'constructor' }).length, 6); // anche un nome che ogni oggetto JavaScript ha
});

test('raggruppaPerAnno: dall\'anno più recente, senza anno in fondo; nel gruppo dal documento più recente', () => {
  const gruppi = raggruppaPerAnno(voci());
  assert.deepEqual(gruppi.map((g) => [g.anno, g.voci.map((v) => v.chiave)]), [
    [2025, ['documento:d1', 'verbale:v25', 'convocazione:a25', 'documento:d3']],
    [null, ['documento:d2', 'verbale:vx']],
  ]);
  assert.deepEqual(raggruppaPerAnno([]), []);
});

test('accetta solo file PDF, riconosciuti dal tipo o dal nome', () => {
  assert.equal(ePdf({ type: '', name: 'elenco-pdf' }), false);
  assert.equal(ePdf({ type: 'application/pdf', name: 'rendiconto' }), true);
  assert.equal(ePdf({ type: '', name: 'Rendiconto 2025.PDF' }), true);
  assert.equal(ePdf({ type: 'image/jpeg', name: 'foto.jpg' }), false);
  assert.equal(ePdf(null), false);
});

test('quadroPerAnno: solo documenti caricati; convocazioni e verbali raggruppati per assemblea, anche se non collegati', async () => {
  const { quadroPerAnno, dataNelTitolo } = await import('../../src/dati/documenti.js');
  assert.equal(dataNelTitolo('Convocazione 27 Aprile 2023'), '2023-04-27');
  assert.equal(dataNelTitolo('Assemblea ordinaria 17.03.2025'), '2025-03-17');
  const extra = [
    { chiave: 'documento:c1', origine: 'documento', titolo: 'Convocazione 20 Maggio 2025', tipo: 'convocazione', anno: 2025, data: '2025-04-28', assemblea: null },
    { chiave: 'documento:v1', origine: 'documento', titolo: 'Verbale 20.05.2025', tipo: 'verbale', anno: 2025, data: null, assemblea: null },
    { chiave: 'documento:c2', origine: 'documento', titolo: 'Convocazione 12 Gennaio 2019', tipo: 'convocazione', anno: 2019, data: '2018-12-20', assemblea: null },
    { chiave: 'documento:v2', origine: 'documento', titolo: 'Verbale 12/01/2019', tipo: 'verbale', anno: 2019, data: null, assemblea: null },
  ];
  const q = quadroPerAnno({ voci: [...voci(), ...extra], assemblee });
  assert.deepEqual(q.map((g) => g.anno), [2025, 2019, null]);
  const g25 = q[0];
  assert.deepEqual([g25.preventivo.map((v) => v.chiave), g25.consuntivo.map((v) => v.chiave)], [['documento:d3'], ['documento:d1']]);
  // le copie salvate da Assemblee e Verbali non compaiono; l'assemblea del 2024 senza documenti nemmeno
  assert.deepEqual(g25.assemblee.map((r) => [r.assemblea?.id, r.convocazioni.map((v) => v.chiave), r.verbali.map((v) => v.chiave)]), [['a25', ['documento:c1'], ['documento:v1']]]);
  // senza assemblea nel portale: convocazione e verbale dello stesso giorno stanno insieme
  assert.deepEqual(q[1].assemblee.map((r) => [r.assemblea, r.data, r.convocazioni.length, r.verbali.length]), [[null, '2019-01-12', 1, 1]]);
  assert.deepEqual(q[2].altri.map((v) => v.chiave), ['documento:d2']);
});
