import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campiVuoti, leggiCampi, fattiVerbale } from '../../src/verbale/fatti.js';
import { componiVerbale } from '../../src/verbale/componi.js';
import { datiProva } from '../../src/dati/dati-prova.js';
import { costruisciModello, perCodice } from '../../src/dati/modello.js';
import { statoSeduta, statoPunto } from '../../src/assemblea/seduta.js';
import { millesimi, ora } from '../../src/ui/html.js';
import { daInteri } from '../../src/calcolo/numeri.js';

const peso = (interi) => millesimi(daInteri(interi));

// Il contesto della seduta come lo costruisce src/pagine/assemblea/dettaglio.js, dai dati di prova.
// `ritocca(dati)` modifica i dati prima di costruirlo.
function contesto(id = 'asm-2025', ritocca = () => {}) {
  const dati = datiProva();
  ritocca(dati);
  const stato = { dati, modello: costruisciModello(dati, '2026-10-20') };
  const assemblea = dati.assemblee.find((a) => a.id === id);
  const teste = dati.teste_assemblea.filter((t) => t.assemblea_id === id);
  const punti = dati.punti_odg.filter((p) => p.assemblea_id === id).sort((a, b) => a.ordine - b.ordine);
  const presenze = dati.presenze.filter((p) => p.assemblea_id === id);
  const deleghe = dati.deleghe.filter((d) => d.assemblea_id === id);
  const voti = dati.voti.filter((v) => punti.some((p) => p.id === v.punto_id));
  const unitaPerId = new Map(dati.unita.map((u) => [u.id, u]));
  return {
    stato, assemblea, teste, punti, presenze, deleghe, voti,
    solaLettura: assemblea.stato === 'chiusa', senzaSeduta: assemblea.stato === 'chiusa' && !teste.length,
    seduta: statoSeduta({ assemblea, teste, presenze, deleghe, millesimi: dati.millesimi, tabellaProprietaId: stato.modello.tabellaProprieta?.id }),
    unitaDi: (testa) => testa.unita.map((u) => unitaPerId.get(u)).filter(Boolean).sort(perCodice).map((u) => u.codice).join(', '),
  };
}
const nomi = (gruppo) => gruppo.nominativi.map((n) => n.nominativo);

test('leggiCampi: JSON rotto o mancante → campi vuoti; JSON valido → i campi, con i tipi sistemati', () => {
  assert.deepEqual(campiVuoti(), { presidente: '', segretario: '', convocante: '', allegati: '', punti: {} });
  for (const rotto of ['{"presidente": "ROSSI', '', undefined, null, 'null', '[1,2]', '42', '"testo"']) assert.deepEqual(leggiCampi(rotto), campiVuoti(), String(rotto));
  assert.deepEqual(leggiCampi(JSON.stringify({ presidente: 'ROSSI Mario', segretario: 7, punti: { p1: { sintesi: 'Breve', delibera: null }, p2: 'no', p3: [] } })), {
    presidente: 'ROSSI Mario', segretario: '', convocante: '', allegati: '',
    punti: { p1: { sintesi: 'Breve', dichiarazioni: '', delibera: '' } },
  });
  // ogni chiamata dà un oggetto nuovo: modificarlo non tocca i successivi
  const campi = leggiCampi('rotto');
  campi.punti.p1 = { sintesi: 'x' };
  assert.deepEqual(campiVuoti().punti, {});
});

test('fattiVerbale: l\'assemblea chiusa del 20/05/2025 dai dati di prova', () => {
  const ctx = contesto();
  const campi = { ...campiVuoti(), presidente: 'MONTI Marco', segretario: 'NEVI Nora', convocante: 'Studio Esempio', allegati: 'Rendiconto 2024\n\n  Preventivo 2025  \n',
    punti: { 'p25-2': { sintesi: 'Si esamina il preventivo.', dichiarazioni: '', delibera: 'Si approva il preventivo 2025.' } } };
  const f = fattiVerbale(ctx, campi);
  const a = ctx.assemblea;

  assert.equal(f.condominio, 'Condominio Palmanova 67');
  assert.equal(f.titolo, 'Assemblea ordinaria del 20/05/2025');
  assert.equal(f.tipo, 'ordinaria');
  assert.equal(f.convocazione, 'seconda');
  assert.deepEqual(f.avviso, { data: '28/04/2025', convocante: 'Studio Esempio' });
  assert.deepEqual(f.primaConvocazione, { data: '', ora: '', luogo: '', termineRispettato: null });
  assert.deepEqual(f.seduta, { data: '20/05/2025', ora: '21:00', luogo: 'Sala comune (esempio)', apertura: ora(a.ora_apertura), appello: ora(a.ora_appello), chiusura: ora(a.ora_chiusura) });
  assert.equal(f.presidente, 'MONTI Marco');
  assert.equal(f.segretario, 'NEVI Nora');
  assert.deepEqual(f.ordineDelGiorno.map((p) => `${p.numero}. ${p.testo}`), [
    '1. Approvazione del rendiconto 2024 e del relativo riparto', '2. Approvazione del preventivo 2025', '3. Installazione di un impianto di videosorveglianza',
  ]);

  // appello: com'era la sala all'ora dell'appello, come nel quorum del Report
  const { appello } = f;
  assert.equal(appello.ora, ora(a.ora_appello));
  assert.equal(appello.tabella, '4 - Proprietà');
  assert.deepEqual(appello.aventiDiritto, { teste: 25, millesimi: '1.000,000' });
  assert.deepEqual(appello.diPersona, { teste: 16, millesimi: '665,000' });
  assert.deepEqual(appello.perDelega, { teste: 1, millesimi: '42,000' });
  assert.deepEqual(appello.presenti, { teste: 17, millesimi: '707,000' });
  assert.equal(appello.elenco.length, 17);
  assert.deepEqual(appello.elenco.find((r) => r.nominativo === 'ALBERI Ada'), { nominativo: 'ALBERI Ada', unita: 'A1, A2', millesimi: '100,000', delega: null, ora: ora('2025-05-20T19:00:00Z') });
  assert.deepEqual(appello.elenco.find((r) => r.nominativo === 'ORTI Omar'), { nominativo: 'ORTI Omar', unita: 'A9', millesimi: '42,000', delega: { delegato: 'ABETI Aldo', esterno: false }, ora: ora('2025-05-20T19:02:00Z') });
  assert.ok(!appello.elenco.some((r) => r.nominativo === 'ZOLLE Zeno'));
  assert.equal(f.quorumRaggiunto, true);
  assert.deepEqual(f.movimenti, []);

  // punti: conteggi identici a quelli del Report (statoPunto con la fotografia dei presenti al voto)
  assert.equal(f.punti.length, 3);
  const [p1, p2, p3] = f.punti;
  assert.equal(p1.votazione.approvato, true);
  assert.equal(p1.votazione.unanime, true);
  assert.deepEqual(p1.votazione.favorevoli.teste, 17);
  assert.equal(p2.numero, 2);
  assert.equal(p2.testo, 'Approvazione del preventivo 2025');
  assert.equal(p2.informativo, false);
  assert.equal(p2.sintesi, 'Si esamina il preventivo.');
  assert.equal(p2.delibera, 'Si approva il preventivo 2025.');
  assert.equal(p2.dichiarazioni, '');
  const v2 = p2.votazione;
  assert.equal(v2.chiusa, true);
  assert.equal(v2.ora, ora('2025-05-20T19:45:00Z'));
  assert.equal(v2.tabella, '4 - Proprietà');
  assert.equal(v2.tabellaParticolare, false);
  assert.equal(v2.aventiDiritto, 25);
  assert.deepEqual(v2.presenti, { teste: 17, millesimi: '707,000' });
  assert.deepEqual([v2.favorevoli.teste, v2.favorevoli.millesimi], [13, '488,000']);
  assert.deepEqual([v2.contrari.teste, v2.contrari.millesimi, nomi(v2.contrari)], [3, '180,500', ['ABETI Aldo', 'ALBERI Ada', 'BOSCHI Bruno + CAMPI Carla']]);
  assert.deepEqual(v2.contrari.nominativi[1], { nominativo: 'ALBERI Ada', unita: 'A1, A2', millesimi: '100,000' });
  assert.deepEqual([v2.astenuti.teste, v2.astenuti.millesimi, nomi(v2.astenuti)], [1, '38,500', ['BRINA Bice']]);
  assert.deepEqual(v2.mancanti, { teste: 0, millesimi: '0,000', nominativi: [] });
  assert.deepEqual([v2.assenti.teste, v2.assenti.millesimi, v2.assenti.elenco.length], [8, '293,000', 8]);
  assert.deepEqual([v2.maggioranza, v2.frazione, v2.soglia, v2.unanimita, v2.norma], ['Maggioranza dei presenti e 1/3 dei millesimi', '1/3', '333,334', null, 'art. 1136 c.c.']);
  assert.deepEqual([v2.approvato, v2.unanime, v2.mancaMaggioranzaTeste, v2.sottoSoglia, v2.favorevoliSuperanoContrari], [true, false, false, false, true]);
  const v3 = p3.votazione;
  assert.deepEqual([v3.approvato, v3.mancaMaggioranzaTeste, v3.sottoSoglia, v3.favorevoli.millesimi, v3.contrari.millesimi, v3.frazione, v3.soglia],
    [false, true, true, '184,000', '523,000', '1/2', '500,000']);
  for (const p of ctx.punti) {
    const { esito } = statoPunto({ punto: p, teste: ctx.teste, millesimi: ctx.stato.dati.millesimi, presenti: ctx.seduta.presenti, voti: ctx.voti });
    const v = f.punti.find((x) => x.id === p.id).votazione;
    for (const chiave of ['favorevoli', 'contrari', 'astenuti']) assert.deepEqual([v[chiave].teste, v[chiave].millesimi], [esito[chiave].teste, peso(esito[chiave].peso)], `${p.id} ${chiave}`);
    assert.equal(v.approvato, esito.approvato);
  }

  assert.deepEqual(f.chiusura, { ora: ora(a.ora_chiusura), teste: 17, millesimi: '707,000' });
  assert.deepEqual(f.allegati, [
    { numero: 1, chiave: 'avviso', descrizione: 'Avviso di convocazione del 28/04/2025, con ordine del giorno.' },
    { numero: 2, chiave: 'deserta', descrizione: 'Annotazione di mancata costituzione della prima convocazione.' },
    { numero: 3, chiave: 'report', descrizione: 'Report delle presenze e delle votazioni generato dal portale.' },
    { numero: 4, chiave: 'deleghe', descrizione: 'Deleghe scritte (n. 1).' },
    { numero: 5, chiave: 'altro', descrizione: 'Rendiconto 2024' },
    { numero: 6, chiave: 'altro', descrizione: 'Preventivo 2025' },
  ]);

  // il testo completo non ha buchi
  const testo = componiVerbale(f);
  for (const vietato of ['undefined', 'null', 'NaN']) assert.ok(!testo.includes(vietato), vietato);
  assert.ok(testo.includes('– ORTI Omar – unità A9 – 42,000/1000 – per delega a ABETI Aldo – delega registrata ore '));
});

test('fattiVerbale: ingressi, uscite e assenti al voto', () => {
  const ENTRA = '2025-05-20T19:35:00Z';
  const DELEGA = '2025-05-20T19:40:00Z';
  const ESCE = '2025-05-20T19:50:00Z';
  const ctx = contesto('asm-2025', (dati) => {
    const presenza = (id) => dati.presenze.find((p) => p.testa_id === id);
    const puntoDi = (id) => dati.punti_odg.find((p) => p.id === id);
    // SASSI Sara arriva dopo il primo voto, TORRI Tino delega ALBERI Ada dopo l'appello: votano dal secondo punto
    Object.assign(presenza('t25-21'), { stato: 'presente', ora_ingresso: ENTRA });
    dati.deleghe.push({ id: 'del25-2', assemblea_id: 'asm-2025', delegante_testa_id: 't25-22', delegato_testa_id: 't25-02', delegato_esterno: null,
      amministratore: false, nota: null, scansione_path: null, ora_registrazione: DELEGA });
    for (const id of ['p25-2', 'p25-3']) {
      // nei dati di prova i punti condividono lo stesso elenco: se ne fa una copia per punto
      puntoDi(id).presenti_al_voto = [...puntoDi(id).presenti_al_voto, 't25-21', 't25-22'];
      dati.voti.push({ punto_id: id, testa_id: 't25-21', voto: 'favorevole' }, { punto_id: id, testa_id: 't25-22', voto: 'contrario' });
    }
    // ABETI Aldo esce prima del terzo voto e con lui la delega di ORTI Omar che porta
    Object.assign(presenza('t25-01'), { stato: 'assente', ora_uscita: ESCE });
    const p3 = puntoDi('p25-3');
    p3.presenti_al_voto = p3.presenti_al_voto.filter((t) => t !== 't25-01' && t !== 't25-17');
    dati.voti = dati.voti.filter((v) => !(v.punto_id === 'p25-3' && (v.testa_id === 't25-01' || v.testa_id === 't25-17')));
  });
  const f = fattiVerbale(ctx, campiVuoti());

  // all'appello non c'erano ancora
  assert.equal(f.appello.presenti.teste, 17);
  assert.ok(!f.appello.elenco.some((r) => ['SASSI Sara', 'TORRI Tino'].includes(r.nominativo)));
  assert.ok(f.appello.elenco.some((r) => r.nominativo === 'ABETI Aldo'));

  const movimento = (momento, verso, nominativo, unita, mill, delegato = null) => ({ momento, ora: ora(momento), verso, nominativo, unita, millesimi: mill, delegato });
  const sassi = movimento(ENTRA, 'entra', 'SASSI Sara', 'A13', '45,000');
  const torri = movimento(DELEGA, 'entra', 'TORRI Tino', 'A14', '37,000', 'ALBERI Ada');
  const abeti = movimento(ESCE, 'esce', 'ABETI Aldo', 'A18', '36,500');
  const orti = movimento(ESCE, 'esce', 'ORTI Omar', 'A9', '42,000', 'ABETI Aldo');
  assert.deepEqual(f.movimenti, [sassi, torri, abeti, orti]);
  // ogni movimento sta nel punto il cui voto segue: prima del voto, in ordine di tempo
  assert.deepEqual(f.punti.map((p) => p.variazioni), [[], [sassi, torri], [abeti, orti]]);
  assert.deepEqual(f.movimentiFinali, []);

  const [v1, v2, v3] = f.punti.map((p) => p.votazione);
  const votanti = (v) => [...nomi(v.favorevoli), ...nomi(v.contrari), ...nomi(v.astenuti), ...nomi(v.mancanti)];
  const assenti = (v) => v.assenti.elenco.map((x) => x.nominativo);
  // primo punto: SASSI e TORRI assenti al voto, con gli orari che lo spiegano
  assert.ok(!votanti(v1).includes('SASSI Sara') && assenti(v1).includes('SASSI Sara'));
  assert.equal(v1.assenti.elenco.find((x) => x.nominativo === 'SASSI Sara').orari, `arrivo ore ${ora(ENTRA)}`);
  assert.equal(v1.assenti.elenco.find((x) => x.nominativo === 'TORRI Tino').orari, `delega registrata alle ${ora(DELEGA)}`);
  // secondo punto: votano anche loro
  assert.deepEqual(v2.presenti, { teste: 19, millesimi: '789,000' });
  assert.ok(nomi(v2.favorevoli).includes('SASSI Sara') && nomi(v2.contrari).includes('TORRI Tino'));
  // terzo punto: ABETI e ORTI non votano più e risultano assenti
  assert.equal(v3.presenti.teste, 17);
  for (const nome of ['ABETI Aldo', 'ORTI Omar']) assert.ok(!votanti(v3).includes(nome) && assenti(v3).includes(nome), nome);
  assert.equal(v3.assenti.elenco.find((x) => x.nominativo === 'ABETI Aldo').orari, `arrivo ore ${ora('2025-05-20T19:00:00Z')}, uscita ore ${ora(ESCE)}`);
  assert.deepEqual(f.chiusura.teste, ctx.seduta.quorum.testePresenti);
  assert.deepEqual(f.chiusura.millesimi, peso(ctx.seduta.quorum.pesoPresente));

  const testo = componiVerbale(f);
  assert.ok(testo.includes(`– ore ${ora(DELEGA)}: entra TORRI Tino (unità A14, 37,000/1000), rappresentato da ALBERI Ada.`));
  assert.ok(testo.includes(`– ore ${ora(ESCE)}: esce ORTI Omar (unità A9, 42,000/1000), rappresentato da ABETI Aldo.`));
  // i movimenti dopo l'ultimo voto vanno in fondo, prima della chiusura
  const tardi = fattiVerbale(contesto('asm-2025', (dati) => {
    Object.assign(dati.presenze.find((p) => p.testa_id === 't25-05'), { stato: 'assente', ora_uscita: '2025-05-20T20:30:00Z' });
  }), campiVuoti());
  assert.deepEqual(tardi.punti.map((p) => p.variazioni.length), [0, 0, 0]);
  assert.deepEqual(tardi.movimentiFinali.map((m) => `${m.verso} ${m.nominativo}`), ['esce CIELI Ciro']);
});

test('fattiVerbale: norma della regola del punto, tabella particolare, «Varie ed eventuali» e punti senza votazione', () => {
  const ctx = contesto('asm-2025', (dati) => {
    const p = (id) => dati.punti_odg.find((x) => x.id === id);
    Object.assign(p('p25-1'), { testo: 'Conferma dell\'amministratore e compenso', maggioranza: 'meta' });
    Object.assign(p('p25-2'), { tabella_id: 'tab-scala-a' });
    Object.assign(p('p25-3'), { testo: 'Varie ed eventuali' });
    dati.punti_odg.push(
      { id: 'p25-4', assemblea_id: 'asm-2025', ordine: 4, testo: 'Sostituzione del cancello', tipo: 'delibera', candidati: [], tabella_id: null, maggioranza: null, votato_il: null, presenti_al_voto: null, esito: null, note: null },
      { id: 'p25-5', assemblea_id: 'asm-2025', ordine: 5, testo: 'Nomina dei consiglieri', tipo: 'nomina_consiglieri', candidati: [{ soggetto_id: 's01', parte_rappresentata: 'Scala A' }, { soggetto_id: 's21', parte_rappresentata: null }],
        tabella_id: 'tab-proprieta', maggioranza: 'terzo', votato_il: null, presenti_al_voto: null, esito: null, note: null },
    );
  });
  const f = fattiVerbale(ctx, { ...campiVuoti(), punti: { 'p25-3': { sintesi: 'Si segnala la perdita in garage.', dichiarazioni: '', delibera: '' } } });
  const [p1, p2, p3, p4, p5] = f.punti;
  assert.equal(p1.votazione.norma, 'art. 1136, quarto comma, del Codice Civile');
  assert.deepEqual([p1.votazione.frazione, p1.votazione.soglia], ['1/2', '500,000']);
  assert.deepEqual([p2.votazione.tabella, p2.votazione.tabellaParticolare, p2.votazione.aventiDiritto], ['2 - Ascensore Scala A', true, 9]);
  assert.deepEqual([p3.informativo, p3.votazione, p3.sintesi], [true, null, 'Si segnala la perdita in garage.']);
  assert.deepEqual([p4.informativo, p4.votazione], [false, null]);
  // votazione non ancora aperta: nessun voto, nessun esito
  assert.equal(p5.votazione, null);
  assert.deepEqual(p5.candidati, ['ALBERI Ada (Scala A)', 'BRINA Bice']);
  const testo = componiVerbale(f);
  assert.ok(testo.includes('Il punto riguarda la tabella 2 - Ascensore Scala A: votano i soli condomini compresi in tale tabella e quorum e maggioranze sono calcolati sui relativi millesimi.'));
  assert.ok(testo.includes('Candidati: ALBERI Ada (Scala A), BRINA Bice.'));
});

test('fattiVerbale: un delegato che arriva dopo l\'appello porta con sé il delegante, e se esce lo porta via', () => {
  const ARRIVA = '2025-05-20T19:35:00Z';
  const ESCE = '2025-05-20T19:55:00Z';
  const ctx = contesto('asm-2025', (dati) => {
    // PRATI VERDI S.R.L. delega QUERCE Rino prima dell'appello, ma QUERCE arriva solo dopo e poi esce
    dati.deleghe.push({ id: 'del25-3', assemblea_id: 'asm-2025', delegante_testa_id: 't25-18', delegato_testa_id: 't25-19', delegato_esterno: null,
      amministratore: false, nota: null, scansione_path: null, ora_registrazione: '2025-05-20T19:05:00Z' });
    Object.assign(dati.presenze.find((p) => p.testa_id === 't25-19'), { stato: 'assente', ora_ingresso: ARRIVA, ora_uscita: ESCE });
  });
  const f = fattiVerbale(ctx, campiVuoti());
  // all'appello il delegato non c'era: nessuno dei due è presente
  assert.ok(!f.appello.elenco.some((r) => ['PRATI VERDI S.R.L.', 'QUERCE Rino'].includes(r.nominativo)));
  // nello stesso momento il delegato viene prima del suo delegante (anche se in ordine alfabetico verrebbe dopo)
  assert.deepEqual(f.movimenti.map((m) => [m.ora, m.verso, m.nominativo, m.delegato]), [
    [ora(ARRIVA), 'entra', 'QUERCE Rino', null],
    [ora(ARRIVA), 'entra', 'PRATI VERDI S.R.L.', 'QUERCE Rino'],
    [ora(ESCE), 'esce', 'QUERCE Rino', null],
    [ora(ESCE), 'esce', 'PRATI VERDI S.R.L.', 'QUERCE Rino'],
  ]);
  assert.deepEqual(f.movimenti[1], { momento: ARRIVA, ora: ora(ARRIVA), verso: 'entra', nominativo: 'PRATI VERDI S.R.L.', unita: 'A10', millesimi: '33,000', delegato: 'QUERCE Rino' });
  // gli ingressi vanno sotto il secondo punto (dopo il primo voto), le uscite sotto il terzo (dopo il secondo)
  assert.deepEqual(f.punti.map((p) => p.variazioni.length), [0, 2, 2]);
  assert.deepEqual(f.punti.map((p) => p.variazioniDa), ['appello', 'votazione', 'votazione']);
  assert.deepEqual(f.movimentiFinali.map((m) => m.nominativo), []);
  const testo = componiVerbale(f);
  assert.ok(testo.includes(`– ore ${ora(ARRIVA)}: entra QUERCE Rino (unità A11, 39,500/1000).\n– ore ${ora(ARRIVA)}: entra PRATI VERDI S.R.L. (unità A10, 33,000/1000), rappresentato da QUERCE Rino.`));
});

test('fattiVerbale: una delega dopo l\'appello non valida o in conflitto non è un ingresso', () => {
  const ctx = contesto('asm-2025', (dati) => {
    const delega = (id, delegante, delegato, ora_registrazione) => ({ id, assemblea_id: 'asm-2025', delegante_testa_id: delegante, delegato_testa_id: delegato,
      delegato_esterno: null, amministratore: false, nota: null, scansione_path: null, ora_registrazione });
    // TORRI Tino delega VALLI Vera, che non è in sala; LAGHI Lia, presente di persona, delega MONTI Marco
    dati.deleghe.push(delega('del25-4', 't25-22', 't25-24', '2025-05-20T19:40:00Z'), delega('del25-5', 't25-13', 't25-15', '2025-05-20T19:42:00Z'));
  });
  assert.deepEqual(fattiVerbale(ctx, campiVuoti()).movimenti, []);
});

test('fattiVerbale: in seconda convocazione con 1/3 si segnala l\'approvazione con i contrari che pesano di più; norma generale se il punto non rispetta la regola', () => {
  // secondo punto: 9 favorevoli per 341,750 millesimi, 8 contrari per 365,250 (i più pesanti)
  const CONTRARI = ['t25-02', 't25-10', 't25-03', 't25-17', 't25-06', 't25-08', 't25-14', 't25-05'];
  const ritocca = (convocazione) => (dati) => {
    dati.assemblee.find((a) => a.id === 'asm-2025').convocazione = convocazione;
    for (const v of dati.voti) if (v.punto_id === 'p25-2') v.voto = CONTRARI.includes(v.testa_id) ? 'contrario' : 'favorevole';
    // nomina dell'amministratore votata su una tabella sbagliata: la regola non è rispettata
    Object.assign(dati.punti_odg.find((p) => p.id === 'p25-3'), { testo: 'Nomina dell\'amministratore', maggioranza: 'meta', tabella_id: 'tab-scala-a' });
  };
  const seconda = fattiVerbale(contesto('asm-2025', ritocca('seconda')), campiVuoti()).punti;
  const v = seconda[1].votazione;
  assert.deepEqual([v.approvato, v.favorevoli.teste, v.favorevoli.millesimi, v.contrari.teste, v.contrari.millesimi, v.favorevoliSuperanoContrari, v.daVerificareContrari],
    [true, 9, '341,750', 8, '365,250', false, true]);
  assert.equal(seconda[0].votazione.daVerificareContrari, false);
  assert.equal(seconda[2].votazione.norma, 'art. 1136 c.c.');
  assert.ok(componiVerbale(fattiVerbale(contesto('asm-2025', ritocca('seconda')), campiVuoti())).includes('[DA VERIFICARE: i millesimi dei favorevoli (341,750/1000) non superano quelli dei contrari (365,250/1000);'));
  // in prima convocazione la condizione non vale
  const prima = fattiVerbale(contesto('asm-2025', ritocca('prima')), campiVuoti()).punti[1].votazione;
  assert.deepEqual([prima.approvato, prima.daVerificareContrari], [true, false]);
});

test('fattiVerbale: il termine della seconda convocazione si conferma solo con le due date note', () => {
  const termine = (prima_data) => fattiVerbale(contesto('asm-2025', (dati) => {
    dati.assemblee.find((a) => a.id === 'asm-2025').prima_data = prima_data;
  }), campiVuoti()).primaConvocazione.termineRispettato;
  assert.deepEqual([termine('2025-05-19'), termine('2025-05-10'), termine('2025-05-20'), termine('2025-05-09'), termine('2025-05-21'), termine(null)],
    [true, true, false, false, false, null]);
});
