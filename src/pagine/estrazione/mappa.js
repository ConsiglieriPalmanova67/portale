// Fase della mappa: il lettore ha proposto le sezioni del documento con le loro pagine; qui si controlla e si corregge
// prima di spendere per la lettura. Alla conferma nascono i blocchi e si passa alla lettura.
import { esc } from '../../ui/html.js';
import { TIPI_SEZIONE, ordinaMappa, controllaMappa, blocchiDaMappa } from '../../estrazione/blocchi.js';
import { preparaBlocchi } from '../../estrazione/lettura.js';

const opzioni = (scelta) => Object.entries(TIPI_SEZIONE).map(([valore, nome]) => `<option value="${valore}" ${valore === scelta ? 'selected' : ''}>${esc(nome)}</option>`).join('');

function riga(s = { tipo: 'altro', pagina_da: '', pagina_a: '', titolo: '', parte: null }) {
  return `
    <tr class="riga-mappa">
      <td><select name="tipo" aria-label="Tipo di sezione">${opzioni(s.tipo)}</select></td>
      <td><input type="number" name="pagina_da" min="1" step="1" value="${esc(s.pagina_da)}" aria-label="Dalla pagina" class="corto"></td>
      <td><input type="number" name="pagina_a" min="1" step="1" value="${esc(s.pagina_a)}" aria-label="Alla pagina" class="corto"></td>
      <td><input type="number" name="parte" min="1" step="1" value="${esc(s.parte ?? '')}" aria-label="Parte del riparto" class="corto" ${s.tipo === 'riparto' ? '' : 'disabled'}></td>
      <td><input type="text" name="titolo" value="${esc(s.titolo)}" aria-label="Titolo stampato"></td>
      <td class="tasti"><button type="button" class="secondario" data-azione="togli">Togli</button></td>
    </tr>`;
}

export function faseMappa(ctx, zona) {
  const { estrazione } = ctx;
  const note = estrazione.correzioni?.noteIndice;
  zona.innerHTML = `
    <section class="est-mappa">
      <h2>Mappa del documento <span class="nota">(${esc(estrazione.pagine ?? '?')} pagine)</span></h2>
      <p class="nota">Il lettore ha riconosciuto queste sezioni. Controlla che tipo e pagine siano giusti (i numeri sono quelli delle pagine del PDF, non quelli stampati sui fogli):
        solo le sezioni indicate qui vengono lette, a blocchi di poche pagine. Il riparto è diviso in parti: ogni parte ripete l'elenco delle unità con colonne diverse.</p>
      ${note ? `<p class="avviso">Note del lettore: ${esc(note)}</p>` : ''}
      <form id="modulo-mappa">
        <div class="scorri"><table class="tab-mappa">
          <thead><tr><th>Sezione</th><th>Da pag.</th><th>A pag.</th><th>Parte</th><th>Titolo stampato</th><th></th></tr></thead>
          <tbody>${ordinaMappa(estrazione.mappa).map(riga).join('')}</tbody>
        </table></div>
        <div class="azioni">
          <button type="button" class="secondario" data-azione="aggiungi">Aggiungi una sezione</button>
          <button type="button" class="secondario" data-azione="rifai">Fai rileggere l'indice</button>
        </div>
        <div id="mappa-esito"></div>
        <div class="azioni"><button type="submit">Conferma la mappa e leggi le sezioni</button></div>
      </form>
    </section>`;
  const form = zona.querySelector('#modulo-mappa');
  const corpo = form.querySelector('tbody');

  const leggi = () => [...corpo.querySelectorAll('.riga-mappa')].map((r) => ({
    tipo: r.querySelector('[name="tipo"]').value, pagina_da: r.querySelector('[name="pagina_da"]').value, pagina_a: r.querySelector('[name="pagina_a"]').value,
    parte: r.querySelector('[name="parte"]').value, titolo: r.querySelector('[name="titolo"]').value,
  }));

  // a ogni modifica: cosa non va e quanti blocchi (cioè quante chiamate) verranno fatti
  const verifica = () => {
    const sezioni = leggi();
    const errori = controllaMappa(sezioni, estrazione.pagine);
    const blocchi = errori.length ? [] : blocchiDaMappa(sezioni);
    const perSezione = Object.entries(Object.groupBy(blocchi, (b) => b.sezione)).map(([sezione, suoi]) => `${TIPI_SEZIONE[sezione].split(' (')[0].toLowerCase()} ${suoi.length}`);
    form.querySelector('#mappa-esito').innerHTML = errori.length
      ? `<div class="avviso grave" role="alert"><strong>La mappa va corretta</strong><ul>${errori.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`
      : `<p class="avviso fatto" role="status">Verranno letti <strong>${blocchi.length} blocchi</strong> (${esc(perSezione.join(', '))}), al massimo tre per volta. Ogni blocco è una chiamata a pagamento.</p>`;
    form.querySelector('button[type="submit"]').disabled = errori.length > 0;
    return { sezioni, errori };
  };
  verifica();

  form.oninput = (evento) => {
    if (evento.target.name === 'tipo') {
      const parte = evento.target.closest('tr').querySelector('[name="parte"]');
      parte.disabled = evento.target.value !== 'riparto';
      if (parte.disabled) parte.value = '';
      else if (!parte.value) parte.value = corpo.querySelectorAll('[name="tipo"]').length ? [...corpo.querySelectorAll('[name="tipo"]')].filter((s) => s.value === 'riparto').length : 1;
    }
    verifica();
  };
  form.onclick = async (evento) => {
    const { azione } = evento.target.dataset;
    if (azione === 'aggiungi') {
      corpo.insertAdjacentHTML('beforeend', riga());
      corpo.querySelector('.riga-mappa:last-child select').focus();
    }
    if (azione === 'togli') evento.target.closest('tr').remove();
    if (azione === 'aggiungi' || azione === 'togli') verifica();
    if (azione === 'rifai') {
      try {
        await ctx.salva({ mappa: null });
        ctx.ridisegna();
      } catch (e) {
        ctx.errore(`Non è stato possibile azzerare la mappa: ${e.message}`);
      }
    }
  };
  form.onsubmit = async (evento) => {
    evento.preventDefault();
    const { sezioni, errori } = verifica();
    if (errori.length) return;
    const bottone = form.querySelector('button[type="submit"]');
    bottone.disabled = true;
    try {
      const mappa = ordinaMappa(sezioni);
      await preparaBlocchi(ctx.deposito, estrazione.id, mappa);
      await ctx.rileggiRighe();
      // da qui la lettura parte da sola: la conferma è questa
      ctx.avviaLettura = true;
      await ctx.salva({ mappa, stato: 'lettura' });
      ctx.ridisegna();
    } catch (e) {
      bottone.disabled = false;
      ctx.errore(`La mappa non è stata salvata: ${e.message}`);
    }
  };
}
