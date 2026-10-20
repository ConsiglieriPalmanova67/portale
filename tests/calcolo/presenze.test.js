import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaPresenti } from '../../src/calcolo/presenze.js';

const delega = (delegante, delegato_testa = null, delegato_esterno = null) =>
  ({ delegante, delegato_testa, delegato_esterno, amministratore: false });

test('chi è presente di persona è presente', () => {
  const { presenti, avvisi } = calcolaPresenti(
    [{ testa: 'a', stato: 'presente' }, { testa: 'b', stato: 'assente' }],
    [],
  );
  assert.deepEqual([...presenti], ['a']);
  assert.deepEqual(avvisi, []);
});

test('delega a un condomino presente rende presente il delegante', () => {
  const { presenti } = calcolaPresenti([{ testa: 'a', stato: 'presente' }], [delega('b', 'a')]);
  assert.deepEqual([...presenti].sort(), ['a', 'b']);
});

test('delega a un esterno rende presente il delegante', () => {
  const { presenti } = calcolaPresenti([], [delega('b', null, 'Avv. Esempio')]);
  assert.deepEqual([...presenti], ['b']);
});

test('delega a un condomino assente: avviso e delegante non presente', () => {
  const { presenti, avvisi } = calcolaPresenti([{ testa: 'a', stato: 'assente' }], [delega('b', 'a')]);
  assert.deepEqual([...presenti], []);
  assert.deepEqual(avvisi, [{ tipo: 'delegato_assente', testa: 'b', delegato: 'a' }]);
});

test('presente di persona che ha anche rilasciato delega: avviso di conflitto', () => {
  const { presenti, avvisi } = calcolaPresenti(
    [{ testa: 'a', stato: 'presente' }, { testa: 'b', stato: 'presente' }],
    [delega('b', 'a')],
  );
  assert.deepEqual([...presenti].sort(), ['a', 'b']);
  assert.deepEqual(avvisi, [{ tipo: 'conflitto', testa: 'b' }]);
});
