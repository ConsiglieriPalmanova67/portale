// Archivio dei documenti del condominio: rendiconti, preventivi, riparti e ogni altro file, raggruppati per anno.
// I file stanno nel bucket privato `documenti`, in <anno o "senza-anno">/<id del documento>.<estensione>.
// Nell'elenco compaiono anche, in sola lettura, le convocazioni delle assemblee e i verbali con un file:
// restano gestiti dalle loro pagine, ma l'archivio è il punto unico in cui trovarli.
import { deposito } from '../dati/client.js';
import { ARCHIVIO_DOCUMENTI, TIPI_DOCUMENTO, CATEGORIE_DOCUMENTO, LIMITE_FILE, ePdf, percorsoDocumento, archivioUnico, filtraArchivio, quadroPerAnno, assembleaDi } from '../dati/documenti.js';
import { esc, data } from '../ui/html.js';
import { creaEsecutore, estensione } from '../ui/esegui.js';
import { titoloAssemblea, conferma, apriFile } from './assemblea/comuni.js';
import { chiediAvvio, chiediVerbale, azioneEstrazione } from './estrazione/avvio.js';
import { segnaAvvio } from './estrazione/pagina.js';
import { importaConvocazione } from './assemblea/importa.js';
import { riquadroSiti } from './siti-collegati.js';

const megabyte = (byte) => (byte / (1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 1 });
const scelte = (voci, scelta) => voci.map(([valore, nome]) => `<option value="${esc(valore)}" ${String(valore) === String(scelta ?? '') ? 'selected' : ''}>${esc(nome)}</option>`).join('');

// Un documento dentro una scheda: titolo (si apre con un clic), data, note e i tasti per modificarlo.
// `estrazioni`: quelle del documento (null se l'estrazione dei dati non è disponibile).
function voceDocumento(v, estrazioni) {
  const chiave = esc(v.chiave);
  // per convocazioni e verbali l'azione (crea l'assemblea, crea i to-do) sta accanto all'etichetta della scheda
  const azione = ['convocazione', 'verbale'].includes(v.tipo) ? '' : azioneEstrazione(v.documento, estrazioni, v.chiave);
  const dettagli = [v.data ? data(v.data) : '', v.note ?? ''].filter(Boolean);
  return `
    <div class="doc-voce">
      <button type="button" class="collegamento" data-azione="scarica" data-chiave="${chiave}" title="Apri il file">${esc(v.titolo)}</button>
      ${dettagli.length ? `<span class="nota">${esc(dettagli.join(' · '))}</span>` : ''}
      <span class="tasti piccoli">
        <button type="button" class="secondario" data-azione="modifica" data-chiave="${chiave}">Modifica</button>
        <button type="button" class="secondario" data-azione="elimina" data-chiave="${chiave}">Elimina</button>
        ${azione}</span>
    </div>`;
}
const cella = (elenco, vuota, estrazioni) => (elenco.length ? elenco.map((v) => voceDocumento(v, estrazioni(v))).join('') : `<span class="nota">${vuota}</span>`);
// i documenti che non sono né bilancio né assemblea: una scheda per tipo
const TITOLI_ALTRI = { regolamento: 'Regolamento', comunicazione: 'Comunicazioni' };

// categoria: la sezione del menu (#/documenti/<categoria>, vedi CATEGORIE_DOCUMENTO); assente = tutti i documenti.
export async function documenti(stato, contenitore, categoria) {
  let attiva = true;
  stato.allUscita = () => { attiva = false; };
  // estrazioni: null finché le tabelle delle estrazioni non esistono nel database (la pagina funziona lo stesso)
  const d = { documenti: [], assemblee: [], verbali: [], estrazioni: null };
  // la sezione arriva dall'indirizzo: vale solo se è una delle CATEGORIE_DOCUMENTO
  const sezione = Object.hasOwn(CATEGORIE_DOCUMENTO, categoria ?? '') ? CATEGORIE_DOCUMENTO[categoria] : null;
  const filtri = { categoria: sezione ? categoria : '', tipo: '', testo: '' };
  const tipiVisibili = Object.entries(TIPI_DOCUMENTO).filter(([tipo]) => !sezione || sezione.tipi.includes(tipo));
  let voci = [];
  // id del documento in modifica; null = modulo per caricarne uno nuovo
  let inModifica = null;
  // ultimo caricamento tentato ({ id, file }): se fallisce a metà e lo si ripete, l'id resta quello
  let tentativo = null;

  // i gestori stanno su un riquadro della pagina, non sul contenitore comune: cambiando pagina spariscono con lui
  contenitore.innerHTML = `<div id="doc-pagina" class="doc-layout">
    <aside class="doc-laterale"><div id="doc-modulo"></div><div id="doc-siti" class="doc-siti"></div></aside>
    <section class="doc-principale">
    <header class="testata">
      <h1>${sezione ? `Documenti — ${esc(sezione.nome)}` : 'Documenti'}</h1>
      <p class="nota">${sezione ? `Solo i documenti di tipo ${esc(sezione.tipi.map((t) => TIPI_DOCUMENTO[t].toLowerCase()).join(', '))}, anno per anno.`
        : 'L\'archivio dei documenti del condominio, anno per anno: il bilancio (preventivo e consuntivo) e, per ogni assemblea, convocazione e verbale.'}
        Un documento si carica dal riquadro a sinistra.</p>
    </header>
    <div id="doc-errore" class="avviso grave" role="alert" hidden></div>
    <div class="filtri">
      ${tipiVisibili.length > 1 ? `<select id="doc-tipo" aria-label="Filtra per tipo">${scelte([['', 'Tutti i tipi'], ...tipiVisibili], '')}</select>` : ''}
      <input type="search" id="doc-cerca" placeholder="Cerca per titolo" aria-label="Cerca per titolo">
    </div>
    <div id="doc-importazione"></div>
    <div id="doc-elenco"><p class="nota">Caricamento…</p></div>
    </section>
  </div>`;
  const $ = (selettore) => contenitore.querySelector(selettore);
  const pagina = $('#doc-pagina');
  riquadroSiti(pagina.querySelector('#doc-siti'));

  function disegnaElenco() {
    const visibili = filtraArchivio(voci, filtri);
    const filtrato = Boolean(filtri.categoria || filtri.tipo || filtri.testo.trim());
    const estrazioniDi = (v) => (v.documento && d.estrazioni ? d.estrazioni.filter((e) => e.documento_id === v.documento.id) : null);
    const quadro = quadroPerAnno({ voci: visibili, assemblee: d.assemblee });
    const voce = (titolo, contenuto, azione = '') => `<div class="doc-campo"><span class="doc-etichetta">${titolo}${azione ? ` ${azione}` : ''}</span>${contenuto}</div>`;
    const schedaBilancio = (g) => ((!filtrato && g.anno !== null) || g.preventivo.length || g.consuntivo.length ? `
      <article class="doc-scheda bilancio">
        <h3>Bilancio ${g.anno ?? ''}</h3>
        ${voce('Rendiconto preventivo', cella(g.preventivo, 'nessuno', estrazioniDi))}
        ${voce('Rendiconto consuntivo e riparto', cella(g.consuntivo, 'nessuno', estrazioniDi))}
      </article>` : '');
    // accanto a «Convocazione»: l'assemblea c'è già oppure si crea da questa convocazione
    const azioneConvocazione = (r) => (r.assemblea
      ? `<a class="doc-azione" href="#/assemblee/${encodeURIComponent(r.assemblea.id)}">Vai all'assemblea</a>`
      : r.convocazioni.length ? `<button type="button" class="doc-azione" data-azione="convocazione" data-chiave="${esc(r.convocazioni[0].chiave)}">Crea l'assemblea</button>` : '');
    // accanto a «Verbale»: i to-do sono già stati estratti dal verbale oppure si estraggono ora
    const azioneVerbale = (r) => {
      if (!r.verbali.length) return '';
      const letture = r.verbali.flatMap((v) => estrazioniDi(v) ?? []).filter((e) => e.tipo === 'verbale');
      if (letture.some((e) => e.stato === 'importata')) return '<a class="doc-azione" href="#/todo">Vai ai to-do</a>';
      const inCorso = letture.find((e) => ['lettura', 'revisione'].includes(e.stato));
      if (inCorso) return `<a class="doc-azione" href="#/lettura-verbale/${encodeURIComponent(inCorso.id)}">Riprendi i to-do</a>`;
      return `<button type="button" class="doc-azione" data-azione="verbale" data-chiave="${esc(r.verbali[0].chiave)}">Crea i to-do</button>`;
    };
    const schedaAssemblea = (r) => `
      <article class="doc-scheda">
        <h3>${r.assemblea ? esc(titoloAssemblea(r.assemblea)) : r.data ? `Assemblea del ${data(r.data)}` : 'Assemblea (data non riconosciuta)'}</h3>
        ${voce('Convocazione', cella(r.convocazioni, 'nessuna', estrazioniDi), azioneConvocazione(r))}
        ${voce('Verbale', cella(r.verbali, 'nessuno', estrazioniDi), azioneVerbale(r))}
        ${r.assemblea ? voce('Delibere', `<a href="#/assemblee/${encodeURIComponent(r.assemblea.id)}/odg">Esiti e delibere dei punti all'ordine del giorno</a>`) : ''}
      </article>`;
    // altri documenti: una scheda per tipo (Regolamento, Comunicazioni, poi tutti gli altri)
    const schedeAltri = (altri) => [...new Set(altri.map((v) => TITOLI_ALTRI[v.tipo] ?? 'Altri documenti'))].map((titolo) => `
      <article class="doc-scheda"><h3>${esc(titolo)}</h3>${cella(altri.filter((v) => (TITOLI_ALTRI[v.tipo] ?? 'Altri documenti') === titolo), '', estrazioniDi)}</article>`).join('');
    $('#doc-elenco').innerHTML = `
      <p class="nota">${visibili.length} di ${voci.length} documenti.</p>
      ${quadro.map((g) => `
        <section class="doc-anno">
          <h2>${g.anno === null ? 'Senza anno' : esc(g.anno)}</h2>
          <div class="doc-riga">
            ${schedaBilancio(g)}
            ${g.assemblee.map(schedaAssemblea).join('')}
            ${schedeAltri(g.altri)}
          </div>
        </section>`).join('') || `<p class="nota">${voci.length ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento in archivio: caricane uno dal riquadro a sinistra.'}</p>`}`;
  }

  function disegnaModulo() {
    const doc = inModifica ? d.documenti.find((x) => x.id === inModifica) : null;
    if (inModifica && !doc) inModifica = null;
    // un documento nuovo caricato da una sezione nasce del primo tipo della sezione
    const v = doc ?? { titolo: '', tipo: sezione?.tipi[0] ?? 'altro', anno: '', data_documento: '', assemblea_id: '', note: '' };
    $('#doc-modulo').innerHTML = `
      <h2>${doc ? 'Modifica il documento' : 'Carica un documento'}</h2>
      <form class="modulo" id="modulo-documento">
        <label class="largo">${doc ? `Sostituisci il file <span class="nota">(facoltativo: ora c'è ${esc(doc.nome_file ?? 'un file')})</span>` : 'File PDF'}
          <input type="file" name="file" accept="application/pdf,.pdf" ${doc ? '' : 'required'}></label>
        <p class="avviso largo" id="doc-peso" role="status" hidden></p>
        <label class="largo">Titolo <input type="text" name="titolo" required value="${esc(v.titolo)}" placeholder="Per esempio: Rendiconto consuntivo 2025"></label>
        <label>Tipo <select name="tipo">${scelte(Object.entries(TIPI_DOCUMENTO), v.tipo)}</select></label>
        <label>Anno <input type="number" name="anno" min="1900" max="2100" step="1" value="${esc(v.anno)}" placeholder="Facoltativo"></label>
        <label>Data del documento <input type="date" name="data_documento" min="1900-01-01" max="2100-12-31" value="${esc(v.data_documento)}"></label>
        <label>Assemblea collegata <select name="assemblea_id">${scelte([['', 'Nessuna'], ...d.assemblee.map((a) => [a.id, titoloAssemblea(a)])], v.assemblea_id)}</select></label>
        <label class="largo">Note <input type="text" name="note" value="${esc(v.note)}" placeholder="Facoltative"></label>
        <div class="azioni"><button type="submit">${doc ? 'Salva le modifiche' : 'Carica il documento'}</button>
          ${doc ? '<button type="button" class="secondario" data-azione="annulla">Annulla</button>' : ''}</div>
        <p class="errore" role="alert"></p>
      </form>`;
  }

  // Dopo una scrittura si ridisegna solo l'elenco: il modulo resta com'è, così dopo un errore i dati inseriti non si perdono.
  const carica = async () => {
    const [documentiLetti, assemblee, verbali, estrazioni] = await Promise.all([deposito.leggi('documenti'), deposito.leggi('assemblee'), deposito.leggi('verbali'),
      deposito.leggi('estrazioni').catch(() => null)]);
    if (!attiva) return;
    Object.assign(d, { documenti: documentiLetti, verbali, estrazioni, assemblee: assemblee.sort((a, b) => (a.data < b.data ? 1 : -1)) });
    voci = archivioUnico({ ...d, titoloAssemblea }).filter((v) => v.origine === 'documento');
    disegnaElenco();
  };
  const { esegui, mostra } = creaEsecutore($('#doc-errore'), carica);
  const primaLettura = () => carica().then(() => attiva && disegnaModulo())
    .catch((errore) => attiva && mostra(`Non è stato possibile leggere i documenti: ${errore.message}`, primaLettura));

  $('#doc-tipo')?.addEventListener('change', (evento) => { filtri.tipo = evento.target.value; disegnaElenco(); });
  $('#doc-cerca').addEventListener('input', (evento) => { filtri.testo = evento.target.value; disegnaElenco(); });

  pagina.onchange = (evento) => {
    const form = evento.target.form;
    if (form?.id !== 'modulo-documento') return;
    if (evento.target.name === 'file') {
      const file = evento.target.files[0];
      const peso = form.querySelector('#doc-peso');
      peso.hidden = !file || file.size <= LIMITE_FILE;
      peso.textContent = peso.hidden ? '' : `Il file pesa ${megabyte(file.size)} MB: oltre ${megabyte(LIMITE_FILE)} MB l'archivio può rifiutarlo. Se possibile riducilo (per esempio un PDF a risoluzione più bassa) prima di caricarlo.`;
      // il titolo si propone dal nome del file, senza estensione
      if (file && !form.titolo.value.trim()) form.titolo.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    }
    // l'anno si propone dalla data del documento
    if (evento.target.name === 'data_documento' && evento.target.value && !form.anno.value) form.anno.value = evento.target.value.slice(0, 4);
  };

  pagina.onclick = async (evento) => {
    const { azione, chiave } = evento.target.dataset;
    if (!azione) return;
    if (azione === 'annulla') {
      inModifica = null;
      disegnaModulo();
      return;
    }
    const voce = voci.find((v) => v.chiave === chiave);
    if (!voce) return;
    if (azione === 'scarica') {
      const bottone = evento.target;
      try {
        await apriFile(deposito, voce.bucket, voce.percorso, bottone);
      } catch (errore) {
        mostra(`Il file non si apre: ${errore.message}`, () => bottone.click());
      }
    }
    // una convocazione non si estrae come un fascicolo: se ne legge il testo e si crea l'assemblea (come da Assemblee)
    if (azione === 'convocazione') {
      const bottone = evento.target;
      bottone.disabled = true;
      try {
        const risposta = await fetch(await deposito.urlFile(voce.bucket, voce.percorso));
        if (!risposta.ok) throw new Error(`errore ${risposta.status}`);
        const file = new File([await risposta.blob()], voce.nomeFile || 'convocazione.pdf', { type: 'application/pdf' });
        if (!attiva) return;
        importaConvocazione($('#doc-importazione'), file, { deposito, esistenti: () => d.assemblee, scegliAltro: () => { $('#doc-importazione').innerHTML = ''; }, allaChiusura: carica });
      } catch (errore) {
        mostra(`Il file della convocazione non si apre: ${errore.message}`, () => bottone.click());
      } finally {
        bottone.disabled = false;
      }
    }
    if (azione === 'verbale') {
      const assembleaId = await chiediVerbale(voce.documento, d.assemblee, assembleaDi(voce, d.assemblee)?.id);
      if (!assembleaId || !attiva) return;
      const assemblea = d.assemblee.find((x) => x.id === assembleaId);
      esegui(async () => {
        const [creata] = await deposito.inserisci('estrazioni', [{ documento_id: voce.documento.id, tipo: 'verbale', anno: Number(assemblea.data.slice(0, 4)), stato: 'lettura', mappa: { assemblea_id: assembleaId } }]);
        location.hash = `#/lettura-verbale/${encodeURIComponent(creata.id)}`;
      });
    }
    if (azione === 'estrai') {
      const scelta = await chiediAvvio(voce.documento);
      if (!scelta || !attiva) return;
      // la riga nasce qui, dopo la conferma: da questo momento l'estrazione si può riprendere
      esegui(async () => {
        const [creata] = await deposito.inserisci('estrazioni', [{ documento_id: voce.documento.id, tipo: scelta.tipo, anno: scelta.anno, stato: 'indice' }]);
        segnaAvvio(creata.id);
        location.hash = `#/estrazione/${encodeURIComponent(creata.id)}`;
      });
    }
    if (azione === 'modifica') {
      inModifica = voce.documento.id;
      disegnaModulo();
      $('#doc-modulo').scrollIntoView({ block: 'nearest' });
    }
    if (azione === 'elimina') {
      const doc = voce.documento;
      if (!(await conferma(`Eliminare il documento «${doc.titolo}»? Viene eliminato anche il file dall'archivio. L'operazione non si può annullare.`, 'Elimina il documento'))) return;
      if (inModifica === doc.id) {
        inModifica = null;
        disegnaModulo();
      }
      // riprovando dopo un errore a metà: la riga già tolta non è un problema, il file mancante nemmeno
      esegui(async () => {
        await deposito.elimina('documenti', { id: doc.id });
        await deposito.eliminaFile(ARCHIVIO_DOCUMENTI, doc.file_path);
      });
    }
  };

  pagina.onsubmit = async (evento) => {
    evento.preventDefault();
    const form = evento.target;
    if (form.id !== 'modulo-documento') return;
    const errore = form.querySelector('.errore');
    const esistente = inModifica ? d.documenti.find((x) => x.id === inModifica) : null;
    const file = form.file.files[0] ?? null;
    const valori = {
      titolo: form.titolo.value.trim(), tipo: form.tipo.value, anno: form.anno.value ? Number(form.anno.value) : null,
      data_documento: form.data_documento.value || null, assemblea_id: form.assemblea_id.value || null, note: form.note.value.trim() || null,
    };
    errore.textContent = !valori.titolo ? 'Scrivi il titolo del documento.'
      : valori.data_documento && !/^(19|20)\d\d-\d\d-\d\d$/.test(valori.data_documento) ? 'La data del documento non è valida: controlla l’anno (quattro cifre).' : !esistente && !file ? 'Scegli il file da caricare.' : file && !ePdf(file) ? 'Per ora si possono caricare solo file PDF.' : '';
    if (errore.textContent) return;
    if (file && file.size > LIMITE_FILE
      && !(await conferma(`Il file pesa ${megabyte(file.size)} MB: oltre ${megabyte(LIMITE_FILE)} MB l'archivio può rifiutarlo. Provare comunque a caricarlo?`, 'Carica comunque'))) return;
    // l'id si decide qui e resta lo stesso a ogni tentativo (con "Riprova" o inviando di nuovo lo stesso file):
    // dopo un errore a metà il file viene sovrascritto e la riga aggiornata, senza doppioni
    const id = esistente?.id ?? (tentativo?.file === file ? tentativo.id : crypto.randomUUID());
    tentativo = { id, file };
    esegui(async () => {
      if (file) {
        const percorso = await deposito.caricaFile(ARCHIVIO_DOCUMENTI, percorsoDocumento(id, valori.anno, estensione(file)), file);
        await deposito.salva('documenti', [{ id, ...valori, file_path: percorso, nome_file: file.name || null }], ['id']);
        // il file di prima, se stava altrove (altro anno o altra estensione), non serve più
        if (esistente?.file_path && esistente.file_path !== percorso) await deposito.eliminaFile(ARCHIVIO_DOCUMENTI, esistente.file_path);
      } else {
        await deposito.aggiorna('documenti', { id }, valori);
      }
      tentativo = null;
      inModifica = null;
      if (attiva) disegnaModulo();
    });
  };

  await primaLettura();
}
