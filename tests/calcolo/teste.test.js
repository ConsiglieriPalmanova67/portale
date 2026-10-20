import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaTeste, pesaTeste } from '../../src/calcolo/teste.js';

const pr = (unita_id, soggetto_id, extra = {}) =>
  ({ unita_id, soggetto_id, ruolo: 'proprietario', dal: null, al: null, ...extra });

test('comproprietari di una unità formano una sola testa', () => {
  const teste = calcolaTeste([pr('U1', 'rossi'), pr('U1', 'bianchi')], '2026-01-01');
  assert.equal(teste.length, 1);
  assert.deepEqual(teste[0], { chiave: 'bianchi+rossi', soggetti: ['bianchi', 'rossi'], unita: ['U1'] });
});

test('stesso proprietario su più unità è una sola testa', () => {
  const teste = calcolaTeste([pr('U1', 'rossi'), pr('U2', 'rossi')], '2026-01-01');
  assert.equal(teste.length, 1);
  assert.deepEqual(teste[0].unita, ['U1', 'U2']);
});

test('insiemi di proprietari diversi sono teste diverse', () => {
  const teste = calcolaTeste(
    [pr('U1', 'rossi'), pr('U2', 'rossi'), pr('U2', 'bianchi')],
    '2026-01-01',
  );
  assert.deepEqual(teste.map((t) => t.chiave), ['bianchi+rossi', 'rossi']);
});

test('conduttori e assegnatari non formano teste', () => {
  const teste = calcolaTeste(
    [
      pr('U1', 'rossi'),
      { unita_id: 'U1', soggetto_id: 'verdi', ruolo: 'conduttore', dal: null, al: null },
      { unita_id: 'U2', soggetto_id: 'neri', ruolo: 'assegnatario', dal: null, al: null },
    ],
    '2026-01-01',
  );
  assert.deepEqual(teste.map((t) => t.chiave), ['rossi']);
});

test('conta solo le titolarità valide alla data', () => {
  const titolarita = [
    pr('U1', 'vecchio', { al: '2025-06-30' }),
    pr('U1', 'nuovo', { dal: '2025-07-01' }),
  ];
  assert.deepEqual(calcolaTeste(titolarita, '2025-06-30').map((t) => t.chiave), ['vecchio']);
  assert.deepEqual(calcolaTeste(titolarita, '2025-07-01').map((t) => t.chiave), ['nuovo']);
});

const teste = [
  { chiave: 'rossi', soggetti: ['rossi'], unita: ['U1', 'U2'] },
  { chiave: 'bianchi', soggetti: ['bianchi'], unita: ['U3'] },
];
const millesimi = [
  { unita_id: 'U1', tabella_id: 'proprieta', valore: 10.5 },
  { unita_id: 'U2', tabella_id: 'proprieta', valore: 1.25 },
  { unita_id: 'U3', tabella_id: 'proprieta', valore: 20 },
  { unita_id: 'U1', tabella_id: 'torre1', valore: 50 },
];

test('pesaTeste somma i millesimi delle unità della testa', () => {
  const pesate = pesaTeste(teste, millesimi, 'proprieta');
  assert.deepEqual(pesate.map((t) => [t.chiave, t.peso]), [['rossi', 11750], ['bianchi', 20000]]);
});

test('pesaTeste esclude le teste senza millesimi nella tabella', () => {
  const pesate = pesaTeste(teste, millesimi, 'torre1');
  assert.deepEqual(pesate.map((t) => [t.chiave, t.peso]), [['rossi', 50000]]);
});
