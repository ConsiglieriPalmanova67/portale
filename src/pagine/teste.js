import { esc, millesimi, normalizza, linkCondomino, linkEmail } from '../ui/html.js';
import { deposito, caricaDati } from '../dati/client.js';
import { costruisciModello } from '../dati/modello.js';
import * as controlla from '../dati/contatti.js';
import { TIPI } from './unita.js';

const tel = (v) => `<a href="tel:${esc(String(v).replace(/[^\d+]/g, ''))}">${esc(v)}</a>`;
const vuoto = '<span class="nota">—</span>';
// Per ogni soggetto della testa il suo valore, uno sotto l'altro (una testa può avere più comproprietari).
const perSoggetto = (t, campo, formato) => t.soggetti.filter((s) => s[campo]).map((s) => formato(s[campo])).join('<br>') || vuoto;

// Il popup per correggere i recapiti dei soggetti di una testa. → true se ha salvato.
function modificaRecapiti(testa) {
  return new Promise((risolvi) => {
    const finestra = document.createElement('dialog');
    finestra.className = 'conferma finestra-todo';
    finestra.innerHTML = `
      <form method="dialog" class="modulo">
        <h2 class="largo">Recapiti</h2>
        ${testa.soggetti.map((s, i) => `
          <p class="largo"><strong>${esc(s.denominazione)}</strong></p>
          <label class="largo">Email <input data-i="${i}" name="email" inputmode="email" placeholder="più indirizzi separati da virgola" value="${esc(s.email ?? '')}"></label>
          <label>Telefono <input data-i="${i}" name="telefono" type="tel" value="${esc(s.telefono ?? '')}"></label>
          <label>Cellulare <input data-i="${i}" name="cellulare" type="tel" value="${esc(s.cellulare ?? '')}"></label>`).join('')}
        <p class="errore largo" role="alert"></p>
        <div class="azioni largo"><button type="button" class="secondario" value="no">Annulla</button> <button type="submit">Salva</button></div>
      </form>`;
    const form = finestra.querySelector('form');
    const chiudi = (esito) => {
      if (!finestra.isConnected) return;
      finestra.close();
      finestra.remove();
      risolvi(esito);
    };
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const campo = (i, nome) => form.querySelector(`[data-i="${i}"][name="${nome}"]`).value;
      let valori;
      try {
        valori = testa.soggetti.map((s, i) => ({ id: s.id, email: controlla.email(campo(i, 'email')), telefono: controlla.telefono(campo(i, 'telefono')), cellulare: controlla.telefono(campo(i, 'cellulare')) }));
      } catch (e) {
        form.querySelector('.errore').textContent = e.message;
        return;
      }
      form.querySelector('button[type="submit"]').disabled = true;
      try {
        for (const { id, ...v } of valori) await deposito.aggiorna('soggetti', { id }, v);
        chiudi(true);
      } catch (e) {
        form.querySelector('.errore').textContent = `Non salvato: ${e.message}`;
        form.querySelector('button[type="submit"]').disabled = false;
      }
    });
    finestra.addEventListener('click', (evento) => evento.target.value === 'no' && chiudi(false));
    finestra.addEventListener('close', () => chiudi(false));
    document.body.append(finestra);
    finestra.showModal();
  });
}

// I condomini: ogni proprietario (o gruppo di comproprietari) con le sue unità, una per riga, e i suoi recapiti.
// È anche chi vota in assemblea (una testa).
export function elencoTeste(stato, contenitore) {
  const totale = () => stato.modello.teste.reduce((s, t) => s + t.proprieta, 0);
  contenitore.innerHTML = `<div id="condomini-pagina" class="condomini-pagina">
    <header class="testata">
      <h1>Condomini</h1>
      <p class="nota">Ogni proprietario, o gruppo di comproprietari, con le sue unità e i recapiti. In assemblea conta una testa con la somma dei millesimi delle sue unità;
        conduttori e assegnatari non votano. Il cambio di proprietà si fa unità per unità («cambia proprietario» sotto il nome): il box può passare a uno e l'appartamento a un altro.</p>
    </header>
    <div class="riquadri" id="condomini-riquadri"></div>
    <div class="filtri">
      <input type="search" id="cerca" placeholder="Cerca per nome, unità, email o telefono" aria-label="Cerca">
      <select id="parte" aria-label="Filtra per scala o torre"><option value="">Tutte le scale e torri</option>${stato.modello.parti.map((p) => `<option>${esc(p)}</option>`).join('')}</select>
      <select id="ordine" aria-label="Ordina">
        <option value="nome">Ordina per nome</option>
        <option value="peso">Ordina per millesimi</option>
      </select>
      <span id="conteggio" class="nota"></span>
    </div>
    <div class="scorri"><table class="tab-condomini">
      <thead><tr><th>Condomino</th><th>Unità</th><th>Tipo</th><th>Scala / torre</th><th>Piano</th><th>Interno</th><th class="num">Millesimi unità</th>
        <th>Telefono</th><th>Cellulare</th><th>Email</th><th class="num">Millesimi totali</th><th></th></tr></thead>
      <tbody id="righe"></tbody>
    </table></div>
  </div>`;
  const pagina = contenitore.querySelector('#condomini-pagina');
  const cerca = pagina.querySelector('#cerca');
  const ordine = pagina.querySelector('#ordine');
  const parte = pagina.querySelector('#parte');

  const disegna = () => {
    const { modello } = stato;
    pagina.querySelector('#condomini-riquadri').innerHTML = `
      <div class="riquadro"><span class="valore">${modello.teste.length}</span><span class="nota">condomini con diritto di voto (teste)</span></div>
      <div class="riquadro"><span class="valore">${millesimi(totale())}</span><span class="nota">millesimi di proprietà</span></div>
      <div class="riquadro"><span class="valore">${Math.ceil(modello.teste.length / 3)}</span><span class="nota">teste per il quorum di seconda convocazione (1/3)</span></div>`;
    const testo = normalizza(cerca.value.trim());
    const righe = modello.teste
      .filter((t) => !parte.value || t.unita.some((u) => u.parti.includes(parte.value)))
      .filter((t) => !testo || normalizza([t.etichetta, ...t.unita.map((u) => u.codice), ...t.soggetti.flatMap((s) => [s.email, s.telefono, s.cellulare])].join(' ')).includes(testo))
      .sort((a, b) => (ordine.value === 'peso' ? b.proprieta - a.proprieta : 0));
    pagina.querySelector('#conteggio').textContent = `${righe.length} mostrati`;
    pagina.querySelector('#righe').innerHTML = righe.map((t, n) => {
      const unita = t.unita.length ? t.unita : [null];
      const alte = `rowspan="${unita.length}"`;
      return unita.map((u, i) => `
        <tr class="${n % 2 ? 'pari' : ''} ${i === 0 ? 'prima' : ''}">
          ${i === 0 ? `<td ${alte}><strong>${t.soggetti.map((x) => linkCondomino(x)).join(' + ') || esc(t.etichetta)}</strong>${t.soggetti.some((s) => s.note) ? `<br><span class="nota">${esc(t.soggetti.map((s) => s.note).filter(Boolean).join('; '))}</span>` : ''}
            ${t.unita.length ? `<br><span class="nota cambio">cambia proprietario${t.unita.length > 1 ? ' di' : ''}: ${t.unita.map((x) => `<a href="#/unita/${encodeURIComponent(x.codice)}/cambio" title="Cambio di proprietà di ${esc(x.codice)}">${t.unita.length > 1 ? esc(x.codice) : 'apri'}</a>`).join(' ')}</span>` : ''}</td>` : ''}
          <td>${u ? `<a href="#/unita/${encodeURIComponent(u.codice)}"><strong>${esc(u.codice)}</strong></a>` : vuoto}</td>
          <td>${u ? esc(TIPI[u.tipo] ?? '') : ''}</td>
          <td>${u ? esc(u.parti.join(', ')) || vuoto : ''}</td>
          <td>${u?.piano ? esc(u.piano) : vuoto}</td>
          <td>${u?.interno ? esc(u.interno) : vuoto}</td>
          <td class="num">${u ? millesimi(u.proprieta) : ''}</td>
          ${i === 0 ? `<td ${alte}>${perSoggetto(t, 'telefono', tel)}</td><td ${alte}>${perSoggetto(t, 'cellulare', tel)}</td>
            <td ${alte} class="email">${perSoggetto(t, 'email', linkEmail)}</td><td ${alte} class="num"><strong>${millesimi(t.proprieta)}</strong></td>` : ''}
          ${i === 0 ? `<td ${alte} class="tasti"><button type="button" class="secondario piccolo" data-recapiti="${esc(t.chiave)}">Modifica recapiti</button></td>` : ''}
        </tr>`).join('');
    }).join('') || '<tr><td colspan="12" class="nota">Nessun condomino corrisponde alla ricerca.</td></tr>';
  };

  pagina.onclick = async (evento) => {
    const chiave = evento.target.dataset.recapiti;
    if (!chiave) return;
    const testa = stato.modello.teste.find((t) => t.chiave === chiave);
    if (!testa || !(await modificaRecapiti(testa))) return;
    stato.dati = await caricaDati();
    stato.modello = costruisciModello(stato.dati, stato.oggi);
    disegna();
  };
  cerca.addEventListener('input', disegna);
  ordine.addEventListener('change', disegna);
  parte.addEventListener('change', disegna);
  disegna();
}
