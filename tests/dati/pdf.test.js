import { test } from 'node:test';
import assert from 'node:assert/strict';
import { righeDaFrammenti } from '../../src/dati/pdf.js';
import { leggiConvocazione } from '../../src/assemblea/convocazione.js';

// un frammento come li restituisce pdf.js: l'origine è in basso a sinistra, quindi y cala scendendo
const f = (str, x, y, width = str.length * 5, height = 10) => ({ str, transform: [height, 0, 0, height, x, y], width, height });

test('i frammenti alla stessa altezza formano una riga, da sinistra a destra, anche se arrivano in disordine', () => {
  const righe = righeDaFrammenti([f('mondo', 80, 700.4), f('Seconda riga', 50, 688), f('Ciao', 50, 700)]);
  assert.deepEqual(righe, ['Ciao mondo', 'Seconda riga']);
});

test('frammenti che si toccano sono la stessa parola; quelli vuoti si ignorano', () => {
  const righe = righeDaFrammenti([f('Con', 50, 700, 15), f('vocazione', 65, 700, 45), f(' ', 110, 700, 3), f('assemblea', 113, 700, 45), f('', 0, 0)]);
  assert.deepEqual(righe, ['Convocazione assemblea']);
});

test('uno stacco verticale ampio diventa una riga vuota', () => {
  assert.deepEqual(righeDaFrammenti([f('Titolo', 50, 700), f('Testo', 50, 660), f('ancora', 50, 648)]), ['Titolo', '', 'Testo', 'ancora']);
});

test('nessun frammento, o dati senza senso: nessuna riga e nessun errore', () => {
  assert.deepEqual(righeDaFrammenti([]), []);
  assert.deepEqual(righeDaFrammenti(undefined), []);
  assert.deepEqual(righeDaFrammenti([null, {}, { str: 'x' }, { str: 3, transform: [] }]), []);
});

test('le righe ricostruite si leggono con leggiConvocazione', () => {
  const frammenti = [
    f('Borgo Finto, li 02/03/2027', 50, 760),
    f('I Signori Condomini sono convocati in Assemblea Straordinaria di prima convocazione il giorno', 50, 720),
    f('8 Aprile 2027 alle ore 07:00 presso Studio Esempio e, mancando il numero legale, in seconda convocazione il giorno', 50, 708),
    f('9 Aprile 2027', 200, 690), f('alle ore 20:45', 200, 678), f('SALA DEI TIGLI - VIA FINTA 1', 150, 660),
    f('per discutere e deliberare sul seguente:', 50, 640), f('ORDINE DEL GIORNO', 200, 620),
    f('1.', 70, 600, 8), f('Rifacimento della facciata: scelta', 85, 600), f('dell\'impresa', 100, 588),
    f('2.', 70, 576, 8), f('Varie ed eventuali', 85, 576),
    f('L\' Amministratore', 400, 540),
  ];
  const c = leggiConvocazione(righeDaFrammenti(frammenti).join('\n'));
  assert.equal(c.tipo, 'straordinaria');
  assert.equal(c.data_lettera, '2027-03-02');
  assert.deepEqual(c.prima, { data: '2027-04-08', ora: '07:00', luogo: 'Studio Esempio' });
  assert.deepEqual(c.seconda, { data: '2027-04-09', ora: '20:45', luogo: 'SALA DEI TIGLI - VIA FINTA 1' });
  assert.deepEqual(c.punti.map((p) => p.testo), ['Rifacimento della facciata: scelta dell\'impresa', 'Varie ed eventuali']);
  assert.deepEqual(c.avvisi, []);
});
