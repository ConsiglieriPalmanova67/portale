import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaDeleghe } from '../../src/calcolo/deleghe.js';

const t = (chiave, millesimi) => ({ chiave, soggetti: [chiave], unita: [], peso: millesimi * 1000 });
const delega = (delegante, delegato_testa = null, delegato_esterno = null, amministratore = false) =>
  ({ delegante, delegato_testa, delegato_esterno, amministratore });

// 25 teste da 40 millesimi: 1/5 = 5 teste, 200 millesimi
const venticinque = Array.from({ length: 25 }, (_, i) => t(`t${i}`, 40));

test('entro un quinto: nessun avviso', () => {
  const deleghe = [1, 2, 3, 4, 5].map((i) => delega(`t${i}`, 't0'));
  assert.deepEqual(controllaDeleghe(venticinque, deleghe), []);
});

test('oltre un quinto delle teste e dei millesimi: due avvisi', () => {
  const deleghe = [1, 2, 3, 4, 5, 6].map((i) => delega(`t${i}`, 't0'));
  assert.deepEqual(controllaDeleghe(venticinque, deleghe), [
    { tipo: 'oltre_quinto_teste', delegato: 't0', teste: 6 },
    { tipo: 'oltre_quinto_millesimi', delegato: 't0', peso: 240000 },
  ]);
});

test('oltre un quinto dei soli millesimi', () => {
  const teste = [t('grande', 300), ...Array.from({ length: 24 }, (_, i) => t(`p${i}`, 700 / 24))];
  const avvisi = controllaDeleghe(teste, [delega('grande', 'p0')]);
  assert.deepEqual(avvisi.map((a) => a.tipo), ['oltre_quinto_millesimi']);
});

test('le deleghe allo stesso esterno si sommano ignorando maiuscole e spazi', () => {
  const deleghe = [
    ...[1, 2, 3].map((i) => delega(`t${i}`, null, 'Mario Esempio')),
    ...[4, 5, 6].map((i) => delega(`t${i}`, null, ' mario esempio ')),
  ];
  const avvisi = controllaDeleghe(venticinque, deleghe);
  assert.equal(avvisi[0].tipo, 'oltre_quinto_teste');
  assert.equal(avvisi[0].delegato, 'esterno:mario esempio');
});

test('fino a 20 condomini il limite del quinto non si applica', () => {
  const venti = Array.from({ length: 20 }, (_, i) => t(`t${i}`, 50));
  const deleghe = [1, 2, 3, 4, 5, 6, 7].map((i) => delega(`t${i}`, 't0'));
  assert.deepEqual(controllaDeleghe(venti, deleghe), []);
});

test('delega all\'amministratore: avviso', () => {
  const avvisi = controllaDeleghe(venticinque, [delega('t1', null, 'Amministratore', true)]);
  assert.deepEqual(avvisi, [{ tipo: 'amministratore', testa: 't1' }]);
});
