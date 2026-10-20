import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componiVerbale } from '../../src/verbale/componi.js';

// Fatti scritti a mano, nella forma prodotta da fattiVerbale (src/verbale/fatti.js).
const persona = (nominativo, unita, millesimi) => ({ nominativo, unita, millesimi });
const gruppo = (teste, millesimi, nominativi = []) => ({ teste, millesimi, nominativi });

function votazione(extra = {}) {
  return {
    chiusa: true, ora: '21:40', tabella: '4 - Proprietà', tabellaParticolare: false, aventiDiritto: 5,
    presenti: { teste: 3, millesimi: '600,000' },
    favorevoli: gruppo(2, '400,000', [persona('ROSSI Mario', 'A1', '250,000'), persona('VERDI Anna', 'A2', '150,000')]),
    contrari: gruppo(1, '200,000', [persona('NERI Luca', 'A3, A4', '200,000')]),
    astenuti: gruppo(0, '0,000'),
    mancanti: gruppo(0, '0,000'),
    assenti: { teste: 2, millesimi: '400,000', elenco: [{ ...persona('BIANCHI Rita', 'A5', '200,000'), orari: '' }, { ...persona('GIALLI Ugo', 'A6', '200,000'), orari: '' }] },
    maggioranza: 'Maggioranza dei presenti e 1/3 dei millesimi', frazione: '1/3', soglia: '333,334', unanimita: null, norma: 'art. 1136 c.c.',
    approvato: true, unanime: false, mancaMaggioranzaTeste: false, sottoSoglia: false, favorevoliSuperanoContrari: true, daVerificareContrari: false,
    ...extra,
  };
}

const punto = (numero, testo, extra = {}) => ({
  id: `p${numero}`, numero, testo, informativo: false, candidati: [], sintesi: '', dichiarazioni: '', delibera: '', variazioni: [], variazioniDa: 'appello', votazione: null, ...extra,
});

function fatti(extra = {}) {
  return {
    condominio: 'Condominio Palmanova 67', titolo: 'Assemblea ordinaria del 20/10/2026', tipo: 'ordinaria', convocazione: 'seconda',
    avviso: { data: '05/10/2026', convocante: 'Studio Esempio' },
    primaConvocazione: { data: '19/10/2026', ora: '07:00', luogo: 'Studio di prova', termineRispettato: true },
    seduta: { data: '20/10/2026', ora: '21:00', luogo: 'Sala comune', apertura: '21:05', appello: '21:15', chiusura: '23:10' },
    presidente: 'ROSSI Mario', segretario: 'VERDI Anna',
    ordineDelGiorno: [{ numero: 1, testo: 'Approvazione del rendiconto' }, { numero: 2, testo: 'Conferma dell\'amministratore' }],
    appello: {
      ora: '21:15', tabella: '4 - Proprietà',
      aventiDiritto: { teste: 5, millesimi: '1.000,000' }, diPersona: { teste: 2, millesimi: '400,000' }, perDelega: { teste: 1, millesimi: '200,000' },
      presenti: { teste: 3, millesimi: '600,000' },
      elenco: [
        { ...persona('NERI Luca', 'A3, A4', '200,000'), delega: { delegato: 'ROSSI Mario', esterno: false }, ora: '21:02' },
        { ...persona('ROSSI Mario', 'A1', '250,000'), delega: null, ora: '21:00' },
        { ...persona('VERDI Anna', 'A2', '150,000'), delega: null, ora: '21:01' },
      ],
    },
    quorumRaggiunto: true,
    movimenti: [],
    punti: [
      punto(1, 'Approvazione del rendiconto', { sintesi: 'Si esamina il rendiconto', delibera: 'Si approva il rendiconto 2025.', votazione: votazione() }),
    ],
    movimentiFinali: [],
    chiusura: { ora: '23:10', teste: 3, millesimi: '600,000' },
    allegati: [
      { numero: 1, chiave: 'avviso', descrizione: 'Avviso di convocazione del 05/10/2026, con ordine del giorno.' },
      { numero: 2, chiave: 'deserta', descrizione: 'Annotazione di mancata costituzione della prima convocazione del 19/10/2026.' },
      { numero: 3, chiave: 'report', descrizione: 'Report delle presenze e delle votazioni generato dal portale.' },
      { numero: 4, chiave: 'deleghe', descrizione: 'Deleghe scritte (n. 1).' },
      { numero: 5, chiave: 'altro', descrizione: 'Preventivo della ditta Esempio' },
    ],
    ...extra,
  };
}

// Il blocco di testo di un punto: dal suo titolo al punto successivo (o alla fine della trattazione).
function bloccoPunto(testo, numero) {
  const inizio = testo.indexOf(`PUNTO ${numero} – `);
  assert.ok(inizio >= 0, `manca il punto ${numero}`);
  const dopo = testo.slice(inizio + 1).search(/\n\nPUNTO \d+ – |\n\n\d+\. [A-Z]/);
  return dopo < 0 ? testo.slice(inizio) : testo.slice(inizio, inizio + 1 + dopo);
}

test('componiVerbale: in seconda convocazione c\'è il paragrafo della prima convocazione deserta, in prima no', () => {
  const seconda = componiVerbale(fatti());
  assert.match(seconda, /^CONDOMINIO PALMANOVA 67\n\nVERBALE DELL'ASSEMBLEA ORDINARIA DEI CONDOMINI\nin seconda convocazione del 20\/10\/2026\n\n1\. CONVOCAZIONE\n/);
  assert.ok(seconda.includes('\n\n2. PRIMA CONVOCAZIONE\nSi dà atto che l\'assemblea fissata in prima convocazione per il giorno 19/10/2026 alle ore 07:00 presso Studio di prova è andata deserta per mancanza del numero legale, come risulta dall\'annotazione di mancata costituzione nel registro dei verbali (art. 1130, n. 7, c.c.), allegata sub n. 2.'));
  assert.ok(seconda.includes('L\'odierna seduta si tiene in giorno diverso da quello della prima convocazione e non oltre dieci giorni da essa (art. 1136, terzo comma, c.c.; art. 66, quarto comma, disp. att. c.c.).'));
  assert.ok(seconda.includes('per il giorno 19/10/2026 alle ore 07:00 presso Studio di prova in prima convocazione e per il giorno 20/10/2026 alle ore 21:00 presso Sala comune in seconda convocazione, con il seguente ordine del giorno:\n1. Approvazione del rendiconto\n2. Conferma dell\'amministratore\n'));
  assert.ok(seconda.includes('\n\n3. APERTURA\nIl giorno 20/10/2026, alle ore 21:05, presso Sala comune, si apre la seduta.'));
  assert.ok(seconda.includes('dall\'art. 1136, terzo comma, c.c. (un terzo dei partecipanti e un terzo del valore)'));
  // dati della prima convocazione mancanti: righe da completare; il termine dei dieci giorni non si dichiara se non è confermato
  const ignota = componiVerbale(fatti({ primaConvocazione: { data: '', ora: '', luogo: '', termineRispettato: null } }));
  assert.ok(ignota.includes('per il giorno ______ alle ore ______ presso ______ in prima convocazione e per il giorno 20/10/2026'));
  assert.ok(ignota.includes('fissata in prima convocazione per il giorno ______ alle ore ______ presso ______ è andata deserta'));
  for (const termine of [null, false]) {
    const t = componiVerbale(fatti({ primaConvocazione: { ...fatti().primaConvocazione, termineRispettato: termine } }));
    assert.ok(!t.includes('non oltre dieci giorni'), String(termine));
    assert.ok(t.includes('(art. 1130, n. 7, c.c.), allegata sub n. 2.\n\n3. APERTURA'), String(termine));
  }

  const prima = componiVerbale(fatti({ convocazione: 'prima', primaConvocazione: null, allegati: fatti().allegati.filter((a) => a.chiave !== 'deserta') }));
  assert.ok(!prima.includes('PRIMA CONVOCAZIONE'));
  assert.ok(!prima.includes('deserta'));
  assert.ok(prima.includes('in prima convocazione del 20/10/2026'));
  assert.ok(prima.includes('per il giorno 20/10/2026 alle ore 21:00 presso Sala comune in prima convocazione, con il seguente ordine del giorno:'));
  assert.ok(prima.includes('\n\n2. APERTURA\n'));
  assert.ok(prima.includes('dall\'art. 1136, primo comma, c.c. (maggioranza dei partecipanti e due terzi del valore)'));
});

test('componiVerbale: la frase della convocazione e della sua verifica è quella del modello (art. 1136, sesto comma)', () => {
  const testo = componiVerbale(fatti());
  assert.ok(testo.includes('Si dà atto che l\'assemblea ordinaria del Condominio è stata convocata da Studio Esempio con avviso del 05/10/2026, inviato a tutti gli aventi diritto, per il giorno'));
  assert.ok(testo.includes('L\'avviso è allegato al presente verbale (allegato n. 1).'));
  assert.ok(testo.includes('Si dà atto altresì che il Presidente dell\'assemblea, ROSSI Mario, nominato come indicato al paragrafo 4, ha verificato la regolare convocazione di tutti gli aventi diritto, come richiesto dall\'art. 1136, sesto comma, c.c.'));
  assert.ok(testo.includes('\n\n4. PRESIDENTE E SEGRETARIO\nL\'assemblea nomina Presidente ROSSI Mario e Segretario VERDI Anna, che accettano.'));
  // in prima convocazione il paragrafo del presidente è il terzo
  const prima = componiVerbale(fatti({ convocazione: 'prima', primaConvocazione: null }));
  assert.ok(prima.includes('nominato come indicato al paragrafo 3, ha verificato'));
  // senza convocante e senza data dell'avviso la frase resta corretta, senza segnaposto
  const senza = componiVerbale(fatti({ avviso: { data: '', convocante: '' } }));
  assert.ok(senza.includes('è stata convocata da ______ con avviso del ______, inviato a tutti gli aventi diritto, per il giorno'));
});

test('componiVerbale: appello con elenco nominativo e costituzione', () => {
  const testo = componiVerbale(fatti());
  assert.ok(testo.includes('\n\n5. APPELLO\nAlle ore 21:15 si procede all\'appello. Gli aventi diritto sono n. 5 condomini, per complessivi 1.000,000/1000 della tabella 4 - Proprietà.\n'
    + 'Risultano presenti:\n– di persona: n. 2 condomini, per 400,000/1000;\n– per delega: n. 1 condomino, per 200,000/1000;\n'
    + 'in totale n. 3 condomini su 5, per 600,000/1000.\nElenco nominativo dei presenti:\n'
    + '– NERI Luca – unità A3, A4 – 200,000/1000 – per delega a ROSSI Mario – delega registrata ore 21:02\n'
    + '– ROSSI Mario – unità A1 – 250,000/1000 – di persona – ingresso ore 21:00\n'
    + '– VERDI Anna – unità A2 – 150,000/1000 – di persona – ingresso ore 21:01\n'
    + 'Lo stesso elenco, con gli orari, è riportato nel foglio presenze del report allegato n. 3. Le deleghe, rilasciate per iscritto, sono allegate sub n. 4.'));
  assert.ok(testo.includes('\n\n6. COSTITUZIONE\nIl Presidente, constatato che sono presenti, di persona o per delega, n. 3 condomini su 5, che rappresentano 600,000/1000 del valore dell\'edificio, e che è quindi raggiunto il quorum previsto dall\'art. 1136, terzo comma, c.c. (un terzo dei partecipanti e un terzo del valore), dichiara l\'assemblea validamente costituita e atta a deliberare sugli argomenti all\'ordine del giorno.'));
  const esterno = componiVerbale(fatti({ appello: { ...fatti().appello, elenco: [{ ...persona('NERI Luca', 'A3', '200,000'), delega: { delegato: 'Mario Esterni', esterno: true }, ora: '21:02' }] } }));
  assert.ok(esterno.includes('– NERI Luca – unità A3 – 200,000/1000 – per delega a Mario Esterni (non condomino) – delega registrata ore 21:02'));
});

test('componiVerbale: punto approvato, con nominativi e millesimi, maggioranza con la norma ed esito', () => {
  const blocco = bloccoPunto(componiVerbale(fatti()), 1);
  assert.ok(blocco.includes('Discussione. Si esamina il rendiconto.'));
  assert.ok(blocco.includes('Proposta di delibera posta in votazione:\n«Si approva il rendiconto 2025.»'));
  assert.ok(blocco.includes('Votazione per appello nominale (tabella 4 - Proprietà). Alle ore 21:40 sono presenti, di persona o per delega, n. 3 condomini su 5 aventi diritto al voto sul punto, per 600,000/1000 (intervenuti).\n'
    + '– Favorevoli: n. 2, per 400,000/1000: ROSSI Mario (unità A1, 250,000/1000), VERDI Anna (unità A2, 150,000/1000);\n'
    + '– Contrari: n. 1, per 200,000/1000: NERI Luca (unità A3, A4, 200,000/1000);\n'
    + '– Astenuti: n. 0, per 0,000/1000: nessuno.\n'
    + 'Gli assenti al momento del voto, n. 2 condomini per 400,000/1000, sono elencati nel report allegato n. 3.\n'
    + 'Maggioranza richiesta: maggioranza degli intervenuti che rappresenti almeno 1/3 del valore (333,334/1000) – art. 1136 c.c.'));
  assert.ok(blocco.includes('Esito: APPROVATA. La proposta ha ottenuto il voto favorevole della maggioranza degli intervenuti (n. 2 su 3), che rappresenta 400,000/1000, pari o superiore alla soglia di 333,334/1000 richiesta dall\'art. 1136 c.c.; i millesimi dei favorevoli (400,000/1000) superano quelli dei contrari (200,000/1000).\nL\'assemblea pertanto APPROVA la delibera sopra trascritta.'));
  assert.ok(!blocco.includes('RESPINTA'));

  // all'unanimità degli intervenuti: la variante del modello, riferita alle persone elencate
  const unanime = bloccoPunto(componiVerbale(fatti({ punti: [punto(1, 'Rendiconto', { votazione: votazione({ unanime: true, favorevoli: gruppo(3, '600,000', [persona('ROSSI Mario', 'A1', '250,000')]), contrari: gruppo(0, '0,000') }) })] })), 1);
  assert.ok(unanime.includes('Esito: APPROVATA. L\'assemblea APPROVA la proposta posta in votazione all\'unanimità degli intervenuti, n. 3 condomini per 600,000/1000, i cui nominativi sono riportati nell\'elenco dei favorevoli.'));
});

test('componiVerbale: punto respinto, con il motivo e la norma della regola del punto', () => {
  const respinto = votazione({
    approvato: false, mancaMaggioranzaTeste: true, sottoSoglia: true, favorevoliSuperanoContrari: false,
    favorevoli: gruppo(1, '150,000', [persona('VERDI Anna', 'A2', '150,000')]),
    contrari: gruppo(1, '200,000', [persona('NERI Luca', 'A3, A4', '200,000')]),
    astenuti: gruppo(1, '250,000', [persona('ROSSI Mario', 'A1', '250,000')]),
    maggioranza: 'Maggioranza dei presenti e 500 millesimi', frazione: '1/2', soglia: '500,000', norma: 'art. 1136, quarto comma, del Codice Civile',
  });
  const testo = componiVerbale(fatti({ punti: [punto(2, 'Conferma dell\'amministratore', { delibera: 'Si conferma l\'amministratore.', votazione: respinto })] }));
  const blocco = bloccoPunto(testo, 2);
  assert.ok(blocco.includes('– Astenuti: n. 1, per 250,000/1000: ROSSI Mario (unità A1, 250,000/1000).'));
  assert.ok(blocco.includes('Maggioranza richiesta: maggioranza degli intervenuti che rappresenti almeno 1/2 del valore (500,000/1000) – art. 1136, quarto comma, del Codice Civile.'));
  assert.ok(blocco.includes('Esito: RESPINTA. La proposta non ha raggiunto la maggioranza richiesta dall\'art. 1136, quarto comma, del Codice Civile (manca la maggioranza degli intervenuti per teste e i favorevoli non raggiungono la soglia di 500,000/1000: favorevoli n. 1 su 3 intervenuti, per 150,000/1000; contrari per 200,000/1000).\nL\'assemblea pertanto NON APPROVA la proposta.'));
  assert.ok(!blocco.includes('APPROVATA'));
});

test('componiVerbale: «Varie ed eventuali» solo comunicazioni, senza votazione né esito', () => {
  const testo = componiVerbale(fatti({ punti: [
    punto(1, 'Approvazione del rendiconto', { votazione: votazione() }),
    punto(2, 'Varie ed eventuali', { informativo: true, sintesi: 'Si segnala la perdita in garage' }),
  ] }));
  const varie = bloccoPunto(testo, 2);
  assert.ok(varie.includes('Sono rese le seguenti comunicazioni, senza alcuna votazione: Si segnala la perdita in garage.'));
  assert.ok(varie.includes('Gli argomenti che richiedono una decisione saranno inseriti nell\'ordine del giorno di una prossima assemblea.'));
  for (const parola of ['Votazione', 'Esito', 'Maggioranza richiesta', 'Favorevoli', 'Discussione.']) assert.ok(!varie.includes(parola), parola);
});

test('componiVerbale: punto non votato, niente esito inventato', () => {
  const testo = componiVerbale(fatti({ punti: [punto(1, 'Sostituzione del cancello', { sintesi: 'Si attende un secondo preventivo' })] }));
  const blocco = bloccoPunto(testo, 1);
  assert.ok(blocco.includes('Discussione. Si attende un secondo preventivo.'));
  assert.ok(blocco.includes('Il punto non viene posto in votazione. Nessuna decisione è assunta sul punto.'));
  for (const parola of ['Esito', 'APPROVA', 'RESPINTA', 'Maggioranza richiesta']) assert.ok(!blocco.includes(parola), parola);
  // una votazione ancora aperta: conteggio provvisorio, nessun esito
  const aperta = bloccoPunto(componiVerbale(fatti({ punti: [punto(1, 'Rendiconto', { votazione: votazione({ chiusa: false, ora: '' }) })] })), 1);
  assert.ok(aperta.includes('Votazione per appello nominale (tabella 4 - Proprietà). Sono presenti, di persona o per delega,'));
  assert.ok(aperta.includes('Votazione non ancora chiusa nel portale: il conteggio è provvisorio e l\'esito non è ancora determinato.'));
  assert.ok(!aperta.includes('Esito'));
});

test('componiVerbale: campi vuoti, nessuna riga vuota di dichiarazioni e nessun undefined o null', () => {
  const testo = componiVerbale(fatti({
    presidente: '', segretario: '', avviso: { data: '', convocante: '' },
    seduta: { data: '20/10/2026', ora: '', luogo: '', apertura: '', appello: '', chiusura: '' },
    punti: [punto(1, 'Approvazione del rendiconto', { votazione: votazione() }), punto(2, 'Varie ed eventuali', { informativo: true })],
    chiusura: { ora: '', teste: 3, millesimi: '600,000' },
  }));
  for (const vietato of ['undefined', 'null', 'NaN', '[object', 'Dichiarazioni a verbale', 'Discussione.', 'Proposta di delibera', 'alle ore ,', 'presso ,']) {
    assert.ok(!testo.includes(vietato), vietato);
  }
  assert.ok(!/\n\n\n/.test(testo));
  assert.ok(testo.split('\n\n').every((p) => p.trim() && p === p.trim()));
  assert.ok(!/:\n\n/.test(testo), 'nessuna riga con i due punti seguita dal vuoto');
  assert.ok(testo.includes('Il giorno 20/10/2026, alle ore ______, presso ______, si apre la seduta.'));
  assert.ok(testo.includes('per il giorno 20/10/2026 alle ore ______ presso ______ in seconda convocazione'));
  assert.ok(testo.includes('L\'assemblea nomina Presidente ______________________ e Segretario ______________________, che accettano.'));
  assert.ok(testo.includes('il Presidente dell\'assemblea, nominato come indicato al paragrafo 4, ha verificato'));
  assert.ok(testo.includes('Il Presidente dichiara chiusa l\'assemblea alle ore ______.'));
  assert.ok(bloccoPunto(testo, 2).includes('Non si procede ad alcuna votazione.'));
});

test('componiVerbale: dichiarazioni a verbale, variazioni dei presenti prima del voto e dopo l\'ultimo', () => {
  const entra = { momento: '2026-10-20T19:30:00Z', ora: '21:30', verso: 'entra', ...persona('BIANCHI Rita', 'A5', '200,000'), delegato: null };
  const delega = { momento: '2026-10-20T19:32:00Z', ora: '21:32', verso: 'entra', ...persona('GIALLI Ugo', 'A6', '200,000'), delegato: 'ROSSI Mario' };
  const esce = { momento: '2026-10-20T20:30:00Z', ora: '22:30', verso: 'esce', ...persona('VERDI Anna', 'A2', '150,000'), delegato: null };
  const testo = componiVerbale(fatti({
    movimenti: [entra, delega, esce],
    punti: [
      punto(1, 'Approvazione del rendiconto', { dichiarazioni: 'NERI Luca, ore 21:35: «Voto contro perché manca il dettaglio delle spese.»', variazioni: [entra, delega], votazione: votazione() }),
      punto(2, 'Preventivo', { variazioni: [{ ...esce, ora: '21:50' }], variazioniDa: 'votazione', votazione: votazione({ ora: '21:55' }) }),
    ],
    movimentiFinali: [esce],
  }));
  const blocco = bloccoPunto(testo, 1);
  assert.ok(blocco.includes('Variazioni dei presenti dopo l\'appello:\n– ore 21:30: entra BIANCHI Rita (unità A5, 200,000/1000).\n– ore 21:32: entra GIALLI Ugo (unità A6, 200,000/1000), rappresentato da ROSSI Mario.\n'
    + 'Chi è uscito non partecipa alle votazioni successive e risulta assente; eventuali dichiarazioni sul voto rese prima di uscire non sono computate.'));
  assert.ok(blocco.includes('Dichiarazioni a verbale rese su richiesta (art. 1130, n. 7, c.c.):\nNERI Luca, ore 21:35: «Voto contro perché manca il dettaglio delle spese.»'));
  assert.ok(blocco.indexOf('Variazioni') < blocco.indexOf('Dichiarazioni') && blocco.indexOf('Dichiarazioni') < blocco.indexOf('Votazione per appello'));
  assert.ok(!blocco.includes('dopo l\'ultima votazione'));
  assert.ok(bloccoPunto(testo, 2).includes('Variazioni dei presenti dopo l\'ultima votazione:\n– ore 21:50: esce VERDI Anna (unità A2, 150,000/1000).'));
  const finale = testo.indexOf('Variazioni dei presenti dopo l\'ultima votazione:\n– ore 22:30: esce VERDI Anna (unità A2, 150,000/1000).');
  assert.ok(finale > testo.indexOf('Esito: APPROVATA') && finale < testo.indexOf('CHIUSURA DEI LAVORI'));
});

test('componiVerbale: ordine del modello, chiusura con l\'ora, firme e allegati numerati', () => {
  const testo = componiVerbale(fatti());
  const ordine = ['CONDOMINIO PALMANOVA 67', '1. CONVOCAZIONE', '2. PRIMA CONVOCAZIONE', '3. APERTURA', '4. PRESIDENTE E SEGRETARIO', '5. APPELLO', '6. COSTITUZIONE',
    '7. TRATTAZIONE DEI PUNTI ALL\'ORDINE DEL GIORNO', 'PUNTO 1 – ', '8. CHIUSURA DEI LAVORI', '9. LETTURA E APPROVAZIONE DEL VERBALE', 'Letto, confermato e sottoscritto.',
    'Il Presidente ROSSI Mario', '10. ELENCO DEGLI ALLEGATI'];
  const posizioni = ordine.map((t) => testo.indexOf(t));
  assert.ok(posizioni.every((p) => p >= 0), JSON.stringify(posizioni));
  assert.deepEqual([...posizioni].sort((a, b) => a - b), posizioni);
  assert.ok(testo.includes('\n\n8. CHIUSURA DEI LAVORI\nEsaurita la trattazione dei punti all\'ordine del giorno alle ore ______, risultano presenti n. 3 condomini per 600,000/1000.'));
  assert.ok(testo.includes('Il report allegato n. 3 (foglio presenze con orari di ingresso e di uscita, elenco delle deleghe, quorum costitutivo, presenti e votazioni nominative per ciascun punto, con teste e millesimi) costituisce parte integrante del presente verbale ed è sottoscritto insieme a esso.'));
  assert.ok(testo.includes('Il Presidente dichiara chiusa l\'assemblea alle ore 23:10.'));
  assert.ok(testo.endsWith('\n\nLetto, confermato e sottoscritto.\n\nSala comune, 20/10/2026\n\nIl Presidente ROSSI Mario ______________________\nIl Segretario VERDI Anna ______________________\n\n'
    + '10. ELENCO DEGLI ALLEGATI\n1. Avviso di convocazione del 05/10/2026, con ordine del giorno.\n2. Annotazione di mancata costituzione della prima convocazione del 19/10/2026.\n'
    + '3. Report delle presenze e delle votazioni generato dal portale.\n4. Deleghe scritte (n. 1).\n5. Preventivo della ditta Esempio'));
});

test('componiVerbale: quorum non raggiunto all\'appello, verbale di mancata costituzione (modello 3.7) senza i punti', () => {
  const appello = { ...fatti().appello, presenti: { teste: 1, millesimi: '250,000' }, elenco: [{ ...persona('ROSSI Mario', 'A1', '250,000'), delega: null, ora: '21:00' }] };
  const testo = componiVerbale(fatti({ quorumRaggiunto: false, appello }));
  assert.equal(testo, ['CONDOMINIO PALMANOVA 67',
    'VERBALE DI MANCATA COSTITUZIONE DELL\'ASSEMBLEA\n(da annotare nel registro dei verbali ai sensi dell\'art. 1130, n. 7, c.c.)',
    'Il giorno 20/10/2026 alle ore 21:00, presso Sala comune, era fissata l\'assemblea ordinaria in seconda convocazione, convocata da Studio Esempio con avviso del 05/10/2026, inviato a tutti gli aventi diritto, con l\'ordine del giorno riportato nell\'avviso allegato.\n'
    + 'Alle ore 21:15, ROSSI Mario constata che sono presenti, di persona o per delega, soltanto n. 1 condomino su 5, per 250,000/1000: ROSSI Mario (unità A1, 250,000/1000).\n'
    + 'Non è raggiunto il quorum costitutivo previsto dall\'art. 1136, terzo comma, c.c. (un terzo dei partecipanti e un terzo del valore).\n'
    + 'L\'assemblea non è validamente costituita e non può deliberare.\n'
    + 'Gli argomenti all\'ordine del giorno dovranno essere sottoposti a una nuova assemblea, da convocare con nuovo avviso.\n'
    + 'Il presente verbale è chiuso alle ore 23:10.',
    'Sala comune, 20/10/2026\nROSSI Mario ______________________',
    'Allegati: avviso di convocazione; foglio presenze e deleghe.'].join('\n\n'));
  const nessuno = componiVerbale(fatti({ convocazione: 'prima', primaConvocazione: null, presidente: '', quorumRaggiunto: false, appello: { ...appello, presenti: { teste: 0, millesimi: '0,000' }, elenco: [] } }));
  assert.ok(nessuno.includes('Alle ore 21:15, ______________________ constata che nessun avente diritto è presente.'));
  assert.ok(nessuno.includes('previsto dall\'art. 1136, primo comma, c.c. (maggioranza dei partecipanti e due terzi del valore)'));
  assert.ok(nessuno.includes('L\'assemblea si terrà in seconda convocazione come indicato nell\'avviso.'));
  assert.ok(nessuno.endsWith('Allegati: avviso di convocazione.'));
  for (const parola of ['PUNTO', 'TRATTAZIONE', 'validamente costituita e atta']) assert.ok(!testo.includes(parola) && !nessuno.includes(parola), parola);
});

test('componiVerbale: seconda convocazione con 1/3, favorevoli non oltre i contrari in millesimi → esito del portale e avviso da verificare', () => {
  const daVerificare = votazione({ daVerificareContrari: true, favorevoliSuperanoContrari: false, favorevoli: gruppo(2, '200,000', [persona('ROSSI Mario', 'A1', '200,000')]), contrari: gruppo(1, '250,000', [persona('NERI Luca', 'A3', '250,000')]) });
  const blocco = bloccoPunto(componiVerbale(fatti({ punti: [punto(1, 'Rendiconto', { votazione: daVerificare })] })), 1);
  assert.ok(blocco.includes('Esito: APPROVATA. La proposta ha ottenuto il voto favorevole della maggioranza degli intervenuti (n. 2 su 3), che rappresenta 200,000/1000, pari o superiore alla soglia di 333,334/1000 richiesta dall\'art. 1136 c.c.\nL\'assemblea pertanto APPROVA la proposta posta in votazione.\n'
    + '[DA VERIFICARE: i millesimi dei favorevoli (200,000/1000) non superano quelli dei contrari (250,000/1000); secondo il modello (Cass. 13856/2026) la delibera potrebbe non essere valida; verificare prima della firma.]'));
  const regolare = bloccoPunto(componiVerbale(fatti()), 1);
  assert.ok(!regolare.includes('DA VERIFICARE'));
  assert.ok(regolare.includes('superano quelli dei contrari (200,000/1000).'));
});
