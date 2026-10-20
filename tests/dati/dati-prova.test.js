// I dati finti della modalità prova devono bastare a provare contabilità, assemblee storiche e documenti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datiProva, fileProva } from '../../src/dati/dati-prova.js';
import { creaDepositoProva } from '../../src/dati/deposito-prova.js';
import { eserciziPerAnno, raffronto, situazionePatrimoniale, raggruppaPartite } from '../../src/dati/contabilita.js';
import { contaEsiti, esitoPunto } from '../../src/assemblea/delibere.js';
import { archivioUnico } from '../../src/dati/documenti.js';

test('contabilità di prova: almeno due anni con preventivo e consuntivo e uno con il solo preventivo', () => {
  const dati = datiProva();
  const anni = eserciziPerAnno(dati.esercizi);
  assert.ok(anni.filter((a) => a.consuntivo && a.preventivo).length >= 2);
  assert.ok(anni.some((a) => !a.consuntivo && a.preventivo));
  // i totali dichiarati nei commenti di dati-prova.js
  const totali = Object.fromEntries(anni.filter((a) => a.consuntivo).map((a) => [a.anno, raffronto(dati.spese, dati.conti, a.preventivo.id, a.consuntivo.id).totale]));
  assert.deepEqual([totali[2024].preventivo, totali[2024].consuntivo, totali[2024].sforamento], [-1190000, -1237605, true]);
  assert.deepEqual([totali[2025].preventivo, totali[2025].consuntivo, totali[2025].sforamento], [-1260000, -1234610, false]);
  // ogni spesa ha un conto e un esercizio che esistono
  for (const s of dati.spese) {
    assert.ok(dati.conti.some((c) => c.id === s.conto_id) && dati.esercizi.some((e) => e.id === s.esercizio_id), `spesa ${s.id} scollegata`);
  }
});

test('contabilità di prova: la situazione patrimoniale quadra e le partite verso terzi tornano con le sue voci', () => {
  const dati = datiProva();
  const sp = situazionePatrimoniale(dati.stato_patrimoniale, 'es-2025');
  assert.deepEqual([sp.totaleAttivita, sp.totalePassivita, sp.quadra], [1123075, 1123075, true]);
  assert.equal(raggruppaPartite(dati.partite_terzi, { esercizioId: 'es-2025', tipo: 'debito' }).totale, 398025);
  assert.equal(raggruppaPartite(dati.partite_terzi, { esercizioId: 'es-2025', tipo: 'credito' }).totale, 35000);
});

test('assemblee di prova: una da aprire, una conclusa con la seduta registrata, una archiviata con esiti a mano', () => {
  const dati = datiProva();
  const puntiDi = (id) => dati.punti_odg.filter((p) => p.assemblea_id === id);
  const testeDi = (id) => dati.teste_assemblea.filter((t) => t.assemblea_id === id);
  assert.equal(dati.assemblee.find((a) => a.id === 'asm-prova').stato, 'bozza');
  assert.ok(dati.assemblee.filter((a) => a.stato === 'chiusa' && puntiDi(a.id).length).length >= 2);

  // seduta registrata: teste, presenze per ogni testa, esiti calcolati dai voti
  assert.equal(testeDi('asm-2025').length, 25);
  assert.equal(dati.presenze.filter((p) => p.assemblea_id === 'asm-2025').length, 25);
  assert.deepEqual(puntiDi('asm-2025').map((p) => [esitoPunto(p).stato, esitoPunto(p).manuale, p.esito.favorevoli.teste, p.esito.presenti.teste]), [
    ['approvata', false, 17, 17], ['approvata', false, 13, 17], ['respinta', false, 5, 17],
  ]);
  // archiviata: nessuna testa, esiti a mano di tutti i tipi e un punto senza esito
  assert.equal(testeDi('asm-2024').length, 0);
  assert.deepEqual(contaEsiti(puntiDi('asm-2024')), { approvata: 1, respinta: 1, non_deliberata: 1, da_votare: 1, manuali: 3 });
  assert.ok(dati.todo.some((t) => t.punto_id && dati.punti_odg.some((p) => p.id === t.punto_id)));
});

test('documenti di prova: ogni file indicato nei dati esiste nell\'archivio di prova', async () => {
  const dati = datiProva();
  assert.ok(dati.documenti.length >= 2);
  const deposito = creaDepositoProva(dati, fileProva());
  const voci = archivioUnico({ documenti: dati.documenti, assemblee: dati.assemblee, verbali: dati.verbali, titoloAssemblea: (a) => a.data });
  assert.ok(voci.some((v) => v.origine === 'convocazione') && voci.some((v) => v.origine === 'verbale'));
  for (const v of voci) assert.match(await deposito.urlFile(v.bucket, v.percorso), /^blob:/, v.chiave);
});
