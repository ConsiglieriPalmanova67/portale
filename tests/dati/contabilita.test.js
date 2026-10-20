import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eserciziPerAnno, raffronto, andamento, raggruppaPartite, situazionePatrimoniale } from '../../src/dati/contabilita.js';

const esercizi = [
  { id: 'p25', anno: 2025, tipo: 'preventivo' },
  { id: 'c24', anno: 2024, tipo: 'consuntivo' },
  { id: 'p24', anno: 2024, tipo: 'preventivo' },
  { id: 'c23', anno: 2023, tipo: 'consuntivo' },
];
const conti = [
  { id: 'pul', gruppo: 'SPESE GENERALI', sottoconto: 'PULIZIE' },
  { id: 'gia', gruppo: 'SPESE GENERALI', sottoconto: 'GIARDINO' },
  { id: 'asc', gruppo: 'ASCENSORE', sottoconto: 'MANUTENZIONE' },
  { id: 'vid', gruppo: 'SPESE GENERALI', sottoconto: 'VIDEOSORVEGLIANZA' },
];
const s = (esercizio_id, conto_id, importo) => ({ esercizio_id, conto_id, importo });
const spese = [
  s('c23', 'pul', '-1000.00'), s('c23', 'asc', '-800.00'),
  s('p24', 'pul', '-1100.00'), s('p24', 'gia', '-500.00'), s('p24', 'asc', '-900.00'),
  s('c24', 'pul', '-600.10'), s('c24', 'pul', '-600.20'), s('c24', 'gia', '-450.00'), s('c24', 'asc', '-900.00'),
  s('p25', 'pul', '-1250.00'), s('p25', 'asc', '-950.00'), s('p25', 'vid', '-300.00'),
  s('c24', 'sconosciuto', '-999.00'), // conto inesistente: ignorata
];

test('eserciziPerAnno: una riga per anno, con il consuntivo e il preventivo quando esistono', () => {
  const anni = eserciziPerAnno(esercizi);
  assert.deepEqual(anni.map((a) => [a.anno, a.consuntivo?.id ?? null, a.preventivo?.id ?? null]), [
    [2023, 'c23', null], [2024, 'c24', 'p24'], [2025, null, 'p25'],
  ]);
  assert.deepEqual(eserciziPerAnno([]), []);
});

test('raffronto: per gruppo e sottoconto preventivo, consuntivo, differenza e scostamento, in centesimi', () => {
  const r = raffronto(spese, conti, 'p24', 'c24');
  assert.deepEqual(r.gruppi.map((g) => g.nome), ['ASCENSORE', 'SPESE GENERALI']);
  const [ascensore, generali] = r.gruppi;
  assert.deepEqual(ascensore, {
    nome: 'ASCENSORE', preventivo: -90000, consuntivo: -90000, differenza: 0, percento: 0, sforamento: false,
    sottoconti: [{ nome: 'MANUTENZIONE', preventivo: -90000, consuntivo: -90000, differenza: 0, percento: 0, sforamento: false }],
  });
  assert.deepEqual(generali.sottoconti.map((x) => x.nome), ['GIARDINO', 'PULIZIE']);
  const [giardino, pulizie] = generali.sottoconti;
  // speso meno del previsto: la differenza (consuntivo − preventivo) è positiva perché le spese sono negative
  assert.deepEqual([giardino.preventivo, giardino.consuntivo, giardino.differenza, giardino.percento, giardino.sforamento], [-50000, -45000, 5000, 10, false]);
  // 600,10 + 600,20 = 1.200,30: nessun errore di virgola mobile
  assert.deepEqual([pulizie.preventivo, pulizie.consuntivo, pulizie.differenza, pulizie.percento, pulizie.sforamento], [-110000, -120030, -10030, -9.1, true]);
  assert.deepEqual([generali.preventivo, generali.consuntivo, generali.differenza, generali.sforamento], [-160000, -165030, -5030, true]);
  assert.deepEqual(r.totale, { preventivo: -250000, consuntivo: -255030, differenza: -5030, percento: -2, sforamento: true });
});

test('raffronto: una voce presente da una parte sola resta, con l\'altra vuota e senza percentuale inventata', () => {
  const r = raffronto(spese, conti, 'p25', 'c24');
  const generali = r.gruppi.find((g) => g.nome === 'SPESE GENERALI');
  const perNome = Object.fromEntries(generali.sottoconti.map((x) => [x.nome, x]));
  assert.deepEqual([perNome.GIARDINO.preventivo, perNome.GIARDINO.consuntivo, perNome.GIARDINO.differenza, perNome.GIARDINO.percento, perNome.GIARDINO.sforamento],
    [null, -45000, -45000, null, true]);
  assert.deepEqual([perNome.VIDEOSORVEGLIANZA.preventivo, perNome.VIDEOSORVEGLIANZA.consuntivo, perNome.VIDEOSORVEGLIANZA.differenza, perNome.VIDEOSORVEGLIANZA.percento, perNome.VIDEOSORVEGLIANZA.sforamento],
    [-30000, null, 30000, 100, false]);
});

test('raffronto: con le spese registrate in positivo lo sforamento è il consuntivo più alto', () => {
  const positive = [s('p', 'pul', '1000.00'), s('c', 'pul', '1200.00'), s('p', 'gia', '500.00'), s('c', 'gia', '400.00')];
  const r = raffronto(positive, conti, 'p', 'c');
  const perNome = Object.fromEntries(r.gruppi[0].sottoconti.map((x) => [x.nome, x]));
  assert.deepEqual([perNome.PULIZIE.differenza, perNome.PULIZIE.percento, perNome.PULIZIE.sforamento], [20000, 20, true]);
  assert.deepEqual([perNome.GIARDINO.differenza, perNome.GIARDINO.sforamento], [-10000, false]);
  assert.equal(r.totale.sforamento, true);
});

test('raffronto: senza voci non dà righe né errori', () => {
  assert.deepEqual(raffronto([], conti, 'p24', 'c24'), { gruppi: [], totale: { preventivo: null, consuntivo: null, differenza: 0, percento: null, sforamento: false } });
});

test('andamento: una colonna per anno, il consuntivo se c\'è altrimenti il preventivo, con la variazione sull\'anno prima', () => {
  const a = andamento(spese, conti, esercizi);
  assert.deepEqual(a.anni, [
    { anno: 2023, fonte: 'consuntivo', esercizioId: 'c23', preventivoId: null, consuntivoSenzaVoci: false },
    { anno: 2024, fonte: 'consuntivo', esercizioId: 'c24', preventivoId: 'p24', consuntivoSenzaVoci: false },
    { anno: 2025, fonte: 'preventivo', esercizioId: 'p25', preventivoId: null, consuntivoSenzaVoci: false },
  ]);
  assert.deepEqual(a.gruppi.map((g) => g.nome), ['ASCENSORE', 'SPESE GENERALI']);
  const generali = a.gruppi[1];
  assert.deepEqual(generali.valori, [
    { importo: -100000, variazione: null, percento: null },
    { importo: -165030, variazione: -65030, percento: -65 },
    { importo: -155000, variazione: 10030, percento: 6.1 },
  ]);
  const perNome = Object.fromEntries(generali.sottoconti.map((x) => [x.nome, x.valori]));
  // voce assente in un anno: nessun importo e nessuna variazione, né in quell'anno né nel successivo
  assert.deepEqual(perNome.GIARDINO, [
    { importo: null, variazione: null, percento: null },
    { importo: -45000, variazione: null, percento: null },
    { importo: null, variazione: null, percento: null },
  ]);
  assert.deepEqual(perNome.VIDEOSORVEGLIANZA.map((v) => v.importo), [null, null, -30000]);
  assert.deepEqual(a.totale.valori.map((v) => v.importo), [-180000, -255030, -250000]);
  assert.deepEqual(a.totale.valori.map((v) => v.variazione), [null, -75030, 5030]);
});

test('andamento: funziona con un anno solo e con nessuno', () => {
  const uno = andamento(spese, conti, [esercizi[3]]);
  assert.deepEqual(uno.anni.map((x) => x.anno), [2023]);
  assert.deepEqual(uno.totale.valori, [{ importo: -180000, variazione: null, percento: null }]);
  assert.deepEqual(andamento(spese, conti, []), { anni: [], gruppi: [], totale: { valori: [] } });
});

test('andamento: dieci anni danno dieci colonne', () => {
  const dieci = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, anno: 2015 + i, tipo: 'consuntivo' }));
  const a = andamento(dieci.map((e, i) => s(e.id, 'pul', String(-1000 - i * 10))), conti, dieci);
  assert.equal(a.anni.length, 10);
  assert.deepEqual(a.gruppi[0].sottoconti[0].valori.at(-1), { importo: -109000, variazione: -1000, percento: -0.9 });
});

const partite = [
  { id: 'a', esercizio_id: 'c24', tipo: 'debito', controparte: 'PULITO S.N.C.', protocollo: '12', descrizione: 'Fattura di dicembre', importo: '625.10' },
  { id: 'b', esercizio_id: 'c24', tipo: 'debito', controparte: 'PULITO S.N.C.', protocollo: '13', descrizione: 'Fattura di novembre', importo: '625.20' },
  { id: 'c', esercizio_id: 'c24', tipo: 'debito', controparte: 'GAS FINTO S.R.L.', protocollo: '20', descrizione: 'Conguaglio', importo: '1980.25' },
  { id: 'd', esercizio_id: 'c24', tipo: 'debito', controparte: null, protocollo: null, descrizione: 'Ritenute da versare', importo: '300.00' },
  { id: 'e', esercizio_id: 'c24', tipo: 'credito', controparte: 'ASSICURAZIONI S.P.A.', protocollo: null, descrizione: 'Rimborso sinistro', importo: '350.00' },
  { id: 'f', esercizio_id: 'c23', tipo: 'debito', controparte: 'ALTRO ANNO', protocollo: null, descrizione: 'Non c\'entra', importo: '1.00' },
];

test('raggruppaPartite: per controparte con i totali, dal più alto', () => {
  const r = raggruppaPartite(partite, { esercizioId: 'c24', tipo: 'debito' });
  assert.deepEqual(r.gruppi.map((g) => [g.controparte, g.totale, g.partite.length]), [
    ['GAS FINTO S.R.L.', 198025, 1], ['PULITO S.N.C.', 125030, 2], ['Senza controparte', 30000, 1],
  ]);
  assert.equal(r.totale, 353055);
  assert.equal(r.totaleComplessivo, 353055);
  assert.deepEqual(raggruppaPartite(partite, { esercizioId: 'c24', tipo: 'credito' }).gruppi.map((g) => g.controparte), ['ASSICURAZIONI S.P.A.']);
});

test('raggruppaPartite: ordine crescente o per nome, e ricerca su controparte, descrizione e protocollo', () => {
  const nomi = (opzioni) => raggruppaPartite(partite, { esercizioId: 'c24', tipo: 'debito', ...opzioni }).gruppi.map((g) => g.controparte);
  assert.deepEqual(nomi({ ordine: 'crescente' }), ['Senza controparte', 'PULITO S.N.C.', 'GAS FINTO S.R.L.']);
  assert.deepEqual(nomi({ ordine: 'nome' }), ['GAS FINTO S.R.L.', 'PULITO S.N.C.', 'Senza controparte']);
  assert.deepEqual(nomi({ testo: 'pulitò' }), ['PULITO S.N.C.']);
  const cercata = raggruppaPartite(partite, { esercizioId: 'c24', tipo: 'debito', testo: 'novembre' });
  // della controparte restano solo le partite trovate; il totale complessivo non cambia
  assert.deepEqual(cercata.gruppi.map((g) => [g.controparte, g.totale, g.partite.map((p) => p.id)]), [['PULITO S.N.C.', 62520, ['b']]]);
  assert.deepEqual([cercata.totale, cercata.totaleComplessivo], [62520, 353055]);
  assert.deepEqual(nomi({ testo: '20' }), ['GAS FINTO S.R.L.']);
  assert.deepEqual(nomi({ testo: 'niente del genere' }), []);
});

test('situazionePatrimoniale: attività e passività in ordine, totali e verifica che coincidano', () => {
  const righe = [
    { esercizio_id: 'c24', lato: 'passivita', ordine: 2, voce: 'Fondo di riserva', importo: '500.00' },
    { esercizio_id: 'c24', lato: 'attivita', ordine: 2, voce: 'Cassa', importo: '100.10' },
    { esercizio_id: 'c24', lato: 'attivita', ordine: 1, voce: 'Banca', importo: '900.20' },
    { esercizio_id: 'c24', lato: 'passivita', ordine: 1, voce: 'Debiti verso fornitori', importo: '500.30' },
    { esercizio_id: 'c23', lato: 'attivita', ordine: 1, voce: 'Altro anno', importo: '1.00' },
  ];
  const sp = situazionePatrimoniale(righe, 'c24');
  assert.deepEqual(sp.attivita, [{ voce: 'Banca', importo: 90020 }, { voce: 'Cassa', importo: 10010 }]);
  assert.deepEqual(sp.passivita.map((v) => v.voce), ['Debiti verso fornitori', 'Fondo di riserva']);
  assert.deepEqual([sp.totaleAttivita, sp.totalePassivita, sp.differenza, sp.quadra, sp.vuota], [100030, 100030, 0, true, false]);

  const sbilanciata = situazionePatrimoniale([...righe, { esercizio_id: 'c24', lato: 'attivita', ordine: 3, voce: 'Crediti', importo: '0.01' }], 'c24');
  assert.deepEqual([sbilanciata.differenza, sbilanciata.quadra], [1, false]);
  const vuota = situazionePatrimoniale(righe, 'nessuno');
  assert.deepEqual([vuota.vuota, vuota.quadra, vuota.attivita.length], [true, false, 0]);
});

test('andamento rispetto al preventivo: la differenza è quella del raffronto dello stesso anno; senza preventivo niente differenza', () => {
  const a = andamento(spese, conti, esercizi, { confronto: 'preventivo' });
  const r = raffronto(spese, conti, 'p24', 'c24');
  assert.deepEqual(a.totale.valori.map((v) => v.variazione), [null, r.totale.differenza, null]);
  assert.deepEqual(a.totale.valori.map((v) => v.importo), [-180000, -255030, -250000]);
});

test('andamento: un consuntivo senza voci (solo riparto) lascia il posto al preventivo dello stesso anno', () => {
  const conVuoto = [...esercizi, { id: 'c25', anno: 2025, tipo: 'consuntivo' }];
  const a = andamento(spese, conti, conVuoto);
  assert.deepEqual(a.anni[2], { anno: 2025, fonte: 'preventivo', esercizioId: 'p25', preventivoId: null, consuntivoSenzaVoci: true });
  assert.equal(a.totale.valori[2].importo, -250000);
});

test('andamento: la stessa voce spostata in un gruppo affine finisce su una riga sola', () => {
  const es = [{ id: 'c22', anno: 2022, tipo: 'consuntivo' }, { id: 'c24', anno: 2024, tipo: 'consuntivo' }, { id: 'c25', anno: 2025, tipo: 'consuntivo' }];
  const cc = [
    { id: 'm1', gruppo: 'RISCALDAMENTO', sottoconto: 'CONSUMO METANO' },
    { id: 'f1', gruppo: 'RISCALDAMENTO', sottoconto: 'FORZA MOTRICE 11%' },
    { id: 'g1', gruppo: 'RISCALDAMENTO', sottoconto: 'GESTIONE IMPIANTO' },
    { id: 'm2', gruppo: 'RISCALDAMENTO SOLO CONSUMI (esclusi i distaccati)', sottoconto: 'CONSUMO METANO' },
    { id: 'f2', gruppo: 'RISCALDAMENTO SOLO CONSUMI (esclusi i distaccati)', sottoconto: 'FORZA MOTRICE' },
    { id: 'x', gruppo: 'ASCENSORE', sottoconto: 'GESTIONE IMPIANTO' },
  ];
  const ss = [
    s('c22', 'm1', '-196249'), s('c22', 'f1', '-3774.87'), s('c22', 'g1', '-347.61'),
    s('c24', 'm1', '0'), s('c24', 'm2', '-106895'), s('c24', 'f2', '-2442.33'), s('c24', 'g1', '-375.10'),
    s('c25', 'm2', '-127350.36'), s('c25', 'f2', '-2460'), s('c25', 'x', '-100'),
  ];
  const a = andamento(ss, cc, es);
  const riga = (g, v) => a.gruppi.find((x) => x.nome === g).sottoconti.find((x) => x.nome === v);
  const consumi = 'RISCALDAMENTO SOLO CONSUMI (esclusi i distaccati)';
  assert.deepEqual(riga(consumi, 'CONSUMO METANO').valori.map((v) => v.importo), [-19624900, -10689500, -12735036]);
  assert.deepEqual(riga(consumi, 'CONSUMO METANO').unite, ['RISCALDAMENTO › CONSUMO METANO']);
  assert.deepEqual(riga(consumi, 'FORZA MOTRICE').valori.map((v) => v.importo), [-377487, -244233, -246000]);
  assert.deepEqual(a.gruppi.find((x) => x.nome === 'RISCALDAMENTO').sottoconti.map((x) => x.nome), ['GESTIONE IMPIANTO']);
  // gruppi non affini restano separati anche con lo stesso nome di voce
  assert.equal(a.gruppi.find((x) => x.nome === 'ASCENSORE').sottoconti[0].unite.length, 0);
});
