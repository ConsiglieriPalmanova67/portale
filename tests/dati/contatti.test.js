import { test } from 'node:test';
import assert from 'node:assert/strict';
import { email, telefono, partitaIva, iban, ibanLeggibile, indirizzoWeb } from '../../src/dati/contatti.js';

test('email e telefono: vuoti diventano null, quelli sbagliati sono rifiutati', () => {
  assert.equal(email('  Mario.Rossi@Esempio.IT '), 'mario.rossi@esempio.it');
  assert.equal(email(''), null);
  assert.throws(() => email('mario@'), /non sembra un indirizzo/);
  assert.equal(email('a@x.it; B@y.it,a@x.it'), 'a@x.it, b@y.it');
  assert.throws(() => email('a@x.it, rotto'), /«rotto»/);
  assert.equal(telefono('+39 02  1234567'), '+39 02 1234567');
  assert.throws(() => telefono('chiamami'), /non sembra un numero/);
});

test('partita IVA: 11 cifre con la cifra di controllo', () => {
  assert.equal(partitaIva('IT 13522600967'), '13522600967');
  assert.throws(() => partitaIva('13522600968'), /non è valida/);
  assert.throws(() => partitaIva('1234'), /11 cifre/);
});

test('IBAN: spazi tolti, codice di controllo verificato, lunghezza italiana', () => {
  assert.equal(iban('it60 x054 2811 1010 0000 0123 456'), 'IT60X0542811101000000123456');
  assert.throws(() => iban('IT61X0542811101000000123456'), /non è valido/);
  assert.throws(() => iban('IT60X054281110100000012345'), /27 caratteri/);
  assert.equal(ibanLeggibile('IT60X0542811101000000123456'), 'IT60 X054 2811 1010 0000 0123 456');
});

test('indirizzo web: completato con https, rifiutato se non è un sito', () => {
  assert.equal(indirizzoWeb('www.miocondominio.eu'), 'https://www.miocondominio.eu/');
  assert.equal(indirizzoWeb(' http://esempio.it/area '), 'http://esempio.it/area');
  assert.throws(() => indirizzoWeb(''), /Scrivi/);
  assert.throws(() => indirizzoWeb('javascript:alert(1)'), /non sembra/);
  assert.throws(() => indirizzoWeb('ciao'), /non sembra/);
});
