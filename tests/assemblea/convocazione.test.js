import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiConvocazione } from '../../src/assemblea/convocazione.js';

// Stessa struttura di una convocazione vera (testo estratto dal PDF), con nomi e luoghi di fantasia.
// Le lettere accentate arrivano rovinate, come capita con l'estrazione.
const ESEMPIO = `Amministrazione Stabili di Fantasia

STUDIO ESEMPIO

20100 Borgo Finto - via dei Platani 12
Tel. 0200000000
e-mail: studio@esempio.invalid

Attivit� svolta in conformit� a quanto stabilito dalla Legge n.4 del 14/01/2013, G.U. 24/01/2013

                                              ALBERI ADA - BOSCHI BRUNO
                                                                                            VIA DEI TIGLI 3
                                                                                                  20100 Borgo Finto BF

Borgo Finto, li 23/09/2026

Oggetto: Convocazione assemblea Ordinaria CONDOMINIO I TIGLI

          I Signori Condomini sono convocati in Assemblea Ordinaria di prima convocazione il giorno Luned�
19 Ottobre 2026 alle ore 00:00 presso Studio Esempio - via dei Platani 12 - Borgo Finto e, mancando il numero legale,
in seconda convocazione il giorno

                                  Marted� 20 Ottobre 2026
                                          alle ore 21:00

    SALA PARROCCHIALE DI S.FINTO - VIA DELLE ROSE 5 - BORGO FINTO

per discutere e deliberare sul seguente:

                                            ORDINE DEL GIORNO

          1. Approvazione rendiconto consuntivo esercizio 2025 e riparto (gi� a vs mani)
          2. Approvazione preventivo esercizio 2026 (gi� a vs mani)
          3. Nomina amministratore, determinazione emolumento
          4. Nomina dei consiglieri della casa
          5. Aggiornamento pratica dismissione cisterne: prescrizioni del Comune, opere di

                completamento, delibere in merito
          6. Impermeabilizzazione cortile che causa grosse infiltrazioni nei box: incarico a professionista

                per progetti, delibere in merito
          7. Opere di adeguamento per SCIA antincendio: delibere in merito
          8. Varie ed eventuali

Si invitano i signori condomini a mantenere aggiornati i riferimenti di contatto (numero telefono e email)

                                                                                                  L' Amministratore

  DELEGA DI PARTECIPAZIONE AD ASSEMBLEA

  (C.c. Art. 1136; Att. C.c., Art. 67)
  Il sottoscritto ALBERI ADA - BOSCHI BRUNO titolare per millesimi 9,999,
  rappresentanti la sua quota condominiale delega il signor:

  _____________________________________________________________
  a rappresentarlo all'assemblea Ordinaria del condominio I TIGLI che si terr� nel giorno: 2�
  conv. 20/10/2026 ore 21:00.

                                                         ___________________________________________________
                                                                                                                           Firma Leggibile
`;

test('convocazione completa: tipo, lettera, prima e seconda convocazione', () => {
  const c = leggiConvocazione(ESEMPIO);
  assert.equal(c.tipo, 'ordinaria');
  assert.equal(c.data_lettera, '2026-09-23');
  assert.deepEqual(c.prima, { data: '2026-10-19', ora: '00:00', luogo: 'Studio Esempio - via dei Platani 12 - Borgo Finto' });
  assert.deepEqual(c.seconda, { data: '2026-10-20', ora: '21:00', luogo: 'SALA PARROCCHIALE DI S.FINTO - VIA DELLE ROSE 5 - BORGO FINTO' });
});

test('convocazione completa: otto punti, quelli a capo ricomposti, niente del modulo di delega', () => {
  const { punti } = leggiConvocazione(ESEMPIO);
  assert.deepEqual(punti.map((p) => p.ordine), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(punti[0].testo, 'Approvazione rendiconto consuntivo esercizio 2025 e riparto (gi� a vs mani)');
  assert.equal(punti[4].testo, 'Aggiornamento pratica dismissione cisterne: prescrizioni del Comune, opere di completamento, delibere in merito');
  assert.equal(punti[5].testo, 'Impermeabilizzazione cortile che causa grosse infiltrazioni nei box: incarico a professionista per progetti, delibere in merito');
  assert.equal(punti[7].testo, 'Varie ed eventuali');
  assert.deepEqual(punti.map((p) => p.tipo), ['delibera', 'delibera', 'delibera', 'nomina_consiglieri', 'delibera', 'delibera', 'delibera', 'delibera']);
  const tutto = JSON.stringify(leggiConvocazione(ESEMPIO));
  for (const vietato of ['DELEGA', 'sottoscritto', 'ALBERI', '9,999', 'Si invitano', 'Amministratore', 'Firma']) {
    assert.ok(!tutto.includes(vietato), `non deve comparire "${vietato}"`);
  }
});

test('convocazione completa: l\'unico avviso riguarda le lettere accentate rovinate', () => {
  const { avvisi } = leggiConvocazione(ESEMPIO);
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0], /accentate/);
  assert.deepEqual(leggiConvocazione(ESEMPIO.replaceAll('�', 'a')).avvisi, []);
});

test('straordinaria, una sola convocazione, ore con il punto, numerazione con la parentesi, minuscole', () => {
  const c = leggiConvocazione(`Borgo Finto, 3 marzo 2027
oggetto: convocazione assemblea straordinaria
i signori condomini sono convocati in assemblea straordinaria in seconda convocazione il giorno 12 aprile 2027 alle ore 20.30 presso la sala comune di via dei Tigli 3 per deliberare sul seguente
ordine del giorno:
1) rifacimento del tetto
2) nomina consiglieri
3) varie
Distinti saluti`);
  assert.equal(c.tipo, 'straordinaria');
  assert.equal(c.data_lettera, '2027-03-03');
  assert.deepEqual(c.prima, { data: null, ora: null, luogo: null });
  assert.deepEqual(c.seconda, { data: '2027-04-12', ora: '20:30', luogo: 'la sala comune di via dei Tigli 3' });
  assert.deepEqual(c.punti, [
    { ordine: 1, testo: 'rifacimento del tetto', tipo: 'delibera' },
    { ordine: 2, testo: 'nomina consiglieri', tipo: 'nomina_consiglieri' },
    { ordine: 3, testo: 'varie', tipo: 'delibera' },
  ]);
  assert.equal(c.avvisi.length, 1);
  assert.match(c.avvisi[0], /una sola convocazione/i);
});

test('una convocazione senza dire quale: vale come prima, con avviso', () => {
  const c = leggiConvocazione(`I condomini sono convocati in assemblea ordinaria il giorno 05/06/2027 alle ore 18 presso Sala Blu, via Finta 1
ORDINE DEL GIORNO
1. Bilancio`);
  assert.deepEqual(c.prima, { data: '2027-06-05', ora: '18:00', luogo: 'Sala Blu, via Finta 1' });
  assert.deepEqual(c.seconda, { data: null, ora: null, luogo: null });
  assert.equal(c.data_lettera, null);
  assert.ok(c.avvisi.some((a) => /lettera/i.test(a)));
});

test('righe ricostruite senza righe vuote (come dal PDF nel browser): stesso risultato', () => {
  const compatto = ESEMPIO.split('\n').filter((r) => r.trim()).join('\n');
  const a = leggiConvocazione(compatto);
  const b = leggiConvocazione(ESEMPIO);
  assert.deepEqual(a, b);
});

test('una riga di continuazione che comincia con la maiuscola dopo una riga vuota chiude l\'elenco', () => {
  const { punti } = leggiConvocazione(`ORDINE DEL GIORNO
1. Primo punto
2. Secondo punto

Cordialmente, lo studio`);
  assert.deepEqual(punti.map((p) => p.testo), ['Primo punto', 'Secondo punto']);
});

test('date e ore impossibili restano vuote', () => {
  const c = leggiConvocazione(`Assemblea ordinaria in prima convocazione il giorno 31 febbraio 2027 alle ore 25:00 presso Sala
e in seconda convocazione il giorno 40/13/2027 alle ore 21:75 presso Sala`);
  assert.deepEqual([c.prima.data, c.prima.ora, c.seconda.data, c.seconda.ora], [null, null, null, null]);
  assert.ok(c.avvisi.length >= 4);
});

test('testo qualsiasi: nessun errore, tutto vuoto e avvisi leggibili', () => {
  for (const testo of ['', '   \n\n ', 'lorem ipsum dolor sit amet', '1. 2. 3.', null, undefined, 42, '�'.repeat(500), 'ORDINE DEL GIORNO', '((((', 'ore ore ore prima convocazione seconda convocazione il giorno']) {
    const c = leggiConvocazione(testo);
    assert.equal(c.tipo, null);
    assert.equal(c.data_lettera, null);
    assert.deepEqual(c.prima, { data: null, ora: null, luogo: null });
    assert.deepEqual(c.seconda, { data: null, ora: null, luogo: null });
    assert.deepEqual(c.punti, []);
    assert.ok(c.avvisi.length > 0);
    assert.ok(c.avvisi.every((a) => typeof a === 'string' && a.length > 10));
  }
});
