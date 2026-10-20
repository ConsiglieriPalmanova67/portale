import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regolaPerTesto, controllaPunto } from '../../src/calcolo/regole-voto.js';
import { esitoVoto } from '../../src/calcolo/maggioranze.js';

test('regola dell\'amministratore: riconosce nomina, conferma, revoca; non il solo compenso', () => {
  for (const testo of ['Nomina amministratore', 'Revoca dell\'amministratore e nomina del nuovo', 'Conferma Amministratore per il 2026', 'Rinnovo incarico all\'amministratore']) {
    assert.equal(regolaPerTesto(testo)?.id, 'amministratore', testo);
  }
  assert.equal(regolaPerTesto('Approvazione del compenso dell\'amministratore'), null);
  assert.equal(regolaPerTesto('Nomina consiglieri'), null);
  assert.equal(regolaPerTesto(''), null);
});

test('controllaPunto: maggioranza e tabella diverse dalla regola sono segnalate', () => {
  const contesto = { tabellaProprietaId: 'prop' };
  assert.deepEqual(controllaPunto({ testo: 'Nomina amministratore', maggioranza: 'meta', tabella_id: 'prop' }, contesto).problemi, []);
  const { problemi } = controllaPunto({ testo: 'Nomina amministratore', maggioranza: 'terzo', tabella_id: 'scala-a' }, contesto);
  assert.equal(problemi.length, 2);
  assert.deepEqual(controllaPunto({ testo: 'Pulizie scale', maggioranza: 'terzo', tabella_id: 'x' }, contesto), { regola: null, problemi: [] });
});

test('maggioranza della regola: servono insieme metà + 1 delle teste intervenute e 500 millesimi', () => {
  const teste = [{ chiave: 'a', peso: 300 }, { chiave: 'b', peso: 250 }, { chiave: 'c', peso: 100 }, { chiave: 'd', peso: 350 }];
  const presenti = new Set(['a', 'b', 'c']);
  const voto = (favorevoli) => esitoVoto(teste, presenti, favorevoli.map((t) => ({ testa: t, voto: 'favorevole' })), 'meta').approvato;
  assert.equal(voto(['a', 'b']), true); // 2 teste su 3, 550 millesimi
  assert.equal(voto(['a', 'c']), false); // 2 teste su 3 ma 400 millesimi
  assert.equal(voto(['a']), false); // 300 millesimi e 1 testa su 3
});
