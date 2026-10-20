import { esc, euro, millesimi, data, RUOLI, segno, normalizza, linkCondomino } from '../ui/html.js';
import { strumentiUnita } from './unita-modifica.js';
import { deposito, caricaDati } from '../dati/client.js';
import { costruisciModello } from '../dati/modello.js';

export const TIPI = { appartamento: 'Appartamento', box: 'Box', 'posto auto': 'Posto auto', cantina: 'Cantina', negozio: 'Negozio', ufficio: 'Ufficio', terrazzo: 'Terrazzo', giardino: 'Giardino', deposito: 'Deposito', altro: 'Altro' };
const tipo = (u) => TIPI[u.tipo] ?? '';

const nomi = (voci) => voci.map((v) => linkCondomino(v.soggetto)).join('<br>');

// Filtro sui millesimi: ">0,8", "<1", ">=", "<=", "=0,8"; un numero senza segno cerca il valore esatto.
function filtroMillesimi(testo) {
  const m = testo.replace(/\s/g, '').match(/^(>=|<=|>|<|=)?(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const soglia = Number(m[2].replace(',', '.'));
  const confronta = { '>': (v) => v > soglia, '<': (v) => v < soglia, '>=': (v) => v >= soglia, '<=': (v) => v <= soglia };
  return confronta[m[1]] ?? ((v) => Math.abs(v - soglia) < 0.0005);
}

// Le unità immobiliari con i titolari e, una colonna per tabella, tutti i millesimi.
// opzioni.tabella: arrivando dal collegamento a una tabella si mostrano solo le unità che vi partecipano.
export function elencoUnita(stato, contenitore, opzioni = {}) {
  const { modello } = stato;
  const { tabelle } = modello;
  const proprieta = modello.tabellaProprieta?.id;
  const tipi = [...new Set(modello.unita.map((u) => u.tipo).filter(Boolean))].sort((a, b) => tipo({ tipo: a }).localeCompare(tipo({ tipo: b }), 'it'));
  // un clic sul titolo ordina la colonna, un altro clic inverte il verso
  const ordinabile = (chiave, etichetta) => `<button type="button" class="ordina" data-ordina="${esc(chiave)}">${etichetta}<span class="freccia" aria-hidden="true"></span></button>`;
  // "4 - Proprietà" → il numero sopra e il nome sotto, per tenere strette le colonne
  const intestazione = (t) => {
    const m = t.nome.match(/^(\d+)\s*-\s*(.+)$/);
    return `<th class="num mill${t.id === proprieta ? ' proprieta' : ''}" title="${esc(t.nome)} (${esc(t.ambito)}), totale dichiarato ${millesimi(t.totale_dichiarato)}">${ordinabile(`t:${t.id}`, m ? `<span class="n-tab">${esc(m[1])}</span>${esc(m[2])}` : esc(t.nome))}</th>`;
  };
  contenitore.innerHTML = `<div id="unita-pagina">
    <header class="testata">
      <h1>Unità immobiliari</h1>
      <p class="nota">${modello.unita.length} unità con i titolari e i millesimi di tutte le ${tabelle.length} tabelle (passa sul titolo di una colonna per il nome completo).
        Ogni delibera usa la tabella della parte che riguarda: chi non ha millesimi in quella tabella non partecipa. Scala e torre sono ricavate dai millesimi.
        Un clic sul titolo di una colonna la ordina (un altro clic inverte). Sotto ogni intestazione c'è il suo filtro; per i millesimi un valore (0,8) o un confronto (&gt;0, &lt;1, &gt;=2).</p>
    </header>
    <div class="filtri">
      <input type="search" id="cerca" placeholder="Cerca per codice o nome" aria-label="Cerca per codice o nome">
      <button type="button" class="secondario" id="azzera-filtri">Togli i filtri</button>
      <span id="conteggio" class="nota"></span>
    </div>
    <div class="scorri"><table class="con-filtri tab-unita">
      <thead>
        <tr class="titoli">${[['codice', 'Unità'], ['tipo', 'Tipo'], ['proprietari', 'Proprietari'], ['altri', 'Altri titolari'], ['parte', 'Scala / torre']].map(([k, e]) => `<th>${ordinabile(k, e)}</th>`).join('')}${tabelle.map(intestazione).join('')}</tr>
        <tr class="filtri-colonna">
          <th><input type="search" data-filtro="codice" placeholder="es. A1" aria-label="Filtra per codice"></th>
          <th><select data-filtro="tipo" aria-label="Filtra per tipo di unità"><option value="">Tutti</option>
            ${tipi.map((t) => `<option value="${esc(t)}">${esc(TIPI[t] ?? t)}</option>`).join('')}</select></th>
          <th><input type="search" data-filtro="proprietari" placeholder="Nome" aria-label="Filtra per proprietario"></th>
          <th><input type="search" data-filtro="altri" placeholder="Nome" aria-label="Filtra per altri titolari"></th>
          <th><select data-filtro="parte" aria-label="Filtra per scala o torre"><option value="">Tutte</option>
            ${modello.parti.map((p) => `<option>${esc(p)}</option>`).join('')}</select></th>
          ${tabelle.map((t) => `<th class="num"><input type="search" data-tabella="${esc(t.id)}" placeholder="&gt;0" aria-label="Filtra per millesimi ${esc(t.nome)}" title="Un valore (0,8) oppure un confronto: >0, <0,8, >=2"></th>`).join('')}
        </tr>
      </thead>
      <tbody id="righe"></tbody>
    </table></div>
  </div>`;

  const pagina = contenitore.querySelector('#unita-pagina');
  const cerca = pagina.querySelector('#cerca');
  const filtri = Object.fromEntries([...pagina.querySelectorAll('[data-filtro]')].map((el) => [el.dataset.filtro, el]));
  const perTabella = [...pagina.querySelectorAll('[data-tabella]')];
  const scelta = perTabella.find((el) => el.dataset.tabella === opzioni.tabella);
  if (scelta) scelta.value = '>0';
  const contiene = (voci, testo) => normalizza(voci.map((v) => v.soggetto.denominazione).join(' ')).includes(testo);
  const valore = (u, t) => Number(u.millesimi[t.id]) || 0;
  const classe = (t) => (t.id === proprieta ? ' proprieta' : '');
  const testoNomi = (voci) => voci.map((v) => v.soggetto.denominazione).join(' ');
  const PER_COLONNA = {
    codice: (u) => u.codice, tipo: (u) => tipo(u), proprietari: (u) => testoNomi(u.proprietari), altri: (u) => testoNomi(u.altri), parte: (u) => u.parti.join(' '),
  };
  const ordine = { chiave: null, verso: 1 };
  const confronta = (a, b) => {
    if (!ordine.chiave) return 0;
    if (ordine.chiave.startsWith('t:')) {
      const id = ordine.chiave.slice(2);
      return ordine.verso * ((Number(a.millesimi[id]) || 0) - (Number(b.millesimi[id]) || 0));
    }
    const [x, y] = [PER_COLONNA[ordine.chiave](a), PER_COLONNA[ordine.chiave](b)];
    // le celle vuote in fondo, in tutti e due i versi
    if (!x !== !y) return x ? -1 : 1;
    return ordine.verso * x.localeCompare(y, 'it', { numeric: true, sensitivity: 'base' });
  };
  const disegna = () => {
    const testo = normalizza(cerca.value.trim());
    const codice = normalizza(filtri.codice.value.trim());
    const proprietari = normalizza(filtri.proprietari.value.trim());
    const altri = normalizza(filtri.altri.value.trim());
    const condizioni = [];
    for (const el of perTabella) {
      const prova = el.value.trim() ? filtroMillesimi(el.value) : null;
      el.setCustomValidity(el.value.trim() && !prova ? 'Scrivi un numero, per esempio 0,8 oppure >0' : '');
      if (prova) condizioni.push({ id: el.dataset.tabella, prova });
    }
    const righe = modello.unita.filter((u) => {
      if (filtri.parte.value && !u.parti.includes(filtri.parte.value)) return false;
      if (filtri.tipo.value && u.tipo !== filtri.tipo.value) return false;
      if (codice && !normalizza(u.codice).startsWith(codice)) return false;
      if (proprietari && !contiene(u.proprietari, proprietari)) return false;
      if (altri && !contiene(u.altri, altri)) return false;
      if (condizioni.some((c) => !c.prova(Number(u.millesimi[c.id]) || 0))) return false;
      if (!testo) return true;
      const dove = [u.codice, ...u.proprietari.map((p) => p.soggetto.denominazione), ...u.altri.map((p) => p.soggetto.denominazione)];
      return normalizza(dove.join(' ')).includes(testo);
    }).sort(confronta);
    for (const b of pagina.querySelectorAll('[data-ordina]')) {
      const attivo = b.dataset.ordina === ordine.chiave;
      b.closest('th').setAttribute('aria-sort', attivo ? (ordine.verso > 0 ? 'ascending' : 'descending') : 'none');
      b.querySelector('.freccia').textContent = attivo ? (ordine.verso > 0 ? ' ▲' : ' ▼') : '';
    }
    pagina.querySelector('#conteggio').textContent = `${righe.length} mostrate`;
    // con tutte le unità mostrate, un totale diverso da quello dichiarato si vede in rosso
    const tutte = righe.length === modello.unita.length;
    const totali = tabelle.map((t) => {
      const somma = righe.reduce((s, u) => s + valore(u, t), 0);
      const diverso = tutte && Math.abs(somma - Number(t.totale_dichiarato)) > 0.0015;
      return `<td class="num${classe(t)}${diverso ? ' attenzione' : ''}" title="Totale dichiarato ${millesimi(t.totale_dichiarato)}">${millesimi(somma)}</td>`;
    }).join('');
    const totale = righe.length ? `<tr class="riga-totale"><td colspan="5"><strong>Totale delle ${righe.length} unità mostrate</strong></td>${totali}</tr>` : '';
    pagina.querySelector('#righe').innerHTML = totale + (righe.map((u) => `
      <tr>
        <td><a href="#/unita/${encodeURIComponent(u.codice)}"><strong>${esc(u.codice)}</strong></a></td>
        <td>${esc(tipo(u))}</td>
        <td>${nomi(u.proprietari) || '<span class="nota">nessuno</span>'}</td>
        <td>${u.altri.map((a) => `${linkCondomino(a.soggetto)} <span class="etichetta">${RUOLI[a.ruolo]}</span>`).join('<br>')}</td>
        <td>${u.parti.map((p) => `<span class="etichetta">${esc(p)}</span>`).join(' ')}</td>
        ${tabelle.map((t) => `<td class="num${classe(t)}">${valore(u, t) ? millesimi(valore(u, t)) : ''}</td>`).join('')}
      </tr>`).join('') || `<tr><td colspan="${5 + tabelle.length}" class="nota">Nessuna unità corrisponde ai filtri.</td></tr>`);
  };
  pagina.querySelector('.scorri').addEventListener('input', disegna);
  pagina.querySelector('tr.titoli').addEventListener('click', (evento) => {
    const chiave = evento.target.closest('[data-ordina]')?.dataset.ordina;
    if (!chiave) return;
    // i millesimi partono dal più alto, i testi dalla A
    ordine.verso = ordine.chiave === chiave ? -ordine.verso : chiave.startsWith('t:') ? -1 : 1;
    ordine.chiave = chiave;
    disegna();
  });
  cerca.addEventListener('input', disegna);
  pagina.querySelector('#azzera-filtri').addEventListener('click', () => {
    cerca.value = '';
    for (const el of [...Object.values(filtri), ...perTabella]) el.value = '';
    disegna();
  });
  disegna();
}

export function dettaglioUnita(stato, contenitore, codice, scheda) {
  const { modello, dati } = stato;
  const u = modello.unitaPerCodice.get(codice);
  if (!u) {
    contenitore.innerHTML = `<p>Unità "${esc(codice)}" non trovata. <a href="#/unita">Torna all'elenco</a></p>`;
    return;
  }
  const esercizi = [...dati.esercizi].sort((a, b) => a.anno - b.anno);
  const titolari = [
    ...u.proprietari.map((v) => ({ ...v, stato: 'in corso' })),
    ...u.altri.map((v) => ({ ...v, stato: 'in corso' })),
    ...u.futuri.map((v) => ({ ...v, stato: 'non ancora iniziato' })),
    ...u.storico.map((v) => ({ ...v, stato: 'cessato' })),
  ];
  const posizioni = dati.posizioni.filter((p) => p.unita_id === u.id);

  contenitore.innerHTML = `
    <p><a href="#/unita">← Unità</a></p>
    <header class="testata">
      <h1>${esc(u.codice)}${tipo(u) ? ` <span class="etichetta">${esc(tipo(u))}</span>` : ''}</h1>
      <p>${u.parti.map((p) => `<span class="etichetta">${esc(p)}</span>`).join(' ') || '<span class="nota">Nessuna scala o torre</span>'}</p>
    </header>
    <form class="filtri" id="unita-posizione">
      <label>Piano <input name="piano" size="6" value="${esc(u.piano ?? '')}" placeholder="es. 3 o T"></label>
      <label>Interno <input name="interno" size="6" value="${esc(u.interno ?? '')}" placeholder="es. 12"></label>
      <button type="submit" class="secondario">Salva piano e interno</button>
      <span class="nota" role="status"></span>
    </form>

    <h2>Titolari</h2>
    <div class="scorri"><table>
      <thead><tr><th>Soggetto</th><th>Titolo</th><th>Dal</th><th>Al</th><th>Stato</th></tr></thead>
      <tbody>${titolari.map((t) => `
        <tr class="${t.stato === 'in corso' ? '' : 'spento'}">
          <td>${linkCondomino(t.soggetto)}${t.soggetto.note ? `<br><span class="nota">${esc(t.soggetto.note)}</span>` : ''}</td>
          <td>${RUOLI[t.ruolo]}</td><td>${data(t.dal)}</td><td>${data(t.al)}</td><td>${t.stato}</td>
        </tr>`).join('')}</tbody>
    </table></div>

    <div id="strumenti-unita"></div>

    <h2>Millesimi</h2>
    <div class="scorri"><table>
      <thead><tr><th>Tabella</th><th class="num">Millesimi</th><th class="num">Totale tabella</th></tr></thead>
      <tbody>${modello.tabelle.filter((t) => u.millesimi[t.id] > 0).map((t) => `
        <tr><td><a href="#/millesimi/${t.id}">${esc(t.nome)}</a></td><td class="num">${millesimi(u.millesimi[t.id])}</td><td class="num">${millesimi(t.totale_dichiarato)}</td></tr>`).join('')
        || '<tr><td colspan="3" class="nota">Nessun millesimo registrato.</td></tr>'}</tbody>
    </table></div>

    ${esercizi.map((e) => {
      const righe = posizioni.filter((p) => p.esercizio_id === e.id);
      if (!righe.length) return '';
      const consuntivo = e.tipo === 'consuntivo';
      return `
        <h2>${e.anno} — ${consuntivo ? 'consuntivo' : 'preventivo'}</h2>
        <div class="scorri"><table>
          <thead><tr><th>Intestatario</th><th class="num">Totale gestione</th><th class="num">Saldo precedente</th>
            ${consuntivo ? '<th class="num">Rate versate</th><th class="num">Saldo finale</th>' : '<th class="num">Totale dovuto</th><th>Rate</th>'}</tr></thead>
          <tbody>${righe.map((p) => {
            const rate = dati.rate.filter((r) => r.posizione_id === p.id).sort((a, b) => a.numero - b.numero);
            return `<tr>
              <td>${linkCondomino(modello.soggetti.get(p.soggetto_id))} <span class="etichetta">${RUOLI[p.ruolo]}</span></td>
              <td class="num ${segno(p.totale_gestione)}">${euro(p.totale_gestione)}</td>
              <td class="num ${segno(p.saldo_precedente)}">${euro(p.saldo_precedente)}</td>
              ${consuntivo
                ? `<td class="num">${euro(p.rate_versate)}</td><td class="num ${segno(p.saldo_finale)}"><strong>${euro(p.saldo_finale)}</strong></td>`
                : `<td class="num ${segno(p.saldo_finale)}"><strong>${euro(p.saldo_finale)}</strong></td>
                   <td>${rate.map((r) => `${data(r.scadenza)}: ${euro(r.importo)}`).join('<br>')}</td>`}
            </tr>`;
          }).join('')}</tbody>
        </table></div>`;
    }).join('')}`;

  // piano e interno: si scrivono qui e compaiono nell'elenco dei condomini
  contenitore.querySelector('#unita-posizione').onsubmit = async (evento) => {
    evento.preventDefault();
    const form = evento.target;
    const esito = form.querySelector('[role="status"]');
    const valori = { piano: form.piano.value.trim() || null, interno: form.interno.value.trim() || null };
    form.querySelector('button').disabled = true;
    try {
      await deposito.aggiorna('unita', { id: u.id }, valori);
      stato.dati = await caricaDati();
      stato.modello = costruisciModello(stato.dati, stato.oggi);
      esito.textContent = 'Salvato.';
    } catch (e) {
      esito.textContent = `Non salvato: ${e.message}`;
    }
    form.querySelector('button').disabled = false;
  };

  if (scheda === 'cambio') {
    const memoria = (stato.memoriaUnita ??= {});
    memoria[u.id] = { soggetto: null, data: '', nuovi: [], ...(memoria[u.id] ?? {}), aperto: 'cambio' };
  }
  strumentiUnita(stato, contenitore.querySelector('#strumenti-unita'), u, () => dettaglioUnita(stato, contenitore, codice));
  if (scheda === 'cambio') contenitore.querySelector('#strumenti-unita').scrollIntoView({ block: 'start' });
}
