import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inInteri, daInteri } from '../../src/calcolo/numeri.js';

test('inInteri converte i millesimi in interi senza errori di virgola', () => {
  assert.equal(inInteri(0.1) + inInteri(0.2), inInteri(0.3));
  assert.equal(inInteri('229,144'.replace(',', '.')), 229144);
  assert.equal(inInteri(0), 0);
});

test('daInteri riporta ai millesimi', () => {
  assert.equal(daInteri(229144), 229.144);
});
