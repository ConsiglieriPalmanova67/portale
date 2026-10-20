// Archivio deleghe per condomino: le deleghe rilasciate e ricevute da un soggetto in tutte le assemblee.
// (L'archivio per assemblea è nella scheda Deleghe di ogni assemblea.)
import { deposito } from '../dati/client.js';
import { esc, ora } from '../ui/html.js';
import { titoloAssemblea } from './assemblea/comuni.js';

const BUCKET = 'deleghe';

export async function archivioDeleghe(stato, contenitore, soggettoIniziale) {
  let attiva = true;
  stato.allUscita = () => { attiva = false; };
  const { modello } = stato;
  let scelto = soggettoIniziale ?? '';
  let d = null;

  contenitore.innerHTML = `
    <header class="testata">
      <p><a href="#/assemblee">← Assemblee</a></p>
      <h1>Archivio deleghe per condomino</h1>
      <p class="nota">Le deleghe rilasciate e ricevute da un condomino in tutte le assemblee, con la scansione quando c'è.
        Le deleghe di una singola assemblea sono nella sua scheda Deleghe.</p>
    </header>
    <div class="filtri"><select id="deleghe-soggetto" aria-label="Condomino"><option value="">Caricamento…</option></select></div>
    <div id="deleghe-elenco"></div>`;
  const elenco = contenitore.querySelector('#deleghe-elenco');
  const selettore = contenitore.querySelector('#deleghe-soggetto');
  const nome = (soggettoId) => modello.soggetti.get(soggettoId)?.denominazione ?? 'Soggetto non più in anagrafica';

  function disegna() {
    const { assemblee, teste, deleghe } = d;
    const testaPerId = new Map(teste.map((t) => [t.id, t]));
    const assembleaPerId = new Map(assemblee.map((a) => [a.id, a]));
    // nel selettore solo chi compare in almeno una delega, come delegante o come delegato
    const coinvolti = new Set(deleghe.flatMap((x) => [...(testaPerId.get(x.delegante_testa_id)?.soggetti ?? []), ...(testaPerId.get(x.delegato_testa_id)?.soggetti ?? [])]));
    if (scelto) coinvolti.add(scelto);
    selettore.innerHTML = `<option value="">Tutti i condomini (${deleghe.length} ${deleghe.length === 1 ? 'delega' : 'deleghe'})</option>${
      [...coinvolti].map((id) => [id, nome(id)]).sort((a, b) => a[1].localeCompare(b[1], 'it'))
        .map(([id, n]) => `<option value="${esc(id)}" ${id === scelto ? 'selected' : ''}>${esc(n)}</option>`).join('')}`;

    const righe = deleghe.map((x) => {
      const delegante = testaPerId.get(x.delegante_testa_id);
      const delegato = testaPerId.get(x.delegato_testa_id);
      const ruolo = !scelto ? '' : delegante?.soggetti.includes(scelto) ? 'rilasciata' : delegato?.soggetti.includes(scelto) ? 'ricevuta' : null;
      return { x, delegante, delegato, ruolo, assemblea: assembleaPerId.get(x.assemblea_id) };
    }).filter((r) => r.ruolo !== null && r.assemblea)
      .sort((a, b) => (a.assemblea.data < b.assemblea.data ? 1 : a.assemblea.data > b.assemblea.data ? -1 : a.x.ora_registrazione < b.x.ora_registrazione ? -1 : 1));
    const senza = righe.filter((r) => !r.x.scansione_path).length;

    elenco.innerHTML = `
      <p class="nota">${righe.length} ${righe.length === 1 ? 'delega' : 'deleghe'}${senza ? `, <strong class="neg">${senza} senza scansione</strong>` : ''}.</p>
      <div class="scorri"><table>
        <thead><tr><th>Assemblea</th><th>Delegante</th><th>Delegato</th>${scelto ? '<th>Per il condomino</th>' : ''}<th>Registrata</th><th>Scansione</th></tr></thead>
        <tbody>${righe.map(({ x, delegante, delegato, ruolo, assemblea }) => `
          <tr class="${x.scansione_path ? '' : 'senza-scansione'}">
            <td><a href="#/assemblee/${encodeURIComponent(assemblea.id)}/deleghe">${esc(titoloAssemblea(assemblea))}</a></td>
            <td><strong>${esc(delegante?.etichetta ?? '?')}</strong></td>
            <td>${esc(delegato?.etichetta ?? x.delegato_esterno ?? '?')}
              ${x.delegato_testa_id ? '' : '<span class="etichetta">esterno</span>'}${x.amministratore ? ' <span class="etichetta stato-avviso">amministratore</span>' : ''}
              ${x.nota ? `<br><span class="nota">${esc(x.nota)}</span>` : ''}</td>
            ${scelto ? `<td><span class="etichetta ${ruolo === 'rilasciata' ? 'stato-delega' : 'stato-presente'}">${ruolo}</span></td>` : ''}
            <td>${ora(x.ora_registrazione)}</td>
            <td>${x.scansione_path ? `<button type="button" class="secondario" data-mostra="${esc(x.id)}">Mostra scansione</button>` : '<span class="etichetta stato-avviso">Senza scansione</span>'}</td>
          </tr>`).join('') || `<tr><td colspan="${scelto ? 6 : 5}" class="nota">Nessuna delega${scelto ? ' per questo condomino' : ' registrata'}.</td></tr>`}</tbody>
      </table></div>`;
  }

  const carica = async () => {
    try {
      const [assemblee, teste, deleghe] = await Promise.all([deposito.leggi('assemblee'), deposito.leggi('teste_assemblea'), deposito.leggi('deleghe')]);
      if (!attiva) return;
      d = { assemblee, teste, deleghe };
      disegna();
    } catch (errore) {
      if (!attiva) return;
      elenco.innerHTML = `<p class="avviso grave" role="alert">Non è stato possibile leggere le deleghe: ${esc(errore.message)} <button type="button" id="riprova-deleghe">Riprova</button></p>`;
      elenco.querySelector('#riprova-deleghe').addEventListener('click', carica);
    }
  };

  selettore.addEventListener('change', () => {
    scelto = selettore.value;
    if (d) disegna();
  });

  elenco.addEventListener('click', async (evento) => {
    const id = evento.target.dataset.mostra;
    if (!id) return;
    const bottone = evento.target;
    const delega = d.deleghe.find((x) => x.id === id);
    bottone.disabled = true;
    try {
      const url = await deposito.urlFile(BUCKET, delega.scansione_path);
      bottone.outerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">Apri la scansione</a>`;
    } catch (errore) {
      bottone.disabled = false;
      bottone.textContent = 'Mostra scansione (riprova)';
      bottone.insertAdjacentHTML('afterend', `<br><span class="neg" role="alert">${esc(errore.message)}</span>`);
    }
  });

  await carica();
}
