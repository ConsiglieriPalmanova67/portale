// Elenco delle assemblee in tre gruppi (pianificate, in corso, concluse), con i documenti di ciascuna;
// creazione a mano e importazione della convocazione da PDF (importa.js).
import { deposito } from '../../dati/client.js';
import { esc } from '../../ui/html.js';
import { creaEsecutore } from '../../ui/esegui.js';
import { contaEsiti } from '../../assemblea/delibere.js';
import { TIPI, CONVOCAZIONI, STATI_VERBALE, ARCHIVIO_VERBALI, ESITO_A_MANO, titoloAssemblea, quando, apriFile } from './comuni.js';
import { importaConvocazione } from './importa.js';

const opzioni = (voci, scelta) => Object.entries(voci).map(([valore, nome]) => `<option value="${valore}" ${valore === scelta ? 'selected' : ''}>${esc(nome)}</option>`).join('');

const perData = (a, b) => (a.data === b.data ? String(a.ora ?? '').localeCompare(String(b.ora ?? '')) : a.data < b.data ? -1 : 1);

function cellaVerbale(a, verbale) {
  const pagina = `#/verbali/${encodeURIComponent(a.id)}`;
  if (!verbale) return a.stato === 'chiusa' ? `<a href="${pagina}">Verbale da caricare</a>` : '<span class="spento">—</span>';
  const stato = `<span class="etichetta ${verbale.stato === 'definitivo' ? 'stato-presente' : 'stato-avviso'}">${esc(STATI_VERBALE[verbale.stato]).toLowerCase()}</span>`;
  return verbale.file_path
    ? `<button type="button" class="secondario" data-file="verbale" data-assemblea="${esc(a.id)}">Scarica il verbale</button> ${stato}`
    : `<a href="${pagina}">${a.stato === 'chiusa' ? 'Verbale da caricare' : 'Verbale'}</a> ${stato} <span class="nota">solo testo</span>`;
}

// Quanti punti e, dove ce ne sono, con quali esiti: "2 approvate · 1 respinta".
function cellaPunti(a, punti) {
  const c = contaEsiti(punti);
  const senzaEsito = a.stato === 'chiusa' ? c.da_votare : 0;
  const voci = [
    c.approvata ? `${c.approvata} ${c.approvata === 1 ? 'approvata' : 'approvate'}` : '',
    c.respinta ? `${c.respinta} ${c.respinta === 1 ? 'respinta' : 'respinte'}` : '',
    c.non_deliberata ? `${c.non_deliberata} non ${c.non_deliberata === 1 ? 'deliberata' : 'deliberate'}` : '',
    senzaEsito ? `${senzaEsito} senza esito` : '',
  ].filter(Boolean);
  return `${punti.length}${voci.length ? `<br><span class="nota">${voci.join(' · ')}</span>` : ''}${c.manuali ? `<br><span class="etichetta">${ESITO_A_MANO}</span>` : ''}`;
}

function gruppo(titolo, assemblee, vuoto, dati) {
  return `
    <h2>${titolo} <span class="nota">(${assemblee.length})</span></h2>
    ${assemblee.length ? `<div class="scorri"><table>
      <thead><tr><th>Data e ora</th><th>Tipo</th><th>Luogo</th><th>Punti ed esiti</th><th>Convocazione</th><th>Verbale</th><th></th></tr></thead>
      <tbody>${assemblee.map((a) => `
        <tr>
          <td><a href="#/assemblee/${encodeURIComponent(a.id)}" title="${esc(titoloAssemblea(a))}"><strong>${esc(quando(a.data, a.ora))}</strong></a></td>
          <td>${esc(TIPI[a.tipo])}<br><span class="nota">${esc(CONVOCAZIONI[a.convocazione]).toLowerCase()}</span></td>
          <td>${esc(a.luogo)}</td>
          <td>${cellaPunti(a, dati.punti.get(a.id) ?? [])}</td>
          <td>${a.convocazione_path
            ? `<button type="button" class="secondario" data-file="convocazione" data-assemblea="${esc(a.id)}">Scarica la convocazione</button>`
            : '<span class="spento">—</span>'}</td>
          <td>${cellaVerbale(a, dati.verbali.get(a.id))}</td>
          <td><a href="#/assemblee/${encodeURIComponent(a.id)}">Apri</a></td>
        </tr>`).join('')}</tbody>
    </table></div>` : `<p class="nota">${vuoto}</p>`}`;
}

export async function elencoAssemblee(stato, contenitore) {
  // se nel frattempo si cambia pagina, questa non deve più disegnare
  let attiva = true;
  stato.allUscita = () => { attiva = false; };

  contenitore.innerHTML = `
    <header class="testata">
      <h1>Assemblee</h1>
      <p class="nota">Ogni assemblea ha il suo ordine del giorno, le presenze, le deleghe e le votazioni. Le teste si congelano all'apertura della seduta.
        Un'assemblea del passato si crea o si importa come le altre e poi, dalla sua pagina, si registra come già svolta.
        <a href="#/delibere">Registro delle delibere</a> · <a href="#/deleghe">Archivio delle deleghe per condomino</a></p>
    </header>
    <div class="doc-layout">
    <aside class="doc-laterale riquadro-laterale">
      <h2>Importa la convocazione</h2>
      <p class="nota">Dal PDF della convocazione si leggono data, ora, luogo e ordine del giorno; prima di salvare vedi l'anteprima.</p>
      <div class="azioni">
        <button type="button" id="importa-pdf">Importa convocazione da PDF</button>
        <input type="file" id="file-convocazione" accept="application/pdf,.pdf" hidden>
      </div>
      <h2>Nuova assemblea</h2>
    <form id="nuova" class="modulo">
      <label>Data <input type="date" name="data" required value="${stato.oggi}"></label>
      <label>Ora <input type="time" name="ora"></label>
      <label>Tipo <select name="tipo">${opzioni(TIPI, 'ordinaria')}</select></label>
      <label>Convocazione <select name="convocazione">${opzioni(CONVOCAZIONI, 'seconda')}</select></label>
      <label class="largo">Luogo <input type="text" name="luogo" placeholder="Per esempio: sala comune"></label>
      <div class="azioni"><button type="submit">Crea assemblea</button></div>
      <p id="nuova-errore" class="errore" role="alert"></p>
    </form>
    </aside>
    <div>
      <div id="importazione"></div>
      <div id="elenco-errore" class="avviso grave" role="alert" hidden></div>
      <div id="elenco"><p class="nota">Caricamento…</p></div>
    </div>
    </div>`;

  const elenco = contenitore.querySelector('#elenco');
  let assemblee = [];
  let verbali = new Map();

  const leggi = async () => {
    const [tutte, punti, tuttiVerbali] = await Promise.all([deposito.leggi('assemblee'), deposito.leggi('punti_odg'), deposito.leggi('verbali')]);
    if (!attiva) return;
    assemblee = tutte;
    // come nella pagina dei verbali: se un'assemblea ne ha più d'uno vale il primo
    verbali = new Map(tuttiVerbali.reverse().map((v) => [v.assemblea_id, v]));
    const puntiPerAssemblea = new Map();
    for (const p of punti) puntiPerAssemblea.set(p.assemblea_id, [...(puntiPerAssemblea.get(p.assemblea_id) ?? []), p]);
    const dati = { punti: puntiPerAssemblea, verbali };
    const con = (statoAssemblea) => tutte.filter((a) => a.stato === statoAssemblea).sort(perData);
    elenco.innerHTML = `
      ${gruppo('Pianificate', con('bozza'), 'Nessuna assemblea pianificata: importa una convocazione o creane una dal riquadro a sinistra.', dati)}
      ${gruppo('In corso', con('in_corso'), 'Nessuna seduta aperta in questo momento.', dati)}
      ${gruppo('Concluse', con('chiusa').reverse(), 'Nessuna assemblea conclusa.', dati)}`;
  };
  const { mostra } = creaEsecutore(contenitore.querySelector('#elenco-errore'), leggi);
  const carica = () => leggi().catch((errore) => attiva && mostra(`Non è stato possibile leggere le assemblee: ${errore.message}`, carica));

  // scarico dei documenti: l'indirizzo del file è temporaneo, si chiede al momento
  elenco.onclick = async (evento) => {
    const bottone = evento.target.closest('[data-file]');
    if (!bottone) return;
    const id = bottone.dataset.assemblea;
    const percorso = bottone.dataset.file === 'verbale' ? verbali.get(id)?.file_path : assemblee.find((a) => a.id === id)?.convocazione_path;
    if (!percorso) return;
    try {
      await apriFile(deposito, ARCHIVIO_VERBALI, percorso, bottone);
    } catch (errore) {
      mostra(`Il file non si apre: ${errore.message}`, () => bottone.click());
    }
  };

  // importazione: la scelta del file apre l'anteprima; nulla viene salvato finché non la si conferma
  const sceltaFile = contenitore.querySelector('#file-convocazione');
  contenitore.querySelector('#importa-pdf').addEventListener('click', () => sceltaFile.click());
  sceltaFile.addEventListener('change', () => {
    const file = sceltaFile.files[0];
    sceltaFile.value = '';
    if (!file) return;
    importaConvocazione(contenitore.querySelector('#importazione'), file, {
      deposito,
      esistenti: () => assemblee,
      scegliAltro: () => sceltaFile.click(),
      allaChiusura: carica,
    });
    contenitore.querySelector('#importazione').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  const modulo = contenitore.querySelector('#nuova');
  modulo.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const bottone = modulo.querySelector('button[type="submit"]');
    const errore = modulo.querySelector('#nuova-errore');
    const valori = Object.fromEntries(new FormData(modulo));
    errore.textContent = '';
    bottone.disabled = true;
    try {
      const [creata] = await deposito.inserisci('assemblee', [{
        data: valori.data, ora: valori.ora || null, tipo: valori.tipo, convocazione: valori.convocazione, luogo: valori.luogo.trim() || null, stato: 'bozza',
      }]);
      location.hash = `#/assemblee/${encodeURIComponent(creata.id)}`;
    } catch (e) {
      // i dati restano nel modulo: basta premere di nuovo per riprovare
      errore.textContent = `Assemblea non creata: ${e.message} Premi di nuovo "Crea assemblea" per riprovare.`;
    } finally {
      bottone.disabled = false;
    }
  });

  await carica();
}
