// Scheda Presenze: chi c'è, chi è uscito, a che ora, e chi è rappresentato per delega.
// La delega si può registrare anche da qui, durante l'appello; scansione e archivio restano nella scheda Deleghe.
import { daInteri } from '../../calcolo/numeri.js';
import { esc, millesimi, ora, conOra, normalizza } from '../../ui/html.js';
import { nonAperta, soloPresenti, ricordaVista, conferma } from './comuni.js';
import { datiIngresso } from '../../assemblea/seduta.js';

const BUCKET_DELEGHE = 'deleghe';

// Modulo che si apre sotto la riga: delegato scelto tra i condomini oppure persona esterna da digitare.
function moduloDelega(ctx, r) {
  const altri = ctx.seduta.righe.filter((x) => x.testa.id !== r.testa.id);
  return `
    <tr class="riga-modulo">
      <td colspan="5">
        <form class="modulo delega-rapida" data-delegante="${esc(r.testa.id)}">
          <strong class="largo">Delega di ${esc(r.testa.etichetta)}</strong>
          <fieldset class="largo">
            <legend>Delegato</legend>
            <label class="scelta"><input type="radio" name="genere" value="condomino" checked> Un condomino</label>
            <label class="scelta"><input type="radio" name="genere" value="esterno"> Una persona esterna</label>
            <select name="delegato_testa" aria-label="Condomino delegato">
              <option value="">Scegli dalla lista…</option>
              ${altri.map((x) => `<option value="${esc(x.testa.id)}">${esc(x.testa.etichetta)} — ${esc(ctx.unitaDi(x.testa))}${x.stato === 'presente' ? '' : ' (non in sala)'}</option>`).join('')}
            </select>
            <input type="text" name="delegato_esterno" placeholder="Nome e cognome del delegato" aria-label="Nome del delegato esterno" hidden>
          </fieldset>
          <div class="azioni">
            <button type="submit">Registra delega</button>
            <button type="button" class="secondario" data-azione="chiudi-delega">Annulla</button>
          </div>
          <p class="errore largo" role="alert"></p>
          <p class="nota largo">La scansione della delega si allega dalla scheda Deleghe.</p>
        </form>
      </td>
    </tr>`;
}

const STATO = { presente: 'Presente', delega: 'Per delega', assente: 'Assente' };

function riga(ctx, r) {
  const id = esc(r.testa.id);
  const campoOra = (campo, valore, nome) => (valore
    ? `<label class="orario">${nome} <input type="time" data-ora="${campo}" data-testa="${id}" value="${ora(valore)}" ${ctx.solaLettura ? 'disabled' : ''}></label>`
    : '');
  const delega = r.delegato
    ? `<br><span class="nota ${r.delegato.valida ? '' : 'neg'}">delega a ${esc(r.delegato.nome)}${r.delegato.valida ? '' : r.stato === 'presente' ? ' (in conflitto: è presente di persona)' : ' (non valida: il delegato non è in sala)'}</span>`
    : '';
  const tasti = ctx.solaLettura ? ''
    : r.stato === 'presente'
      ? `<button type="button" class="secondario" data-azione="uscita" data-testa="${id}">Uscita</button>
         <button type="button" class="secondario" data-azione="annulla" data-testa="${id}" title="Segnato presente per errore">Assente</button>`
      : `<button type="button" data-azione="presente" data-testa="${id}">Presente</button>
         ${r.delegato
           ? `<button type="button" class="secondario" data-azione="togli-delega" data-testa="${id}">Togli delega</button>`
           : `<button type="button" class="secondario" data-azione="delega" data-testa="${id}">Delega</button>`}`;
  const aperto = !ctx.solaLettura && ctx.memoria.presenze.delegaAperta === r.testa.id && !r.delegato && r.stato !== 'presente';
  return `
    <tr class="riga-${r.stato}">
      <td><strong>${esc(r.testa.etichetta)}</strong><br><span class="nota">${esc(ctx.unitaDi(r.testa))}</span></td>
      <td class="num">${millesimi(daInteri(r.peso))}</td>
      <td><span class="etichetta stato-${r.stato}">${STATO[r.stato]}</span>${delega}</td>
      <td>${campoOra('ora_ingresso', r.oraIngresso, 'Ingresso')} ${campoOra('ora_uscita', r.oraUscita, 'Uscita')}</td>
      <td class="tasti">${tasti}</td>
    </tr>${aperto ? moduloDelega(ctx, r) : ''}`;
}

const tabella = (ctx, righe, vuoto) => `
  <div class="scorri"><table>
    <thead><tr><th>Testa</th><th class="num">Millesimi</th><th>Stato</th><th>Orari</th><th></th></tr></thead>
    <tbody>${righe.map((r) => riga(ctx, r)).join('') || `<tr><td colspan="5" class="nota">${vuoto}</td></tr>`}</tbody>
  </table></div>`;

export function schedaPresenze(ctx, contenitore) {
  if (ctx.assemblea.stato === 'bozza') {
    contenitore.innerHTML = nonAperta('le presenze');
    return;
  }
  const memoria = ctx.memoria.presenze;
  memoria.cerca ??= '';
  memoria.assentiAperti ??= false;
  const { righe } = ctx.seduta;
  const inSala = righe.filter((r) => r.stato !== 'assente');
  const perDelega = inSala.filter((r) => r.stato === 'delega').length;

  contenitore.innerHTML = `
    <div class="filtri">
      <input type="search" id="cerca-presenze" placeholder="Cerca per nome o unità" aria-label="Cerca per nome o unità" value="${esc(memoria.cerca)}">
      <label class="interruttore"><input type="checkbox" id="solo-presenti" ${soloPresenti() ? 'checked' : ''}> Solo presenti</label>
      <span class="nota">${inSala.length} presenti (${inSala.length - perDelega} di persona, ${perDelega} per delega), ${righe.length - inSala.length} assenti</span>
    </div>
    <div id="elenco-presenze"></div>`;

  const elenco = contenitore.querySelector('#elenco-presenze');
  const disegnaElenco = () => {
    const testo = normalizza(memoria.cerca.trim());
    const trovate = righe.filter((r) => !testo || normalizza(`${r.testa.etichetta} ${ctx.unitaDi(r.testa)}`).includes(testo));
    if (!soloPresenti()) {
      elenco.innerHTML = tabella(ctx, trovate, 'Nessuna testa corrisponde alla ricerca.');
      return;
    }
    const presenti = trovate.filter((r) => r.stato !== 'assente');
    const assenti = trovate.filter((r) => r.stato === 'assente');
    // cercando un nome gli assenti trovati si vedono subito: chi arriva tardi si segna senza aprire la sezione
    elenco.innerHTML = `
      ${tabella(ctx, presenti, testo ? 'Nessun presente corrisponde alla ricerca.' : 'Nessun presente registrato.')}
      <details class="gruppo assenti" id="assenti" ${memoria.assentiAperti || (testo && assenti.length) ? 'open' : ''}>
        <summary><span>Assenti (${assenti.length})</span></summary>
        ${tabella(ctx, assenti, 'Nessun assente.')}
      </details>`;
    elenco.querySelector('#assenti').addEventListener('toggle', (evento) => {
      if (!normalizza(memoria.cerca.trim())) memoria.assentiAperti = evento.target.open;
    });
  };
  disegnaElenco();

  contenitore.querySelector('#cerca-presenze').addEventListener('input', (evento) => {
    memoria.cerca = evento.target.value;
    disegnaElenco();
  });
  contenitore.querySelector('#solo-presenti').addEventListener('change', (evento) => {
    ricordaVista(evento.target.checked);
    disegnaElenco();
  });

  const salva = (testaId, valori) => ctx.esegui(() =>
    ctx.deposito.salva('presenze', [{ assemblea_id: ctx.assemblea.id, testa_id: testaId, ...valori }], ['assemblea_id', 'testa_id']));

  elenco.onclick = async (evento) => {
    const { azione, testa } = evento.target.dataset;
    const adesso = new Date().toISOString();
    if (azione === 'delega') {
      memoria.delegaAperta = testa;
      disegnaElenco();
      elenco.querySelector('.delega-rapida select')?.focus();
    }
    if (azione === 'chiudi-delega') {
      memoria.delegaAperta = null;
      disegnaElenco();
    }
    if (azione === 'togli-delega') {
      const delega = ctx.deleghe.find((d) => d.delegante_testa_id === testa);
      if (!delega || !(await conferma('Togliere questa delega? La testa torna assente.', 'Togli delega'))) return;
      // prima la riga, poi la scansione: riprovando dopo un errore a metà nessuno dei due passi fa danni
      ctx.esegui(async () => {
        await ctx.deposito.elimina('deleghe', { id: delega.id });
        if (delega.scansione_path) await ctx.deposito.eliminaFile(BUCKET_DELEGHE, delega.scansione_path);
      });
    }
    // chi rientra dopo un'uscita conserva l'ora del primo ingresso (datiIngresso)
    if (azione === 'presente') salva(testa, datiIngresso(ctx.presenze.find((p) => p.testa_id === testa), adesso));
    // l'uscita conserva l'ora di ingresso; "assente" annulla una presenza segnata per errore
    if (azione === 'uscita') salva(testa, { stato: 'assente', ora_uscita: adesso });
    if (azione === 'annulla') salva(testa, { stato: 'assente', ora_ingresso: null, ora_uscita: null });
  };
  // correzione a mano dell'orario messo dal sistema
  elenco.onchange = (evento) => {
    // delegato condomino oppure esterno: si mostra solo il campo che serve
    if (evento.target.name === 'genere') {
      const form = evento.target.form;
      const esterno = form.genere.value === 'esterno';
      form.delegato_testa.hidden = esterno;
      form.delegato_esterno.hidden = !esterno;
      (esterno ? form.delegato_esterno : form.delegato_testa).focus();
      return;
    }
    const { ora: campo, testa } = evento.target.dataset;
    if (!campo) return;
    const presenza = ctx.presenze.find((p) => p.testa_id === testa);
    if (!evento.target.value || !presenza?.[campo]) { disegnaElenco(); return; }
    salva(testa, { [campo]: conOra(presenza[campo], evento.target.value) });
  };

  elenco.onsubmit = (evento) => {
    evento.preventDefault();
    const form = evento.target;
    const esterno = form.genere.value === 'esterno';
    const delegatoTesta = esterno ? null : form.delegato_testa.value || null;
    const delegatoEsterno = esterno ? form.delegato_esterno.value.trim() || null : null;
    if (!delegatoTesta && !delegatoEsterno) {
      form.querySelector('.errore').textContent = esterno ? 'Scrivi il nome della persona delegata.' : 'Scegli dalla lista il condomino delegato.';
      return;
    }
    const riga = {
      assemblea_id: ctx.assemblea.id, delegante_testa_id: form.dataset.delegante, delegato_testa_id: delegatoTesta,
      delegato_esterno: delegatoEsterno, amministratore: false, nota: null, ora_registrazione: new Date().toISOString(),
    };
    memoria.delegaAperta = null;
    ctx.esegui(() => ctx.deposito.inserisci('deleghe', [riga]));
  };
}
