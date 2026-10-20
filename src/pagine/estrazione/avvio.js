// Avvio di un'estrazione dalla pagina Documenti: si scelgono tipo e anno e si conferma, sapendo che il documento
// viene inviato a un servizio esterno e che la lettura ha un costo. Solo dopo la conferma nasce la riga in `estrazioni`.
import { esc } from '../../ui/html.js';
import { inProva } from '../../dati/client.js';

export const TIPI_ESTRAZIONE = { fascicolo_rendiconto: 'Fascicolo di rendiconto' };
export const STATI_ESTRAZIONE = { indice: 'mappa delle sezioni', lettura: 'lettura delle sezioni', revisione: 'in revisione', importata: 'importata', annullata: 'annullata' };
// Un'estrazione ancora aperta: si riprende quella, non se ne avvia un'altra.
export const aperta = (e) => ['indice', 'lettura', 'revisione'].includes(e.stato);
export const ePdfInArchivio = (documento) => /\.pdf$/i.test(documento?.file_path ?? '');

const AVVISO = `<strong>Il documento esce dal portale.</strong> Per leggerlo, le sue pagine vengono inviate a un servizio esterno
  (Claude, di Anthropic), che le elabora e restituisce i dati. <strong>La lettura ha un costo a consumo</strong>, addebitato sull'account
  Anthropic del condominio in base alla quantità di testo letta e scritta (i «token»): per un fascicolo di 60-70 pagine si tratta
  di qualche decina di chiamate. A fine lettura il portale mostra i token usati.`;

// Chiede tipo e anno e la conferma. → { tipo, anno } oppure null se si annulla.
export function chiediAvvio(documento) {
  return new Promise((risolvi) => {
    const finestra = document.createElement('dialog');
    finestra.className = 'conferma avvio-estrazione';
    finestra.innerHTML = `
      <form method="dialog" class="modulo">
        <h2 class="largo">Estrai i dati da «${esc(documento.titolo)}»</h2>
        <label>Tipo di documento <select name="tipo">${Object.entries(TIPI_ESTRAZIONE).map(([valore, nome]) => `<option value="${valore}">${esc(nome)}</option>`).join('')}</select></label>
        <label>Anno dell'esercizio (consuntivo) <input type="number" name="anno" min="2000" max="2100" step="1" required value="${esc(documento.anno ?? '')}"></label>
        <p class="avviso largo">${AVVISO}</p>
        ${inProva ? '<p class="avviso fatto largo">In modalità prova non viene inviato nulla e non si spende nulla: la lettura è simulata su un fascicolo di fantasia.</p>' : ''}
        <p class="nota largo">Nulla entra nella contabilità finché non rivedi i dati e confermi l'importazione. Un'estrazione interrotta si può riprendere da dove era.</p>
        <p class="errore" role="alert"></p>
        <div class="azioni">
          <button type="button" class="secondario" value="no">Annulla</button>
          <button type="submit" value="si">Invia il documento e avvia la lettura</button>
        </div>
      </form>`;
    const form = finestra.querySelector('form');
    const chiudi = (esito) => {
      if (!finestra.isConnected) return;
      finestra.close();
      finestra.remove();
      risolvi(esito);
    };
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const anno = Number(form.anno.value);
      if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) {
        form.querySelector('.errore').textContent = 'Scrivi l\'anno dell\'esercizio a cui si riferisce il rendiconto.';
        return;
      }
      chiudi({ tipo: form.tipo.value, anno });
    });
    finestra.addEventListener('click', (evento) => evento.target.value === 'no' && chiudi(null));
    finestra.addEventListener('close', () => chiudi(null));
    document.body.append(finestra);
    finestra.showModal();
  });
}

// Tasto o collegamento da mettere accanto a un documento PDF dell'archivio.
// `estrazioni`: le estrazioni di quel documento (null se le tabelle delle estrazioni non ci sono ancora).
export function azioneEstrazione(documento, estrazioni, chiave) {
  if (!ePdfInArchivio(documento) || !estrazioni) return '';
  if (documento.tipo === 'convocazione') return `<button type="button" class="secondario" data-azione="convocazione" data-chiave="${esc(chiave)}">Crea l'assemblea</button>`;
  if (documento.tipo === 'verbale') {
    const letture = estrazioni.filter((e) => e.tipo === 'verbale');
    const inCorso = letture.find(aperta);
    return `${inCorso
      ? `<a class="bottone" href="#/lettura-verbale/${encodeURIComponent(inCorso.id)}">Riprendi la lettura del verbale</a>`
      : `<button type="button" class="secondario" data-azione="verbale" data-chiave="${esc(chiave)}">Leggi il verbale</button>`}
      ${letture.filter((e) => e.stato === 'importata').map((e) => `<br><a class="nota" href="#/lettura-verbale/${encodeURIComponent(e.id)}">verbale letto e registrato</a>`).join('')}`;
  }
  const fascicoli = estrazioni.filter((e) => e.tipo !== 'verbale');
  const inCorso = fascicoli.find(aperta);
  const importate = fascicoli.filter((e) => e.stato === 'importata');
  return `${inCorso
    ? `<a class="bottone" href="#/estrazione/${encodeURIComponent(inCorso.id)}">Riprendi l'estrazione (${esc(STATI_ESTRAZIONE[inCorso.stato])})</a>`
    : `<button type="button" class="secondario" data-azione="estrai" data-chiave="${esc(chiave)}">Estrai i dati</button>`}
    ${importate.map((e) => `<br><a class="nota" href="#/estrazione/${encodeURIComponent(e.id)}">estrazione ${esc(e.anno)} importata</a>`).join('')}`;
}

// Per un verbale: l'assemblea a cui appartiene e la conferma dell'invio. → id dell'assemblea, oppure null se si annulla.
export function chiediVerbale(documento, assemblee, predefinita = documento.assemblea_id) {
  return new Promise((risolvi) => {
    const ordinate = [...assemblee].sort((a, b) => b.data.localeCompare(a.data));
    const finestra = document.createElement('dialog');
    finestra.className = 'conferma avvio-estrazione';
    finestra.innerHTML = `
      <form method="dialog" class="modulo">
        <h2 class="largo">Leggi il verbale «${esc(documento.titolo)}»</h2>
        ${ordinate.length ? `<label class="largo">Assemblea a cui si riferisce <select name="assemblea" required>
          <option value="">Scegli l'assemblea…</option>
          ${ordinate.map((a) => `<option value="${esc(a.id)}" ${a.id === predefinita ? 'selected' : ''}>Assemblea ${esc(a.tipo)} del ${esc(a.data.split('-').reverse().join('/'))}</option>`).join('')}
        </select></label>` : ''}
        <p class="nota largo">Dal verbale il portale propone esito e sintesi di ogni punto, le cose da fare, i consiglieri e l'amministratore nominati.
          Nulla viene registrato finché non rivedi le proposte e confermi.</p>
        <p class="avviso largo"><strong>Il documento esce dal portale</strong>: viene letto da un servizio esterno (Claude, di Anthropic) con un costo a consumo, per un verbale di poche pagine intorno a 10-30 centesimi.</p>
        ${inProva ? '<p class="avviso fatto largo">In modalità prova non viene inviato nulla: la lettura è simulata.</p>' : ''}
        ${ordinate.length ? '' : '<p class="avviso grave largo">Nel portale non c’è ancora nessuna assemblea: creala prima dalla sua convocazione (tasto «Crea l’assemblea») o dalla pagina Assemblee.</p>'}
        <p class="errore" role="alert"></p>
        <div class="azioni">
          <button type="button" class="secondario" value="no">Annulla</button>
          ${ordinate.length ? '<button type="submit" value="si">Invia il verbale e avvia la lettura</button>' : ''}
        </div>
      </form>`;
    const form = finestra.querySelector('form');
    const chiudi = (esito) => {
      if (!finestra.isConnected) return;
      finestra.close();
      finestra.remove();
      risolvi(esito);
    };
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (!form.assemblea?.value) {
        form.querySelector('.errore').textContent = 'Scegli l’assemblea di cui questo è il verbale.';
        return;
      }
      chiudi(form.assemblea.value);
    });
    finestra.addEventListener('click', (evento) => evento.target.value === 'no' && chiudi(null));
    finestra.addEventListener('close', () => chiudi(null));
    document.body.append(finestra);
    finestra.showModal();
  });
}
