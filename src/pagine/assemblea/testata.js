// Testata del dettaglio: dati dell'assemblea e della convocazione, documenti, orari, e i passaggi di stato
// (apri seduta, appello, chiudi, riapri, azzera; in bozza anche modifica ed eliminazione).
import { costruisciModello } from '../../dati/modello.js';
import { congelaTeste } from '../../assemblea/seduta.js';
import { esc, ora, conOra, data } from '../../ui/html.js';
import { TIPI, CONVOCAZIONI, STATI, STATI_VERBALE, ARCHIVIO_VERBALI, titoloAssemblea, conferma, oraBreve, quando, apriFile } from './comuni.js';

const opzioni = (voci, scelta) => Object.entries(voci).map(([valore, nome]) => `<option value="${valore}" ${valore === scelta ? 'selected' : ''}>${esc(nome)}</option>`).join('');

function moduloDati(a) {
  return `
    <form class="modulo" id="dati-assemblea">
      <label>Data <input type="date" name="data" required value="${esc(a.data)}"></label>
      <label>Ora prevista <input type="time" name="ora" value="${esc(oraBreve(a.ora))}"></label>
      <label>Tipo <select name="tipo">${opzioni(TIPI, a.tipo)}</select></label>
      <label>Convocazione <select name="convocazione">${opzioni(CONVOCAZIONI, a.convocazione)}</select></label>
      <label class="largo">Luogo <input type="text" name="luogo" value="${esc(a.luogo)}" placeholder="Per esempio: sala comune"></label>
      <fieldset class="largo campi">
        <legend>Prima convocazione (se la seduta si tiene in seconda)</legend>
        <label>Data <input type="date" name="prima_data" value="${esc(a.prima_data)}"></label>
        <label>Ora <input type="time" name="prima_ora" value="${esc(oraBreve(a.prima_ora))}"></label>
        <label class="largo">Luogo <input type="text" name="prima_luogo" value="${esc(a.prima_luogo)}"></label>
      </fieldset>
      <label>Data della lettera di convocazione <input type="date" name="data_lettera" value="${esc(a.data_lettera)}"></label>
      <div class="azioni"><button type="submit">Salva i dati</button> <button type="button" class="secondario" data-azione="annulla-dati">Annulla</button></div>
    </form>`;
}

// Seduta prevista, prima convocazione, lettera e documenti (convocazione e verbale).
function datiConvocazione(ctx) {
  const a = ctx.assemblea;
  const v = ctx.verbale;
  const voce = (nome, valore) => (valore ? `<div><dt>${nome}</dt><dd>${valore}</dd></div>` : '');
  const prima = [quando(a.prima_data, a.prima_ora), a.prima_luogo].filter(Boolean).join(', ');
  const documenti = [
    a.convocazione_path ? '<button type="button" class="secondario" data-file="convocazione">Scarica la convocazione</button>' : '',
    v?.file_path ? `<button type="button" class="secondario" data-file="verbale">Scarica il verbale</button>
      <span class="etichetta ${v.stato === 'definitivo' ? 'stato-presente' : 'stato-avviso'}">${esc(STATI_VERBALE[v.stato]).toLowerCase()}</span>` : '',
    !v?.file_path && a.stato === 'chiusa' ? `<a href="#/verbali/${encodeURIComponent(a.id)}">Verbale da caricare</a>` : '',
  ].filter(Boolean).join(' ');
  return `
    <dl class="dati-convocazione">
      ${voce('Seduta', esc(quando(a.data, a.ora)))}
      ${voce('Prima convocazione', esc(prima))}
      ${voce('Lettera di convocazione', a.data_lettera ? `del ${data(a.data_lettera)}` : '')}
      ${voce('Documenti', documenti)}
    </dl>`;
}

const AZZERA = ' <button type="button" class="secondario pericolo" data-azione="azzera">Azzera seduta</button>';

export function testata(ctx) {
  const a = ctx.assemblea;
  const orario = (campo, nome) => (a[campo]
    ? `<label class="orario">${nome} <input type="time" data-orario="${campo}" value="${ora(a[campo])}" ${ctx.solaLettura ? 'disabled' : ''}></label>`
    : '');
  const azioni = a.stato === 'bozza'
    ? `<button type="button" data-azione="apri">Apri seduta</button>
       <button type="button" class="secondario" data-azione="modifica-dati">Modifica i dati</button>
       <button type="button" class="secondario" data-azione="gia-svolta">Registra come già svolta</button>
       <button type="button" class="secondario pericolo" data-azione="elimina">Elimina assemblea</button>`
    : a.stato === 'chiusa' ? `<button type="button" class="secondario" data-azione="riapri">Riapri assemblea</button>${ctx.senzaSeduta ? '' : AZZERA}`
      : `${a.ora_appello ? '' : '<button type="button" data-azione="appello">Registra appello</button>'}
         <button type="button" class="secondario" data-azione="chiudi">Chiudi assemblea</button>${AZZERA}`;
  return `
    <h1>${esc(titoloAssemblea(a))}</h1>
    <p>
      <span class="etichetta stato-${esc(a.stato)}">${esc(STATI[a.stato])}</span>
      <span class="etichetta">${esc(CONVOCAZIONI[a.convocazione])}</span>
      ${a.luogo ? `<span class="nota">${esc(a.luogo)}</span>` : ''}
    </p>
    ${datiConvocazione(ctx)}
    <div class="azioni">
      ${orario('ora_apertura', 'Apertura')}${orario('ora_appello', 'Appello')}${orario('ora_chiusura', 'Chiusura')}
      ${azioni}
      <a href="#/verbali/${encodeURIComponent(a.id)}">Verbale</a>
    </div>
    ${a.stato === 'bozza' && ctx.memoria.testata?.inModifica ? moduloDati(a) : ''}
    ${a.stato === 'bozza' ? `<p class="nota">Aprendo la seduta le teste vengono congelate alla data dell'assemblea: i cambi di proprietà successivi non la toccano.
      Un'assemblea del passato si archivia invece con «Registra come già svolta», senza aprire la seduta.</p>` : ''}
    ${a.stato === 'chiusa' && !ctx.senzaSeduta ? '<p class="nota">Assemblea chiusa: presenze, deleghe e voti sono in sola lettura. Per correggere qualcosa va riaperta.</p>' : ''}
    ${ctx.senzaSeduta ? `<p class="nota">Assemblea registrata come già svolta, senza seduta dal vivo: non ci sono presenze né voti. L'esito e il testo della delibera di ogni punto
      si registrano a mano nell'ordine del giorno. Per correggere la data, i dati della convocazione o i punti va riaperta: torna tra le pianificate.</p>` : ''}`;
}

// Congela le teste alla data dell'assemblea, crea le presenze (tutte assenti), poi apre la seduta.
// Ogni passo si può ripetere senza duplicare: se la rete cade a metà basta riprovare.
async function apriSeduta(ctx) {
  const { stato, assemblea, deposito } = ctx;
  const teste = congelaTeste(costruisciModello(stato.dati, assemblea.data));
  if (!teste.length) throw new Error(`alla data dell'assemblea non risulta nessun proprietario: la seduta non si può aprire`);
  // esiti registrati a mano quando l'assemblea era archiviata: in una seduta dal vivo l'esito viene solo dal voto
  for (const p of await deposito.leggi('punti_odg', { assemblea_id: assemblea.id })) {
    if (p.esito?.manuale) await deposito.aggiorna('punti_odg', { id: p.id }, { esito: null });
  }
  const salvate = await deposito.salva('teste_assemblea', teste.map((t) => ({ ...t, assemblea_id: assemblea.id })), ['assemblea_id', 'chiave']);
  await deposito.salva('presenze', salvate.map((t) => ({ assemblea_id: assemblea.id, testa_id: t.id, stato: 'assente' })), ['assemblea_id', 'testa_id']);
  await deposito.aggiorna('assemblee', { id: assemblea.id }, { stato: 'in_corso', ora_apertura: new Date().toISOString() });
}

// Riporta l'assemblea a "da aprire" cancellando tutto ciò che è stato registrato nella seduta: voti, deleghe
// (con le scansioni), presenze, teste congelate, esiti e orari. Restano ordine del giorno, convocazione, verbale e to-do.
// Lo stato dell'assemblea cambia per ultimo: se un passo fallisce il tasto resta lì e basta riprovare.
async function azzeraSeduta(ctx) {
  const { deposito, id } = ctx;
  const [punti, deleghe] = await Promise.all([deposito.leggi('punti_odg', { assemblea_id: id }), deposito.leggi('deleghe', { assemblea_id: id })]);
  for (const p of punti) await deposito.elimina('voti', { punto_id: p.id });
  await deposito.elimina('deleghe', { assemblea_id: id });
  for (const d of deleghe) {
    if (d.scansione_path) await deposito.eliminaFile('deleghe', d.scansione_path);
  }
  await deposito.elimina('presenze', { assemblea_id: id });
  await deposito.elimina('teste_assemblea', { assemblea_id: id });
  for (const p of punti) {
    if (p.votato_il || p.presenti_al_voto || p.esito) await deposito.aggiorna('punti_odg', { id: p.id }, { votato_il: null, presenti_al_voto: null, esito: null });
  }
  await deposito.aggiorna('assemblee', { id }, { stato: 'bozza', ora_apertura: null, ora_appello: null, ora_chiusura: null });
}

// Archivia un'assemblea del passato: da bozza a chiusa senza congelare teste né creare presenze.
// Lo stato si ricontrolla sul deposito: un altro dispositivo potrebbe aver aperto la seduta nel frattempo.
async function registraGiaSvolta(ctx) {
  const { deposito, id } = ctx;
  const [[attuale], teste] = await Promise.all([deposito.leggi('assemblee', { id }), deposito.leggi('teste_assemblea', { assemblea_id: id })]);
  if (attuale?.stato !== 'bozza' || teste.length) throw new Error('la seduta di questa assemblea è già stata aperta: va chiusa dalla seduta, non registrata come già svolta.');
  await deposito.aggiorna('assemblee', { id }, { stato: 'chiusa' });
}

// Riapertura di un'assemblea archiviata senza seduta: torna in bozza, dove dati e punti si possono correggere.
// Gli esiti registrati a mano restano sui punti.
async function riapriArchiviata(ctx) {
  const { deposito, id } = ctx;
  const teste = await deposito.leggi('teste_assemblea', { assemblea_id: id });
  if (teste.length) throw new Error('per questa assemblea risulta una seduta registrata: ricarica la pagina e riaprila da lì.');
  await deposito.aggiorna('assemblee', { id }, { stato: 'bozza', ora_chiusura: null });
}

// Un'assemblea in bozza si può eliminare: con lei spariscono i punti, il PDF della convocazione e l'eventuale verbale (file compreso).
async function eliminaAssemblea(ctx) {
  const { deposito, id } = ctx;
  if (ctx.assemblea.convocazione_path) await deposito.eliminaFile(ARCHIVIO_VERBALI, ctx.assemblea.convocazione_path);
  for (const v of await deposito.leggi('verbali', { assemblea_id: id })) {
    if (v.file_path) await deposito.eliminaFile('verbali', v.file_path);
  }
  await deposito.elimina('assemblee', { id });
}

// `ridisegna` ridisegna la pagina con i dati già letti (serve ad aprire e chiudere il modulo dei dati).
export function collegaTestata(ctx, ridisegna) {
  const { deposito } = ctx;
  const el = ctx.radice.querySelector('#asm-testata');
  ctx.memoria.testata ??= {};
  const memoria = ctx.memoria.testata;
  const aggiorna = (valori) => ctx.esegui(() => deposito.aggiorna('assemblee', { id: ctx.id }, valori));

  el.onclick = async (evento) => {
    const azione = evento.target.dataset.azione;
    const a = ctx.assemblea;
    const quale = evento.target.dataset.file;
    const percorso = quale === 'convocazione' ? a.convocazione_path : quale === 'verbale' ? ctx.verbale?.file_path : null;
    if (percorso) {
      const bottone = evento.target;
      try {
        await apriFile(deposito, ARCHIVIO_VERBALI, percorso, bottone);
      } catch (errore) {
        ctx.mostraErrore(`Il file non si apre: ${errore.message}`, () => bottone.click());
      }
      return;
    }
    if (azione === 'apri') {
      const quante = congelaTeste(costruisciModello(ctx.stato.dati, a.data)).length;
      const aMano = ctx.punti.filter((p) => p.esito?.manuale).length;
      const avviso = aMano ? ` Attenzione: ${aMano === 1 ? 'un punto ha un esito registrato' : `${aMano} punti hanno un esito registrato`} a mano, che viene cancellato: in una seduta dal vivo l'esito viene dal voto.` : '';
      if (!(await conferma(`Aprire la seduta? Vengono congelate ${quante} teste alla data dell'assemblea e da questo momento si registrano presenze e deleghe.${avviso}`, 'Apri seduta'))) return;
      memoria.inModifica = false;
      ctx.esegui(() => apriSeduta(ctx));
    }
    if (azione === 'gia-svolta') {
      if (a.data > ctx.stato.oggi) {
        await conferma(`La data dell'assemblea (${data(a.data)}) è nel futuro: non può essere già svolta. Se la data è sbagliata correggila con «Modifica i dati».`, 'Ho capito');
        return;
      }
      if (!(await conferma(`Registrare l'${titoloAssemblea(a).toLowerCase()} come già svolta? Passa tra le concluse senza aprire la seduta: non vengono congelate le teste né registrate presenze e voti. L'esito e il testo della delibera di ogni punto si inseriscono a mano nell'ordine del giorno. Si potrà riaprire per correggerla.`, 'Registra come già svolta'))) return;
      memoria.inModifica = false;
      ctx.esegui(() => registraGiaSvolta(ctx));
    }
    if (azione === 'appello') {
      // il report verifica il quorum su chi risulta presente a quest'ora: l'appello si registra a presenze segnate
      const q = ctx.seduta.quorum;
      if (!(await conferma(`Registrare adesso l'ora dell'appello? In questo momento risultano presenti ${q.testePresenti} teste su ${q.testeTotali}: il quorum ${q.raggiunto ? 'è raggiunto' : 'NON è raggiunto'}. Il report riporterà il quorum con le presenze e le deleghe registrate fino a quest'ora; l'ora si può correggere a mano.`, 'Registra appello'))) return;
      aggiorna({ ora_appello: new Date().toISOString() });
    }
    if (azione === 'modifica-dati' || azione === 'annulla-dati') {
      memoria.inModifica = azione === 'modifica-dati';
      ridisegna();
    }
    if (azione === 'elimina') {
      if (!(await conferma(`Eliminare l'${titoloAssemblea(a).toLowerCase()}? Vengono eliminati anche i ${ctx.punti.length} punti all'ordine del giorno. L'operazione non si può annullare.`, 'Elimina assemblea'))) return;
      const prova = async () => {
        try {
          await eliminaAssemblea(ctx);
          location.hash = '#/assemblee';
        } catch (errore) {
          ctx.mostraErrore(`Assemblea non eliminata: ${errore.message}`, prova);
        }
      };
      prova();
    }
    if (azione === 'chiudi') {
      const aperti = ctx.punti.filter((p) => !p.votato_il).length;
      const avviso = aperti ? ` Attenzione: ${aperti === 1 ? 'un punto non ha' : `${aperti} punti non hanno`} la votazione chiusa.` : '';
      if (!(await conferma(`Chiudere l'assemblea?${avviso} Presenze, deleghe e voti diventano in sola lettura; per correggerli andrà riaperta.`, 'Chiudi assemblea'))) return;
      aggiorna({ stato: 'chiusa', ora_chiusura: new Date().toISOString() });
    }
    if (azione === 'azzera') {
      const presenti = ctx.seduta?.presenti?.size ?? 0;
      const votati = ctx.punti.filter((p) => p.votato_il).length;
      const mandati = (ctx.stato.dati.consiglieri ?? []).filter((c) => c.assemblea_nomina_id === ctx.id).length;
      const testo = `Sei sicuro di voler azzerare la seduta? Vengono cancellate le presenze (${presenti} presenti), ${ctx.deleghe.length === 1 ? 'una delega con la sua scansione' : `${ctx.deleghe.length} deleghe con le loro scansioni`}, `
        + `tutti i voti (${votati} ${votati === 1 ? 'votazione chiusa' : 'votazioni chiuse'}) e gli orari: l'assemblea torna da aprire. `
        + 'Restano ordine del giorno, convocazione, verbale e to-do. '
        + (mandati ? `I ${mandati} mandati dei consiglieri registrati da questa assemblea NON vengono toccati: vanno sistemati a mano nella pagina Consiglio. ` : '')
        + 'Questa operazione non si può annullare.';
      if (!(await conferma(testo, 'Azzera seduta'))) return;
      memoria.inModifica = false;
      ctx.esegui(() => azzeraSeduta(ctx));
      return;
    }
    if (azione === 'riapri' && ctx.senzaSeduta) {
      if (!(await conferma('Riaprire l\'assemblea? Torna tra le pianificate: si possono correggere la data, i dati della convocazione e i punti. Gli esiti e i testi delle delibere già registrati restano; quando hai finito premi di nuovo «Registra come già svolta».', 'Riapri assemblea'))) return;
      ctx.esegui(() => riapriArchiviata(ctx));
      return;
    }
    if (azione === 'riapri') {
      if (!(await conferma('Riaprire l\'assemblea? Presenze, deleghe e voti tornano modificabili e l\'ora di chiusura viene azzerata. La riapertura resta registrata con autore e ora.', 'Riapri assemblea'))) return;
      aggiorna({ stato: 'in_corso', ora_chiusura: null });
    }
  };

  // correzione a mano di un orario già registrato
  el.onchange = (evento) => {
    const campo = evento.target.dataset.orario;
    if (!campo) return;
    if (!evento.target.value) { ridisegna(); return; }
    aggiorna({ [campo]: conOra(ctx.assemblea[campo], evento.target.value) });
  };

  el.onsubmit = (evento) => {
    evento.preventDefault();
    const valori = Object.fromEntries(new FormData(evento.target));
    memoria.inModifica = false;
    ctx.esegui(async () => {
      // i dati si cambiano solo finché la seduta non è aperta: si ricontrolla sul deposito
      const [attuale] = await deposito.leggi('assemblee', { id: ctx.id });
      if (attuale?.stato !== 'bozza') throw new Error('la seduta è già stata aperta: i dati della convocazione non si possono più cambiare.');
      await deposito.aggiorna('assemblee', { id: ctx.id }, {
        data: valori.data, ora: valori.ora || null, tipo: valori.tipo, convocazione: valori.convocazione, luogo: valori.luogo.trim() || null,
        prima_data: valori.prima_data || null, prima_ora: valori.prima_ora || null, prima_luogo: valori.prima_luogo.trim() || null,
        data_lettera: valori.data_lettera || null,
      });
    });
  };
}
