import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esitoPunto, esitoManuale, contaEsiti, registroDelibere, filtraDelibere } from '../../src/assemblea/delibere.js';

const votato = (approvato) => ({
  favorevoli: { teste: 12, peso: 520000 }, contrari: { teste: 2, peso: 80000 }, astenuti: { teste: 1, peso: 30000 },
  nonEspressi: { teste: 0, peso: 0 }, presenti: { teste: 15, peso: 630000 }, pesoTotale: 1000000, approvato,
});

test('esitoPunto: esito di una votazione registrata, con i conteggi', () => {
  const e = esitoPunto({ votato_il: '2025-05-20T20:00:00Z', esito: votato(true) });
  assert.deepEqual([e.stato, e.manuale], ['approvata', false]);
  assert.deepEqual(e.conteggi.favorevoli, { teste: 12, peso: 520000 });
  assert.equal(esitoPunto({ votato_il: '2025-05-20T20:00:00Z', esito: votato(false) }).stato, 'respinta');
});

test('esitoPunto: esito registrato a mano, senza numeri', () => {
  assert.deepEqual(esitoPunto({ votato_il: null, esito: esitoManuale(true) }), { stato: 'approvata', manuale: true, conteggi: null });
  assert.deepEqual(esitoPunto({ votato_il: null, esito: esitoManuale(false) }), { stato: 'respinta', manuale: true, conteggi: null });
  assert.deepEqual(esitoPunto({ votato_il: null, esito: esitoManuale(null) }), { stato: 'non_deliberata', manuale: true, conteggi: null });
  assert.deepEqual(esitoManuale(true), { manuale: true, approvato: true });
});

test('esitoPunto: senza esito, o con una votazione ancora aperta, il punto è da votare', () => {
  const daVotare = { stato: 'da_votare', manuale: false, conteggi: null };
  assert.deepEqual(esitoPunto({ votato_il: null, esito: null }), daVotare);
  assert.deepEqual(esitoPunto({}), daVotare);
  // l'esito di una votazione vale solo a votazione chiusa
  assert.deepEqual(esitoPunto({ votato_il: null, esito: votato(true) }), daVotare);
  assert.deepEqual(esitoPunto({ votato_il: '2025-05-20T20:00:00Z', esito: null }), daVotare);
});

test('contaEsiti: quanti punti per esito e quanti registrati a mano', () => {
  const punti = [
    { votato_il: 'x', esito: votato(true) }, { esito: esitoManuale(true) }, { esito: esitoManuale(false) }, { esito: esitoManuale(null) }, { esito: null },
  ];
  assert.deepEqual(contaEsiti(punti), { approvata: 2, respinta: 1, non_deliberata: 1, da_votare: 1, manuali: 3 });
  assert.deepEqual(contaEsiti([]), { approvata: 0, respinta: 0, non_deliberata: 0, da_votare: 0, manuali: 0 });
});

const assemblee = [
  { id: 'a24', data: '2024-04-18', tipo: 'ordinaria', stato: 'chiusa' },
  { id: 'a25', data: '2025-05-20', tipo: 'ordinaria', stato: 'chiusa' },
  { id: 'a26', data: '2026-11-20', tipo: 'straordinaria', stato: 'bozza' },
];
const punti = [
  { id: 'p2', assemblea_id: 'a24', ordine: 5, testo: 'Rifacimento del tetto', esito: esitoManuale(false), note: 'Rinviato: servono altri preventivi' },
  { id: 'p1', assemblea_id: 'a24', ordine: 2, testo: 'Approvazione del rendiconto 2023', esito: esitoManuale(true), note: null },
  { id: 'p3', assemblea_id: 'a25', ordine: 1, testo: 'Sostituzione della caldaia', votato_il: '2025-05-20T20:00:00Z', esito: votato(true), note: 'Affidata alla ditta Esempio' },
  { id: 'p4', assemblea_id: 'a26', ordine: 1, testo: 'Videosorveglianza', esito: null, note: null },
  { id: 'p5', assemblea_id: 'sparita', ordine: 1, testo: 'Punto senza assemblea', esito: null, note: null },
];
const todo = [
  { id: 't1', descrizione: 'Chiedere tre preventivi', punto_id: 'p2', stato: 'aperto' },
  { id: 't2', descrizione: 'Firmare il contratto', punto_id: 'p3', stato: 'chiuso' },
  { id: 't3', descrizione: 'Verificare la garanzia', punto_id: 'p3', stato: 'aperto' },
  { id: 't4', descrizione: 'Libero', punto_id: null, stato: 'aperto' },
];

test('registroDelibere: tutti i punti, dall\'assemblea più recente, con numero, anno, esito e to-do', () => {
  const righe = registroDelibere({ assemblee, punti, todo });
  assert.deepEqual(righe.map((r) => [r.punto.id, r.assemblea.id, r.numero, r.anno, r.stato, r.manuale]), [
    ['p4', 'a26', 1, 2026, 'da_votare', false],
    ['p3', 'a25', 1, 2025, 'approvata', false],
    ['p1', 'a24', 1, 2024, 'approvata', true],
    ['p2', 'a24', 2, 2024, 'respinta', true],
  ]);
  assert.deepEqual(righe.map((r) => r.todo.map((t) => t.id)), [[], ['t2', 't3'], [], ['t1']]);
  assert.deepEqual(righe.map((r) => r.delibera), ['', 'Affidata alla ditta Esempio', '', 'Rinviato: servono altri preventivi']);
  assert.equal(righe[1].conteggi.favorevoli.teste, 12);
  assert.deepEqual(registroDelibere({ assemblee: [], punti: [], todo: [] }), []);
});

test('filtraDelibere: ricerca nel testo del punto e della delibera, filtro per anno e per esito', () => {
  const righe = registroDelibere({ assemblee, punti, todo });
  const trovati = (filtri) => filtraDelibere(righe, filtri).map((r) => r.punto.id);
  assert.deepEqual(trovati({}), ['p4', 'p3', 'p1', 'p2']);
  assert.deepEqual(trovati({ testo: 'CALDAIA' }), ['p3']);
  assert.deepEqual(trovati({ testo: 'preventivi' }), ['p2']); // nel testo della delibera
  assert.deepEqual(trovati({ testo: '  ditta esèmpio ' }), ['p3']);
  assert.deepEqual(trovati({ anno: 2024 }), ['p1', 'p2']);
  assert.deepEqual(trovati({ anno: '2024', esito: 'respinta' }), ['p2']);
  assert.deepEqual(trovati({ esito: 'approvata' }), ['p3', 'p1']);
  assert.deepEqual(trovati({ esito: 'da_votare' }), ['p4']);
  assert.deepEqual(trovati({ testo: 'tetto', anno: 2025 }), []);
});

test('ricorrenze: lo stesso argomento in più assemblee tenute; esclusi punti ordinari, sedute deserte e punti segnati come nuovi', async () => {
  const { ricorrenze, stessoArgomento, puntoOrdinario } = await import('../../src/assemblea/delibere.js');
  assert.ok(stessoArgomento('Impermeabilizzazione giardino che causa grosse infiltrazioni nei box: delibere in merito', 'Impermeabilizzazione del giardino: infiltrazioni nei box, incarico a professionista'));
  assert.ok(!stessoArgomento('Opere di adeguamento per SCIA antincendio', 'Impermeabilizzazione giardino'));
  assert.ok(stessoArgomento('Opere di adeguamento per SCIA antincendio: delibere in merito', 'Progetto SCIA antincendio: progetto del tecnico incaricato'));
  assert.ok(!stessoArgomento('Progetto CIS: relazione tecnico incaricato e delibere in merito', 'Progetto SCIA antincendio: relazione tecnico incaricato e delibere in merito'));
  assert.ok(!puntoOrdinario('Approvazione rendiconto sentenza Termocentro: delibere in merito') && puntoOrdinario('Approvazione rendiconto consuntivo esercizio 2024 e riparto'));
  assert.ok(puntoOrdinario('Nomina dei consiglieri della casa') && puntoOrdinario('Approvazione preventivo esercizio 2026') && !puntoOrdinario('Dismissione serbatoi'));
  const a = (id, data, esito_seduta = null) => ({ id, data, esito_seduta });
  const riga = (assemblea, id, testo, extra = {}) => ({ assemblea, punto: { id, testo, ...extra } });
  const [a23, a24d, a25, a26] = [a('a23', '2023-04-27'), a('a24', '2024-04-08', 'deserta'), a('a25', '2025-03-17'), a('a26', '2026-10-20')];
  const righe = [
    riga(a26, 'p1', 'Impermeabilizzazione giardino: incarico a professionista per progetti'),
    riga(a26, 'p2', 'Nomina dei consiglieri della casa'),
    riga(a26, 'p3', 'Dismissione serbatoi: opere di completamento', { non_ricorrente: true }),
    riga(a25, 'p4', 'Impermeabilizzazione giardino che causa infiltrazioni nei box'),
    riga(a25, 'p5', 'Nomina dei consiglieri della casa'),
    riga(a25, 'p6', 'Dismissione serbatoi: prescrizioni del Comune'),
    riga(a24d, 'p7', 'Impermeabilizzazione giardino: infiltrazioni nei box'),
    riga(a23, 'p8', 'Infiltrazioni dal giardino nei box: impermeabilizzazione'),
  ];
  const r = ricorrenze(righe);
  assert.deepEqual([...r.keys()], ['p1', 'p4']);
  assert.deepEqual(r.get('p1').map((x) => x.punto.id), ['p4', 'p8']); // la seduta deserta non conta
});
