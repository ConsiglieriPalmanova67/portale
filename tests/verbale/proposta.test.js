import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proponi, pianoScritture, dataIso, soggettiPerNome, esitoDaLettura } from '../../src/verbale/proposta.js';

const assemblea = { id: 'as1', data: '2025-03-17' };
const soggetti = [
  { id: 's1', denominazione: 'ROSSI MARIO - BIANCHI ANNA' },
  { id: 's2', denominazione: 'VERDI LUCA' },
  { id: 's3', denominazione: 'NERI PAOLA' },
  { id: 's4', denominazione: 'ROSSI MARIA' },
];
const lettura = {
  punti: [
    { ordine: 1, titolo: 'Consuntivo 2024', esito: 'approvato', sintesi: 'Approvato il consuntivo.', cose_da_fare: [], nomine: [] },
    { ordine: 2, titolo: 'Impermeabilizzazione giardino', esito: 'approvato', sintesi: 'Si chiedono tre preventivi.',
      cose_da_fare: [{ descrizione: 'Richiedere tre preventivi', responsabile: 'amministratore', scadenza: '30/04/2025', importo: '' },
        { descrizione: 'Informare i condomini', responsabile: '', scadenza: 'entro maggio', importo: '5.000 euro' }], nomine: [] },
    { ordine: 3, titolo: 'Nomina consiglieri', esito: 'approvato', sintesi: '', cose_da_fare: [],
      nomine: [{ ruolo: 'consigliere', nome: 'Rossi Mario', compenso: '', durata: '', note: '' }, { ruolo: 'consigliere', nome: 'Verdi Luca', compenso: '', durata: '', note: '' }] },
    { ordine: 4, titolo: 'Nomina amministratore', esito: 'approvato', sintesi: '', cose_da_fare: [],
      nomine: [{ ruolo: 'amministratore', nome: 'Studio Nuovo srl', compenso: '9.000 + IVA', durata: '1 anno', note: '' }] },
    { ordine: 5, titolo: 'Varie', esito: 'informativa', sintesi: '', cose_da_fare: [], nomine: [] },
  ],
};
const punti = [1, 2, 3, 4, 5].map((ordine) => ({ id: `p${ordine}`, ordine, votato_il: null, esito: null }));
const consiglieri = [
  { id: 'c1', soggetto_id: 's2', utente_id: null, inizio_mandato: '2024-01-01', fine_mandato: null },
  { id: 'c2', soggetto_id: 's3', utente_id: null, inizio_mandato: '2024-01-01', fine_mandato: null },
  { id: 'c3', soggetto_id: 's4', utente_id: 'io', inizio_mandato: '2024-01-01', fine_mandato: null },
];
const amministratori = [{ id: 'a1', denominazione: 'NCS Servizi', dal: '2020-01-01', al: null }];

test('date e nomi: solo le date complete diventano ISO; un nome trova i soggetti che ne contengono tutte le parole', () => {
  assert.equal(dataIso('30/04/2025'), '2025-04-30');
  assert.equal(dataIso('31/02/2025'), null);
  assert.equal(dataIso('entro maggio'), null);
  assert.deepEqual(soggettiPerNome('Rossi Mario', soggetti).map((s) => s.id), ['s1']);
  assert.deepEqual(soggettiPerNome('Rossi', soggetti).map((s) => s.id), ['s1', 's4']);
  assert.deepEqual([esitoDaLettura('approvato'), esitoDaLettura('respinto'), esitoDaLettura('rinviato'), esitoDaLettura('informativa')], [true, false, null, undefined]);
});

test('proposta: esiti, to-do, consiglieri da nominare e da chiudere (mai il proprio), nuovo amministratore', () => {
  const p = proponi({ lettura, assemblea, punti, consiglieri, soggetti, amministratori, utenteId: 'io' });
  assert.equal(p.creaPunti, false);
  assert.deepEqual(p.punti.map((x) => x.aggiornaEsito), [true, true, true, true, false]);
  assert.deepEqual(p.punti[1].todo.map((t) => [t.scadenza, t.responsabile, t.note]), [['2025-04-30', 'amministratore', ''], [null, '', 'Scadenza: entro maggio · Importo: 5.000 euro']]);
  assert.deepEqual(p.consiglio.nominati.map((n) => [n.soggettoId, n.gia?.id ?? null]), [['s1', null], ['s2', 'c1']]);
  assert.deepEqual(p.consiglio.daChiudere.map((d) => [d.consigliere.id, d.bloccato, d.scelto]), [['c2', false, true], ['c3', true, false]]);
  assert.equal(p.amministratore.conferma, false);

  const passi = pianoScritture(p, assemblea);
  const conta = (tabella, azione) => passi.filter((x) => x.tabella === tabella && x.azione === azione).length;
  assert.equal(conta('punti_odg', 'aggiorna'), 4); // il punto informativo senza sintesi non si tocca
  assert.equal(conta('todo', 'inserisci'), 2);
  assert.deepEqual(passi.find((x) => x.tabella === 'todo').valori, { titolo: 'Richiedere tre preventivi', descrizione: null, responsabile: 'amministratore', assemblea_id: 'as1', punto_id: 'p2', data_apertura: '2025-03-17', scadenza: '2025-04-30', stato: 'aperto' });
  assert.deepEqual(passi.find((x) => x.tabella === 'consiglieri' && x.azione === 'inserisci').valori, { soggetto_id: 's1', nominativo: 'Rossi Mario', inizio_mandato: '2025-03-17', assemblea_nomina_id: 'as1' });
  assert.deepEqual(passi.filter((x) => x.tabella === 'consiglieri' && x.azione === 'aggiorna').map((x) => [x.dove.id, x.valori.fine_mandato]), [['c2', '2025-03-16']]);
  assert.deepEqual(passi.filter((x) => x.tabella === 'amministratori').map((x) => x.azione), ['aggiorna', 'inserisci']);
});

test('proposta: una votazione fatta nel portale non si sovrascrive; senza punti si creano dal verbale; la conferma dell\'amministratore non apre un nuovo incarico', () => {
  const votati = punti.map((x) => (x.ordine === 1 ? { ...x, votato_il: '2025-03-17T20:00:00Z', esito: { approvato: true } } : x));
  const conferma = { punti: [{ ordine: 1, titolo: 'Amministratore', esito: 'approvato', sintesi: '', cose_da_fare: [], nomine: [{ ruolo: 'amministratore', nome: 'NCS Servizi srl', compenso: '10.230', durata: '', note: '' }] }] };
  const p = proponi({ lettura: conferma, assemblea, punti: votati, consiglieri, soggetti, amministratori, utenteId: 'io' });
  assert.equal(p.punti[0].aggiornaEsito, false);
  assert.equal(p.amministratore.conferma, true);
  assert.deepEqual(pianoScritture(p, assemblea).map((x) => [x.tabella, x.azione]), [['amministratori', 'aggiorna']]);

  const vuota = proponi({ lettura, assemblea, punti: [], consiglieri: [], soggetti, amministratori: [], utenteId: null });
  assert.equal(vuota.creaPunti, true);
  const creati = pianoScritture(vuota, assemblea).filter((x) => x.tabella === 'punti_odg');
  assert.deepEqual(creati.map((x) => [x.azione, x.valori.ordine, x.valori.esito?.approvato]), [['inserisci', 1, true], ['inserisci', 2, true], ['inserisci', 3, true], ['inserisci', 4, true], ['inserisci', 5, undefined]]);
});

test('proposta: un verbale di assemblea non costituita segna la seduta come deserta', () => {
  const p = proponi({ lettura: { costituita: 'no', punti: [] }, assemblea, punti: [], consiglieri: [], soggetti, amministratori: [], utenteId: null });
  assert.deepEqual(pianoScritture(p, assemblea).map((x) => [x.tabella, x.valori]), [['assemblee', { esito_seduta: 'deserta' }]]);
});
