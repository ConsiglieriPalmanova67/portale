import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaDepositoProva } from '../../src/dati/deposito-prova.js';
import { campiVuoti, leggiCampi } from '../../src/verbale/fatti.js';
import { leggiBozza, aggiornaBozza } from '../../src/verbale/bozza.js';

const nuovo = (bozze = []) => creaDepositoProva({ assemblee: [{ id: 'a1', data: '2026-10-20', stato: 'in_corso' }], bozze_verbale: bozze });
const righe = (deposito) => deposito.leggi('bozze_verbale', { assemblea_id: 'a1' });
const punto = (sintesi = '', dichiarazioni = '', delibera = '') => ({ sintesi, dichiarazioni, delibera });

test('leggiBozza: senza riga, id nullo e campi vuoti', async () => {
  assert.deepEqual(await leggiBozza(nuovo(), 'a1'), { id: null, campi: campiVuoti() });
  // con i campi iniziali indicati (per esempio il convocante proposto) si parte da quelli
  const iniziali = () => ({ ...campiVuoti(), convocante: 'Studio Prova, amministratore del condominio' });
  assert.equal((await leggiBozza(nuovo(), 'a1', iniziali)).campi.convocante, 'Studio Prova, amministratore del condominio');
});

test('leggiBozza: la riga dell\'assemblea, la più recente se sono più d\'una', async () => {
  const deposito = nuovo([
    { id: 'b1', assemblea_id: 'a1', testo: JSON.stringify({ presidente: 'Vecchio' }), modificato_il: '2026-10-20T18:00:00Z' },
    { id: 'b2', assemblea_id: 'a1', testo: JSON.stringify({ presidente: 'Nuovo' }), modificato_il: '2026-10-20T19:00:00Z' },
    { id: 'b3', assemblea_id: 'altra', testo: JSON.stringify({ presidente: 'Altra' }), modificato_il: '2026-10-21T19:00:00Z' },
  ]);
  const { id, campi } = await leggiBozza(deposito, 'a1');
  assert.equal(id, 'b2');
  assert.equal(campi.presidente, 'Nuovo');
});

test('aggiornaBozza: senza riga la crea, con la modifica e i campi iniziali', async () => {
  const deposito = nuovo();
  const iniziali = () => ({ ...campiVuoti(), convocante: 'Studio Prova, amministratore del condominio' });
  const campi = await aggiornaBozza(deposito, 'a1', (c) => { c.punti.p1 = punto('Discussione sul tetto'); }, iniziali);
  assert.equal(campi.punti.p1.sintesi, 'Discussione sul tetto');
  const [riga, ...altre] = await righe(deposito);
  assert.equal(altre.length, 0);
  assert.equal(riga.assemblea_id, 'a1');
  assert.deepEqual(leggiCampi(riga.testo), campi);
  assert.equal(campi.convocante, 'Studio Prova, amministratore del condominio');
  assert.deepEqual(await leggiBozza(deposito, 'a1'), { id: riga.id, campi });
});

test('aggiornaBozza: due modifiche successive su punti diversi non si cancellano (la seconda rilegge)', async () => {
  const deposito = nuovo();
  // due schede (o due dispositivi) che scrivono ognuna il suo punto
  await aggiornaBozza(deposito, 'a1', (c) => { c.punti.p1 = punto('Note del punto 1'); });
  const campi = await aggiornaBozza(deposito, 'a1', (c) => { c.punti.p2 = punto('Note del punto 2'); });
  assert.deepEqual(campi.punti, { p1: punto('Note del punto 1'), p2: punto('Note del punto 2') });
  // nel frattempo un altro dispositivo scrive il presidente direttamente nella riga: la modifica successiva lo ritrova
  const [riga] = await righe(deposito);
  await deposito.aggiorna('bozze_verbale', { id: riga.id }, { testo: JSON.stringify({ ...leggiCampi(riga.testo), presidente: 'ALBERI Ada' }) });
  const dopo = await aggiornaBozza(deposito, 'a1', (c) => { c.punti.p1.sintesi = 'Note del punto 1, riviste'; });
  assert.equal(dopo.presidente, 'ALBERI Ada');
  assert.deepEqual(dopo.punti, { p1: punto('Note del punto 1, riviste'), p2: punto('Note del punto 2') });
  assert.equal((await righe(deposito)).length, 1);
  assert.deepEqual(leggiCampi((await righe(deposito))[0].testo), dopo);
});

test('aggiornaBozza: una modifica a presidente non tocca i punti', async () => {
  const salvati = { ...campiVuoti(), segretario: 'NEVI Nora', punti: { p1: punto('Sintesi', 'Dichiarazione', 'Delibera'), p2: punto('', '', 'Altra delibera') } };
  const deposito = nuovo([{ id: 'b1', assemblea_id: 'a1', testo: JSON.stringify(salvati) }]);
  const campi = await aggiornaBozza(deposito, 'a1', (c) => { c.presidente = 'MONTI Marco'; });
  assert.deepEqual(campi, { ...salvati, presidente: 'MONTI Marco' });
  const tutte = await righe(deposito);
  assert.deepEqual(tutte.map((r) => r.id), ['b1']);
  assert.deepEqual(leggiCampi(tutte[0].testo), { ...salvati, presidente: 'MONTI Marco' });
});

test('aggiornaBozza: se la riga letta sparisce prima della scrittura se ne crea una nuova', async () => {
  const deposito = nuovo([{ id: 'b1', assemblea_id: 'a1', testo: JSON.stringify({ presidente: 'MONTI Marco' }) }]);
  // la riga viene tolta tra la lettura e la scrittura: l'aggiornamento non trova nulla
  const sparita = { ...deposito, aggiorna: async (tabella, chiave) => { await deposito.elimina(tabella, chiave); return []; } };
  const campi = await aggiornaBozza(sparita, 'a1', (c) => { c.segretario = 'NEVI Nora'; });
  assert.deepEqual([campi.presidente, campi.segretario], ['MONTI Marco', 'NEVI Nora']);
  const [riga, ...altre] = await righe(deposito);
  assert.equal(altre.length, 0);
  assert.notEqual(riga.id, 'b1');
  assert.deepEqual(leggiCampi(riga.testo), campi);
});

test('aggiornaBozza: un errore di scrittura arriva a chi chiama', async () => {
  const deposito = nuovo();
  const rotto = { ...deposito, inserisci: async () => { throw new Error('bozze_verbale: connessione assente'); } };
  await assert.rejects(aggiornaBozza(rotto, 'a1', (c) => { c.presidente = 'X'; }), /connessione assente/);
  assert.equal((await righe(deposito)).length, 0);
});
