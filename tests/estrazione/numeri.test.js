import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numero, centesimi, millesimiInteri, decimali, dataIso, inEuro, piatto } from '../../src/estrazione/numeri.js';

test('numero: importi e millesimi come stampati', () => {
  assert.equal(numero('-12.345,60'), -12345.6);
  assert.equal(numero('2.310,45'), 2310.45);
  assert.equal(numero('(0,412)'), 0.412);
  assert.equal(numero('0,00'), 0);
  assert.equal(numero('12,50-'), -12.5);
  assert.equal(numero('1.000'), 1000);
  assert.equal(numero('912.345'), 912345); // senza virgola, un punto seguito da tre cifre è il separatore delle migliaia
  assert.equal(numero('1234.56'), 1234.56);
  assert.equal(numero(-3.5), -3.5);
  assert.equal(numero('€ 1.234,5'), 1234.5);
});

test('numero: vuoto e illeggibile diventano null, non zero', () => {
  for (const v of ['', '   ', null, undefined, 'n.d.', '12,3,4', '-']) assert.equal(numero(v), null, String(v));
  assert.equal(centesimi(''), null);
  assert.equal(millesimiInteri(null), null);
});

test('centesimi e millesimi interi non risentono della virgola mobile', () => {
  assert.equal(centesimi('-48,30'), -4830);
  assert.equal(centesimi('0,57'), 57);
  assert.equal(centesimi('2.310,45'), 231045);
  assert.equal(millesimiInteri('0,412'), 412);
  assert.equal(millesimiInteri('1000'), 1000000);
  assert.equal(inEuro(-4830), '-48.30');
  assert.equal(inEuro(null), null);
});

test('decimali stampati; date; testo piatto per i confronti', () => {
  assert.deepEqual(['0,8', '0,412', '(4,125)', '1000', ''].map(decimali), [1, 3, 3, 0, 0]);
  assert.equal(dataIso('15/03/2025'), '2025-03-15');
  assert.equal(dataIso('1.2.25'), '2025-02-01');
  assert.equal(dataIso('2025-03-15'), '2025-03-15');
  assert.equal(dataIso('31/13/2025'), null);
  assert.equal(dataIso(''), null);
  assert.equal(piatto('  SPESE PROPRIETA\' / Città '), 'spese proprieta citta');
});
