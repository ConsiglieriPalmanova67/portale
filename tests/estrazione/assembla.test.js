import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembla, applicaCorrezioni, normalizzaCodice, ruoloColonna, elencoCorrezioni } from '../../src/estrazione/assembla.js';
import { fascicolo } from './aiuti.js';

const blocco = (sezione, pagina_da, pagina_a, dati, altro = {}) => ({ sezione, parte: null, pagina_da, pagina_a, stato: 'fatto', dati, ...altro });
const cella = (colonna, importo, millesimi = '') => ({ colonna, importo, millesimi });
const riga = (pagina, codice, intestatario, etichetta, celle) => ({ pagina, codice, intestatario, etichetta, celle });

test('normalizzaCodice: "44" senza A, "A109 .2", ".2" finito nel nome', () => {
  assert.deepEqual(normalizzaCodice('44', 'VERDI VERA'), { codice: 'A44', intestatario: 'VERDI VERA' });
  assert.deepEqual(normalizzaCodice('A109 .2', 'FINTA SRL***'), { codice: 'A109.2', intestatario: 'FINTA SRL***' });
  assert.deepEqual(normalizzaCodice('A109', '.2 FINTA SRL***'), { codice: 'A109.2', intestatario: 'FINTA SRL***' });
  assert.deepEqual(normalizzaCodice(' a7 ', '  ROSSI   Remo '), { codice: 'A7', intestatario: 'ROSSI Remo' });
  assert.deepEqual(normalizzaCodice('', 'Arrotondamenti'), { codice: '', intestatario: 'Arrotondamenti' });
});

test('ruoloColonna: le colonne speciali si riconoscono dal titolo, le altre sono tabelle', () => {
  assert.equal(ruoloColonna('1 - SPESE GENERALI', true), 'tabella');
  assert.equal(ruoloColonna('CONDOMINIO C', true), 'tabella');
  assert.equal(ruoloColonna('Movimenti personali', false), 'movimenti_personali');
  assert.equal(ruoloColonna('Totale gestione', false), 'totale_gestione');
  assert.equal(ruoloColonna('Saldi di fine Es. prec.', false), 'saldo_precedente');
  assert.equal(ruoloColonna('Rate versate', false), 'rate_versate');
  assert.equal(ruoloColonna('Saldo finale', false), 'saldo_finale');
  assert.equal(ruoloColonna('Note', false), 'altro');
});

// Un riparto in due parti: la prima su due blocchi, con codici stampati in modo irregolare e due righe per A2.
const RIPARTO = [
  blocco('riparto', 9, 10, {
    colonne: [{ titolo: '1 - SPESE GENERALI', millesimi: true }, { titolo: '4 - PROPRIETA\'', millesimi: true }],
    righe: [riga(9, 'A1', 'ALBERI ADA', 'Pr', [cella(1, '-60,00', '600,000'), cella(2, '-30,00', '600')]),
      riga(9, 'A2', 'BOSCHI BRUNO', 'Pr', [cella(1, '-25,00', '250,000'), cella(2, '-12,50', '250')]),
      riga(10, 'A2', 'CAMPI CARLA', 'Co', [cella(1, '-5,00', '50,000'), cella(2, '0,00', '0')])],
    arrotondamenti: [], totale: [], incerte: [],
  }, { parte: 1 }),
  blocco('riparto', 11, 11, {
    colonne: [{ titolo: '1 - Spese generali', millesimi: true }, { titolo: '4 - PROPRIETA\'', millesimi: true }],
    righe: [riga(11, '44', 'DORIA DINO', 'Pr', [cella(1, '-5,00', '50,000'), cella(2, '-5,00', '100')]),
      riga(11, 'A109', '.2 FINTA SRL***', 'Pr', [cella(1, '-5,00', '50,000'), cella(2, '-2,50', '50')]),
      // arrotondamenti e totale arrivati come righe qualsiasi: vanno riconosciuti lo stesso
      riga(11, '', 'Arrotondamenti', '', [cella(1, '0,01')]),
      riga(11, 'TOTALE', 'TOTALE COMPLESSIVO', '', [cella(1, '-99,99', '1.000,000'), cella(2, '-50,00', '1000')])],
    arrotondamenti: [], totale: [], incerte: [{ pagina: 11, riga: '44', campo: 'importo', nota: 'macchia' }],
  }, { parte: 1 }),
  blocco('riparto', 12, 12, {
    colonne: [{ titolo: 'Totale gestione', millesimi: false }, { titolo: 'Saldi di fine Es. prec.', millesimi: false }],
    righe: [riga(12, 'A1', 'ALBERI ADA', 'Pr', [cella(1, '-90,00'), cella(2, '1,50')]), riga(12, 'A2', 'BOSCHI BRUNO', 'Pr', [cella(1, '-37,50'), cella(2, '0,00')]),
      riga(12, 'A2', 'CAMPI CARLA', 'Co', [cella(1, '-5,00'), cella(2, '-2,00')]), riga(12, 'A 44', 'DORIA DINO', 'Pr', [cella(1, '-10,00'), cella(2, '0,00')]),
      riga(12, 'A109 .2', 'FINTA SRL***', 'Pr', [cella(1, '-7,50'), cella(2, '0,00')])],
    arrotondamenti: [{ colonna: 1, importo: '0,01' }], totale: [cella(1, '-149,99'), cella(2, '-0,50')], incerte: [],
  }, { parte: 2 }),
];

test('riparto: le parti si uniscono per posizione, con i codici normalizzati e più righe per la stessa unità', () => {
  const { riparto, incerte } = assembla(RIPARTO);
  assert.deepEqual(riparto.colonne.map((c) => [c.chiave, c.ruolo, c.parte]), [
    ['1_spese_generali', 'tabella', 1], ['4_proprieta', 'tabella', 1], ['totale_gestione', 'totale_gestione', 2], ['saldi_di_fine_es_prec', 'saldo_precedente', 2],
  ]);
  assert.deepEqual(riparto.parti.map((p) => p.righe.map((r) => r.codice)), [['A1', 'A2', 'A2', 'A44', 'A109.2'], ['A1', 'A2', 'A2', 'A44', 'A109.2']]);
  assert.deepEqual(riparto.righe.map((r) => [r.codice, r.n, r.intestatario, r.etichetta]), [
    ['A1', 1, 'ALBERI ADA', 'Pr'], ['A2', 1, 'BOSCHI BRUNO', 'Pr'], ['A2', 2, 'CAMPI CARLA', 'Co'], ['A44', 1, 'DORIA DINO', 'Pr'], ['A109.2', 1, 'FINTA SRL***', 'Pr'],
  ]);
  const a2co = riparto.righe[2];
  assert.equal(a2co.valori['1_spese_generali'].importo, '-5,00');
  assert.equal(a2co.valori.totale_gestione.importo, '-5,00');
  assert.equal(a2co.valori.saldi_di_fine_es_prec.importo, '-2,00');
  // ogni cella sa da dove viene: è la chiave delle correzioni
  assert.equal(riparto.righe[3].valori['1_spese_generali'].origine, 'riparto:11|righe.0.celle.0');
  assert.equal(riparto.righe[3].valori.totale_gestione.origine, 'riparto:12|righe.3.celle.0');
  assert.equal(riparto.arrotondamenti['1_spese_generali'].importo, '0,01');
  assert.equal(riparto.totale['4_proprieta'].millesimi, '1000');
  assert.equal(riparto.totale.totale_gestione.importo, '-149,99');
  assert.deepEqual(incerte, [{ sezione: 'riparto', blocco: 'riparto:11', pagina: 11, riga: '44', campo: 'importo', nota: 'macchia' }]);
});

test('riparto: se le parti non hanno la stessa sequenza si uniscono per codice, senza perdere righe', () => {
  const sfasato = structuredClone(RIPARTO);
  sfasato[2].dati.righe.splice(1, 1); // nella seconda parte manca la riga del proprietario di A2
  const { riparto } = assembla(sfasato);
  assert.equal(riparto.righe.length, 5);
  assert.equal(riparto.righe.find((r) => r.codice === 'A44').valori.totale_gestione.importo, '-10,00');
  // la riga rimasta di A2 nella seconda parte è la prima con quel codice: si appaia alla prima della parte 1
  assert.equal(riparto.righe[1].valori.totale_gestione.importo, '-5,00');
  assert.equal(riparto.righe[2].valori.totale_gestione, undefined);
});

test('riparto: il ruolo di una colonna si può correggere a mano', () => {
  const { riparto } = assembla(RIPARTO, { ruoli: { saldi_di_fine_es_prec: 'altro' } });
  assert.equal(riparto.colonne.at(-1).ruolo, 'altro');
});

test('spese: i blocchi si accodano in ordine di pagina e ciò che viene dalla pagina di contesto si scarta', () => {
  const voce = (pagina, protocollo, importo) => ({ pagina, gruppo: 'SPESE GENERALI', sottoconto: 'PULIZIE', protocollo, fattura: '', descrizione: 'PULIZIA', fornitore: '', data_fattura: '', data_pagamento: '', importo });
  const { spese, mancanti } = assembla([
    blocco('spese', 8, 9, { voci: [voce(7, 'G3', '-30,00'), voce(8, 'G4', '-40,00')], totali: [{ pagina: 7, tipo: 'parziale_sottoconto', gruppo: 'X', sottoconto: 'Y', etichetta: '', importo: '-1,00' }], incerte: [] }, { contesto: 7 }),
    blocco('spese', 5, 7, { voci: [voce(5, 'G1', '-10,00'), voce(7, 'G3', '-30,00')], totali: [], incerte: [] }),
    { sezione: 'partite', parte: null, pagina_da: 3, pagina_a: 3, stato: 'errore', dati: null },
  ]);
  assert.deepEqual(spese.voci.map((v) => [v.protocollo, v.origine]), [['G1', 'spese:5|voci.0'], ['G3', 'spese:5|voci.1'], ['G4', 'spese:8|voci.1']]);
  assert.deepEqual(spese.totali, []);
  assert.deepEqual(mancanti, ['partite:3']);
});

test('correzioni: si applicano sopra i dati letti senza modificarli, e si possono elencare', () => {
  const { blocchi, dati } = fascicolo();
  const prima = structuredClone(blocchi);
  const celle = { 'spese:5|voci.1.importo': '-999,00', 'riparto:9|righe.8.intestatario': 'ORTI OMAR', 'patrimoniale:2|totale_attivita': '1,00', 'sparito:1|voci.0.importo': '5' };
  const corretti = applicaCorrezioni(blocchi, celle);
  assert.deepEqual(blocchi, prima);
  assert.equal(corretti.find((b) => b.sezione === 'spese').dati.voci[1].importo, '-999,00');
  const d = dati({ celle });
  assert.equal(d.spese.voci[1].importo, '-999,00');
  assert.equal(d.riparto.righe[8].intestatario, 'ORTI OMAR');
  assert.equal(d.patrimoniale.totale_attivita, '1,00');
  assert.deepEqual(elencoCorrezioni(blocchi, celle).map((c) => [c.sezione, c.pagina, c.letto, c.corretto]), [
    ['spese', 5, '-1.250,00', '-999,00'], ['riparto', 9, 'ORTI OMAR', 'ORTI OMAR'], ['patrimoniale', 2, '8.195,10', '1,00'], ['sparito', null, '', '5'],
  ]);
});

test('preventivo: un gruppo a cavallo di due blocchi resta un gruppo solo, con il totale stampato dove finisce', () => {
  const { preventivo } = assembla([
    blocco('preventivo', 20, 22, { esercizio: 'Esercizio ordinario "2027"', gruppi: [{ gruppo: 'SPESE GENERALI', totale: '', voci: [{ voce: 'PULIZIE', importo: '-10,00' }] }], totale: '', riquadro: [], incerte: [] }),
    blocco('preventivo', 23, 23, { esercizio: '', gruppi: [{ gruppo: 'Spese generali', totale: '-15,00', voci: [{ voce: 'GIARDINO', importo: '-5,00' }] }, { gruppo: 'ASCENSORE', totale: '-1,00', voci: [{ voce: 'CANONE', importo: '-1,00' }] }], totale: '-16,00', riquadro: [], incerte: [] }),
  ]);
  assert.deepEqual(preventivo.gruppi.map((g) => [g.gruppo, g.totale, g.voci.map((v) => v.voce)]), [['SPESE GENERALI', '-15,00', ['PULIZIE', 'GIARDINO']], ['ASCENSORE', '-1,00', ['CANONE']]]);
  assert.equal(preventivo.totale, '-16,00');
  assert.equal(preventivo.origineTotale, 'preventivo:23|totale');
});

test('fascicolo di fantasia: tutte le sezioni si assemblano', () => {
  const d = fascicolo().dati();
  assert.equal(d.spese.voci.length, 16);
  assert.equal(d.riparto.righe.length, 26);
  assert.deepEqual(d.riparto.parti.map((p) => p.colonne.length), [2, 4, 2]);
  assert.equal(d.partite.righe.length, 6);
  assert.equal(d.patrimoniale.attivita.length + d.patrimoniale.passivita.length, 7);
  assert.equal(d.raffronto.righe.length, 5);
  assert.deepEqual(d.mancanti, []);
});

test('spese: gruppo e sottoconto lasciati vuoti nelle pagine successive si ricavano dai titoli precedenti e dalle somme', () => {
  const voce = (pagina, gruppo, sottoconto, importo) => ({ pagina, gruppo, sottoconto, protocollo: 'G' + pagina + importo, importo });
  const { spese } = assembla([
    { sezione: 'spese', pagina_da: 1, pagina_a: 2, stato: 'fatto', dati: {
      voci: [voce(1, 'SPESE GENERALI', 'LUCE', '-10,00'), voce(2, 'SPESE GENERALI', 'PULIZIE', '-5,00')],
      totali: [{ pagina: 2, tipo: 'parziale_sottoconto', gruppo: 'SPESE GENERALI', sottoconto: 'LUCE', etichetta: '', importo: '-10,00' }] } },
    { sezione: 'spese', pagina_da: 3, pagina_a: 4, stato: 'fatto', dati: {
      voci: [voce(3, '', '', '-7,00'), voce(3, '', 'GIARDINO', '-20,00'), voce(4, 'RISCALDAMENTO', 'METANO', '-100,00')],
      totali: [
        { pagina: 3, tipo: 'parziale_sottoconto', gruppo: '', sottoconto: '', etichetta: '', importo: '-12,00' },
        { pagina: 3, tipo: 'parziale_sottoconto', gruppo: '', sottoconto: 'GIARDINO', etichetta: '', importo: '-20,00' },
        { pagina: 4, tipo: 'totale_gruppo', gruppo: '', sottoconto: '', etichetta: '', importo: '-42,00' },
      ] } },
  ]);
  assert.deepEqual(spese.voci.map((v) => [v.gruppo, v.sottoconto]), [
    ['SPESE GENERALI', 'LUCE'], ['SPESE GENERALI', 'PULIZIE'], ['SPESE GENERALI', 'PULIZIE'], ['SPESE GENERALI', 'GIARDINO'], ['RISCALDAMENTO', 'METANO'],
  ]);
  assert.deepEqual(spese.totali.map((t) => [t.tipo, t.gruppo, t.sottoconto]), [
    ['parziale_sottoconto', 'SPESE GENERALI', 'LUCE'], ['parziale_sottoconto', 'SPESE GENERALI', 'PULIZIE'],
    ['parziale_sottoconto', 'SPESE GENERALI', 'GIARDINO'], ['totale_gruppo', 'SPESE GENERALI', ''],
  ]);
});

test('spese: il seguito di una voce a cavallo di due blocchi si riattacca; chi è intestatario delle spese personali va in testa alla descrizione', () => {
  const voce = (pagina, protocollo, altro = {}) => ({ pagina, gruppo: 'G', sottoconto: 'S', protocollo, fattura: '', descrizione: 'PULIZIA MESI DI', fornitore: '', data_fattura: '', data_pagamento: '', importo: '-10,00', ...altro });
  const blocchi = [
    { sezione: 'spese', pagina_da: 5, pagina_a: 7, stato: 'fatto', dati: { voci: [voce(7, 'G219')], totali: [] } },
    { sezione: 'spese', pagina_da: 8, pagina_a: 9, stato: 'fatto', dati: {
      seguito: { protocollo: 'G219', descrizione: 'LUGLIO/AGOSTO', fornitore: 'ROSSI SRL', data_fattura: '06/10/2025', data_pagamento: '' },
      voci: [voce(8, 'P9', { intestato_a: 'A21 ROSSI', descrizione: 'ONORARI' })], totali: [] } },
  ];
  const { voci } = assembla(blocchi).spese;
  assert.equal(voci[0].descrizione, 'PULIZIA MESI DI LUGLIO/AGOSTO');
  assert.deepEqual([voci[0].fornitore, voci[0].data_fattura, voci[0].data_pagamento], ['ROSSI SRL', '06/10/2025', '']);
  assert.equal(voci[1].descrizione, 'A21 ROSSI - ONORARI');
});

test('patrimoniale: un dettaglio seguito dalla riga della sua somma conta una volta sola', async () => {
  const { controlliPatrimoniale } = await import('../../src/estrazione/controlli.js');
  const voce = (v, importo, gruppo = '') => ({ voce: v, gruppo, importo });
  const dati = { data: '31/12/2022', incerte: [], totale_attivita: '1.150,00', totale_passivita: '1.150,00',
    attivita: [voce('Crediti v/condomini', '1.000,00'), voce('Banca', '50,00', 'Disponibilità'), voce('integrazione', '120,00'), voce('restituzione', '-40,00'), voce('compensi', '20,00'), voce('', '100,00')],
    passivita: [voce('Debiti v/terzi', '1.150,00')] };
  const { patrimoniale } = assembla([blocco('patrimoniale', 5, 5, dati)]);
  assert.deepEqual(patrimoniale.attivita.map((v) => Boolean(v.dettaglio)), [false, false, true, true, true, false]);
  assert.equal(patrimoniale.attivita[5].voce, 'Dettaglio: integrazione 120,00; restituzione -40,00; compensi 20,00');
  assert.ok(!controlliPatrimoniale(patrimoniale).some((e) => e.livello === 'errore'));
});
