import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaDepositoProva } from '../../src/dati/deposito-prova.js';
import { datiProva } from '../../src/dati/dati-prova.js';
import { costruisciModello } from '../../src/dati/modello.js';

const nuovo = () => creaDepositoProva({
  assemblee: [{ id: 'a1', data: '2026-01-10', stato: 'bozza' }, { id: 'a2', data: '2026-02-10', stato: 'chiusa' }],
  punti_odg: [
    { id: 'p1', assemblea_id: 'a1', ordine: 1, testo: 'Primo' },
    { id: 'p2', assemblea_id: 'a1', ordine: 2, testo: 'Secondo' },
    { id: 'p3', assemblea_id: 'a2', ordine: 1, testo: 'Altro' },
  ],
  voti: [{ punto_id: 'p1', testa_id: 't1', voto: 'favorevole' }],
});
const unTick = () => new Promise((fatto) => setTimeout(fatto, 0));

test('leggi: tutto, con filtri di uguaglianza e con un elenco di valori', async () => {
  const d = nuovo();
  assert.equal((await d.leggi('punti_odg')).length, 3);
  assert.deepEqual((await d.leggi('punti_odg', { assemblea_id: 'a1', ordine: 2 })).map((p) => p.id), ['p2']);
  assert.deepEqual((await d.leggi('punti_odg', { id: ['p1', 'p3'] })).map((p) => p.id), ['p1', 'p3']);
  assert.deepEqual(await d.leggi('punti_odg', { id: [] }), []);
  assert.deepEqual(await d.leggi('presenze'), []);
});

test('leggi restituisce copie: modificarle non tocca il deposito', async () => {
  const d = nuovo();
  (await d.leggi('assemblee'))[0].stato = 'manomesso';
  assert.equal((await d.leggi('assemblee', { id: 'a1' }))[0].stato, 'bozza');
});

test('inserisci assegna un id e i valori predefiniti del database', async () => {
  const d = nuovo();
  const [a] = await d.inserisci('assemblee', [{ data: '2026-03-01', tipo: 'ordinaria' }]);
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual([a.stato, a.convocazione], ['bozza', 'seconda']);
  const [p] = await d.inserisci('punti_odg', [{ assemblea_id: a.id, ordine: 1, testo: 'x' }]);
  assert.deepEqual([p.tipo, p.candidati], ['delibera', []]);
  // le tabelle con chiave composta non hanno id
  const [presenza] = await d.inserisci('presenze', [{ assemblea_id: a.id, testa_id: 't1' }]);
  assert.equal(presenza.id, undefined);
  assert.equal(presenza.stato, 'assente');
  assert.equal((await d.leggi('assemblee')).length, 3);
});

test('inserisci rifiuta i doppioni come farebbe il database, senza inserire nulla', async () => {
  const d = nuovo();
  await assert.rejects(d.inserisci('punti_odg', [{ assemblea_id: 'a1', ordine: 9, testo: 'ok' }, { assemblea_id: 'a1', ordine: 2, testo: 'doppio' }]), /esiste già/i);
  assert.equal((await d.leggi('punti_odg')).length, 3);
  await assert.rejects(d.inserisci('voti', [{ punto_id: 'p1', testa_id: 't1', voto: 'contrario' }]), /esiste già/i);
});

test('aggiorna modifica solo le righe della chiave e restituisce quelle aggiornate', async () => {
  const d = nuovo();
  const righe = await d.aggiorna('punti_odg', { assemblea_id: 'a1', ordine: 2 }, { testo: 'Cambiato' });
  assert.deepEqual(righe.map((p) => [p.id, p.testo]), [['p2', 'Cambiato']]);
  assert.deepEqual((await d.leggi('punti_odg')).map((p) => p.testo), ['Primo', 'Cambiato', 'Altro']);
  assert.deepEqual(await d.aggiorna('punti_odg', { id: 'inesistente' }, { testo: 'x' }), []);
  await assert.rejects(d.aggiorna('punti_odg', {}, { testo: 'tutti' }), /chiave/i);
  // scambiare due ordini in un colpo solo viola l'unicità, come nel database
  await assert.rejects(d.aggiorna('punti_odg', { id: 'p1' }, { ordine: 2 }), /esiste già/i);
});

test('salva inserisce le righe nuove e aggiorna quelle esistenti (upsert)', async () => {
  const d = nuovo();
  const righe = await d.salva('voti', [
    { punto_id: 'p1', testa_id: 't1', voto: 'contrario' },
    { punto_id: 'p1', testa_id: 't2', voto: 'astenuto' },
  ], ['punto_id', 'testa_id']);
  assert.equal(righe.length, 2);
  assert.deepEqual((await d.leggi('voti', { punto_id: 'p1' })).map((v) => [v.testa_id, v.voto]), [['t1', 'contrario'], ['t2', 'astenuto']]);
});

test('salva conserva l\'id e le colonne non passate della riga esistente', async () => {
  const d = nuovo();
  const [riga] = await d.salva('punti_odg', [{ assemblea_id: 'a1', ordine: 1, note: 'nota' }], ['assemblea_id', 'ordine']);
  assert.deepEqual([riga.id, riga.testo, riga.note], ['p1', 'Primo', 'nota']);
  const [nuova] = await d.salva('punti_odg', [{ assemblea_id: 'a1', ordine: 3, testo: 'Terzo' }], ['assemblea_id', 'ordine']);
  assert.match(nuova.id, /^[0-9a-f-]{36}$/);
});

test('elimina restituisce il numero di righe e porta via i voti del punto eliminato', async () => {
  const d = nuovo();
  assert.equal(await d.elimina('punti_odg', { assemblea_id: 'a1' }), 2);
  assert.deepEqual((await d.leggi('punti_odg')).map((p) => p.id), ['p3']);
  assert.deepEqual(await d.leggi('voti'), []);
  assert.equal(await d.elimina('punti_odg', { id: 'inesistente' }), 0);
  await assert.rejects(d.elimina('punti_odg', {}), /chiave/i);
});

test('ascolta avvisa a ogni modifica delle tabelle richieste, finché non si smette', async () => {
  const d = nuovo();
  const visti = [];
  const smetti = d.ascolta(['presenze', 'voti'], (tabella) => visti.push(tabella));
  await d.inserisci('presenze', [{ assemblea_id: 'a1', testa_id: 't1' }]);
  await d.aggiorna('presenze', { assemblea_id: 'a1', testa_id: 't1' }, { stato: 'presente' });
  await d.salva('voti', [{ punto_id: 'p2', testa_id: 't1', voto: 'favorevole' }], ['punto_id', 'testa_id']);
  await d.elimina('voti', { punto_id: 'p2' });
  await d.inserisci('assemblee', [{ data: '2026-05-01', tipo: 'ordinaria' }]);
  await d.leggi('presenze');
  await unTick();
  assert.deepEqual(visti, ['presenze', 'presenze', 'voti', 'voti']);
  smetti();
  await d.elimina('presenze', { assemblea_id: 'a1' });
  await unTick();
  assert.equal(visti.length, 4);
});

test('un\'operazione che non cambia nulla non avvisa', async () => {
  const d = nuovo();
  let avvisi = 0;
  d.ascolta(['punti_odg'], () => { avvisi += 1; });
  await d.elimina('punti_odg', { id: 'inesistente' });
  await d.aggiorna('punti_odg', { id: 'inesistente' }, { testo: 'x' });
  await unTick();
  assert.equal(avvisi, 0);
});

test('caricaFile conserva il file e urlFile lo rende apribile', async () => {
  const d = nuovo();
  const percorso = await d.caricaFile('deleghe', 'a1/d1.pdf', new Blob(['prova'], { type: 'application/pdf' }));
  assert.equal(percorso, 'a1/d1.pdf');
  assert.match(await d.urlFile('deleghe', 'a1/d1.pdf'), /^blob:/);
  await assert.rejects(d.urlFile('deleghe', 'a1/mancante.pdf'), /non trovato/i);
});

test('i dati di prova bastano a provare il limite del quinto e le tabelle parziali', () => {
  const dati = datiProva();
  const modello = costruisciModello(dati, '2026-10-12');
  assert.ok(modello.teste.length > 20, `servono più di 20 teste, sono ${modello.teste.length}`);
  assert.ok(modello.teste.some((t) => t.soggetti.length > 1), 'manca una testa di comproprietari');
  assert.ok(modello.teste.some((t) => t.unita.length > 1), 'manca un proprietario con più unità');
  assert.ok(modello.unita.some((u) => u.altri.some((a) => a.ruolo === 'conduttore')), 'manca un conduttore');
  assert.ok(modello.parti.length >= 2, 'servono almeno due tabelle parziali');
  for (const tabella of modello.tabelle) {
    const somma = dati.millesimi.filter((m) => m.tabella_id === tabella.id).reduce((s, m) => s + Math.round(Number(m.valore) * 1000), 0);
    assert.equal(somma, Math.round(Number(tabella.totale_dichiarato) * 1000), `la tabella ${tabella.nome} non quadra`);
  }
  // ogni chiamata dà una copia nuova: un deposito non sporca l'altro
  assert.notEqual(datiProva().unita, dati.unita);
});

test('eliminaFile toglie il file dall\'archivio; se non c\'è non è un errore', async () => {
  const d = nuovo();
  await d.caricaFile('deleghe', 'a1/d1.pdf', new Blob(['prova']));
  await d.caricaFile('deleghe', 'a1/d2.pdf', new Blob(['altra']));
  await d.eliminaFile('deleghe', 'a1/d1.pdf');
  await assert.rejects(d.urlFile('deleghe', 'a1/d1.pdf'), /non trovato/i);
  assert.match(await d.urlFile('deleghe', 'a1/d2.pdf'), /^blob:/);
  await d.eliminaFile('deleghe', 'a1/d1.pdf');
  await d.eliminaFile('verbali', 'a1/d2.pdf'); // stesso percorso, altro bucket: non tocca le deleghe
  assert.match(await d.urlFile('deleghe', 'a1/d2.pdf'), /^blob:/);
});
