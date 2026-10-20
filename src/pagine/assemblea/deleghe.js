// Scheda Deleghe: inserimento a mano, scansione facoltativa (subito o dopo), archivio dell'assemblea, avvisi.
import { esc, ora, conOra } from '../../ui/html.js';
import { nonAperta, conferma } from './comuni.js';

const BUCKET = 'deleghe';
const TIPI_FILE = 'image/*,application/pdf';

// Percorso nel bucket: una cartella per assemblea, un file per delega.
function percorsoScansione(assembleaId, delegaId, file) {
  const estensione = (file.name?.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'bin').toLowerCase();
  return `${assembleaId}/${delegaId}.${estensione}`;
}

// Sostituendo la scansione, quella vecchia si toglie dall'archivio (se ha un altro nome: con lo stesso viene sovrascritta).
async function allegaScansione(ctx, delegaId, file) {
  const [attuale] = await ctx.deposito.leggi('deleghe', { id: delegaId });
  if (!attuale) throw new Error('la delega non esiste più.');
  const percorso = await ctx.deposito.caricaFile(BUCKET, percorsoScansione(ctx.assemblea.id, delegaId, file), file);
  await ctx.deposito.aggiorna('deleghe', { id: delegaId }, { scansione_path: percorso });
  if (attuale.scansione_path && attuale.scansione_path !== percorso) await ctx.deposito.eliminaFile(BUCKET, attuale.scansione_path);
}

function modulo(ctx) {
  const haDelegato = new Set(ctx.deleghe.map((d) => d.delegante_testa_id));
  const opzioni = (righe) => righe.map((r) => `<option value="${esc(r.testa.id)}">${esc(r.testa.etichetta)} — ${esc(ctx.unitaDi(r.testa))}</option>`).join('');
  return `
    <h2>Nuova delega</h2>
    <form id="nuova-delega" class="modulo">
      <label class="largo">Chi delega (delegante)
        <select name="delegante" required>
          <option value="">Scegli la testa…</option>
          ${opzioni(ctx.seduta.righe.filter((r) => !haDelegato.has(r.testa.id)))}
        </select>
      </label>
      <fieldset class="largo">
        <legend>Delegato</legend>
        <label class="scelta"><input type="radio" name="genere" value="condomino" checked> Un condomino</label>
        <label class="scelta"><input type="radio" name="genere" value="esterno"> Una persona esterna</label>
        <select name="delegato_testa" aria-label="Condomino delegato">
          <option value="">Scegli la testa…</option>
          ${opzioni(ctx.seduta.righe)}
        </select>
        <input type="text" name="delegato_esterno" placeholder="Nome e cognome del delegato" aria-label="Nome del delegato esterno" hidden>
        <label class="scelta"><input type="checkbox" name="amministratore"> Il delegato è l'amministratore</label>
      </fieldset>
      <label class="largo">Nota <input type="text" name="nota" placeholder="Facoltativa"></label>
      <label class="largo">Scansione della delega (foto o PDF, facoltativa: si può caricare anche dopo)
        <input type="file" name="scansione" accept="${TIPI_FILE}">
      </label>
      <div class="azioni"><button type="submit">Registra delega</button></div>
      <p id="delega-errore" class="errore" role="alert"></p>
    </form>`;
}

function archivio(ctx) {
  const rigaPerTesta = new Map(ctx.seduta.righe.map((r) => [r.testa.id, r]));
  const deleghe = [...ctx.deleghe].sort((a, b) => (a.ora_registrazione < b.ora_registrazione ? -1 : 1));
  const senza = deleghe.filter((d) => !d.scansione_path).length;
  const blocca = ctx.solaLettura ? 'disabled' : '';
  return `
    <h2>Archivio deleghe dell'assemblea</h2>
    <p class="nota"><a href="#/deleghe">Archivio di tutte le assemblee, per condomino</a></p>
    <p class="nota">${deleghe.length} ${deleghe.length === 1 ? 'delega' : 'deleghe'}${senza ? `, <strong class="neg">${senza} senza scansione</strong>` : deleghe.length ? ', tutte con scansione' : ''}.</p>
    <div class="scorri"><table>
      <thead><tr><th>Delegante</th><th>Delegato</th><th>Nota</th><th>Registrata</th><th>Scansione</th><th></th></tr></thead>
      <tbody>${deleghe.map((d) => {
        const r = rigaPerTesta.get(d.delegante_testa_id);
        const id = esc(d.id);
        const esito = !r ? '' : r.stato === 'delega' ? '<span class="etichetta stato-delega">conta come presente</span>'
          : r.stato === 'presente' ? '<span class="etichetta stato-avviso">in conflitto</span>' : '<span class="etichetta stato-avviso">delegato non in sala</span>';
        return `
        <tr class="${d.scansione_path ? '' : 'senza-scansione'}">
          <td><strong>${esc(r?.testa.etichetta ?? '?')}</strong><br><span class="nota">${r ? esc(ctx.unitaDi(r.testa)) : ''}</span></td>
          <td>${esc(r?.delegato?.nome ?? d.delegato_esterno ?? '?')}
            ${d.delegato_testa_id ? '' : '<span class="etichetta">esterno</span>'}
            ${d.amministratore ? '<span class="etichetta stato-avviso">amministratore</span>' : ''}<br>${esito}</td>
          <td>${esc(d.nota)}</td>
          <td><input type="time" data-ora-delega="${id}" value="${ora(d.ora_registrazione)}" aria-label="Ora di registrazione" ${blocca}></td>
          <td>
            ${d.scansione_path
              ? `<button type="button" class="secondario" data-azione="mostra" data-delega="${id}">Mostra scansione</button>`
              : '<span class="etichetta stato-avviso">Senza scansione</span>'}
            ${ctx.solaLettura ? '' : `<label class="bottone secondario">${d.scansione_path ? 'Sostituisci' : 'Carica scansione'}
              <input type="file" accept="${TIPI_FILE}" data-scansione="${id}" hidden></label>`}
          </td>
          <td class="tasti">${ctx.solaLettura ? '' : `<button type="button" class="secondario" data-azione="elimina" data-delega="${id}">Elimina</button>`}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="nota">Nessuna delega registrata.</td></tr>'}</tbody>
    </table></div>`;
}

export function schedaDeleghe(ctx, contenitore) {
  if (ctx.assemblea.stato === 'bozza') {
    contenitore.innerHTML = nonAperta('le deleghe');
    return;
  }
  const { avvisi } = ctx.seduta;
  contenitore.innerHTML = `
    ${avvisi.length ? `
      <div class="avviso" role="status">
        <strong>Controlli sulle deleghe: ${avvisi.length} ${avvisi.length === 1 ? 'avviso' : 'avvisi'}</strong>
        <ul>${avvisi.map((a) => `<li>${esc(a.messaggio)}</li>`).join('')}</ul>
        <span class="nota">Sono avvisi, non blocchi: come procedere lo decide l'assemblea.</span>
      </div>` : '<p class="nota">Controlli sulle deleghe: nessun avviso.</p>'}
    ${archivio(ctx)}
    ${ctx.solaLettura ? '' : modulo(ctx)}`;

  contenitore.onclick = async (evento) => {
    const { azione, delega: id } = evento.target.dataset;
    if (azione === 'mostra') {
      const bottone = evento.target;
      const d = ctx.deleghe.find((x) => x.id === id);
      bottone.disabled = true;
      try {
        const url = await ctx.deposito.urlFile(BUCKET, d.scansione_path);
        // un collegamento da premere invece di una finestra aperta dal codice, che il browser bloccherebbe
        bottone.outerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">Apri la scansione</a>`;
      } catch (errore) {
        bottone.disabled = false;
        bottone.textContent = 'Mostra scansione (riprova)';
        bottone.insertAdjacentHTML('afterend', `<br><span class="neg" role="alert">${esc(errore.message)}</span>`);
      }
    }
    if (azione === 'elimina') {
      if (!(await conferma('Eliminare questa delega? La testa delegante torna assente, se non è presente di persona.', 'Elimina delega'))) return;
      // prima la riga, poi la scansione: riprovando dopo un errore a metà nessuno dei due passi fa danni
      const scansione = ctx.deleghe.find((x) => x.id === id)?.scansione_path;
      ctx.esegui(async () => {
        await ctx.deposito.elimina('deleghe', { id });
        if (scansione) await ctx.deposito.eliminaFile(BUCKET, scansione);
      });
    }
  };

  contenitore.onchange = (evento) => {
    const bersaglio = evento.target;
    if (bersaglio.dataset.scansione && bersaglio.files[0]) {
      const file = bersaglio.files[0];
      ctx.esegui(() => allegaScansione(ctx, bersaglio.dataset.scansione, file));
    }
    if (bersaglio.dataset.oraDelega) {
      const d = ctx.deleghe.find((x) => x.id === bersaglio.dataset.oraDelega);
      if (!bersaglio.value || !d) { schedaDeleghe(ctx, contenitore); return; }
      ctx.esegui(() => ctx.deposito.aggiorna('deleghe', { id: d.id }, { ora_registrazione: conOra(d.ora_registrazione, bersaglio.value) }));
    }
    // delegato condomino oppure esterno: si mostra solo il campo che serve
    if (bersaglio.name === 'genere' || bersaglio.name === 'amministratore') {
      const form = bersaglio.form;
      const esterno = form.genere.value === 'esterno';
      form.delegato_testa.hidden = esterno;
      form.delegato_esterno.hidden = !esterno;
      if (bersaglio.name === 'amministratore' && bersaglio.checked) {
        form.genere.value = 'esterno';
        form.delegato_testa.hidden = true;
        form.delegato_esterno.hidden = false;
        if (!form.delegato_esterno.value) form.delegato_esterno.value = 'Amministratore';
      }
    }
  };

  contenitore.onsubmit = (evento) => {
    evento.preventDefault();
    const form = evento.target;
    const errore = form.querySelector('#delega-errore');
    const esterno = form.genere.value === 'esterno';
    const delegante = form.delegante.value;
    const delegatoTesta = esterno ? null : form.delegato_testa.value || null;
    const delegatoEsterno = esterno ? form.delegato_esterno.value.trim() || null : null;
    errore.textContent = !delegatoTesta && !delegatoEsterno ? 'Indica il delegato: un condomino dell\'elenco oppure il nome della persona esterna.'
      : delegatoTesta === delegante ? 'Una testa non può delegare sé stessa.' : '';
    if (errore.textContent) return;
    const file = form.scansione.files[0] ?? null;
    const riga = {
      assemblea_id: ctx.assemblea.id, delegante_testa_id: delegante, delegato_testa_id: delegatoTesta, delegato_esterno: delegatoEsterno,
      amministratore: form.amministratore.checked, nota: form.nota.value.trim() || null, ora_registrazione: new Date().toISOString(),
    };
    // La delega si registra anche se il caricamento della scansione fallisce: resta in archivio "senza scansione".
    // Riprovando non si crea un doppione: la riga già inserita viene riusata.
    let inserita = null;
    ctx.esegui(async () => {
      inserita ??= (await ctx.deposito.inserisci('deleghe', [riga]))[0];
      if (file) await allegaScansione(ctx, inserita.id, file);
    });
  };
}
