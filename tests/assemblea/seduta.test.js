import { test } from 'node:test';
import assert from 'node:assert/strict';
import { congelaTeste, statoSeduta, statoPunto, datiIngresso } from '../../src/assemblea/seduta.js';
import { costruisciModello } from '../../src/dati/modello.js';

// 25 teste da 40 millesimi di proprietà, una unità ciascuna: 1/5 = 5 teste e 200 millesimi.
// Le prime 10 unità hanno anche 100 millesimi nella tabella parziale "scala".
const N = 25;
const teste = Array.from({ length: N }, (_, i) => ({
  id: `T${i}`, chiave: `s${i}`, etichetta: `TESTA ${String(i).padStart(2, '0')}`, soggetti: [`s${i}`], unita: [`u${i}`],
}));
const millesimi = [
  ...teste.map((t, i) => ({ unita_id: `u${i}`, tabella_id: 'prop', valore: '40.000' })),
  ...teste.slice(0, 10).map((t, i) => ({ unita_id: `u${i}`, tabella_id: 'scala', valore: '100.000' })),
];
const assemblea = { id: 'A', convocazione: 'seconda' };
const presenza = (n, stato = 'presente', extra = {}) =>
  ({ assemblea_id: 'A', testa_id: `T${n}`, stato, ora_ingresso: stato === 'presente' ? '2026-01-10T18:00:00Z' : null, ora_uscita: null, ...extra });
const delega = (delegante, delegato = null, extra = {}) =>
  ({ id: `d${delegante}`, assemblea_id: 'A', delegante_testa_id: `T${delegante}`, delegato_testa_id: delegato === null ? null : `T${delegato}`,
    delegato_esterno: null, amministratore: false, ora_registrazione: '2026-01-10T18:05:00Z', ...extra });
const seduta = (presenze, deleghe = [], extra = {}) =>
  statoSeduta({ assemblea, teste, presenze, deleghe, millesimi, tabellaProprietaId: 'prop', ...extra });
const riga = (s, n) => s.righe.find((r) => r.testa.id === `T${n}`);

test('congelaTeste: comproprietari una sola testa, stesso proprietario su più unità una sola testa, conduttori esclusi', () => {
  const modello = costruisciModello({
    unita: [{ id: 'u1', codice: 'A1' }, { id: 'u2', codice: 'A2' }, { id: 'u3', codice: 'A3' }],
    soggetti: [{ id: 's1', denominazione: 'ALFA' }, { id: 's2', denominazione: 'BETA' }, { id: 's3', denominazione: 'GAMMA' }],
    titolarita: [
      { unita_id: 'u1', soggetto_id: 's1', ruolo: 'proprietario', dal: null, al: null },
      { unita_id: 'u1', soggetto_id: 's2', ruolo: 'proprietario', dal: null, al: null },
      { unita_id: 'u2', soggetto_id: 's3', ruolo: 'proprietario', dal: null, al: null },
      { unita_id: 'u3', soggetto_id: 's3', ruolo: 'proprietario', dal: null, al: null },
      { unita_id: 'u3', soggetto_id: 's1', ruolo: 'conduttore', dal: null, al: null },
    ],
    tabelle_millesimali: [{ id: 'prop', nome: '4 - Proprietà', ambito: 'condominio' }],
    millesimi: [],
  }, '2026-01-10');
  assert.deepEqual(congelaTeste(modello), [
    { chiave: 's1+s2', etichetta: 'ALFA + BETA', soggetti: ['s1', 's2'], unita: ['u1'] },
    { chiave: 's3', etichetta: 'GAMMA', soggetti: ['s3'], unita: ['u2', 'u3'] },
  ]);
});

test('statoSeduta: il peso di una testa è la somma dei millesimi delle sue unità', () => {
  const s = statoSeduta({
    assemblea,
    teste: [{ id: 'X', chiave: 'a+b', etichetta: 'A + B', soggetti: ['a', 'b'], unita: ['u0', 'u1'] }, teste[2]],
    presenze: [{ testa_id: 'X', stato: 'presente', ora_ingresso: null, ora_uscita: null }],
    deleghe: [], millesimi, tabellaProprietaId: 'prop',
  });
  assert.equal(s.righe[0].peso, 80000);
  assert.deepEqual(s.quorum, { testeTotali: 2, testePresenti: 1, pesoTotale: 120000, pesoPresente: 80000, raggiunto: true });
});

test('statoSeduta: presenti di persona, assenti e quorum di seconda convocazione alla soglia', () => {
  // 1/3 di 25 teste = 8,33: con 8 non basta, con 9 sì
  const otto = seduta(teste.map((t, i) => presenza(i, i < 8 ? 'presente' : 'assente')));
  assert.equal(otto.quorum.testePresenti, 8);
  assert.equal(otto.quorum.raggiunto, false);
  const nove = seduta(teste.map((t, i) => presenza(i, i < 9 ? 'presente' : 'assente')));
  assert.equal(nove.quorum.raggiunto, true);
  assert.equal(nove.quorum.pesoPresente, 360000);
  assert.deepEqual([riga(nove, 0).stato, riga(nove, 9).stato], ['presente', 'assente']);
  assert.equal(riga(nove, 0).oraIngresso, '2026-01-10T18:00:00Z');
  assert.deepEqual(nove.avvisi, []);
});

test('statoSeduta: le righe sono in ordine di etichetta e chi non ha una riga di presenza è assente', () => {
  const s = seduta([]);
  assert.equal(s.righe.length, N);
  assert.deepEqual(s.righe.slice(0, 3).map((r) => r.testa.etichetta), ['TESTA 00', 'TESTA 01', 'TESTA 02']);
  assert.ok(s.righe.every((r) => r.stato === 'assente' && r.delegato === null));
});

test('delega a un condomino presente: il delegante è presente per delega', () => {
  const s = seduta([presenza(0), presenza(1, 'assente')], [delega(1, 0)]);
  assert.deepEqual([...s.presenti].sort(), ['T0', 'T1']);
  assert.equal(riga(s, 1).stato, 'delega');
  assert.equal(riga(s, 1).delegato.nome, 'TESTA 00');
  assert.equal(riga(s, 1).delegato.testa.id, 'T0');
  assert.equal(riga(s, 1).delegato.valida, true);
  assert.equal(s.quorum.testePresenti, 2);
  assert.deepEqual(s.avvisi, []);
});

test('delega a un esterno: il delegante è presente per delega', () => {
  const s = seduta([], [delega(1, null, { delegato_esterno: 'Avv. Esempio' })]);
  assert.deepEqual([...s.presenti], ['T1']);
  assert.equal(riga(s, 1).stato, 'delega');
  assert.deepEqual([riga(s, 1).delegato.nome, riga(s, 1).delegato.testa], ['Avv. Esempio', null]);
});

test('delega a un condomino assente: avviso e delegante assente', () => {
  const s = seduta([presenza(0, 'assente')], [delega(1, 0)]);
  assert.deepEqual([...s.presenti], []);
  assert.equal(riga(s, 1).stato, 'assente');
  assert.equal(riga(s, 1).delegato.valida, false);
  assert.equal(s.avvisi.length, 1);
  assert.equal(s.avvisi[0].tipo, 'delegato_assente');
  assert.equal(s.avvisi[0].testa.id, 'T1');
  assert.match(s.avvisi[0].messaggio, /TESTA 01.*TESTA 00/);
});

test('un delegato presente solo per delega non può rappresentare altri', () => {
  const s = seduta([presenza(0)], [delega(1, 0), delega(2, 1)]);
  assert.deepEqual([...s.presenti].sort(), ['T0', 'T1']);
  assert.deepEqual(s.avvisi.map((a) => a.tipo), ['delegato_assente']);
});

test('presente di persona che ha anche rilasciato delega: avviso di conflitto, conta una volta', () => {
  const s = seduta([presenza(0), presenza(1)], [delega(1, 0)]);
  assert.equal(riga(s, 1).stato, 'presente');
  assert.equal(s.quorum.testePresenti, 2);
  assert.deepEqual(s.avvisi.map((a) => [a.tipo, a.testa.id]), [['conflitto', 'T1']]);
});

test('limite del quinto: 5 deleghe nessun avviso, 6 deleghe avvisi per teste e millesimi', () => {
  const cinque = seduta([presenza(0)], [1, 2, 3, 4, 5].map((i) => delega(i, 0)));
  assert.deepEqual(cinque.avvisi, []);
  const sei = seduta([presenza(0)], [1, 2, 3, 4, 5, 6].map((i) => delega(i, 0)));
  assert.deepEqual(sei.avvisi.map((a) => a.tipo), ['oltre_quinto_teste', 'oltre_quinto_millesimi']);
  assert.match(sei.avvisi[0].messaggio, /TESTA 00.*6 teste/);
  assert.equal(sei.avvisi[0].delegato, 'TESTA 00');
});

test('limite del quinto anche per un delegato esterno e avviso per l\'amministratore', () => {
  const s = seduta([], [1, 2, 3, 4, 5, 6].map((i) => delega(i, null, { delegato_esterno: i % 2 ? 'Studio Esempio' : ' studio esempio ', amministratore: i === 1 })));
  assert.deepEqual(s.avvisi.map((a) => a.tipo), ['amministratore', 'oltre_quinto_teste', 'oltre_quinto_millesimi']);
  assert.equal(s.avvisi[0].testa.id, 'T1');
  assert.match(s.avvisi[1].messaggio, /studio esempio/i);
});

test('con `adesso` la seduta è ricostruita a quel momento: ingressi, uscite e deleghe successivi non contano', () => {
  const presenze = [
    presenza(0, 'presente', { ora_ingresso: '2026-01-10T18:00:00Z' }),
    presenza(1, 'presente', { ora_ingresso: '2026-01-10T19:30:00Z' }),
    presenza(2, 'assente', { ora_ingresso: '2026-01-10T18:00:00Z', ora_uscita: '2026-01-10T19:10:00Z' }),
  ];
  const deleghe = [delega(3, 0, { ora_registrazione: '2026-01-10T19:20:00Z' })];
  const alle19 = seduta(presenze, deleghe, { adesso: '2026-01-10T19:00:00+00:00' });
  assert.deepEqual([...alle19.presenti].sort(), ['T0', 'T2']);
  const ora = seduta(presenze, deleghe);
  assert.deepEqual([...ora.presenti].sort(), ['T0', 'T1', 'T3']);
  assert.equal(riga(ora, 2).oraUscita, '2026-01-10T19:10:00Z');
});

// --- statoPunto ---

const punto = (extra = {}) => ({ id: 'P1', tabella_id: 'prop', maggioranza: 'terzo', votato_il: null, presenti_al_voto: null, ...extra });
const voto = (n, v, punto_id = 'P1') => ({ punto_id, testa_id: `T${n}`, voto: v });
const ids = (righe) => righe.map((r) => r.testa.id);

test('statoPunto: votano i presenti, il presente senza voto è "mancante" e non conta come favorevole', () => {
  const presenti = new Set(['T0', 'T1', 'T2', 'T3']);
  const s = statoPunto({ punto: punto(), teste, millesimi, presenti, voti: [voto(0, 'favorevole'), voto(1, 'favorevole'), voto(2, 'contrario')] });
  assert.deepEqual(ids(s.votanti), ['T0', 'T1', 'T2', 'T3']);
  assert.deepEqual(s.votanti.map((v) => v.voto), ['favorevole', 'favorevole', 'contrario', null]);
  assert.equal(s.votanti[0].peso, 40000);
  assert.equal(s.assenti.length, N - 4);
  assert.equal(s.mancanti, 1);
  assert.deepEqual(s.esito.favorevoli, { teste: 2, peso: 80000 });
  assert.deepEqual(s.esito.nonEspressi, { teste: 1, peso: 40000 });
  // 2 favorevoli su 4 presenti non è la maggioranza dei presenti
  assert.equal(s.esito.approvato, false);
});

test('statoPunto: i voti di altri punti e di teste non presenti non contano', () => {
  const s = statoPunto({ punto: punto(), teste, millesimi, presenti: new Set(['T0']), voti: [voto(0, 'contrario', 'P2'), voto(5, 'favorevole')] });
  assert.equal(s.votanti[0].voto, null);
  assert.deepEqual(s.esito.favorevoli, { teste: 0, peso: 0 });
});

test('statoPunto su tabella parziale: votano e contano solo le teste con millesimi in quella tabella', () => {
  // presenti T8, T9 (nella scala) e T10, T11 (fuori)
  const presenti = new Set(['T8', 'T9', 'T10', 'T11']);
  const s = statoPunto({ punto: punto({ tabella_id: 'scala' }), teste, millesimi, presenti,
    voti: [voto(8, 'favorevole'), voto(9, 'favorevole'), voto(10, 'contrario'), voto(11, 'contrario')] });
  assert.deepEqual(ids(s.votanti), ['T8', 'T9']);
  assert.equal(s.votanti.length + s.assenti.length, 10);
  assert.equal(s.votanti[0].peso, 100000);
  assert.equal(s.esito.pesoTotale, 1000000);
  assert.deepEqual(s.esito.presenti, { teste: 2, peso: 200000 });
  // maggioranza dei presenti sì, ma 200 millesimi su 1000 sono meno di un terzo
  assert.equal(s.esito.approvato, false);
});

test('statoPunto: chi arriva dopo la chiusura della votazione è assente a quel punto', () => {
  const chiuso = punto({ votato_il: '2026-01-10T19:00:00Z', presenti_al_voto: ['T0', 'T1', 'T2'] });
  const voti = [voto(0, 'favorevole'), voto(1, 'favorevole'), voto(2, 'contrario'), voto(3, 'contrario')];
  // T3 è presente adesso, ma non lo era alla chiusura; T2 nel frattempo è uscito
  const s = statoPunto({ punto: chiuso, teste, millesimi, presenti: new Set(['T0', 'T1', 'T3']), voti });
  assert.deepEqual(ids(s.votanti), ['T0', 'T1', 'T2']);
  assert.ok(ids(s.assenti).includes('T3'));
  assert.deepEqual(s.esito.presenti, { teste: 3, peso: 120000 });
  assert.deepEqual(s.esito.contrari, { teste: 1, peso: 40000 });
  assert.equal(s.mancanti, 0);
});

test('statoPunto: approvato alla soglia di un terzo dei millesimi', () => {
  // 9 presenti tutti favorevoli = 360 millesimi su 1000 ≥ 1/3; con 8 = 320 < 333,33
  const con = (n) => {
    const quanti = Array.from({ length: n }, (_, i) => i);
    return statoPunto({ punto: punto(), teste, millesimi, presenti: new Set(quanti.map((i) => `T${i}`)), voti: quanti.map((i) => voto(i, 'favorevole')) });
  };
  assert.equal(con(9).esito.approvato, true);
  assert.equal(con(8).esito.approvato, false);
});

test('statoPunto: senza maggioranza o senza tabella non c\'è esito ma non va in errore', () => {
  const s = statoPunto({ punto: punto({ maggioranza: null }), teste, millesimi, presenti: new Set(['T0']), voti: [] });
  assert.equal(s.esito, null);
  assert.equal(s.votanti.length, 1);
  const senzaTabella = statoPunto({ punto: punto({ tabella_id: null }), teste, millesimi, presenti: new Set(['T0']), voti: [] });
  assert.deepEqual([senzaTabella.votanti.length, senzaTabella.assenti.length, senzaTabella.mancanti], [0, 0, 0]);
});

test('datiIngresso: chi rientra conserva l\'ora del primo ingresso, così la fotografia dell\'appello non cambia', () => {
  const ADESSO = '2026-01-10T19:00:00Z';
  assert.deepEqual(datiIngresso(undefined, ADESSO), { stato: 'presente', ora_ingresso: ADESSO, ora_uscita: null });
  assert.deepEqual(datiIngresso({ stato: 'assente', ora_ingresso: null, ora_uscita: null }, ADESSO), { stato: 'presente', ora_ingresso: ADESSO, ora_uscita: null });
  const uscito = presenza(0, 'assente', { ora_ingresso: '2026-01-10T18:00:00Z', ora_uscita: '2026-01-10T18:30:00Z' });
  const rientro = datiIngresso(uscito, ADESSO);
  assert.deepEqual(rientro, { stato: 'presente', ora_ingresso: '2026-01-10T18:00:00Z', ora_uscita: null });
  // all'appello delle 18:05 la testa c'era, anche dopo il rientro
  const allAppello = seduta([{ ...uscito, ...rientro }], [], { adesso: '2026-01-10T18:05:00Z' });
  assert.equal(riga(allAppello, 0).stato, 'presente');
});
