// Deposito di prova: tabelle dell'archivio documenti e della situazione patrimoniale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaDepositoProva } from '../../src/dati/deposito-prova.js';

const nuovo = () => creaDepositoProva({
  assemblee: [{ id: 'a1', data: '2026-01-10', stato: 'bozza' }, { id: 'a2', data: '2026-02-10', stato: 'chiusa' }],
  punti_odg: [{ id: 'p1', assemblea_id: 'a1', ordine: 1, testo: 'Primo' }, { id: 'p3', assemblea_id: 'a2', ordine: 1, testo: 'Altro' }],
});

test('documenti: titolo, tipo e file sono obbligatori; il tipo deve essere tra quelli ammessi; l\'id si può scegliere', async () => {
  const d = nuovo();
  const valido = { id: 'doc-1', titolo: 'Rendiconto', tipo: 'rendiconto', file_path: '2025/doc-1.pdf' };
  const [doc] = await d.salva('documenti', [valido], ['id']);
  assert.deepEqual([doc.id, doc.anno, doc.assemblea_id, doc.note], ['doc-1', null, null, null]);
  // ripetere il salvataggio con lo stesso id aggiorna la riga, non ne crea un'altra
  await d.salva('documenti', [{ ...valido, titolo: 'Rendiconto 2025', anno: 2025 }], ['id']);
  assert.deepEqual((await d.leggi('documenti')).map((x) => [x.titolo, x.anno]), [['Rendiconto 2025', 2025]]);
  await assert.rejects(d.inserisci('documenti', [{ titolo: 'Senza file', tipo: 'altro' }]), /manca file_path/);
  await assert.rejects(d.inserisci('documenti', [{ titolo: '', tipo: 'altro', file_path: 'x' }]), /manca titolo/);
  await assert.rejects(d.inserisci('documenti', [{ titolo: 'Tipo sbagliato', tipo: 'bilancio', file_path: 'x' }]), /valori ammessi/);
  assert.equal((await d.leggi('documenti')).length, 1);
});

test('eliminando un\'assemblea i documenti e i to-do collegati restano, senza più il collegamento', async () => {
  const d = nuovo();
  await d.inserisci('documenti', [{ titolo: 'Convocazione', tipo: 'convocazione', file_path: 'x.pdf', assemblea_id: 'a1' }]);
  await d.inserisci('todo', [{ descrizione: 'Da fare', assemblea_id: 'a1', punto_id: 'p1' }, { descrizione: 'Altro', assemblea_id: 'a2', punto_id: 'p3' }]);
  await d.elimina('assemblee', { id: 'a1' });
  assert.deepEqual((await d.leggi('documenti')).map((x) => x.assemblea_id), [null]);
  assert.deepEqual((await d.leggi('todo')).map((t) => [t.assemblea_id, t.punto_id]), [[null, null], ['a2', 'p3']]);
});

test('situazione patrimoniale e partite verso terzi: vincoli e cascata dall\'esercizio', async () => {
  const d = creaDepositoProva({ esercizi: [{ id: 'e1', anno: 2025, tipo: 'consuntivo' }] });
  await d.inserisci('stato_patrimoniale', [{ esercizio_id: 'e1', lato: 'attivita', ordine: 1, voce: 'Banca', importo: '10.00' }]);
  await assert.rejects(d.inserisci('stato_patrimoniale', [{ esercizio_id: 'e1', lato: 'attivita', ordine: 1, voce: 'Doppia', importo: '1.00' }]), /esiste già/);
  await assert.rejects(d.inserisci('stato_patrimoniale', [{ esercizio_id: 'e1', lato: 'altro', ordine: 2, voce: 'Lato sbagliato', importo: '1.00' }]), /valori ammessi/);
  const [p] = await d.inserisci('partite_terzi', [{ esercizio_id: 'e1', tipo: 'debito', descrizione: 'Fattura', importo: '5.00' }]);
  assert.deepEqual([p.controparte, p.protocollo], [null, null]);
  await assert.rejects(d.inserisci('partite_terzi', [{ esercizio_id: 'e1', tipo: 'prestito', descrizione: 'x', importo: '1.00' }]), /valori ammessi/);
  await d.elimina('esercizi', { id: 'e1' });
  assert.deepEqual([await d.leggi('stato_patrimoniale'), await d.leggi('partite_terzi')], [[], []]);
});

test('i file iniziali del deposito di prova sono subito apribili', async () => {
  const d = creaDepositoProva({}, { 'documenti/2025/a.txt': new Blob(['prova']) });
  assert.match(await d.urlFile('documenti', '2025/a.txt'), /^blob:/);
  await assert.rejects(d.urlFile('verbali', '2025/a.txt'), /non trovato/i);
});
