import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pianoCambioProprieta, etichetteDaAggiornare } from '../../src/dati/anagrafica.js';

const t = (id, unita_id, soggetto_id, extra = {}) => ({ id, unita_id, soggetto_id, ruolo: 'proprietario', dal: null, al: null, ...extra });
const titolarita = [
  t('t1', 'u1', 'rossi'),
  t('t2', 'u1', 'bianchi'),
  t('t3', 'u1', 'verdi', { ruolo: 'conduttore' }),
  t('t4', 'u1', 'neri', { al: '2023-12-31' }),
  t('t5', 'u2', 'rossi', { dal: '2024-10-08' }),
];

test('vendita: chiude tutti i proprietari attuali al giorno prima e apre il nuovo dalla data', () => {
  const p = pianoCambioProprieta({ titolarita, unitaId: 'u1', nuovi: ['gialli'], data: '2026-03-01' });
  assert.deepEqual(p.errori, []);
  assert.deepEqual(p.chiudi, [{ id: 't1', al: '2026-02-28' }, { id: 't2', al: '2026-02-28' }]);
  assert.deepEqual(p.crea, [{ unita_id: 'u1', soggetto_id: 'gialli', ruolo: 'proprietario', dal: '2026-03-01', al: null }]);
});

test('non tocca conduttori, proprietari già cessati e altre unità', () => {
  const p = pianoCambioProprieta({ titolarita, unitaId: 'u1', nuovi: ['gialli'], data: '2026-03-01' });
  assert.ok(!p.chiudi.some((c) => ['t3', 't4', 't5'].includes(c.id)));
});

test('chi resta comproprietario non viene chiuso né ricreato', () => {
  const p = pianoCambioProprieta({ titolarita, unitaId: 'u1', nuovi: ['rossi', 'gialli'], data: '2026-03-01' });
  assert.deepEqual(p.chiudi, [{ id: 't2', al: '2026-02-28' }]);
  assert.deepEqual(p.crea.map((c) => c.soggetto_id), ['gialli']);
});

test('il primo gennaio chiude al 31 dicembre dell\'anno prima', () => {
  const p = pianoCambioProprieta({ titolarita, unitaId: 'u1', nuovi: ['gialli'], data: '2026-01-01' });
  assert.equal(p.chiudi[0].al, '2025-12-31');
});

test('stessi proprietari: errore, nessuna scrittura', () => {
  const p = pianoCambioProprieta({ titolarita, unitaId: 'u1', nuovi: ['bianchi', 'rossi', 'rossi'], data: '2026-03-01' });
  assert.equal(p.errori.length, 1);
  assert.deepEqual([p.chiudi, p.crea], [[], []]);
});

test('data mancante o non valida e nessun nuovo proprietario: errori', () => {
  assert.equal(pianoCambioProprieta({ titolarita, unitaId: 'u1', nuovi: [], data: '' }).errori.length, 2);
  assert.equal(pianoCambioProprieta({ titolarita, unitaId: 'u1', nuovi: ['gialli'], data: '01/03/2026' }).errori.length, 1);
});

test('data non successiva all\'inizio dell\'attuale proprietà: errore con la data in chiaro', () => {
  const p = pianoCambioProprieta({ titolarita, unitaId: 'u2', nuovi: ['gialli'], data: '2024-10-08' });
  assert.match(p.errori[0], /08\/10\/2024/);
  assert.deepEqual(pianoCambioProprieta({ titolarita, unitaId: 'u2', nuovi: ['gialli'], data: '2024-10-09' }).errori, []);
});

test('unità senza proprietari attuali: si limita ad aprire i nuovi', () => {
  const p = pianoCambioProprieta({ titolarita, unitaId: 'u9', nuovi: ['gialli'], data: '2026-03-01' });
  assert.deepEqual([p.chiudi.length, p.crea.length, p.errori.length], [0, 1, 0]);
});

test('etichette delle teste: aggiorna solo quelle che cambiano', () => {
  const teste = [
    { id: 'a', etichetta: 'ROSI + BIANCHI', soggetti: ['s1', 's2'] },
    { id: 'b', etichetta: 'VERDI', soggetti: ['s3'] },
  ];
  const soggetti = [{ id: 's1', denominazione: 'ROSSI' }, { id: 's2', denominazione: 'BIANCHI' }, { id: 's3', denominazione: 'VERDI' }];
  assert.deepEqual(etichetteDaAggiornare(teste, soggetti), [{ id: 'a', etichetta: 'ROSSI + BIANCHI' }]);
});
