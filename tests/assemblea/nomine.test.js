import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatiNominati, pianoMandati } from '../../src/assemblea/nomine.js';

const DATA = '2026-11-20';
const mandato = (id, soggetto_id, extra = {}) => ({
  id, soggetto_id, utente_id: null, carica: 'Consigliere', parte_rappresentata: 'Scala A',
  inizio_mandato: '2025-05-20', fine_mandato: null, assemblea_nomina_id: null, ...extra,
});
const piano = (candidati, consiglieri) => pianoMandati({ candidati, consiglieri, assembleaId: 'A', data: DATA });

test('pianoMandati: crea il mandato di chi non ne ha uno in corso', () => {
  const p = piano([{ soggetto_id: 's1', parte_rappresentata: 'Torre 1' }], []);
  assert.deepEqual(p.crea, [{
    soggetto_id: 's1', carica: 'Consigliere', parte_rappresentata: 'Torre 1', inizio_mandato: DATA, fine_mandato: null, assemblea_nomina_id: 'A',
  }]);
  assert.deepEqual([p.aggiorna, p.chiudi, p.daVerificare], [[], [], []]);
});

test('pianoMandati: un mandato già finito non conta, il candidato ne riceve uno nuovo', () => {
  const p = piano([{ soggetto_id: 's1', parte_rappresentata: null }], [mandato('m1', 's1', { fine_mandato: '2025-05-19' })]);
  assert.equal(p.crea.length, 1);
  assert.equal(p.crea[0].parte_rappresentata, null);
  assert.deepEqual(p.chiudi, []);
});

test('pianoMandati: il riconfermato conserva mandato e carica, cambiano parte e assemblea di nomina', () => {
  const p = piano([{ soggetto_id: 's1', parte_rappresentata: 'Torre 1' }], [mandato('m1', 's1', { carica: 'Presidente' })]);
  assert.deepEqual(p.crea, []);
  assert.deepEqual(p.aggiorna, [{ id: 'm1', soggetto_id: 's1', valori: { parte_rappresentata: 'Torre 1', assemblea_nomina_id: 'A' } }]);
});

test('pianoMandati: chiude alla data dell\'assemblea i mandati in corso dei non riconfermati', () => {
  const p = piano([{ soggetto_id: 's1', parte_rappresentata: 'Scala A' }], [mandato('m1', 's1'), mandato('m2', 's2'), mandato('m3', 's3', { fine_mandato: '2024-01-01' })]);
  assert.deepEqual(p.chiudi, [{ id: 'm2', soggetto_id: 's2', valori: { fine_mandato: DATA } }]);
});

test('pianoMandati: un mandato senza soggetto non si chiude da solo, va verificato a mano', () => {
  const p = piano([{ soggetto_id: 's1', parte_rappresentata: 'Scala A' }], [mandato('m9', null, { utente_id: 'u9' })]);
  assert.deepEqual(p.chiudi, []);
  assert.deepEqual(p.daVerificare.map((m) => m.id), ['m9']);
});

test('pianoMandati: ripetuto dopo averlo applicato non propone più nulla', () => {
  const candidati = [{ soggetto_id: 's1', parte_rappresentata: 'Torre 1' }, { soggetto_id: 's4', parte_rappresentata: 'Scala A' }];
  let consiglieri = [mandato('m1', 's1'), mandato('m2', 's2')];
  const primo = piano(candidati, consiglieri);
  assert.deepEqual([primo.crea.length, primo.aggiorna.length, primo.chiudi.length], [1, 1, 1]);
  // si applica il piano come farebbe la pagina
  consiglieri = consiglieri.map((c) => ({ ...c, ...[...primo.aggiorna, ...primo.chiudi].find((x) => x.id === c.id)?.valori }));
  consiglieri.push(...primo.crea.map((c, i) => ({ id: `nuovo${i}`, utente_id: null, ...c })));
  const secondo = piano(candidati, consiglieri);
  assert.deepEqual([secondo.crea, secondo.aggiorna, secondo.chiudi], [[], [], []]);
  assert.equal(secondo.vuoto, true);
  assert.equal(primo.vuoto, false);
});

test('pianoMandati: lo stesso candidato indicato due volte riceve un solo mandato', () => {
  const p = piano([{ soggetto_id: 's1', parte_rappresentata: 'Torre 1' }, { soggetto_id: 's1', parte_rappresentata: 'Torre 1' }], []);
  assert.equal(p.crea.length, 1);
});

const punto = (id, extra = {}) => ({ id, tipo: 'nomina_consiglieri', candidati: [], votato_il: '2026-11-20T19:00:00Z', esito: { approvato: true }, ...extra });

test('candidatiNominati: unisce i candidati dei punti di nomina chiusi e approvati', () => {
  const r = candidatiNominati([
    punto('p1', { candidati: [{ soggetto_id: 's1', parte_rappresentata: 'Scala A' }] }),
    punto('p2', { candidati: [{ soggetto_id: 's2', parte_rappresentata: 'Torre 1' }] }),
    punto('p3', { candidati: [{ soggetto_id: 's3', parte_rappresentata: null }], esito: { approvato: false } }),
    { id: 'p4', tipo: 'delibera', candidati: [], votato_il: '2026-11-20T19:00:00Z', esito: { approvato: true } },
  ]);
  assert.deepEqual(r.nominati.map((c) => c.soggetto_id), ['s1', 's2']);
  assert.deepEqual(r.inAttesa, []);
});

test('candidatiNominati: segnala i punti di nomina con la votazione ancora aperta', () => {
  const r = candidatiNominati([
    punto('p1', { candidati: [{ soggetto_id: 's1', parte_rappresentata: 'Scala A' }] }),
    punto('p2', { candidati: [{ soggetto_id: 's2', parte_rappresentata: 'Torre 1' }], votato_il: null, esito: null }),
  ]);
  assert.deepEqual(r.nominati.map((c) => c.soggetto_id), ['s1']);
  assert.deepEqual(r.inAttesa.map((p) => p.id), ['p2']);
});
