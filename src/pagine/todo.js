// To-do come in un foglio di progetto: una riga per attività, ogni cella modificabile sul posto e salvata quando si
// esce dal campo. Colonne: titolo, assemblea e punto di origine, descrizione, responsabile (testo libero: un consigliere,
// l'amministratore, un condomino…), apertura, chiusura stimata, chiusura effettiva, stato, criticità.
// Chiudere un to-do mette la data di chiusura di oggi; scrivere la data di chiusura lo chiude.
import { deposito } from '../dati/client.js';
import { esc, normalizza } from '../ui/html.js';
import { creaEsecutore } from '../ui/esegui.js';
import { titoloAssemblea, conferma } from './assemblea/comuni.js';
import { chiediNuovoTodo } from './todo-nuovo.js';

export const STATI_TODO = { aperto: 'Aperto', in_corso: 'In corso', chiuso: 'Chiuso' };
// Etichetta di un punto aperto: segnalazione (un problema o una richiesta emersi) o deliberato (deciso in assemblea).
// Finché non la si sceglie, vale "deliberato" per un to-do collegato a un'assemblea e "segnalazione" per gli altri.
export const ETICHETTE_TODO = { segnalazione: 'Segnalazione', deliberato: 'Deliberato' };
export const etichettaTodo = (t) => t.etichetta ?? (t.assemblea_id ? 'deliberato' : 'segnalazione');
const NESSUNO = '-';
const scelte = (voci, scelta) => voci.map(([valore, nome]) => `<option value="${esc(valore)}" ${valore === (scelta ?? '') ? 'selected' : ''}>${esc(nome)}</option>`).join('');
const breve = (testo, n = 60) => (testo.length > n ? `${testo.slice(0, n - 3)}…` : testo);
export const titoloTodo = (t) => t.titolo || t.descrizione || 'Senza titolo';

export async function todo(stato, contenitore, assembleaIniziale, puntoIniziale) {
  let attiva = true;
  stato.allUscita = () => { attiva = false; };
  const { modello, oggi } = stato;
  const d = { todo: [], assemblee: [], punti: [], consiglieri: [] };
  const filtri = { stato: '', etichetta: '', assemblea: '', testo: '' };

  contenitore.innerHTML = `<div id="todo-pagina" class="todo-pagina">
    <header class="testata">
      <h1>Punti aperti</h1>
      <p class="nota">Le attività da seguire, ognuna con la sua etichetta: <strong>segnalazione</strong> (un problema o una richiesta emersi) o
        <strong>deliberato</strong> (deciso in assemblea). Ogni cella si modifica direttamente: il valore si salva quando esci dal campo.
        Mettendo lo stato «Chiuso» la chiusura effettiva diventa oggi; scrivendo la chiusura effettiva il to-do si chiude.</p>
    </header>
    <div id="todo-errore" class="avviso grave" role="alert" hidden></div>
    <div class="filtri" id="todo-filtri"></div>
    <div id="todo-elenco"><p class="nota">Caricamento…</p></div>
  </div>`;
  const $ = (selettore) => contenitore.querySelector(selettore);
  const pagina = $('#todo-pagina');

  const nomeConsigliere = (c) => c.nominativo || modello.soggetti.get(c.soggetto_id)?.denominazione || 'Consigliere';
  const puntiDi = (assembleaId) => d.punti.filter((p) => p.assemblea_id === assembleaId).sort((a, b) => a.ordine - b.ordine);

  function disegnaFiltri() {
    $('#todo-filtri').innerHTML = `
      <input type="search" data-filtro="testo" placeholder="Cerca in titolo, descrizione, responsabile, criticità" aria-label="Cerca" value="${esc(filtri.testo)}">
      <select data-filtro="etichetta" aria-label="Filtra per etichetta">${scelte([['', 'Segnalazioni e deliberati'], ['segnalazione', 'Solo segnalazioni'], ['deliberato', 'Solo deliberati']], filtri.etichetta)}</select>
      <select data-filtro="stato" aria-label="Filtra per stato">${scelte([['', 'Tutti gli stati'], ['aperti', 'Non chiusi'], ...Object.entries(STATI_TODO)], filtri.stato)}</select>
      <select data-filtro="assemblea" aria-label="Filtra per assemblea">${scelte([['', 'Tutte le assemblee'], [NESSUNO, 'Senza assemblea'],
        ...d.assemblee.map((a) => [a.id, titoloAssemblea(a)])], filtri.assemblea)}</select>
      <button type="button" data-azione="nuovo">Nuovo to-do</button>`;
  }

  function riga(t) {
    const scaduto = t.scadenza && t.scadenza < oggi && t.stato !== 'chiuso';
    const id = esc(t.id);
    const campo = (nome, tipo = 'text', extra = '') => `<input type="${tipo}" data-id="${id}" data-campo="${nome}" value="${esc(t[nome] ?? '')}" ${extra}>`;
    const area = (nome, segnaposto = '') => `<textarea rows="2" data-id="${id}" data-campo="${nome}" placeholder="${segnaposto}">${esc(t[nome] ?? '')}</textarea>`;
    return `
      <tr class="${t.stato === 'chiuso' ? 'spento' : ''}">
        <td>${area('titolo', 'Che cosa c\'è da fare')}</td>
        <td><select data-id="${id}" data-campo="etichetta" aria-label="Etichetta" class="etichetta-${esc(etichettaTodo(t))}">${scelte(Object.entries(ETICHETTE_TODO), etichettaTodo(t))}</select></td>
        <td>
          <select data-id="${id}" data-campo="assemblea_id" aria-label="Assemblea di origine">${scelte([['', 'Nessuna'], ...d.assemblee.map((a) => [a.id, titoloAssemblea(a).replace('Assemblea ', '')])], t.assemblea_id)}</select>
          ${t.assemblea_id ? `<select data-id="${id}" data-campo="punto_id" aria-label="Punto all'ordine del giorno">${scelte([['', 'Nessun punto'],
            ...puntiDi(t.assemblea_id).map((p) => [p.id, `${p.ordine}. ${breve(p.testo)}`])], t.punto_id)}</select>
            <a class="nota" href="#/assemblee/${encodeURIComponent(t.assemblea_id)}">apri l'assemblea</a>` : ''}
        </td>
        <td>${area('descrizione', 'Dettagli, importi, fornitori…')}</td>
        <td>${campo('responsabile', 'text', 'list="todo-responsabili" placeholder="Chi se ne occupa"')}</td>
        <td>${campo('data_apertura', 'date')}</td>
        <td class="${scaduto ? 'scaduto' : ''}">${campo('scadenza', 'date')}${scaduto ? '<span class="etichetta stato-respinto">scaduto</span>' : ''}</td>
        <td>${campo('data_chiusura', 'date')}</td>
        <td><select data-id="${id}" data-campo="stato" aria-label="Stato">${scelte(Object.entries(STATI_TODO), t.stato)}</select></td>
        <td>${area('criticita', 'Note libere: ostacoli, solleciti…')}</td>
        <td><button type="button" class="secondario" data-azione="elimina" data-id="${id}" title="Elimina il to-do">Elimina</button></td>
      </tr>`;
  }

  function disegnaElenco() {
    const passaStato = (t) => (!filtri.stato || (filtri.stato === 'aperti' ? t.stato !== 'chiuso' : t.stato === filtri.stato))
      && (!filtri.etichetta || etichettaTodo(t) === filtri.etichetta);
    const passaAssemblea = (t) => !filtri.assemblea || (filtri.assemblea === NESSUNO ? !t.assemblea_id : t.assemblea_id === filtri.assemblea);
    const cercato = normalizza(filtri.testo.trim());
    const passaTesto = (t) => !cercato || normalizza([t.titolo, t.descrizione, t.responsabile, t.criticita].join(' ')).includes(cercato);
    const visibili = d.todo.filter((t) => passaStato(t) && passaAssemblea(t) && passaTesto(t))
      // prima quelli ancora da fare, per chiusura stimata (senza data in fondo)
      .sort((a, b) => Number(a.stato === 'chiuso') - Number(b.stato === 'chiuso') || (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999')
        || (a.data_apertura ?? '').localeCompare(b.data_apertura ?? ''));
    const responsabili = [...new Set(['Amministratore', 'Consiglio', ...d.consiglieri.map(nomeConsigliere), ...d.todo.map((t) => t.responsabile).filter(Boolean)])];
    $('#todo-elenco').innerHTML = `
      <p class="nota">${visibili.length} di ${d.todo.length} punti; ${d.todo.filter((t) => t.stato !== 'chiuso').length} non chiusi.</p>
      <datalist id="todo-responsabili">${responsabili.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
      <div class="scorri"><table class="todo-griglia">
        <colgroup><col class="c-titolo"><col class="c-etichetta"><col class="c-origine"><col class="c-descrizione"><col class="c-responsabile"><col class="c-data"><col class="c-data"><col class="c-data"><col class="c-stato"><col class="c-criticita"><col class="c-azioni"></colgroup>
        <thead><tr><th>Titolo</th><th>Etichetta</th><th>Riferimento assemblea</th><th>Descrizione</th><th>Responsabile</th><th>Apertura</th><th>Chiusura stimata</th><th>Chiusura effettiva</th><th>Stato</th><th>Criticità</th><th></th></tr></thead>
        <tbody>${visibili.map(riga).join('') || '<tr><td colspan="11" class="nota">Nessun punto con questi filtri.</td></tr>'}</tbody>
      </table></div>`;
  }

  const disegna = () => { disegnaFiltri(); disegnaElenco(); };
  const carica = async () => {
    const [righe, assemblee, punti, consiglieri] = await Promise.all([
      deposito.leggi('todo'), deposito.leggi('assemblee'), deposito.leggi('punti_odg'), deposito.leggi('consiglieri'),
    ]);
    if (!attiva) return;
    Object.assign(d, { todo: righe, punti, consiglieri, assemblee: assemblee.sort((a, b) => (a.data < b.data ? 1 : -1)) });
    disegnaElenco();
  };
  const { esegui, mostra } = creaEsecutore($('#todo-errore'), carica);

  // Salva un campo di una riga; alcuni campi ne trascinano altri (stato ↔ chiusura effettiva, assemblea → punto).
  function salvaCampo(id, campo, valore) {
    const t = d.todo.find((x) => x.id === id);
    if (!t) return;
    const pulito = typeof valore === 'string' ? valore.trim() : valore;
    const valori = { [campo]: pulito === '' ? null : pulito };
    if (campo === 'titolo' && !valori.titolo) {
      mostra('Il titolo non può restare vuoto.', () => {});
      disegnaElenco();
      return;
    }
    if (campo === 'stato' && pulito === 'chiuso' && !t.data_chiusura) valori.data_chiusura = oggi;
    if (campo === 'stato' && pulito !== 'chiuso') valori.data_chiusura = null;
    if (campo === 'data_chiusura') valori.stato = valori.data_chiusura ? 'chiuso' : (t.stato === 'chiuso' ? 'in_corso' : t.stato);
    if (campo === 'assemblea_id') valori.punto_id = null;
    if (Object.entries(valori).every(([k, v]) => (t[k] ?? null) === v)) return;
    const prima = Object.fromEntries(Object.keys(valori).map((k) => [k, t[k] ?? null]));
    Object.assign(t, valori);
    // si salva senza ridisegnare la tabella, così chi passa da una cella all'altra non perde il punto in cui è;
    // si ridisegna solo quando il cambio tocca altre celle della riga (stato, date, punti dell'assemblea)
    if (['stato', 'data_chiusura', 'assemblea_id', 'scadenza', 'etichetta'].includes(campo)) disegnaElenco();
    deposito.aggiorna('todo', { id }, valori).catch((errore) => {
      Object.assign(t, prima);
      if (attiva) disegnaElenco();
      // la colonna nasce con la migrazione 019: finché manca, l'etichetta resta quella ricavata dal collegamento
      mostra(campo === 'etichetta' && /etichetta/i.test(errore.message)
        ? 'Etichetta non salvata: nel database manca ancora la colonna. Va eseguita la migrazione 019 dall\'SQL Editor di Supabase.'
        : `Non salvato: ${errore.message}`, () => salvaCampo(id, campo, valore));
    });
  }

  pagina.onchange = (evento) => {
    const { filtro, id, campo } = evento.target.dataset;
    if (filtro && filtro !== 'testo') {
      filtri[filtro] = evento.target.value;
      disegnaElenco();
    }
    if (id && campo) salvaCampo(id, campo, evento.target.value);
  };
  pagina.oninput = (evento) => {
    if (evento.target.dataset.filtro === 'testo') {
      filtri.testo = evento.target.value;
      disegnaElenco();
    }
  };
  pagina.onclick = async (evento) => {
    const { azione, id } = evento.target.dataset;
    if (azione === 'nuovo') {
      const responsabili = [...new Set(['Amministratore', 'Consiglio', ...d.consiglieri.map(nomeConsigliere), ...d.todo.map((t) => t.responsabile).filter(Boolean)])];
      const valori = await chiediNuovoTodo({ assemblee: d.assemblee, punti: d.punti, responsabili, oggi, iniziali: { assemblea_id: assembleaIniziale ?? '', punto_id: puntoIniziale ?? '' } });
      if (!valori || !attiva) return;
      esegui(async () => {
        await deposito.inserisci('todo', [valori]);
        // il to-do appena creato deve vedersi: si tolgono i filtri che potrebbero nasconderlo
        Object.assign(filtri, { stato: '', testo: '', assemblea: '' });
        disegnaFiltri();
      });
    }
    if (azione === 'elimina') {
      const t = d.todo.find((x) => x.id === id);
      if (!(await conferma(`Eliminare il to-do «${titoloTodo(t)}»?`, 'Elimina'))) return;
      esegui(() => deposito.elimina('todo', { id }));
    }
  };

  disegnaFiltri();
  await carica().catch((errore) => attiva && mostra(`Non è stato possibile leggere i to-do: ${errore.message}`, carica));
  // arrivando da un punto all'ordine del giorno (#/todo/<assemblea>/<punto>) si propone subito una riga nuova collegata
  if (puntoIniziale && attiva) pagina.querySelector('[data-azione="nuovo"]')?.click();
}
