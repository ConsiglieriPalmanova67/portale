import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocchiDaMappa, controllaMappa, unisciIndici, allineaBlocchi, chiaveBlocco, ordinaMappa } from '../../src/estrazione/blocchi.js';

const MAPPA = [
  { tipo: 'altro', pagina_da: 1, pagina_a: 4, titolo: 'Lettera' },
  { tipo: 'patrimoniale', pagina_da: 5, pagina_a: 5, titolo: 'Situazione patrimoniale' },
  { tipo: 'partite', pagina_da: 10, pagina_a: 13, titolo: 'Debiti e crediti' },
  { tipo: 'spese', pagina_da: 17, pagina_a: 24, titolo: 'Rendiconto' },
  { tipo: 'riparto', pagina_da: 46, pagina_a: 50, titolo: 'Riparto', parte: 1 },
  { tipo: 'riparto', pagina_da: 51, pagina_a: 52, titolo: 'Riparto', parte: 2 },
  { tipo: 'preventivo', pagina_da: 65, pagina_a: 66, titolo: 'Preventivo' },
];

test('blocchiDaMappa: dimensione per tipo, contesto per spese e partite dopo il primo blocco, niente per "altro"', () => {
  const blocchi = blocchiDaMappa(MAPPA);
  assert.deepEqual(blocchi.map((b) => `${b.sezione}${b.parte ? `/${b.parte}` : ''} ${b.pagina_da}-${b.pagina_a}${b.contesto ? ` (+${b.contesto})` : ''}`), [
    'patrimoniale 5-5', 'partite 10-11', 'partite 12-13 (+11)',
    'spese 17-19', 'spese 20-22 (+19)', 'spese 23-24 (+22)',
    'riparto/1 46-47', 'riparto/1 48-49', 'riparto/1 50-50', 'riparto/2 51-52',
    'preventivo 65-66',
  ]);
  assert.equal(new Set(blocchi.map(chiaveBlocco)).size, blocchi.length);
  assert.deepEqual(blocchiDaMappa([]), []);
});

test('controllaMappa: una mappa buona passa; intervalli sbagliati, sovrapposti o fuori dal documento no', () => {
  assert.deepEqual(controllaMappa(MAPPA, 67), []);
  assert.match(controllaMappa(MAPPA, 60).join(' '), /solo 60 pagine/);
  assert.match(controllaMappa([{ tipo: 'spese', pagina_da: 9, pagina_a: 5 }], 67).join(' '), /non è valido/);
  assert.match(controllaMappa([{ tipo: 'spese', pagina_da: 5, pagina_a: 9 }, { tipo: 'partite', pagina_da: 9, pagina_a: 10 }], 67).join(' '), /pagine 9-9 compaiono in due sezioni/);
  assert.match(controllaMappa([{ tipo: 'altro', pagina_da: 1, pagina_a: 3 }], 67).join(' '), /nessuna sezione da leggere/);
  assert.match(controllaMappa([{ tipo: 'riparto', pagina_da: 1, pagina_a: 2, parte: 1 }, { tipo: 'riparto', pagina_da: 3, pagina_a: 4, parte: 1 }], 9).join(' '), /stesso numero di parte/);
  assert.match(controllaMappa([{ tipo: 'spese', pagina_da: 1, pagina_a: 2 }, { tipo: 'spese', pagina_da: 5, pagina_a: 6 }], 9).join(' '), /più di una volta/);
  // le pagine "altro" possono sovrapporsi a tutto: non si leggono
  assert.deepEqual(controllaMappa([{ tipo: 'altro', pagina_da: 1, pagina_a: 9 }, { tipo: 'spese', pagina_da: 2, pagina_a: 3 }], 9), []);
});

test('ordinaMappa: pagine intere, tipo sconosciuto = altro, parte solo per il riparto', () => {
  assert.deepEqual(ordinaMappa([{ tipo: 'riparto', pagina_da: '7', pagina_a: '8' }, { tipo: 'boh', pagina_da: 1, pagina_a: 2, parte: 3 }]), [
    { tipo: 'altro', pagina_da: 1, pagina_a: 2, titolo: '', parte: null }, { tipo: 'riparto', pagina_da: 7, pagina_a: 8, titolo: '', parte: 1 },
  ]);
});

test('unisciIndici: le sezioni a cavallo di due pezzi si riuniscono e le parti del riparto si rinumerano', () => {
  const unite = unisciIndici([
    { sezioni: [{ tipo: 'spese', pagina_da: 17, pagina_a: 20 }, { tipo: 'altro', pagina_da: 1, pagina_a: 16 }] },
    { sezioni: [{ tipo: 'spese', pagina_da: 21, pagina_a: 30 }, { tipo: 'riparto', pagina_da: 31, pagina_a: 40, parte: 1, prima_colonna: '1 - SPESE GENERALI' }] },
    { sezioni: [{ tipo: 'riparto', pagina_da: 41, pagina_a: 42, parte: 1, prima_colonna: '1 - Spese generali' },
      { tipo: 'riparto', pagina_da: 43, pagina_a: 48, parte: 2, prima_colonna: '8 - TORRE 2' }, { tipo: 'riparto', pagina_da: 49, pagina_a: 54, parte: 3, prima_colonna: 'Rate versate' }] },
  ]);
  assert.deepEqual(unite.map((s) => [s.tipo, s.pagina_da, s.pagina_a, s.parte]), [
    ['altro', 1, 16, null], ['spese', 17, 30, null], ['riparto', 31, 42, 1], ['riparto', 43, 48, 2], ['riparto', 49, 54, 3],
  ]);
});

test('allineaBlocchi: dopo una correzione della mappa restano i blocchi buoni, si creano i nuovi, si tolgono i superflui', () => {
  const esistenti = [
    { sezione: 'spese', parte: null, pagina_da: 17, pagina_a: 19 }, { sezione: 'spese', parte: null, pagina_da: 20, pagina_a: 22 },
    { sezione: 'partite', parte: null, pagina_da: 10, pagina_a: 11 },
  ];
  const r = allineaBlocchi([{ tipo: 'spese', pagina_da: 17, pagina_a: 21 }, { tipo: 'patrimoniale', pagina_da: 5, pagina_a: 5 }], esistenti);
  assert.deepEqual(r.daCreare.map(chiaveBlocco), ['patrimoniale:5']);
  assert.deepEqual(r.daRifare.map(chiaveBlocco), ['spese:20']); // ora finisce a pagina 21
  assert.deepEqual(r.daTogliere.map(chiaveBlocco), ['partite:10']);
});

test('un blocco diviso in pagine singole resta com\'è quando si riallinea alla mappa, e i blocchi si leggono dalle righe', async () => {
  const { blocchiDaRighe, dividiBlocco } = await import('../../src/estrazione/blocchi.js');
  const mappa = [{ tipo: 'riparto', parte: 2, pagina_da: 52, pagina_a: 57 }, { tipo: 'spese', pagina_da: 17, pagina_a: 19 }];
  const pezzi = dividiBlocco({ sezione: 'riparto', parte: 2, pagina_da: 54, pagina_a: 55 });
  assert.deepEqual(pezzi.map((b) => [b.pagina_da, b.pagina_a]), [[54, 54], [55, 55]]);
  const righe = [
    { id: 1, sezione: 'riparto', parte: 2, pagina_da: 52, pagina_a: 53 }, ...pezzi.map((b, i) => ({ id: 2 + i, ...b })),
    { id: 4, sezione: 'riparto', parte: 2, pagina_da: 56, pagina_a: 57 }, { id: 5, sezione: 'spese', parte: null, pagina_da: 17, pagina_a: 19 },
  ];
  const r = allineaBlocchi(mappa, righe);
  assert.deepEqual([r.daCreare.length, r.daRifare.length, r.daTogliere.length], [0, 0, 0]);
  assert.deepEqual(blocchiDaRighe(mappa, righe).map(chiaveBlocco), ['spese:17', 'riparto:52', 'riparto:54', 'riparto:55', 'riparto:56']);
  // una pagina sola delle due non basta: il blocco intero va rifatto e il pezzo orfano tolto
  const monco = allineaBlocchi(mappa, righe.filter((b) => b.id !== 3));
  assert.deepEqual([monco.daCreare.length, monco.daRifare.map(chiaveBlocco), monco.daTogliere.length], [0, ['riparto:54'], 0]);
});
