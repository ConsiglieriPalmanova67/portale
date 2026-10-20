import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAGGIORANZE, esitoVoto } from '../../src/calcolo/maggioranze.js';

const t = (chiave, millesimi) => ({ chiave, soggetti: [chiave], unita: [], peso: millesimi * 1000 });
const v = (testa, voto) => ({ testa, voto });
// 5 teste, 1000 millesimi
const teste = [t('a', 334), t('b', 166), t('c', 200), t('d', 200), t('e', 100)];

test('elenco delle maggioranze disponibili', () => {
  assert.deepEqual(Object.keys(MAGGIORANZE), ['terzo', 'meta', 'due_terzi', 'unanimita', 'unanimita_presenti']);
});

test('conteggi per teste e millesimi', () => {
  const esito = esitoVoto(
    teste,
    new Set(['a', 'b', 'c']),
    [v('a', 'favorevole'), v('b', 'contrario'), v('c', 'astenuto')],
    'terzo',
  );
  assert.deepEqual(esito.favorevoli, { teste: 1, peso: 334000 });
  assert.deepEqual(esito.contrari, { teste: 1, peso: 166000 });
  assert.deepEqual(esito.astenuti, { teste: 1, peso: 200000 });
  assert.deepEqual(esito.presenti, { teste: 3, peso: 700000 });
  assert.equal(esito.pesoTotale, 1000000);
});

test('terzo: maggioranza dei presenti e almeno 1/3 dei millesimi', () => {
  const presenti = new Set(['a', 'b', 'c']);
  const due = [v('a', 'favorevole'), v('b', 'favorevole'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, presenti, due, 'terzo').approvato, true); // 2 su 3, 500
  const uno = [v('a', 'favorevole'), v('b', 'contrario'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, presenti, uno, 'terzo').approvato, false); // 1 su 3
  const pochi = [v('b', 'favorevole'), v('e', 'favorevole'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, new Set(['b', 'e', 'c']), pochi, 'terzo').approvato, false); // 266 < 333,33
});

test('meta: servono almeno 500 millesimi', () => {
  const presenti = new Set(['a', 'b', 'c']);
  const voti = [v('a', 'favorevole'), v('b', 'favorevole'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, presenti, voti, 'meta').approvato, true); // 500 esatti
  const meno = [v('a', 'favorevole'), v('e', 'favorevole'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, new Set(['a', 'e', 'c']), meno, 'meta').approvato, false); // 434
});

test('due_terzi: servono almeno 2/3 dei millesimi', () => {
  const tutti = new Set(['a', 'b', 'c', 'd', 'e']);
  const voti = [v('a', 'favorevole'), v('b', 'favorevole'), v('c', 'favorevole'), v('d', 'contrario'), v('e', 'contrario')];
  assert.equal(esitoVoto(teste, tutti, voti, 'due_terzi').approvato, true); // 700
  const meno = [v('a', 'favorevole'), v('c', 'favorevole'), v('e', 'favorevole'), v('b', 'contrario'), v('d', 'contrario')];
  assert.equal(esitoVoto(teste, tutti, meno, 'due_terzi').approvato, false); // 634
});

test('unanimita: tutte le teste della tabella favorevoli, assenti compresi', () => {
  const favorevoli = (chiavi) => chiavi.map((c) => v(c, 'favorevole'));
  const tutti = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(esitoVoto(teste, new Set(tutti), favorevoli(tutti), 'unanimita').approvato, true);
  const quattro = ['a', 'b', 'c', 'd'];
  assert.equal(esitoVoto(teste, new Set(quattro), favorevoli(quattro), 'unanimita').approvato, false);
  // dei presenti: bastano i presenti, ma tutti favorevoli (un astenuto o un non espresso la fa cadere)
  assert.equal(esitoVoto(teste, new Set(quattro), favorevoli(quattro), 'unanimita_presenti').approvato, true);
  assert.equal(esitoVoto(teste, new Set(quattro), favorevoli(quattro.slice(1)), 'unanimita_presenti').approvato, false);
  assert.equal(esitoVoto(teste, new Set(), [], 'unanimita_presenti').approvato, false);
});

test('il voto di chi non è presente non conta', () => {
  const esito = esitoVoto(teste, new Set(['a']), [v('a', 'favorevole'), v('b', 'favorevole')], 'terzo');
  assert.deepEqual(esito.favorevoli, { teste: 1, peso: 334000 });
});

test('presente senza voto espresso: conteggiato a parte, non favorevole', () => {
  const esito = esitoVoto(teste, new Set(['a', 'b']), [v('a', 'favorevole')], 'terzo');
  assert.deepEqual(esito.nonEspressi, { teste: 1, peso: 166000 });
  assert.equal(esito.approvato, false); // 1 su 2 non è maggioranza
});

test('maggioranza sconosciuta: errore', () => {
  assert.throws(() => esitoVoto(teste, new Set(), [], 'boh'), /maggioranza/);
});
