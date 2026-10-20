// Il popup per un to-do nuovo, usato dalla pagina To-do e dalla pagina Delibere (dal punto di un'assemblea).
// Si compila e solo alla conferma restituisce i valori da salvare; null se si annulla.
import { esc } from '../ui/html.js';
import { titoloAssemblea } from './assemblea/comuni.js';

export const STATI_TODO = { aperto: 'Aperto', in_corso: 'In corso', chiuso: 'Chiuso' };
const scelte = (voci, scelta) => voci.map(([valore, nome]) => `<option value="${esc(valore)}" ${valore === (scelta ?? '') ? 'selected' : ''}>${esc(nome)}</option>`).join('');
const breve = (testo, n = 60) => (testo.length > n ? `${testo.slice(0, n - 3)}…` : testo);

// assemblee, punti: le righe del database; responsabili: nomi da suggerire; oggi: data ISO;
// iniziali: { assemblea_id, punto_id, titolo, descrizione } già compilati.
export function chiediNuovoTodo({ assemblee, punti, responsabili = [], oggi, iniziali = {} }) {
  return new Promise((risolvi) => {
    const puntiDi = (assembleaId) => punti.filter((p) => p.assemblea_id === assembleaId).sort((a, b) => a.ordine - b.ordine);
    const opzioniPunti = (assembleaId, scelto) => scelte([['', 'Nessun punto in particolare'], ...puntiDi(assembleaId).map((x) => [x.id, `${x.ordine}. ${breve(x.testo)}`])], scelto);
    const finestra = document.createElement('dialog');
    finestra.className = 'conferma finestra-todo';
    finestra.innerHTML = `
      <form method="dialog" class="modulo">
        <h2 class="largo">Nuovo to-do</h2>
        <label class="largo">Titolo <input name="titolo" required placeholder="Che cosa c'è da fare" value="${esc(iniziali.titolo ?? '')}"></label>
        <label>Assemblea di origine <select name="assemblea_id">${scelte([['', 'Nessuna'], ...assemblee.map((a) => [a.id, titoloAssemblea(a)])], iniziali.assemblea_id ?? '')}</select></label>
        <label>Punto all'ordine del giorno <select name="punto_id" ${iniziali.assemblea_id ? '' : 'disabled'}>${opzioniPunti(iniziali.assemblea_id, iniziali.punto_id ?? '')}</select></label>
        <label class="largo">Descrizione <textarea name="descrizione" rows="3" placeholder="Dettagli, importi, fornitori…">${esc(iniziali.descrizione ?? '')}</textarea></label>
        <label>Responsabile <input name="responsabile" list="todo-nuovo-responsabili" placeholder="Chi se ne occupa"></label>
        <datalist id="todo-nuovo-responsabili">${responsabili.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
        <label>Stato <select name="stato">${scelte(Object.entries(STATI_TODO).filter(([k]) => k !== 'chiuso'), 'aperto')}</select></label>
        <label>Apertura <input type="date" name="data_apertura" value="${esc(oggi)}"></label>
        <label>Chiusura stimata <input type="date" name="scadenza"></label>
        <label class="largo">Criticità <textarea name="criticita" rows="2" placeholder="Note libere: ostacoli, solleciti…"></textarea></label>
        <p class="errore largo" role="alert"></p>
        <div class="azioni largo"><button type="button" class="secondario" value="no">Annulla</button> <button type="submit">Crea il to-do</button></div>
      </form>`;
    const form = finestra.querySelector('form');
    const chiudi = (esito) => {
      if (!finestra.isConnected) return;
      finestra.close();
      finestra.remove();
      risolvi(esito);
    };
    form.assemblea_id.addEventListener('change', () => {
      form.punto_id.innerHTML = opzioniPunti(form.assemblea_id.value, '');
      form.punto_id.disabled = !form.assemblea_id.value;
    });
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const v = (nome) => form.elements[nome].value.trim() || null;
      if (!v('titolo')) {
        form.querySelector('.errore').textContent = 'Scrivi il titolo del to-do.';
        return;
      }
      chiudi({
        titolo: v('titolo'), descrizione: v('descrizione'), responsabile: v('responsabile'), stato: form.stato.value,
        assemblea_id: v('assemblea_id'), punto_id: v('punto_id'), data_apertura: v('data_apertura'), scadenza: v('scadenza'), criticita: v('criticita'),
      });
    });
    finestra.addEventListener('click', (evento) => evento.target.value === 'no' && chiudi(null));
    finestra.addEventListener('close', () => chiudi(null));
    document.body.append(finestra);
    finestra.showModal();
    form.titolo.focus();
  });
}
