// Verbali: per ogni assemblea un testo libero, un file allegato (bucket privato `verbali`) e lo stato bozza/definitivo.
// Un verbale caricato in Documenti (tipo «Verbale», collegato all'assemblea o con la sua data nel titolo) compare qui da solo:
// non serve caricarlo una seconda volta.
import { deposito } from '../dati/client.js';
import { esc } from '../ui/html.js';
import { creaEsecutore, estensione } from '../ui/esegui.js';
import { STATI, STATI_VERBALE, titoloAssemblea, conferma } from './assemblea/comuni.js';
import { ARCHIVIO_DOCUMENTI, assembleaDi } from '../dati/documenti.js';

const BUCKET = 'verbali';
const TIPI_FILE = 'application/pdf,image/*,.doc,.docx,.odt';

function scheda(a, verbale, aperta, documenti = []) {
  const v = verbale ?? { stato: 'bozza', testo: '', file_path: null };
  const fermo = v.stato === 'definitivo' ? 'disabled' : '';
  return `
    <details class="gruppo verbale" data-assemblea="${esc(a.id)}" ${aperta ? 'open' : ''}>
      <summary>
        <span>${esc(titoloAssemblea(a))} <span class="etichetta stato-${esc(a.stato)}">${esc(STATI[a.stato])}</span></span>
        <span>${verbale ? `<span class="etichetta ${v.stato === 'definitivo' ? 'stato-presente' : 'stato-avviso'}">verbale: ${esc(STATI_VERBALE[v.stato]).toLowerCase()}</span>` : '<span class="etichetta">nessun verbale</span>'}
          ${v.file_path ? '<span class="etichetta stato-delega">file allegato</span>' : ''}
          ${documenti.length ? '<span class="etichetta stato-delega">file in Documenti</span>' : ''}</span>
      </summary>
      <form class="modulo" data-verbale="${esc(verbale?.id ?? '')}">
        <label>Stato <select name="stato">${Object.entries(STATI_VERBALE).map(([k, n]) => `<option value="${k}" ${k === v.stato ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <p class="nota largo">${v.stato === 'definitivo' ? 'Il verbale è definitivo: testo e file sono bloccati. Per modificarli riportalo in bozza e salva.' : 'Finché è in bozza testo e file si possono cambiare.'}
          <a href="#/assemblee/${encodeURIComponent(a.id)}/report">Vai al report dell'assemblea</a></p>
        <label class="largo">Testo del verbale <textarea name="testo" rows="8" ${fermo} placeholder="Facoltativo: il verbale si può anche solo allegare come file">${esc(v.testo)}</textarea></label>
        ${documenti.length ? `<div class="largo">Dai Documenti: ${documenti.map((d) => `<button type="button" class="secondario" data-azione="apri-documento" data-documento="${esc(d.id)}">${esc(d.titolo)}</button>`).join(' ')}
          ${v.file_path ? '' : '<br><span class="nota">Il file è già in Documenti: qui non serve allegarlo di nuovo.</span>'}</div>` : ''}
        <div class="largo">
          ${v.file_path
            ? `<span>File allegato: <button type="button" class="secondario" data-azione="apri-file">Mostra il file</button>
               ${fermo ? '' : '<button type="button" class="secondario" data-azione="togli-file">Togli il file</button>'}</span>`
            : documenti.length ? '' : '<span class="nota">Nessun file allegato.</span>'}
        </div>
        <label class="largo">${v.file_path ? 'Sostituisci il file' : 'Allega il file'} (PDF, immagine o documento)
          <input type="file" name="file" accept="${TIPI_FILE}" ${fermo}></label>
        <div class="azioni"><button type="submit">Salva il verbale</button></div>
      </form>
    </details>`;
}

export async function verbali(stato, contenitore, assembleaScelta) {
  let attiva = true;
  stato.allUscita = () => { attiva = false; };
  contenitore.innerHTML = `
    <header class="testata">
      <h1>Verbali</h1>
      <p class="nota">Per ogni assemblea il testo del verbale, il file firmato e lo stato. Il report con presenze e voti si stampa dalla scheda Report dell'assemblea.
        <a href="#/deleghe">Archivio delle deleghe per condomino</a></p>
    </header>
    <div id="verbali-errore" class="avviso grave" role="alert" hidden></div>
    <div id="verbali-elenco"><p class="nota">Caricamento…</p></div>`;
  const elenco = contenitore.querySelector('#verbali-elenco');
  const aperte = new Set(assembleaScelta ? [assembleaScelta] : []);
  let righe = [];
  let verbaliInDocumenti = new Map();
  let prima = true;

  const carica = async () => {
    const [assemblee, tutti, documenti] = await Promise.all([deposito.leggi('assemblee'), deposito.leggi('verbali'), deposito.leggi('documenti')]);
    if (!attiva) return;
    righe = tutti;
    assemblee.sort((a, b) => (a.data < b.data ? 1 : -1));
    // i verbali caricati in Documenti, ciascuno sotto la sua assemblea (collegata, oppure riconosciuta dalla data)
    verbaliInDocumenti = new Map();
    for (const d of documenti.filter((x) => x.tipo === 'verbale' && x.file_path)) {
      const voce = { titolo: d.titolo, data: d.data_documento, tipo: 'verbale', assemblea: assemblee.find((a) => a.id === d.assemblea_id) ?? null };
      const a = assembleaDi(voce, assemblee);
      if (!a) continue;
      if (!verbaliInDocumenti.has(a.id)) verbaliInDocumenti.set(a.id, []);
      verbaliInDocumenti.get(a.id).push(d);
    }
    elenco.innerHTML = assemblee.map((a) => scheda(a, tutti.find((v) => v.assemblea_id === a.id), aperte.has(a.id), verbaliInDocumenti.get(a.id))).join('')
      || '<p class="nota">Nessuna assemblea registrata.</p>';
    if (prima && assembleaScelta) elenco.querySelector(`[data-assemblea="${CSS.escape(assembleaScelta)}"]`)?.scrollIntoView({ block: 'nearest' });
    prima = false;
  };
  const { esegui, mostra } = creaEsecutore(contenitore.querySelector('#verbali-errore'), carica);
  const primaLettura = () => carica().catch((errore) => attiva && mostra(`Non è stato possibile leggere i verbali: ${errore.message}`, primaLettura));

  // quali assemblee sono aperte si ricorda, così un salvataggio non le richiude
  elenco.addEventListener('toggle', (evento) => {
    const id = evento.target.dataset?.assemblea;
    if (!id) return;
    if (evento.target.open) aperte.add(id); else aperte.delete(id);
  }, true);

  elenco.onsubmit = (evento) => {
    evento.preventDefault();
    const form = evento.target;
    const assembleaId = form.closest('details').dataset.assemblea;
    const esistente = righe.find((v) => v.id === form.dataset.verbale);
    // un verbale definitivo ha i campi bloccati: si salva solo lo stato
    const valori = { stato: form.stato.value, ...(form.testo.disabled ? {} : { testo: form.testo.value.trim() || null }) };
    const file = form.file.disabled ? null : form.file.files[0] ?? null;
    let verbale = esistente ?? null;
    esegui(async () => {
      // riprovando dopo un errore non si crea un secondo verbale: la riga già inserita viene riusata
      verbale = verbale ? (await deposito.aggiorna('verbali', { id: verbale.id }, valori))[0] ?? verbale
        : (await deposito.inserisci('verbali', [{ assemblea_id: assembleaId, ...valori }]))[0];
      if (file) {
        const percorso = await deposito.caricaFile(BUCKET, `${assembleaId}/${verbale.id}.${estensione(file)}`, file);
        await deposito.aggiorna('verbali', { id: verbale.id }, { file_path: percorso });
        if (esistente?.file_path && esistente.file_path !== percorso) await deposito.eliminaFile(BUCKET, esistente.file_path);
      }
    });
  };

  elenco.onclick = async (evento) => {
    const azione = evento.target.dataset.azione;
    if (!azione) return;
    if (azione === 'apri-documento') {
      const bottone = evento.target;
      const doc = [...verbaliInDocumenti.values()].flat().find((d) => d.id === bottone.dataset.documento);
      bottone.disabled = true;
      try {
        const url = await deposito.urlFile(ARCHIVIO_DOCUMENTI, doc.file_path);
        bottone.outerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">Apri «${esc(doc.titolo)}»</a>`;
      } catch (errore) {
        bottone.disabled = false;
        mostra(`Il file non si apre: ${errore.message}`, () => bottone.click());
      }
      return;
    }
    const verbale = righe.find((v) => v.id === evento.target.closest('form').dataset.verbale);
    if (!verbale?.file_path) return;
    if (azione === 'apri-file') {
      const bottone = evento.target;
      bottone.disabled = true;
      try {
        const url = await deposito.urlFile(BUCKET, verbale.file_path);
        // un collegamento da premere invece di una finestra aperta dal codice, che il browser bloccherebbe
        bottone.outerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">Apri il file</a>`;
      } catch (errore) {
        bottone.disabled = false;
        mostra(`Il file non si apre: ${errore.message}`, () => bottone.click());
      }
    }
    if (azione === 'togli-file') {
      if (!(await conferma('Togliere il file allegato al verbale? Il file viene eliminato dall\'archivio.', 'Togli il file'))) return;
      esegui(async () => {
        await deposito.aggiorna('verbali', { id: verbale.id }, { file_path: null });
        await deposito.eliminaFile(BUCKET, verbale.file_path);
      });
    }
  };

  await primaLettura();
}
