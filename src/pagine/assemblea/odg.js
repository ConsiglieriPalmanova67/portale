// Scheda Ordine del giorno: i punti con tipo, tabella millesimale e maggioranza; per le nomine, i candidati.
import { MAGGIORANZE } from '../../calcolo/maggioranze.js';
import { esc } from '../../ui/html.js';
import { esitoPunto, esitoManuale } from '../../assemblea/delibere.js';
import { TIPI_PUNTO, ESITO_A_MANO, etichettaEsito, conferma, spiegaRegola } from './comuni.js';
import { REGOLE, regolaPerTesto, controllaPunto, tabellaDellaRegola } from '../../calcolo/regole-voto.js';

const INTERO = 'Intero condominio';
const contestoRegole = (ctx) => ({ tabellaProprietaId: ctx.stato.modello.tabellaProprieta?.id });

// Nel modulo del punto: la regola che il testo richiama, con il tasto per applicarla.
const suggerimento = (testo) => {
  const regola = regolaPerTesto(testo);
  return regola ? `<span class="etichetta stato-in_corso">Regola di voto</span> ${spiegaRegola(regola)}
    <button type="button" class="secondario piccolo" data-azione="applica-regola-modulo">Imposta maggioranza e tabella</button>` : '';
};

const scelte = (voci, scelta, vuota) => `${vuota ? `<option value="">${esc(vuota)}</option>` : ''}${voci.map(([valore, nome]) =>
  `<option value="${esc(valore)}" ${valore === scelta ? 'selected' : ''}>${esc(nome)}</option>`).join('')}`;

function rigaCandidato(ctx, candidato = {}) {
  const soggetti = [...ctx.stato.modello.soggetti.values()].sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it'));
  return `
    <div class="candidato">
      <select name="cand_soggetto" aria-label="Candidato">${scelte(soggetti.map((s) => [s.id, s.denominazione]), candidato.soggetto_id, 'Scegli il candidato…')}</select>
      <input type="text" name="cand_parte" list="parti-rappresentate" aria-label="Parte rappresentata" placeholder="Parte rappresentata" value="${esc(candidato.parte_rappresentata)}">
      <button type="button" class="secondario" data-azione="togli-candidato">Togli</button>
    </div>`;
}

function moduloPunto(ctx, punto) {
  const { modello } = ctx.stato;
  const p = punto ?? { testo: '', tipo: 'delibera', tabella_id: modello.tabellaProprieta?.id ?? '', maggioranza: '', note: '', candidati: [] };
  return `
    <form class="modulo" data-punto="${esc(punto?.id ?? '')}">
      <label class="largo">Testo del punto <textarea name="testo" rows="2" required>${esc(p.testo)}</textarea></label>
      <label>Tipo <select name="tipo">${scelte(Object.entries(TIPI_PUNTO), p.tipo)}</select></label>
      <label>Tabella millesimale <select name="tabella_id" required>${scelte(modello.tabelle.map((t) => [t.id, t.nome]), p.tabella_id, 'Scegli la tabella…')}</select></label>
      <label>Maggioranza richiesta <select name="maggioranza" required>${scelte(Object.entries(MAGGIORANZE).map(([k, m]) => [k, m.etichetta]), p.maggioranza, 'Scegli la maggioranza…')}</select></label>
      <p class="largo regola-voto" data-regola aria-live="polite">${suggerimento(p.testo)}</p>
      <label class="largo">Note <input type="text" name="note" value="${esc(p.note)}" placeholder="Facoltative"></label>
      <fieldset class="largo candidati" ${p.tipo === 'nomina_consiglieri' ? '' : 'hidden'}>
        <legend>Candidati</legend>
        <div class="elenco-candidati">${(p.candidati ?? []).map((c) => rigaCandidato(ctx, c)).join('')}</div>
        <button type="button" class="secondario" data-azione="aggiungi-candidato">Aggiungi candidato</button>
      </fieldset>
      <div class="azioni">
        <button type="submit">${punto ? 'Salva il punto' : 'Aggiungi il punto'}</button>
        ${punto ? '<button type="button" class="secondario" data-azione="annulla-modifica">Annulla</button>' : ''}
      </div>
      <p class="errore" role="alert"></p>
    </form>`;
}

const SCELTE_ESITO = [['approvata', 'Approvata'], ['respinta', 'Respinta'], ['non_deliberata', 'Non deliberata o rinviata']];
// scelta nel modulo → valore di `approvato` nell'esito registrato a mano
const APPROVATO = { approvata: true, respinta: false, non_deliberata: null };

// Assemblea registrata come già svolta: esito e testo della delibera di un punto, inseriti a mano.
function moduloEsito(punto, posizione) {
  const e = esitoPunto(punto);
  return `
    <form class="modulo" data-esito-di="${esc(punto.id)}">
      <p class="largo"><strong>${posizione + 1}. ${esc(punto.testo)}</strong></p>
      <label>Esito <select name="esito">${scelte(SCELTE_ESITO, e.manuale ? e.stato : '', 'Non registrato')}</select></label>
      <label class="largo">Testo della delibera <textarea name="delibera" rows="3" placeholder="Che cosa è stato deciso, come risulta dal verbale">${esc(punto.note)}</textarea></label>
      <div class="azioni">
        <button type="submit">Salva l'esito</button>
        <button type="button" class="secondario" data-azione="annulla-esito">Annulla</button>
        <span class="nota">Resterà indicato come «${ESITO_A_MANO}»: non ci sono voti registrati.</span>
      </div>
    </form>`;
}

// Sotto il punto: la regola del suo argomento e, se maggioranza o tabella non la rispettano, che cosa correggere.
function regolaDelPunto(ctx, punto, modificabile) {
  const { regola, problemi } = controllaPunto(punto, contestoRegole(ctx));
  if (!regola) return '';
  if (!problemi.length) return `<p class="regola-voto">✓ ${spiegaRegola(regola)}</p>`;
  return `<p class="regola-voto avviso">${spiegaRegola(regola)}<br><strong>Da correggere:</strong> ${esc(problemi.join('; '))}.
    ${modificabile ? `<button type="button" class="secondario piccolo" data-azione="applica-regola" data-punto="${esc(punto.id)}">Applica la regola</button>` : ''}</p>`;
}

function rigaPunto(ctx, punto, posizione) {
  const { modello } = ctx.stato;
  const id = esc(punto.id);
  const tabella = modello.tabelle.find((t) => t.id === punto.tabella_id);
  const modificabile = !ctx.solaLettura && !punto.votato_il;
  // l'esito a mano si mostra dove vale (assemblea archiviata) e dove è rimasto dopo una riapertura
  const aMano = esitoPunto(punto).manuale;
  const esito = ctx.senzaSeduta || aMano ? etichettaEsito(punto, ctx.assemblea) : '';
  const nominaAMano = aMano && punto.tipo === 'nomina_consiglieri' && punto.esito.approvato
    ? '<p class="nota">Nomina registrata a mano: i mandati dei consiglieri non vengono registrati da qui.</p>' : '';
  const candidati = punto.tipo === 'nomina_consiglieri' ? `
    <ul class="nota">${(punto.candidati ?? []).map((c) =>
      `<li>${esc(modello.soggetti.get(c.soggetto_id)?.denominazione ?? '?')}${c.parte_rappresentata ? ` — ${esc(c.parte_rappresentata)}` : ''}</li>`).join('')
      || '<li>Nessun candidato indicato.</li>'}</ul>` : '';
  return `
    <li class="punto">
      <div class="punto-testo">
        <strong>${posizione + 1}. ${esc(punto.testo)}</strong>
        <p>
          ${punto.tipo === 'nomina_consiglieri' ? `<span class="etichetta stato-in_corso">${esc(TIPI_PUNTO[punto.tipo])}</span>` : ''}
          <span class="etichetta">${tabella ? esc(tabella.nome) : 'tabella da scegliere'}</span>
          <span class="etichetta">${esc(MAGGIORANZE[punto.maggioranza]?.etichetta ?? 'maggioranza da scegliere')}</span>
          ${punto.votato_il ? '<span class="etichetta stato-chiusa">votazione chiusa</span>' : ''}
          ${esito}
        </p>
        ${regolaDelPunto(ctx, punto, modificabile)}
        ${candidati}
        ${punto.note ? `<p class="nota">${ctx.senzaSeduta || aMano ? '<strong>Delibera:</strong> ' : ''}${esc(punto.note)}</p>` : ''}
        ${nominaAMano}
        <p><a href="#/todo/${encodeURIComponent(ctx.id)}/${encodeURIComponent(punto.id)}">Crea un to-do da questo punto</a></p>
      </div>
      ${ctx.senzaSeduta ? `
      <div class="tasti">
        <button type="button" class="secondario" data-azione="esito" data-punto="${id}">${aMano || punto.note ? 'Modifica l\'esito' : 'Registra l\'esito'}</button>
      </div>` : ''}
      ${modificabile ? `
      <div class="tasti">
        <button type="button" class="secondario" data-azione="su" data-punto="${id}" aria-label="Sposta su" ${posizione === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="secondario" data-azione="giu" data-punto="${id}" aria-label="Sposta giù" ${posizione === ctx.punti.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="secondario" data-azione="modifica" data-punto="${id}">Modifica</button>
        <button type="button" class="secondario" data-azione="elimina" data-punto="${id}">Elimina</button>
      </div>` : ''}
    </li>`;
}

// Dal modulo ai valori da salvare; lancia un Error se manca qualcosa.
function leggiModulo(form) {
  const tipo = form.tipo.value;
  const candidati = tipo === 'nomina_consiglieri'
    ? [...form.querySelectorAll('.candidato')].map((riga) => ({
      soggetto_id: riga.querySelector('[name="cand_soggetto"]').value,
      parte_rappresentata: riga.querySelector('[name="cand_parte"]').value.trim() || null,
    }))
    : [];
  if (candidati.some((c) => !c.soggetto_id)) throw new Error('Scegli il soggetto di ogni candidato, oppure togli la riga vuota.');
  if (new Set(candidati.map((c) => c.soggetto_id)).size !== candidati.length) throw new Error('Lo stesso candidato compare due volte.');
  return {
    testo: form.testo.value.trim(), tipo, tabella_id: form.tabella_id.value, maggioranza: form.maggioranza.value,
    note: form.note.value.trim() || null, candidati,
  };
}

// Il database non ammette due punti con lo stesso ordine nemmeno per un istante:
// lo scambio passa da un numero libero.
async function scambia(ctx, a, b) {
  const libero = Math.max(...ctx.punti.map((p) => p.ordine)) + 1;
  await ctx.deposito.aggiorna('punti_odg', { id: a.id }, { ordine: libero });
  await ctx.deposito.aggiorna('punti_odg', { id: b.id }, { ordine: a.ordine });
  await ctx.deposito.aggiorna('punti_odg', { id: a.id }, { ordine: b.ordine });
}

// Salva l'esito a mano di un punto e apre il modulo del punto successivo ancora senza esito.
// Prima di scrivere si ricontrolla sul deposito che l'assemblea sia ancora archiviata senza seduta.
function salvaEsito(ctx, form) {
  const { deposito, punti } = ctx;
  const id = form.dataset.esitoDi;
  const scelta = form.esito.value;
  const valori = { esito: scelta ? esitoManuale(APPROVATO[scelta]) : null, note: form.delibera.value.trim() || null };
  const dopo = punti.slice(punti.findIndex((p) => p.id === id) + 1).find((p) => esitoPunto(p).stato === 'da_votare' && !p.note);
  ctx.esegui(async () => {
    const [[assemblea], teste] = await Promise.all([deposito.leggi('assemblee', { id: ctx.id }), deposito.leggi('teste_assemblea', { assemblea_id: ctx.id })]);
    if (assemblea?.stato !== 'chiusa' || teste.length) throw new Error('l\'assemblea non è più tra quelle registrate come già svolte: l\'esito a mano non si può salvare.');
    await deposito.aggiorna('punti_odg', { id }, valori);
    ctx.memoria.odg.esito = dopo?.id ?? null;
  });
}

export function schedaOdg(ctx, contenitore) {
  const memoria = ctx.memoria.odg;
  const { punti } = ctx;
  const inModifica = punti.find((p) => p.id === memoria.inModifica && !p.votato_il) ?? null;
  // il modulo dell'esito a mano esiste solo per le assemblee registrate come già svolta
  const esitoAperto = ctx.senzaSeduta ? memoria.esito : null;

  contenitore.innerHTML = `
    <details class="regole-elenco"><summary>Regole di voto conosciute (${REGOLE.length})</summary>
      <p class="nota">Quando il testo di un punto riguarda uno di questi argomenti, il sistema indica maggioranza e tabella che servono e segnala se il punto non le rispetta.</p>
      <ul>${REGOLE.map((r) => `<li>${spiegaRegola(r)}</li>`).join('')}</ul>
    </details>
    <datalist id="parti-rappresentate">${[INTERO, ...ctx.stato.modello.parti].map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
    ${ctx.senzaSeduta && punti.length ? `<p class="nota">Per ogni punto registra l'esito e il testo della delibera, come risultano dal verbale.
      Per aggiungere, togliere o correggere i punti riapri l'assemblea.</p>` : ''}
    ${punti.length ? `<ol class="punti">${punti.map((p, i) => (p.id === esitoAperto ? `<li class="punto in-modifica">${moduloEsito(p, i)}</li>`
      : p.id === inModifica?.id && !ctx.solaLettura ? `<li class="punto in-modifica">${moduloPunto(ctx, p)}</li>` : rigaPunto(ctx, p, i))).join('')}</ol>`
      : `<p class="nota">Nessun punto all'ordine del giorno.${ctx.senzaSeduta ? ' Per aggiungerne riapri l\'assemblea.' : ''}</p>`}
    ${ctx.solaLettura ? '' : `<h2>Nuovo punto</h2>${moduloPunto(ctx, null)}`}`;

  contenitore.onclick = async (evento) => {
    const { azione, punto: id } = evento.target.dataset;
    if (!azione) return;
    const form = evento.target.closest('form');
    if (azione === 'aggiungi-candidato') form.querySelector('.elenco-candidati').insertAdjacentHTML('beforeend', rigaCandidato(ctx));
    if (azione === 'togli-candidato') evento.target.closest('.candidato').remove();
    if (azione === 'applica-regola-modulo') {
      const regola = regolaPerTesto(form.testo.value);
      if (!regola) return;
      form.maggioranza.value = regola.maggioranza;
      const tabella = tabellaDellaRegola(regola, contestoRegole(ctx));
      if (tabella) form.tabella_id.value = tabella;
      return;
    }
    if (azione === 'modifica' || azione === 'annulla-modifica') {
      memoria.inModifica = azione === 'modifica' ? id : null;
      schedaOdg(ctx, contenitore);
    }
    if (azione === 'esito' || azione === 'annulla-esito') {
      memoria.esito = azione === 'esito' ? id : null;
      schedaOdg(ctx, contenitore);
      return;
    }
    const posizione = punti.findIndex((p) => p.id === id);
    if (posizione < 0) return;
    if (azione === 'su' && posizione > 0) ctx.esegui(() => scambia(ctx, punti[posizione], punti[posizione - 1]));
    if (azione === 'giu' && posizione < punti.length - 1) ctx.esegui(() => scambia(ctx, punti[posizione], punti[posizione + 1]));
    if (azione === 'applica-regola') {
      const regola = regolaPerTesto(punti[posizione].testo);
      const tabella = regola && tabellaDellaRegola(regola, contestoRegole(ctx));
      if (regola) ctx.esegui(() => ctx.deposito.aggiorna('punti_odg', { id }, { maggioranza: regola.maggioranza, ...(tabella ? { tabella_id: tabella } : {}) }));
    }
    if (azione === 'elimina') {
      if (!(await conferma(`Eliminare il punto ${posizione + 1} dall'ordine del giorno?`, 'Elimina il punto'))) return;
      ctx.esegui(() => ctx.deposito.elimina('punti_odg', { id }));
    }
  };

  // i candidati servono solo per i punti di nomina
  // il testo del punto richiama una regola? la si mostra mentre si scrive; un punto nuovo la riceve già impostata
  contenitore.oninput = (evento) => {
    if (evento.target.name !== 'testo') return;
    const form = evento.target.form;
    form.querySelector('[data-regola]').innerHTML = suggerimento(evento.target.value);
    const regola = regolaPerTesto(evento.target.value);
    if (regola && !form.dataset.punto && !form.maggioranza.value) {
      form.maggioranza.value = regola.maggioranza;
      const tabella = tabellaDellaRegola(regola, contestoRegole(ctx));
      if (tabella) form.tabella_id.value = tabella;
    }
  };
  contenitore.onchange = (evento) => {
    if (evento.target.name === 'tipo') evento.target.form.querySelector('.candidati').hidden = evento.target.value !== 'nomina_consiglieri';
  };

  contenitore.onsubmit = (evento) => {
    evento.preventDefault();
    const form = evento.target;
    if (form.dataset.esitoDi) {
      salvaEsito(ctx, form);
      return;
    }
    const errore = form.querySelector('.errore');
    let valori;
    try {
      valori = leggiModulo(form);
      errore.textContent = '';
    } catch (e) {
      errore.textContent = e.message;
      return;
    }
    const id = form.dataset.punto;
    if (id) {
      memoria.inModifica = null;
      ctx.esegui(() => ctx.deposito.aggiorna('punti_odg', { id }, valori));
    } else {
      const ordine = Math.max(0, ...punti.map((p) => p.ordine)) + 1;
      ctx.esegui(() => ctx.deposito.inserisci('punti_odg', [{ assemblea_id: ctx.assemblea.id, ordine, ...valori }]));
    }
  };
}
