import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembla } from '../../src/estrazione/assembla.js';
import { controlliRiparto } from '../../src/estrazione/controlli-riparto.js';

// Un riparto (come quello del 2023) con tre colonne di saldi precedenti: quello ordinario e due gestioni a parte.
const blocco = (parte, pagina, dati) => ({ sezione: 'riparto', parte, pagina_da: pagina, pagina_a: pagina, stato: 'fatto', dati: { arrotondamenti: [], totale: [], incerte: [], ...dati } });
const cella = (colonna, importo, millesimi = '') => ({ colonna, importo, millesimi });
const blocchi = [
  blocco(1, 1, { colonne: [{ titolo: '1 - SPESE GENERALI', millesimi: true }, { titolo: 'Movimenti personali', millesimi: false }, { titolo: 'Totale gestione', millesimi: false }],
    righe: [{ pagina: 1, codice: 'A1', intestatario: 'ROSSI', etichetta: 'Pr', celle: [cella(1, '-100,00', '10,000'), cella(2, '0,00'), cella(3, '-100,00')] }] }),
  blocco(2, 2, { colonne: [{ titolo: 'Saldi di fine Es. prec.', millesimi: false }, { titolo: 'Saldi es. SENTENZA TERMOCENTRO', millesimi: false },
    { titolo: 'Saldi es. BONIFICA SERBATOI', millesimi: false }, { titolo: 'Rate versate', millesimi: false }, { titolo: 'Saldo finale', millesimi: false }],
    righe: [{ pagina: 2, codice: 'A1', intestatario: 'ROSSI', etichetta: 'Pr', celle: [cella(1, '-20,00'), cella(2, '5,00'), cella(3, '-30,00'), cella(4, '100,00'), cella(5, '-45,00')] }] }),
];

test('saldo finale: si sommano tutte le colonne dei saldi precedenti, non solo la prima', () => {
  const { riparto } = assembla(blocchi);
  assert.equal(riparto.colonne.filter((c) => c.ruolo === 'saldo_precedente').length, 3);
  const esiti = controlliRiparto(riparto);
  assert.ok(!esiti.some((e) => e.codice === 'riga_saldo_finale' && e.livello === 'errore'));
  assert.match(esiti.find((e) => e.codice === 'riga_saldo_finale').messaggio, /i 3 saldi precedenti/);
});
