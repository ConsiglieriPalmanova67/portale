// Ogni controllo nel caso che torna e nel caso che non torna. Si parte dal fascicolo di fantasia, che quadra,
// e lo si sporca con una "correzione" alla volta (lo stesso meccanismo delle correzioni fatte a mano).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlla, daRisolvere, controlliSpese, controlliPreventivo, controlliPatrimoniale, controlliPartite, controlliRaffronto, controlliTraSezioni, totaliGruppi } from '../../src/estrazione/controlli.js';
import { controlliRiparto, totaliColonne } from '../../src/estrazione/controlli-riparto.js';
import { fascicolo, codici, senzaOk } from './aiuti.js';

const pulito = fascicolo();
const con = (celle) => pulito.dati({ celle });

test('il fascicolo di fantasia senza errori quadra: nessun errore e nessun avviso', () => {
  const esiti = controlla(pulito.dati());
  assert.deepEqual(senzaOk(esiti), []);
  assert.deepEqual(codici(esiti, 'ok'), [
    'parziale_sottoconto', 'totale_gruppo', 'totale_rendiconto', 'sequenza_unita', 'colonna_totale', 'riga_totale_gestione', 'riga_saldo_finale',
    'spese_totale_gestione', 'gruppo_colonna', 'patrimoniale_pareggio', 'partite_totale', 'partite_patrimoniale', 'partite_totale', 'partite_patrimoniale',
    'preventivo_totale', 'raffronto_gruppo',
  ]);
  assert.deepEqual(daRisolvere(esiti), []);
});

test('spese: una voce letta male fa saltare parziale, totale di gruppo e totale del rendiconto', () => {
  const esiti = controlliSpese(con({ 'spese:5|voci.1.importo': '-1.280,00' }).spese);
  assert.deepEqual(codici(esiti, 'errore'), ['parziale_sottoconto', 'totale_gruppo', 'totale_rendiconto']);
  const parziale = esiti.find((e) => e.codice === 'parziale_sottoconto' && e.livello === 'errore');
  assert.match(parziale.messaggio, /SPESE GENERALI \/ PULIZIE: le voci sommano -2\.840,40 invece di -2\.810,40 \(differenza -30,00\)/);
  assert.equal(parziale.dove.pagina, 5);
  // la cella da guardare è il parziale; le voci del sottoconto sono le altre celle coinvolte
  assert.equal(parziale.dove.origine, 'spese:5|totali.0.importo');
  assert.deepEqual(parziale.dove.origini, ['spese:5|voci.0.importo', 'spese:5|voci.1.importo', 'spese:5|voci.2.importo']);
  // gli altri sottoconti continuano a tornare, ma il riepilogo "tutti tornano" non c'è più
  assert.ok(!esiti.some((e) => e.livello === 'ok'));
});

test('spese: parziale, totale di gruppo e totale del rendiconto mancanti sono avvisi; un parziale senza voci è un errore', () => {
  const d = pulito.dati();
  const senza = (tipo) => ({ ...d.spese, totali: d.spese.totali.filter((t) => t.tipo !== tipo) });
  assert.deepEqual(codici(senzaOk(controlliSpese(senza('parziale_sottoconto')))), Array(8).fill('parziale_mancante'));
  assert.deepEqual(codici(senzaOk(controlliSpese(senza('totale_gruppo')))), Array(4).fill('totale_gruppo_mancante'));
  assert.deepEqual(senzaOk(controlliSpese(senza('totale_generale'))).map((e) => [e.livello, e.codice]), [['avviso', 'totale_rendiconto_mancante']]);
  const orfano = { ...d.spese, totali: [...d.spese.totali, { pagina: 8, tipo: 'parziale_sottoconto', gruppo: 'SPESE GENERALI', sottoconto: 'PORTIERATO', importo: '-10,00', origine: 'spese:8|totali.9' }] };
  assert.deepEqual(codici(controlliSpese(orfano), 'errore'), ['parziale_senza_voci']);
});

test('spese: importo illeggibile, voce senza sottoconto, voce letta due volte', () => {
  assert.deepEqual(codici(controlliSpese(con({ 'spese:5|voci.0.importo': '-1.2S0,00' }).spese), 'errore').slice(0, 1), ['importo_illeggibile']);
  assert.ok(codici(controlliSpese(con({ 'spese:5|voci.0.sottoconto': '' }).spese), 'errore').includes('voce_senza_conto'));
  const d = pulito.dati();
  const doppia = { ...d.spese, voci: [...d.spese.voci, { ...d.spese.voci[3], origine: 'spese:5|voci.99' }] };
  const esiti = controlliSpese(doppia);
  assert.ok(codici(esiti, 'errore').includes('voce_duplicata'));
  assert.match(esiti.find((e) => e.codice === 'voce_duplicata').messaggio, /Pagina 5: la voce G30 \(-480,50\) compare 2 volte/);
  // stesso protocollo e importo su pagine diverse (una fattura divisa su due sottoconti) non è un doppione
  const divisa = { ...d.spese, voci: [...d.spese.voci, { ...d.spese.voci[3], pagina: 6, origine: 'spese:5|voci.99' }] };
  assert.ok(!codici(controlliSpese(divisa)).includes('voce_duplicata'));
});

test('totaliGruppi: somme per gruppo nell\'ordine del rendiconto', () => {
  assert.deepEqual(totaliGruppi(pulito.dati().spese), [
    { gruppo: 'SPESE GENERALI', totale: -559590 }, { gruppo: 'ASCENSORE SCALA A', totale: -138850 }, { gruppo: 'RISCALDAMENTO TORRE 1', totale: -636085 }, { gruppo: 'SPESE PERSONALI', totale: -2440 },
  ]);
});

test('riparto: una cella letta male si vede nel totale di colonna, nella riga e nel rapporto con i millesimi', () => {
  const d = con({ 'riparto:9|righe.6.celle.0.importo': '-232,84' });
  const esiti = controlliRiparto(d.riparto);
  assert.deepEqual(senzaOk(esiti).map((e) => [e.livello, e.codice]), [['errore', 'colonna_totale'], ['avviso', 'rapporto_anomalo'], ['errore', 'riga_totale_gestione']]);
  const rapporto = esiti.find((e) => e.codice === 'rapporto_anomalo');
  assert.match(rapporto.messaggio, /pagina 9, A7, colonna «1 - SPESE GENERALI»: con 40,000 millesimi ci si aspetta circa -223,84, è stato letto -232,84/);
  assert.equal(rapporto.dove.origine, 'riparto:9|righe.6.celle.0.importo');
  assert.match(esiti.find((e) => e.codice === 'colonna_totale').messaggio, /sommano -5\.604,90 invece di -5\.595,90 \(differenza -9,00\)/);
  assert.match(esiti.find((e) => e.codice === 'riga_totale_gestione').messaggio, /A7: le tabelle sommano -383,89 ma il totale gestione è -374,89/);
});

test('riparto: un millesimo letto male sbilancia la somma dei millesimi e il rapporto di quella riga', () => {
  const esiti = senzaOk(controlliRiparto(con({ 'riparto:9|righe.2.celle.0.millesimi': '14,000' }).riparto));
  assert.deepEqual(esiti.map((e) => [e.livello, e.codice, e.dove.riga]), [['avviso', 'colonna_millesimi', 'totale'], ['avviso', 'rapporto_anomalo', 'A3']]);
  assert.match(esiti[0].messaggio, /sommano 970,000 invece di 1\.000,000/);
});

test('riparto: il rapporto tiene conto di quante cifre dei millesimi sono stampate e somma le righe con lo stesso codice', () => {
  const cella = (importo, millesimi, n) => ({ importo, millesimi, origine: `riparto:1|righe.${n}.celle.0` });
  const rigaDi = (codice, n, importo, millesimi, totale) => ({ codice, n: 1, pagina: 1, origine: `riparto:1|righe.${n}`, valori: { t: cella(importo, millesimi, n), tot: cella(totale ?? importo, '', n) } });
  const riparto = (righe, totale) => ({
    colonne: [{ chiave: 't', titolo: '4 - PROPRIETA', millesimi: true, ruolo: 'tabella', parte: 1 }, { chiave: 'tot', titolo: 'Totale gestione', millesimi: false, ruolo: 'totale_gestione', parte: 1 }],
    parti: [{ parte: 1, colonne: ['t', 'tot'], righe: righe.map((r) => ({ ...r, celle: r.valori })), arrotondamenti: {}, totale: {}, colonneDiverse: [] }],
    righe, arrotondamenti: {}, totale: { t: { importo: totale, millesimi: '1000', origine: 'riparto:1|totale.0' } },
  });
  // millesimi stampati con una sola cifra: 0,8 può essere 0,75…0,85 → lo scarto di pochi centesimi non è un'anomalia
  const grezzi = riparto([rigaDi('A1', 0, '-41,50', '0,8'), rigaDi('A2', 1, '-44,00', '0,9'), rigaDi('A3', 2, '-49.914,50', '998,3')], '-50.000,00');
  assert.ok(!codici(controlliRiparto(grezzi)).includes('rapporto_anomalo'));
  // proprietario e conduttore si dividono la quota dell'unità: presi insieme sono proporzionati
  const divisi = riparto([rigaDi('A1', 0, '-70,00', '100,000'), { ...rigaDi('A1', 1, '-30,00', '0,000'), n: 2 }, rigaDi('A2', 2, '-900,00', '900,000')], '-1.000,00');
  assert.ok(!codici(controlliRiparto(divisi)).includes('rapporto_anomalo'));
  const storti = riparto([rigaDi('A1', 0, '-70,00', '100,000'), rigaDi('A2', 1, '-930,00', '900,000')], '-1.000,00');
  assert.deepEqual(controlliRiparto(storti).filter((e) => e.codice === 'rapporto_anomalo').map((e) => e.dove.riga), ['A1', 'A2']);
});

test('riparto: sequenza delle unità diversa tra le parti, riga in meno, codice mancante', () => {
  const diversa = controlliRiparto(con({ 'riparto:11|righe.4.codice': 'A50' }).riparto);
  const errore = diversa.find((e) => e.codice === 'sequenza_unita');
  assert.equal(errore.livello, 'errore');
  assert.match(errore.messaggio, /parte 2, pagina 11: alla riga 5 c'è A50 dove la parte 1 ha A5/);
  assert.equal(errore.dove.origine, 'riparto:11|righe.4.codice');

  const corta = structuredClone(pulito.blocchi);
  corta.find((b) => b.sezione === 'riparto' && b.pagina_da === 12).dati.righe.pop();
  const { assembla } = { assembla: (b) => fascicoloDa(b) };
  assert.match(controlliRiparto(assembla(corta).riparto).find((e) => e.codice === 'sequenza_unita').messaggio, /la parte 3 ha 25 righe, la parte 1 ne ha 26/);

  assert.ok(codici(controlliRiparto(con({ 'riparto:9|righe.0.codice': '' }).riparto), 'errore').includes('riga_senza_codice'));
  assert.ok(codici(controlliRiparto(con({ 'riparto:12|righe.0.celle.0.importo': 'l00,00' }).riparto), 'errore').includes('importo_illeggibile'));
});

test('riparto: saldo finale che non torna; totale mancante; colonna comparsa a metà parte; riparto vuoto', () => {
  const saldo = senzaOk(controlliRiparto(con({ 'riparto:12|righe.3.celle.1.importo': '100,00' }).riparto));
  assert.deepEqual(saldo.map((e) => [e.codice, e.dove.riga]), [['colonna_totale', 'totale'], ['riga_saldo_finale', 'A4#1']]);

  const blocchi = structuredClone(pulito.blocchi);
  for (const b of blocchi.filter((x) => x.sezione === 'riparto')) Object.assign(b.dati, { totale: [], arrotondamenti: [] });
  assert.deepEqual(senzaOk(controlliRiparto(fascicoloDa(blocchi).riparto)).map((e) => [e.livello, e.codice]), [['avviso', 'riparto_totale_mancante']]);

  const spezzato = structuredClone(pulito.blocchi);
  const parte1 = spezzato.find((b) => b.sezione === 'riparto' && b.pagina_da === 9);
  // la mappa ha messo nella parte 1 anche una pagina con altre colonne
  spezzato.push({ sezione: 'riparto', parte: 1, pagina_da: 10, pagina_a: 10, stato: 'fatto', dati: { colonne: [{ titolo: '9 - ALTRA TABELLA', millesimi: true }], righe: [], arrotondamenti: [], totale: [], incerte: [] } });
  parte1.pagina_a = 9;
  assert.ok(codici(controlliRiparto(fascicoloDa(spezzato).riparto), 'avviso').includes('colonne_diverse'));

  assert.deepEqual(codici(controlliRiparto({ colonne: [], parti: [], righe: [], arrotondamenti: {}, totale: {} })), ['riparto_vuoto']);
});

test('totaliColonne: somma delle righe, arrotondamenti e totale stampato per colonna', () => {
  const [generali, , , , gestione] = totaliColonne(pulito.dati().riparto);
  assert.equal(generali.stampato, -559590);
  assert.equal(generali.sommaRighe + generali.arrotondamento, -559590);
  assert.equal(generali.sommaMillesimi, 1000000);
  assert.equal(generali.decimali, 3);
  assert.deepEqual([gestione.ruolo, gestione.stampato], ['totale_gestione', -1336965]);
});

test('tra sezioni: spese e riparto devono dare gli stessi totali, gruppo per gruppo', () => {
  const d = con({ 'spese:8|voci.0.importo': '-2.000,00' });
  const esiti = controlliTraSezioni(d.spese, d.riparto);
  assert.deepEqual(codici(esiti, 'errore'), ['spese_totale_gestione', 'gruppo_colonna']);
  assert.match(esiti[1].messaggio, /RISCALDAMENTO TORRE 1 -6\.260,85 senza una colonna uguale; colonne senza gruppo: 8 - SPESE GENERALI TORRE 1 -6\.360,85/);
});

test('tra sezioni: due gruppi ripartiti sulla stessa tabella tornano se le somme coincidono', () => {
  const d = pulito.dati();
  // il rendiconto divide in due gruppi ciò che il riparto mette in una colonna sola
  const spese = { ...d.spese, voci: d.spese.voci.map((v) => (v.sottoconto === 'GIARDINO' ? { ...v, gruppo: 'AREE VERDI' } : v)) };
  const esiti = controlliTraSezioni(spese, d.riparto);
  assert.deepEqual(codici(esiti, 'errore'), []);
  assert.match(esiti.at(-1).messaggio, /2 gruppi ripartiti insieme su 1 colonne/);
});

test('situazione patrimoniale: totali stampati e pareggio', () => {
  assert.deepEqual(codici(controlliPatrimoniale(pulito.dati().patrimoniale)), ['patrimoniale_pareggio']);
  const esiti = controlliPatrimoniale(con({ 'patrimoniale:2|attivita.0.importo': '1.000,00' }).patrimoniale);
  assert.deepEqual(esiti.map((e) => [e.livello, e.codice]), [['errore', 'patrimoniale_totale'], ['errore', 'patrimoniale_pareggio']]);
  assert.equal(esiti[0].dove.origine, 'patrimoniale:2|totale_attivita');
  assert.deepEqual(codici(controlliPatrimoniale(con({ 'patrimoniale:2|totale_passivita': '' }).patrimoniale)), ['patrimoniale_totale_mancante', 'patrimoniale_pareggio']);
});

test('partite verso terzi: totali stampati e voci omonime della situazione patrimoniale', () => {
  const d = con({ 'partite:3|righe.2.importo': '300,40' });
  const esiti = controlliPartite(d.partite, d.patrimoniale);
  assert.deepEqual(esiti.map((e) => [e.livello, e.codice, e.dove.riga]), [
    ['ok', 'partite_totale', 'credito'], ['ok', 'partite_patrimoniale', 'credito'], ['errore', 'partite_totale', 'debito'], ['errore', 'partite_patrimoniale', 'debito'],
  ]);
  assert.match(esiti[3].messaggio, /debiti verso terzi sommano 3\.325,65, ma nella situazione patrimoniale la voce «Debiti v\/terzi» è 3\.335,65/);
  assert.ok(codici(controlliPartite(con({ 'partite:3|righe.0.sezione': 'Varie' }).partite, null), 'errore').includes('partita_senza_lato'));
  assert.ok(codici(controlliPartite(con({ 'partite:3|righe.0.importo': '' }).partite, null), 'errore').includes('importo_illeggibile'));
  // senza situazione patrimoniale si controllano solo i totali stampati
  assert.deepEqual(codici(controlliPartite(pulito.dati().partite, null)), ['partite_totale', 'partite_totale']);
});

test('preventivo: voci = totale del gruppo = totale', () => {
  assert.deepEqual(codici(controlliPreventivo(pulito.dati().preventivo)), ['preventivo_totale']);
  const esiti = controlliPreventivo(con({ 'preventivo:13|gruppi.0.voci.1.importo': '-800,00' }).preventivo);
  assert.deepEqual(esiti.map((e) => [e.livello, e.codice, e.dove.riga ?? '']), [['errore', 'preventivo_gruppo', 'SPESE GENERALI'], ['errore', 'preventivo_totale', '']]);
  assert.deepEqual(codici(controlliPreventivo(con({ 'preventivo:13|totale': '', 'preventivo:13|gruppi.1.totale': '' }).preventivo)), ['totale_gruppo_mancante', 'preventivo_totale_mancante']);
  assert.ok(codici(controlliPreventivo(con({ 'preventivo:13|gruppi.0.voci.0.importo': '??' }).preventivo), 'errore').includes('importo_illeggibile'));
});

test('raffronto: il consuntivo dei gruppi è la riprova delle spese lette (solo avviso)', () => {
  const d = con({ 'raffronto:4|righe.1.valori.1': '-1.000,00' });
  assert.deepEqual(controlliRaffronto(d.raffronto, d.spese).map((e) => [e.livello, e.codice, e.dove.riga]), [['avviso', 'raffronto_gruppo', 'ASCENSORE SCALA A']]);
});

test('controlla: blocchi non letti e letture incerte entrano tra gli esiti; daRisolvere tiene conto di quelli accettati', () => {
  const esiti = controlla(fascicolo({ conErrori: true }).dati());
  assert.deepEqual(codici(esiti, 'errore'), ['parziale_sottoconto', 'totale_gruppo', 'totale_rendiconto', 'colonna_totale', 'riga_totale_gestione', 'spese_totale_gestione', 'gruppo_colonna']);
  assert.deepEqual(codici(esiti, 'avviso'), ['rapporto_anomalo', 'raffronto_gruppo', 'lettura_incerta']);
  assert.equal(daRisolvere(esiti).length, 7);
  const accettati = Object.fromEntries(esiti.filter((e) => e.livello === 'errore').slice(0, 3).map((e) => [e.chiave, true]));
  assert.equal(daRisolvere(esiti, accettati).length, 4);
  assert.equal(new Set(esiti.map((e) => e.chiave)).size, esiti.length, 'le chiavi degli esiti devono essere tutte diverse');

  const blocchi = structuredClone(pulito.blocchi);
  Object.assign(blocchi[1], { stato: 'errore', dati: null });
  const mancante = controlla(fascicoloDa(blocchi));
  assert.deepEqual(mancante.filter((e) => e.codice === 'blocco_mancante').map((e) => e.dove.riga), ['partite:3']);
});

// import in coda per non appesantire l'intestazione: assembla serve solo ai casi che cambiano i blocchi
import { assembla as fascicoloDa } from '../../src/estrazione/assembla.js';
