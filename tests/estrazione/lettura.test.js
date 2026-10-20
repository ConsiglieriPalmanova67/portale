// La conduzione della lettura: blocchi allineati alla mappa, poche chiamate insieme, riprova, salvataggio immediato, ripresa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparaBlocchi, leggiBlocchi, tokenUsati, ErroreLettura } from '../../src/estrazione/lettura.js';
import { blocchiDaMappa, chiaveBlocco } from '../../src/estrazione/blocchi.js';
import { creaLettoreProva } from '../../src/estrazione/lettore-prova.js';
import { assembla } from '../../src/estrazione/assembla.js';
import { creaDepositoProva } from '../../src/dati/deposito-prova.js';
import { datiProva } from '../../src/dati/dati-prova.js';
import { MAPPA_FASCICOLO } from '../../src/dati/fascicolo-prova.js';

async function avvia(mappa = MAPPA_FASCICOLO) {
  const deposito = creaDepositoProva(datiProva());
  const [estrazione] = await deposito.inserisci('estrazioni', [{ documento_id: 'doc-rendiconto-2025', anno: 2026, mappa }]);
  const righe = await preparaBlocchi(deposito, estrazione.id, mappa);
  return { deposito, estrazione, righe, blocchi: blocchiDaMappa(mappa), leggi: () => deposito.leggi('estrazioni_blocchi', { estrazione_id: estrazione.id }) };
}
const stati = (righe) => Object.fromEntries(righe.map((r) => [chiaveBlocco(r), r.stato]));

test('preparaBlocchi: crea i blocchi della mappa; cambiando la mappa tiene quelli buoni e azzera quelli cambiati', async () => {
  const { deposito, estrazione, righe } = await avvia();
  assert.deepEqual(righe.map(chiaveBlocco), ['patrimoniale:2', 'partite:3', 'raffronto:4', 'spese:5', 'spese:8', 'riparto:9', 'riparto:11', 'riparto:12', 'preventivo:13']);
  assert.ok(righe.every((r) => r.stato === 'in_attesa' && r.tentativi === 0 && !('contesto' in r)));
  await deposito.aggiorna('estrazioni_blocchi', { estrazione_id: estrazione.id }, { stato: 'fatto', dati: { voci: [] } });
  // le spese ora finiscono a pagina 7, il raffronto non c'è più, il preventivo resta
  const nuova = MAPPA_FASCICOLO.filter((s) => s.tipo !== 'raffronto').map((s) => (s.tipo === 'spese' ? { ...s, pagina_a: 6 } : s));
  const dopo = await preparaBlocchi(deposito, estrazione.id, nuova);
  assert.deepEqual(stati(dopo), {
    'patrimoniale:2': 'fatto', 'partite:3': 'fatto', 'spese:5': 'in_attesa', 'riparto:9': 'fatto', 'riparto:11': 'fatto', 'riparto:12': 'fatto', 'preventivo:13': 'fatto',
  });
  assert.equal(dopo.find((r) => r.sezione === 'spese').pagina_a, 6);
});

test('leggiBlocchi: al massimo 3 insieme, ogni blocco salvato appena arriva, token sommati', async () => {
  const { deposito, estrazione, righe, blocchi, leggi } = await avvia();
  let insieme = 0;
  let massimo = 0;
  const salvatiQuando = [];
  const lettore = {
    async blocco(documento, b) {
      insieme += 1;
      massimo = Math.max(massimo, insieme);
      await new Promise((r) => { setTimeout(r, 5); });
      // quando arriva la risposta di un blocco, quelli finiti prima sono già nel deposito
      salvatiQuando.push((await leggi()).filter((r) => r.stato === 'fatto').length);
      insieme -= 1;
      return { dati: { pagina: b.pagina_da, contesto: b.contesto }, token_ingresso: 100, token_uscita: 10 };
    },
  };
  const cambi = [];
  const esito = await leggiBlocchi({ lettore, documento: {}, deposito, blocchi, righe, aggiorna: (r) => cambi.push(`${chiaveBlocco(r)}=${r.stato}`) });
  assert.deepEqual(esito, { fatti: 9, falliti: 0, interrotta: false });
  assert.equal(massimo, 3);
  assert.ok(salvatiQuando.at(-1) >= 6, 'i primi blocchi devono essere già salvati mentre gli ultimi sono in lettura');
  assert.ok(cambi.includes('spese:8=in_corso') && cambi.includes('spese:8=fatto'));
  const dopo = await leggi();
  assert.ok(dopo.every((r) => r.stato === 'fatto' && r.tentativi === 1 && r.token_ingresso === 100));
  assert.deepEqual(dopo.find((r) => chiaveBlocco(r) === 'spese:8').dati, { pagina: 8, contesto: 7 });
  assert.deepEqual(tokenUsati({ ...estrazione, token_ingresso: 1000, token_uscita: 50 }, dopo), { ingresso: 1900, uscita: 140 });
});

test('leggiBlocchi: un errore temporaneo si riprova una volta sola; uno definitivo no; gli altri blocchi proseguono', async () => {
  const { deposito, righe, blocchi, leggi } = await avvia();
  const chiamate = {};
  const lettore = {
    async blocco(documento, b) {
      const k = chiaveBlocco(b);
      chiamate[k] = (chiamate[k] ?? 0) + 1;
      if (k === 'partite:3' && chiamate[k] === 1) throw new ErroreLettura('sovraccarico', true);
      if (k === 'spese:5') throw new ErroreLettura('sovraccarico che non passa', true);
      if (k === 'riparto:9') throw new ErroreLettura('risposta troncata');
      return { dati: {}, token_ingresso: 1, token_uscita: 1 };
    },
  };
  const esito = await leggiBlocchi({ lettore, documento: {}, deposito, blocchi, righe, attesa: 1 });
  assert.deepEqual(esito, { fatti: 7, falliti: 2, interrotta: false });
  assert.deepEqual([chiamate['partite:3'], chiamate['spese:5'], chiamate['riparto:9'], chiamate['spese:8']], [2, 2, 1, 1]);
  const dopo = Object.fromEntries((await leggi()).map((r) => [chiaveBlocco(r), r]));
  assert.deepEqual([dopo['partite:3'].stato, dopo['partite:3'].tentativi], ['fatto', 2]);
  assert.deepEqual([dopo['spese:5'].stato, dopo['spese:5'].errore, dopo['spese:5'].tentativi], ['errore', 'sovraccarico che non passa', 2]);
  assert.deepEqual([dopo['riparto:9'].stato, dopo['riparto:9'].errore, dopo['riparto:9'].tentativi], ['errore', 'risposta troncata', 1]);
});

test('leggiBlocchi: interrotta e ripresa (anche da capo, con le righe rilette dal deposito) non rilegge i blocchi fatti', async () => {
  const { deposito, estrazione, righe, blocchi, leggi } = await avvia();
  const lette = [];
  const lettore = { async blocco(documento, b) { lette.push(chiaveBlocco(b)); return { dati: {}, token_ingresso: 1, token_uscita: 1 }; } };
  const primo = await leggiBlocchi({ lettore, documento: {}, deposito, blocchi, righe, inParallelo: 1, fermati: () => lette.length >= 4 });
  assert.deepEqual(primo, { fatti: 4, falliti: 0, interrotta: true });
  // come dopo aver chiuso la pagina: un blocco rimasto "in corso" e tutto il resto riletto dal deposito
  await deposito.aggiorna('estrazioni_blocchi', { estrazione_id: estrazione.id, sezione: 'spese', pagina_da: 8 }, { stato: 'in_corso' });
  const secondo = await leggiBlocchi({ lettore, documento: {}, deposito, blocchi, righe: await leggi() });
  assert.deepEqual(secondo, { fatti: 5, falliti: 0, interrotta: false });
  assert.equal(lette.length, 9);
  assert.equal(new Set(lette).size, 9);
});

test('leggiBlocchi: la rilettura di un blocco già fatto lo sostituisce e somma i token', async () => {
  const { deposito, righe, blocchi, leggi } = await avvia();
  let giro = 0;
  const lettore = { async blocco() { giro += 1; return { dati: { giro }, token_ingresso: 10, token_uscita: 2 }; } };
  await leggiBlocchi({ lettore, documento: {}, deposito, blocchi, righe });
  const esito = await leggiBlocchi({ lettore, documento: {}, deposito, blocchi, righe: await leggi(), soloQuesti: ['riparto:11'] });
  assert.deepEqual(esito, { fatti: 1, falliti: 0, interrotta: false });
  const riletto = (await leggi()).find((r) => chiaveBlocco(r) === 'riparto:11');
  assert.deepEqual([riletto.dati.giro, riletto.tentativi, riletto.token_ingresso, riletto.token_uscita], [10, 2, 20, 4]);
});

test('lettore finto: dà la mappa del fascicolo di fantasia e, con una rilettura, tutti i blocchi che servono alla revisione', async () => {
  const { deposito, righe, blocchi, leggi } = await avvia();
  const lettore = creaLettoreProva(datiProva(), { anno: 2026, oggi: '2026-10-13', ritardo: 0 });
  const documento = await lettore.apri();
  assert.equal(documento.pagine, 13);
  assert.deepEqual((await lettore.indice(documento)).dati.sezioni, MAPPA_FASCICOLO);
  const primo = await leggiBlocchi({ lettore, documento, deposito, blocchi, righe });
  assert.deepEqual(primo, { fatti: 8, falliti: 1, interrotta: false });
  assert.match((await leggi()).find((r) => r.stato === 'errore').errore, /errore simulato/);
  const secondo = await leggiBlocchi({ lettore, documento, deposito, blocchi, righe: await leggi() });
  assert.deepEqual(secondo, { fatti: 1, falliti: 0, interrotta: false });
  const dati = assembla(await leggi());
  assert.deepEqual([dati.spese.voci.length, dati.riparto.righe.length, dati.mancanti.length], [16, 26, 0]);
  await assert.rejects(lettore.blocco(documento, { sezione: 'spese', pagina_da: 2, pagina_a: 3 }), /non ha un blocco spese che comincia a pagina 2/);
});

test('deposito di prova: i blocchi sono unici per sezione e pagina, e spariscono con l\'estrazione e con il documento', async () => {
  const { deposito, estrazione } = await avvia();
  await assert.rejects(deposito.inserisci('estrazioni_blocchi', [{ estrazione_id: estrazione.id, sezione: 'spese', pagina_da: 5, pagina_a: 6 }]), /esiste già una riga/);
  await assert.rejects(deposito.aggiorna('estrazioni', { id: estrazione.id }, { stato: 'finita' }), /non è tra i valori ammessi/);
  await assert.rejects(deposito.inserisci('estrazioni', [{ documento_id: 'doc-rendiconto-2025' }]), /manca anno/);
  await deposito.elimina('documenti', { id: 'doc-rendiconto-2025' });
  assert.deepEqual([(await deposito.leggi('estrazioni')).length, (await deposito.leggi('estrazioni_blocchi')).length], [0, 0]);
});
