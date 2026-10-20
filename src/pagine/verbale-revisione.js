// Il modulo di revisione delle proposte nate dal verbale (vedi src/verbale/proposta.js): si disegna dalla proposta
// e si rilegge dal modulo, così ciò che si registra è esattamente ciò che si vede e si è corretto.
import { esc } from '../ui/html.js';

const ESITI = [['approvato', 'Approvato', true], ['respinto', 'Respinto', false], ['non_deliberato', 'Non deliberato o rinviato', null]];
const ESITO_LETTO = { approvato: 'approvato', respinto: 'respinto', non_deliberato: 'non deliberato', rinviato: 'rinviato', informativa: 'solo informativo', non_indicato: 'non indicato' };
const chiaveEsito = (v) => ESITI.find((e) => e[2] === v)?.[0] ?? '';

function rigaTodo(t, i, j) {
  return `
    <li class="todo-proposto">
      <label class="spunta"><input type="checkbox" data-todo="${i}.${j}" ${t.scelto ? 'checked' : ''}> Crea il to-do</label>
      <input type="text" data-todo-descrizione="${i}.${j}" value="${esc(t.descrizione)}" aria-label="Descrizione del to-do">
      <input type="text" data-todo-responsabile="${i}.${j}" value="${esc(t.responsabile)}" placeholder="Responsabile" aria-label="Responsabile del to-do">
      <label>Chiusura stimata <input type="date" data-todo-scadenza="${i}.${j}" value="${esc(t.scadenza ?? '')}"></label>
      <input type="text" data-todo-note="${i}.${j}" value="${esc(t.note)}" placeholder="Descrizione" aria-label="Descrizione del to-do">
    </li>`;
}

function schedaPunto(p, i, creaPunti) {
  const titolo = p.punto?.testo ?? p.letto.titolo;
  const diverso = p.punto && p.letto.titolo && p.letto.titolo.trim().toLowerCase() !== p.punto.testo.trim().toLowerCase();
  return `
    <details class="gruppo" open>
      <summary><span>${p.ordine}. ${esc(titolo)}</span><span class="nota">nel verbale: ${esc(ESITO_LETTO[p.letto.esito] ?? p.letto.esito)}</span></summary>
      <div class="scheda-assemblea">
        ${diverso ? `<p class="nota">Titolo nel verbale: ${esc(p.letto.titolo)}</p>` : ''}
        ${!p.punto && !creaPunti ? '<p class="avviso">Questo punto non c\'è nell\'ordine del giorno dell\'assemblea: esito e sintesi non verranno registrati, i to-do sì (senza collegamento al punto).</p>' : ''}
        ${p.letto.voti ? `<p class="nota">Voti: ${esc(p.letto.voti)}</p>` : ''}
        ${p.votato
          ? '<p class="nota">Esito: votazione registrata nel portale durante la seduta, non viene cambiata.</p>'
          : `<label>Esito da registrare <select data-esito="${i}">
              <option value="">Non registrare</option>
              ${ESITI.map(([valore, nome]) => `<option value="${valore}" ${p.aggiornaEsito && chiaveEsito(p.esito) === valore ? 'selected' : ''}>${nome}</option>`).join('')}
            </select></label>`}
        <label class="largo">Sintesi della delibera <textarea rows="2" data-sintesi="${i}">${esc(p.sintesi)}</textarea></label>
        ${p.todo.length ? `<p><strong>Cose da fare</strong></p><ul class="semplice">${p.todo.map((t, j) => rigaTodo(t, i, j)).join('')}</ul>` : ''}
      </div>
    </details>`;
}

// soggetti: tutti, in ordine di nome; nominativi: { [id]: denominazione } per i mandati da chiudere
export function moduloRevisione(proposta, { soggetti, nomeSoggetto }) {
  const c = proposta.consiglio;
  const a = proposta.amministratore;
  const opzioniSoggetti = (n) => `<option value="">Scegli il condomino…</option>${[
    ...soggetti.filter((s) => n.candidati.includes(s.id)), ...soggetti.filter((s) => !n.candidati.includes(s.id)),
  ].map((s) => `<option value="${esc(s.id)}" ${s.id === n.soggettoId ? 'selected' : ''}>${esc(s.denominazione)}</option>`).join('')}`;
  return `
    <form id="verbale-revisione" class="revisione-verbale">
      <h2>Punti all'ordine del giorno</h2>
      ${proposta.creaPunti ? '<p class="avviso">L\'assemblea non ha ancora l\'ordine del giorno nel portale: i punti verranno creati dal verbale.</p>' : ''}
      ${proposta.punti.map((p, i) => schedaPunto(p, i, proposta.creaPunti)).join('') || '<p class="nota">Il verbale non riporta punti all\'ordine del giorno.</p>'}

      ${c ? `
        <h2>Consiglieri</h2>
        <p class="nota">Il nuovo mandato comincia il giorno dell'assemblea; quelli chiusi finiscono il giorno prima. Chi entra nel portale ha bisogno anche di un utente: si crea a parte.</p>
        <ul class="semplice">${c.nominati.map((n, i) => `
          <li><label class="spunta"><input type="checkbox" data-nominato="${i}" ${n.scelto ? 'checked' : ''}> Nominato: <strong>${esc(n.nome)}</strong></label>
            <select data-nominato-soggetto="${i}" aria-label="Condomino corrispondente a ${esc(n.nome)}">${opzioniSoggetti(n)}</select>
            ${n.gia ? '<span class="nota">ha già un mandato in corso: resta quello</span>' : n.candidati.length > 1 ? '<span class="nota">più condomini con questo nome: scegli quello giusto</span>' : !n.soggettoId ? '<span class="nota">nessun condomino con questo nome: sceglilo dall\'elenco</span>' : ''}</li>`).join('')}
        </ul>
        ${c.daChiudere.length ? `<p><strong>Mandati in corso non confermati dal verbale</strong></p><ul class="semplice">${c.daChiudere.map((d, i) => `
          <li><label class="spunta"><input type="checkbox" data-chiudi="${i}" ${d.scelto ? 'checked' : ''} ${d.bloccato ? 'disabled' : ''}> Chiudi il mandato di <strong>${esc(nomeSoggetto(d.consigliere.soggetto_id))}</strong></label>
            ${d.bloccato ? '<span class="nota">è il tuo: chiuderlo ti toglierebbe l\'accesso al portale. Se serve, lo chiude un altro consigliere.</span>' : ''}</li>`).join('')}</ul>` : ''}` : ''}

      ${a ? `
        <h2>Amministratore</h2>
        <label class="spunta"><input type="checkbox" data-amministratore ${a.scelto ? 'checked' : ''}> ${a.conferma ? 'Conferma dell\'incarico in corso' : 'Registra il nuovo incarico'}</label>
        <div class="modulo">
          <label>Nome <input type="text" data-amm-nome value="${esc(a.nome)}" ${a.conferma ? 'disabled' : ''}></label>
          <label>Compenso <input type="text" data-amm-compenso value="${esc(a.compenso)}"></label>
        </div>
        <p class="nota">${a.conferma ? `Resta l'incarico di ${esc(a.attuale.denominazione)}; se indicato, si aggiorna il compenso.`
          : a.attuale ? `L'incarico di ${esc(a.attuale.denominazione)} si chiude il giorno prima dell'assemblea.` : 'Nel portale non c\'era un amministratore registrato.'}${a.durata ? ` Durata nel verbale: ${esc(a.durata)}.` : ''}</p>` : ''}

      ${proposta.altre.length ? `<p class="nota">Altre nomine nel verbale (non registrate): ${proposta.altre.map((n) => `${esc(n.nome)} (${esc(n.ruolo)})`).join(', ')}.</p>` : ''}
      <p class="errore" role="alert"></p>
      <div class="azioni"><button type="submit">Registra quanto scelto</button></div>
    </form>`;
}

// Rilegge dal modulo le scelte e le correzioni e le riporta sulla proposta (che viene modificata e restituita).
export function leggiRevisione(form, proposta) {
  const val = (sel) => form.querySelector(sel);
  proposta.punti.forEach((p, i) => {
    const esito = val(`[data-esito="${i}"]`);
    if (esito) {
      const scelta = ESITI.find((e) => e[0] === esito.value);
      p.aggiornaEsito = Boolean(scelta);
      p.esito = scelta ? scelta[2] : undefined;
    }
    p.sintesi = val(`[data-sintesi="${i}"]`).value.trim();
    p.todo.forEach((t, j) => {
      t.scelto = val(`[data-todo="${i}.${j}"]`).checked;
      t.descrizione = val(`[data-todo-descrizione="${i}.${j}"]`).value.trim();
      t.scadenza = val(`[data-todo-scadenza="${i}.${j}"]`).value || null;
      t.responsabile = val(`[data-todo-responsabile="${i}.${j}"]`).value.trim();
      t.note = val(`[data-todo-note="${i}.${j}"]`).value.trim();
      if (!t.descrizione) t.scelto = false;
    });
  });
  if (proposta.consiglio) {
    proposta.consiglio.nominati.forEach((n, i) => {
      n.scelto = val(`[data-nominato="${i}"]`).checked;
      n.soggettoId = val(`[data-nominato-soggetto="${i}"]`).value || null;
    });
    proposta.consiglio.daChiudere.forEach((d, i) => { d.scelto = !d.bloccato && val(`[data-chiudi="${i}"]`).checked; });
  }
  if (proposta.amministratore) {
    const a = proposta.amministratore;
    a.scelto = val('[data-amministratore]').checked;
    if (!a.conferma) a.nome = val('[data-amm-nome]').value.trim();
    a.compenso = val('[data-amm-compenso]').value.trim();
  }
  const mancanti = proposta.consiglio?.nominati.filter((n) => n.scelto && !n.soggettoId).map((n) => n.nome) ?? [];
  if (mancanti.length) return `Scegli il condomino corrispondente a: ${mancanti.join(', ')} (oppure togli la spunta).`;
  if (proposta.amministratore?.scelto && !proposta.amministratore.nome) return 'Scrivi il nome dell\'amministratore (oppure togli la spunta).';
  return null;
}
