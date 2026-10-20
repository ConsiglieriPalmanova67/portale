import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quorumCostitutivo } from '../../src/calcolo/quorum.js';

const t = (chiave, millesimi) => ({ chiave, soggetti: [chiave], unita: [], peso: millesimi * 1000 });
// tre teste, 1000 millesimi
const teste = [t('a', 333), t('b', 333), t('c', 334)];

test('riporta i conteggi', () => {
  const q = quorumCostitutivo(teste, new Set(['a', 'c']), 'seconda');
  assert.deepEqual(
    { testeTotali: q.testeTotali, testePresenti: q.testePresenti, pesoTotale: q.pesoTotale, pesoPresente: q.pesoPresente },
    { testeTotali: 3, testePresenti: 2, pesoTotale: 1000000, pesoPresente: 667000 },
  );
});

test('seconda convocazione: serve almeno 1/3 dei millesimi', () => {
  assert.equal(quorumCostitutivo(teste, new Set(['a']), 'seconda').raggiunto, false); // 333 < 333,33
  assert.equal(quorumCostitutivo(teste, new Set(['c']), 'seconda').raggiunto, true); // 334
});

test('seconda convocazione: serve almeno 1/3 delle teste', () => {
  const quattro = [t('a', 700), t('b', 100), t('c', 100), t('d', 100)];
  assert.equal(quorumCostitutivo(quattro, new Set(['a']), 'seconda').raggiunto, false); // 1 su 4
  assert.equal(quorumCostitutivo(quattro, new Set(['a', 'b']), 'seconda').raggiunto, true);
});

test('prima convocazione: maggioranza delle teste e 2/3 dei millesimi', () => {
  assert.equal(quorumCostitutivo(teste, new Set(['a', 'b']), 'prima').raggiunto, false); // 666 < 666,67
  assert.equal(quorumCostitutivo(teste, new Set(['a', 'c']), 'prima').raggiunto, true); // 667
  const due = [t('a', 900), t('b', 100)];
  assert.equal(quorumCostitutivo(due, new Set(['a']), 'prima').raggiunto, false); // 1 su 2 non è maggioranza
});

test('ignora presenti che non sono teste della tabella', () => {
  assert.equal(quorumCostitutivo(teste, new Set(['a', 'estraneo']), 'seconda').testePresenti, 1);
});

test('convocazione sconosciuta: errore', () => {
  assert.throws(() => quorumCostitutivo(teste, new Set(), 'terza'), /convocazione/);
});
