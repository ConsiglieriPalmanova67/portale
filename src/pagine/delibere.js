// Registro delle delibere: tutti i punti all'ordine del giorno di tutte le assemblee, dal più recente,
// con l'esito, il testo della delibera e i to-do nati dal punto. Serve a rispondere a "quando abbiamo deliberato X?".
// Sola consultazione: esiti e testi si registrano nella pagina dell'assemblea.
import { deposito } from '../dati/client.js';
import { ESITI, registroDelibere, filtraDelibere, ricorrenze } from '../assemblea/delibere.js';
import { daInteri } from '../calcolo/numeri.js';
import { esc, millesimi, data } from '../ui/html.js';
import { creaEsecutore } from '../ui/esegui.js';
import { chiediNuovoTodo } from './todo-nuovo.js';
import { STATI, titoloAssemblea, etichettaEsito } from './assemblea/comuni.js';

const STATI_TODO = { aperto: 'aperto', in_corso: 'in corso', chiuso: 'chiuso' };
// I conteggi arrivano dall'esito salvato nel database: si forzano a numero prima di scriverli nella pagina.
const num = (x) => Number(x) || 0;
const teste = (n) => `${num(n)} ${num(n) === 1 ? 'testa' : 'teste'}`;
const scelte = (voci, scelta) => voci.map(([valore, nome]) => `<option value="${esc(valore)}" ${String(valore) === String(scelta) ? 'selected' : ''}>${esc(nome)}</option>`).join('');

// La votazione: i conteggi se il punto è stato votato nel portale, altrimenti la frase del verbale (se letta).
function votazione(r) {
  if (r.conteggi) {
    const c = r.conteggi;
    return `Favorevoli <strong>${teste(c.favorevoli.teste)}</strong>, ${millesimi(daInteri(num(c.favorevoli.peso)))} mill.<br>
      Contrari ${teste(c.contrari.teste)}, ${millesimi(daInteri(num(c.contrari.peso)))} mill.<br>
      Astenuti ${teste(c.astenuti.teste)}, ${millesimi(daInteri(num(c.astenuti.peso)))} mill.<br>
      <span class="nota">su ${teste(c.presenti.teste)} presenti al voto, ${millesimi(daInteri(num(c.presenti.peso)))} mill.</span>`;
  }
  if (r.punto.voti_testo) return `${esc(r.punto.voti_testo)}<br><span class="nota">dal verbale</span>`;
  return '<span class="nota">non registrata</span>';
}

const SEDUTE = { '': 'Seduta tenuta', deserta: 'Andata deserta', rinviata: 'Rinviata' };

// La nota sotto un punto che torna da assemblee precedenti; per uno segnato come nuovo, la possibilità di tornare indietro.
function notaRicorrenza(x, ripetuti, simili) {
  const prima = ripetuti.get(x.punto.id);
  if (prima) {
    return `<p class="ricorrenza">Ripetuto: già all'ordine del giorno ${prima.map((y) => `il ${data(y.assemblea.data)} (punto ${y.numero}, ${esc(ESITI[y.stato] ?? y.stato).toLowerCase()})`).join(', ')}.
      <button type="button" class="collegamento" data-azione="nuovo" data-punto="${esc(x.punto.id)}">Non è una ripetizione</button></p>`;
  }
  if (x.punto.non_ricorrente && simili.has(x.punto.id)) {
    return `<p class="nota">Segnato come punto nuovo. <button type="button" class="collegamento" data-azione="ricorrente" data-punto="${esc(x.punto.id)}">Annulla</button></p>`;
  }
  return '';
}

// Una scheda per assemblea, comprimibile, con la tabella dei suoi punti. Una seduta deserta o rinviata è grigia
// e chiusa: resta come memoria ma non conta (niente delibere, niente to-do, niente ripetizioni).
function schedaAssemblea(a, righe, { aperta, ripetuti, simili }) {
  const indirizzo = `#/assemblee/${encodeURIComponent(a.id)}`;
  const deliberati = righe.filter((x) => x.stato === 'approvata' || x.stato === 'respinta').length;
  const nRipetuti = righe.filter((x) => ripetuti.has(x.punto.id)).length;
  return `
    <details class="delibere-assemblea ${a.esito_seduta ? 'non-valida' : ''}" data-assemblea="${esc(a.id)}" ${aperta ? 'open' : ''}>
      <summary>
        <span class="titolo">${esc(titoloAssemblea(a))}</span>
        ${a.esito_seduta ? `<span class="etichetta stato-avviso">${esc(SEDUTE[a.esito_seduta]).toLowerCase()}</span>`
          : `<span class="etichetta ${a.stato === 'chiusa' ? 'stato-presente' : ''}">${esc(STATI[a.stato] ?? a.stato).toLowerCase()}</span>`}
        <span class="nota">${righe.length} punti${a.esito_seduta ? '' : `, ${deliberati} deliberati${nRipetuti ? `, ${nRipetuti} ripetut${nRipetuti === 1 ? 'o' : 'i'}` : ''}`}</span>
      </summary>
      <div class="barra-assemblea">
        <a href="${indirizzo}">Apri l'assemblea</a>
        <label>Seduta <select data-seduta="${esc(a.id)}">${Object.entries(SEDUTE).map(([k, n]) => `<option value="${k}" ${(a.esito_seduta ?? '') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        ${a.esito_seduta ? '<span class="nota">Non conta: da questa seduta non escono delibere né to-do.</span>' : ''}
      </div>
      <div class="scorri"><table class="delibere-tabella">
        <colgroup><col class="c-n"><col class="c-punto"><col class="c-esito"><col class="c-voti"><col class="c-delibera"><col class="c-todo"></colgroup>
        <thead><tr><th>N.</th><th>Punto all'ordine del giorno</th><th>Esito</th><th>Votazione</th><th>Delibera</th><th>To-do</th></tr></thead>
        <tbody>${righe.map((x) => `<tr>
          <td>${x.numero}</td>
          <td><strong>${esc(x.punto.testo)}</strong>${a.esito_seduta ? '' : notaRicorrenza(x, ripetuti, simili)}</td>
          <td>${etichettaEsito(x.punto, a)}</td>
          <td>${votazione(x)}</td>
          <td>${x.delibera ? esc(x.delibera) : '<span class="nota">—</span>'}</td>
          <td>${x.todo.map((t) => `<a href="#/todo">${esc(t.titolo || t.descrizione)}</a> <span class="nota">(${esc(STATI_TODO[t.stato] ?? t.stato)})</span>`).join('<br>')}
            ${a.esito_seduta ? (x.todo.length ? '' : '<span class="nota">—</span>') : `<button type="button" class="secondario piccolo" data-azione="nuovo-todo" data-punto="${esc(x.punto.id)}">+ To-do</button>`}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </details>`;
}

export async function delibere(stato, contenitore) {
  let attiva = true;
  stato.allUscita = () => { attiva = false; };
  const filtri = { testo: '', anno: '', esito: '', ripetuti: false };
  let righe = [];
  // schede aperte o chiuse a mano: restano così mentre si filtra
  const sceltaApertura = new Map();

  contenitore.innerHTML = `<div id="delibere-pagina" class="delibere-pagina">
    <header class="testata">
      <h1>Delibere</h1>
      <p class="nota">Assemblea per assemblea, dalla più recente: ogni punto all'ordine del giorno con esito, votazione, testo della delibera e to-do.
        La votazione viene dal voto registrato durante la seduta oppure, per le assemblee archiviate, dal verbale letto.</p>
    </header>
    <div id="delibere-errore" class="avviso grave" role="alert" hidden></div>
    <div class="filtri" id="delibere-filtri"></div>
    <div id="delibere-elenco"><p class="nota">Caricamento…</p></div>
  </div>`;
  const $ = (selettore) => contenitore.querySelector(selettore);

  function disegnaFiltri() {
    const anni = [...new Set(righe.map((r) => r.anno))].sort((a, b) => b - a);
    $('#delibere-filtri').innerHTML = `
      <input type="search" data-filtro="testo" placeholder="Cerca nel testo dei punti e delle delibere" aria-label="Cerca nel testo" value="${esc(filtri.testo)}">
      <select data-filtro="anno" aria-label="Filtra per anno">${scelte([['', 'Tutti gli anni'], ...anni.map((a) => [a, a])], filtri.anno)}</select>
      <select data-filtro="esito" aria-label="Filtra per esito">${scelte([['', 'Tutti gli esiti'], ...Object.entries(ESITI).map(([k, n]) => [k, k === 'da_votare' ? 'Da votare o senza esito' : n])], filtri.esito)}</select>
      <label class="spunta"><input type="checkbox" data-filtro="ripetuti" ${filtri.ripetuti ? 'checked' : ''}> Solo punti ripetuti</label>`;
  }

  function disegnaElenco() {
    const ripetuti = ricorrenze(righe);
    // i punti segnati come nuovi che però somigliano a uno precedente: per poter annullare la scelta
    const simili = ricorrenze(righe.map((x) => ({ ...x, punto: { ...x.punto, non_ricorrente: false } })));
    const visibili = filtraDelibere(righe, filtri).filter((x) => !filtri.ripetuti || ripetuti.has(x.punto.id));
    // le righe arrivano già per assemblea, dalla più recente: si raggruppano mantenendo l'ordine
    const perAssemblea = [];
    for (const x of visibili) {
      if (perAssemblea.at(-1)?.assemblea.id !== x.assemblea.id) perAssemblea.push({ assemblea: x.assemblea, righe: [] });
      perAssemblea.at(-1).righe.push(x);
    }
    $('#delibere-elenco').innerHTML = `
      <p class="nota">${visibili.length} di ${righe.length} punti, in ${perAssemblea.length} assemblee.</p>
      ${perAssemblea.map((g) => schedaAssemblea(g.assemblea, g.righe, { ripetuti, simili, aperta: sceltaApertura.get(g.assemblea.id) ?? !g.assemblea.esito_seduta })).join('')
        || `<p class="nota">${righe.length ? 'Nessun punto corrisponde alla ricerca.' : 'Nessun punto all\'ordine del giorno registrato.'}</p>`}`;
  }

  const carica = async () => {
    const [assemblee, punti, todo] = await Promise.all([deposito.leggi('assemblee'), deposito.leggi('punti_odg'), deposito.leggi('todo')]);
    if (!attiva) return;
    righe = registroDelibere({ assemblee, punti, todo });
    disegnaFiltri();
    disegnaElenco();
  };
  const { mostra, esegui } = creaEsecutore($('#delibere-errore'), carica);
  const primaLettura = () => carica().catch((errore) => attiva && mostra(`Non è stato possibile leggere le delibere: ${errore.message}`, primaLettura));

  // la ricerca ridisegna solo l'elenco: il campo resta in uso mentre si scrive
  const cambia = (evento) => {
    const { filtro } = evento.target.dataset;
    if (!filtro) return;
    filtri[filtro] = evento.target.type === 'checkbox' ? evento.target.checked : evento.target.value;
    disegnaElenco();
  };
  const elenco = $('#delibere-elenco');
  elenco.addEventListener('toggle', (evento) => {
    const scheda = evento.target.closest?.('details[data-assemblea]');
    if (scheda) sceltaApertura.set(scheda.dataset.assemblea, scheda.open);
  }, true);
  // seduta deserta o rinviata; punto segnato (o non più) come nuovo: si salva e si ricalcola
  elenco.addEventListener('change', (evento) => {
    const id = evento.target.dataset.seduta;
    if (!id) return;
    const valore = evento.target.value || null;
    sceltaApertura.set(id, !valore);
    esegui(() => deposito.aggiorna('assemblee', { id }, { esito_seduta: valore }));
  });
  elenco.addEventListener('click', async (evento) => {
    const { azione, punto } = evento.target.dataset;
    // un to-do nuovo dal punto: assemblea, punto e testo della delibera già compilati
    if (azione === 'nuovo-todo') {
      const riga = righe.find((x) => x.punto.id === punto);
      const assemblee = [...new Map(righe.map((x) => [x.assemblea.id, x.assemblea])).values()];
      const responsabili = [...new Set(['Amministratore', 'Consiglio', ...righe.flatMap((x) => x.todo.map((t) => t.responsabile)).filter(Boolean)])];
      const valori = await chiediNuovoTodo({
        assemblee, punti: righe.map((x) => x.punto), responsabili, oggi: stato.oggi,
        iniziali: { assemblea_id: riga.assemblea.id, punto_id: riga.punto.id, descrizione: riga.delibera },
      });
      if (valori) esegui(() => deposito.inserisci('todo', [valori]));
      return;
    }
    if (azione === 'nuovo' || azione === 'ricorrente') esegui(() => deposito.aggiorna('punti_odg', { id: punto }, { non_ricorrente: azione === 'nuovo' }));
  });
  $('#delibere-filtri').addEventListener('input', cambia);
  $('#delibere-filtri').addEventListener('change', cambia);

  await primaLettura();
}
