// Fase di revisione: esito dei controlli, dati per sezione con le celle segnalate in evidenza e modificabili,
// pagina del PDF accanto. Le correzioni si salvano in estrazioni.correzioni ({ celle, ruoli, accettati }) e non
// toccano i dati letti: a ogni correzione dati e controlli si ricalcolano da capo. Da qui parte l'importazione.
import { esc } from '../../ui/html.js';
import { assembla, applicaCorrezioni, leggiIn, elencoCorrezioni } from '../../estrazione/assembla.js';
import { controlla, daRisolvere } from '../../estrazione/controlli.js';
import { controlliDatabase } from '../../estrazione/controlli-db.js';
import { chiaveBlocco, TIPI_SEZIONE } from '../../estrazione/blocchi.js';
import { creaTabelle, SCHEDE } from './tabelle.js';
import { creaVistaPdf } from './vista-pdf.js';
import { preparaImportazione, mostraConfronto } from './importazione.js';
import { conferma } from '../assemblea/comuni.js';

const LIVELLI = { errore: 'Errori', avviso: 'Avvisi', ok: 'Controlli che tornano' };
const paginaDi = (origine) => Number(/:(\d+)\|/.exec(origine ?? '')?.[1]) || null;

export function faseRevisione(ctx, zona) {
  const { estrazione, stato } = ctx;
  const modificabile = estrazione.stato === 'revisione';
  const vista = { scheda: null, parte: 1, soloSegnalate: false };
  // ricalcolati a ogni correzione
  let dati;
  let esiti;
  let tabelle;

  const correzioni = () => ({ celle: {}, ruoli: {}, accettati: {}, ...(estrazione.correzioni ?? {}) });
  function calcola() {
    const c = correzioni();
    dati = assembla(ctx.righe, c);
    esiti = [...controlla(dati), ...controlliDatabase({ riparto: dati.riparto, db: stato.dati, anno: Number(estrazione.anno), oggi: stato.oggi })];
    // cella → come va evidenziata: la cella indicata dal controllo, e più tenui le altre coinvolte e quelle dei controlli accettati
    const segni = new Map();
    for (const e of esiti.filter((x) => x.livello !== 'ok')) {
      const accettato = Boolean(c.accettati[e.chiave]);
      for (const k of e.dove.origini ?? []) if (!segni.has(k)) segni.set(k, 'coinvolta');
      if (e.dove.origine && segni.get(e.dove.origine) !== 'errore') segni.set(e.dove.origine, accettato ? 'coinvolta' : e.livello);
    }
    const corrette = Object.fromEntries(elencoCorrezioni(ctx.righe, c.celle).map((x) => [x.chiave, String(x.letto ?? '')]));
    tabelle = creaTabelle({ segni, corrette, modificabile });
    const presenti = SCHEDE.filter(([id]) => dati[id]);
    if (!presenti.some(([id]) => id === vista.scheda)) vista.scheda = presenti[0]?.[0] ?? null;
  }

  zona.innerHTML = `
    <section class="revisione">
      ${modificabile ? '' : `<p class="avviso fatto" role="status"><strong>Importazione completata.</strong> I dati dell'esercizio ${esc(estrazione.anno)} sono nella contabilità:
        <a href="#/contabilita/${encodeURIComponent(estrazione.anno)}/spese">apri la contabilità ${esc(estrazione.anno)}</a>. Qui sotto restano i dati letti e le correzioni fatte, in sola consultazione.</p>`}
      <div id="rev-controlli"></div>
      <div class="rev-corpo">
        <div class="rev-dati"><div id="rev-schede"></div><div id="rev-tabella"></div><div id="rev-correzioni"></div></div>
        <aside class="rev-pdf" id="rev-pdf" aria-label="Pagina del documento"></aside>
      </div>
      <div id="rev-importazione"></div>
    </section>`;
  const $ = (selettore) => zona.querySelector(selettore);
  const pdf = creaVistaPdf($('#rev-pdf'), ctx.file);
  ctx.allUscita(() => pdf.chiudi());

  function disegnaControlli() {
    const c = correzioni();
    const aperti = daRisolvere(esiti, c.accettati);
    const gruppo = (livello) => {
      const suoi = esiti.filter((e) => e.livello === livello);
      if (!suoi.length) return '';
      return `
        <details class="gruppo esiti-${livello}" ${livello === 'ok' ? '' : 'open'}>
          <summary><span>${LIVELLI[livello]}</span><span class="nota">${suoi.length}</span></summary>
          ${modificabile ? Object.entries(Object.groupBy(suoi.filter((e) => (e.livello === 'errore' || e.daConfermare) && !c.accettati[e.chiave]), (e) => e.codice))
            .filter(([, stessi]) => stessi.length > 1)
            .map(([codice, stessi]) => `<p class="tasti"><button type="button" class="secondario" data-azione="accetta-tutti" data-codice="${esc(codice)}">Accetta così tutte le ${stessi.length} segnalazioni di questo tipo</button></p>`).join('') : ''}
          <ul class="esiti">${suoi.map((e) => {
            const accettato = Boolean(c.accettati[e.chiave]);
            const daAccettare = e.livello === 'errore' || e.daConfermare;
            return `<li class="${accettato ? 'accettato' : ''}">
              <span>${esc(e.messaggio)}${accettato ? ' <span class="etichetta">accettato così</span>' : ''}</span>
              <span class="tasti">
                ${e.dove.origine || e.dove.pagina ? `<button type="button" class="secondario" data-azione="mostra" data-chiave="${esc(e.chiave)}">Mostra</button>` : ''}
                ${modificabile && daAccettare ? `<button type="button" class="secondario" data-azione="accetta" data-chiave="${esc(e.chiave)}">${accettato ? 'Non accettare più' : 'Accetta così'}</button>` : ''}
              </span></li>`;
          }).join('')}</ul>
        </details>`;
    };
    const errori = esiti.filter((e) => e.livello === 'errore').length;
    const avvisi = esiti.filter((e) => e.livello === 'avviso').length;
    $('#rev-controlli').innerHTML = `
      <h2>Controlli</h2>
      <p class="avviso ${aperti.length ? 'grave' : 'fatto'}" role="status">
        ${aperti.length
          ? `<strong>${aperti.length} ${aperti.length === 1 ? 'controllo ferma' : 'controlli fermano'} l'importazione</strong>: ${aperti.length === 1 ? 'va corretto' : 'vanno corretti'} nelle celle evidenziate oppure, se il documento è davvero così, ${aperti.length === 1 ? 'accettato' : 'accettati uno per uno'}.`
          : `<strong>Nessun controllo ferma l'importazione.</strong>${errori ? ` ${errori} errori sono stati accettati così come sono.` : ''}`}
        ${avvisi ? ` ${avvisi} avvisi da guardare.` : ''}</p>
      ${gruppo('errore')}${gruppo('avviso')}${gruppo('ok')}
      <div class="azioni">
        ${modificabile ? `<button type="button" data-azione="importa" ${aperti.length ? 'disabled' : ''}>Prepara l'importazione…</button>
          <button type="button" class="secondario" data-azione="lettura">Torna alla lettura (per rileggere un blocco)</button>` : ''}
        <button type="button" class="secondario" data-azione="confronta">Confronta con il database</button>
      </div>`;
  }

  function disegnaTabella() {
    const presenti = SCHEDE.filter(([id]) => dati[id]);
    const conSegni = (id) => esiti.filter((e) => e.livello !== 'ok' && e.dove.sezione === id && !correzioni().accettati[e.chiave]).length;
    $('#rev-schede').innerHTML = `
      <h2>Dati letti</h2>
      <nav class="schede" aria-label="Sezioni del fascicolo">${presenti.map(([id, nome]) =>
        `<a href="#" data-scheda="${id}" ${id === vista.scheda ? 'aria-current="page"' : ''}>${esc(nome)}${conSegni(id) ? ` <span class="etichetta stato-avviso">${conSegni(id)}</span>` : ''}</a>`).join('')}</nav>
      <div class="filtri">
        <label class="interruttore"><input type="checkbox" id="rev-solo" ${vista.soloSegnalate ? 'checked' : ''}> Solo le righe segnalate o corrette</label>
        <span class="nota">${modificabile ? 'Clic su una cella per correggerla (Invio conferma, Esc annulla); clic su una riga per vedere la sua pagina.' : 'Estrazione già importata: sola consultazione.'}</span>
      </div>`;
    const scorrimento = $('#rev-tabella .scorri')?.scrollLeft ?? 0;
    $('#rev-tabella').innerHTML = vista.scheda ? tabelle[vista.scheda](dati[vista.scheda], vista) : '<p class="avviso">Nessuna sezione è stata letta.</p>';
    if ($('#rev-tabella .scorri')) $('#rev-tabella .scorri').scrollLeft = scorrimento;
  }

  function disegnaCorrezioni() {
    const elenco = elencoCorrezioni(ctx.righe, correzioni().celle);
    $('#rev-correzioni').innerHTML = elenco.length ? `
      <details class="gruppo" open>
        <summary><span>Correzioni fatte a mano</span><span class="nota">${elenco.length}</span></summary>
        <div class="scorri"><table>
          <thead><tr><th>Sezione</th><th>Pag.</th><th>Campo</th><th>Letto dal documento</th><th>Corretto in</th><th></th></tr></thead>
          <tbody>${elenco.map((x) => `<tr><td>${esc(TIPI_SEZIONE[x.sezione]?.split(' (')[0] ?? x.sezione)}</td><td>${esc(x.pagina ?? '')}</td><td>${esc(x.percorso)}</td>
            <td>${esc(x.letto || '(vuoto)')}</td><td><strong>${esc(x.corretto || '(vuoto)')}</strong></td>
            <td class="tasti">${modificabile ? `<button type="button" class="secondario" data-azione="ripristina" data-chiave="${esc(x.chiave)}">Annulla la correzione</button>` : ''}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>` : '';
  }

  function disegna() {
    if (!ctx.attiva()) return;
    calcola();
    disegnaControlli();
    disegnaTabella();
    disegnaCorrezioni();
  }

  // Salva le correzioni e ridisegna; se il salvataggio fallisce si torna a quelle di prima.
  async function salvaCorrezioni(nuove) {
    const prima = estrazione.correzioni;
    estrazione.correzioni = nuove;
    $('#rev-importazione').innerHTML = '';
    disegna();
    try {
      await ctx.salva({ correzioni: nuove });
    } catch (e) {
      estrazione.correzioni = prima;
      disegna();
      ctx.errore(`La correzione non è stata salvata: ${e.message}`);
    }
  }

  // Il valore di una cella così com'è adesso nei dati del suo blocco (letto, più le correzioni).
  function valoreDi(chiave) {
    const [blocco, percorso] = chiave.split('|');
    const riga = applicaCorrezioni(ctx.righe.filter((r) => chiaveBlocco(r) === blocco), correzioni().celle)[0];
    return String((riga?.dati ? leggiIn(riga.dati, percorso) : '') ?? '');
  }

  function correggi(cella) {
    if (!modificabile || cella.querySelector('input')) return;
    const chiave = cella.dataset.origine;
    const attuale = valoreDi(chiave);
    const mostrato = cella.innerHTML;
    cella.innerHTML = `<input type="text" value="${esc(attuale)}" aria-label="Valore corretto">`;
    const campo = cella.querySelector('input');
    campo.focus();
    campo.select();
    let chiuso = false;
    const chiudi = (conferma) => {
      if (chiuso) return;
      chiuso = true;
      const nuovo = campo.value.trim();
      if (!conferma || nuovo === attuale) {
        cella.innerHTML = mostrato;
        return;
      }
      const c = correzioni();
      const celle = { ...c.celle, [chiave]: nuovo };
      // rimettere il valore letto dal documento equivale a togliere la correzione
      const [blocco, percorso] = chiave.split('|');
      const letto = ctx.righe.find((r) => chiaveBlocco(r) === blocco);
      if (String((letto?.dati ? leggiIn(letto.dati, percorso) : '') ?? '') === nuovo) delete celle[chiave];
      salvaCorrezioni({ ...c, celle });
    };
    campo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') chiudi(true);
      if (evento.key === 'Escape') chiudi(false);
    });
    campo.addEventListener('blur', () => chiudi(true));
  }

  // Porta alla cella indicata da un controllo: scheda giusta, riga in vista, pagina del PDF accanto.
  function mostra(e) {
    const { origine, sezione, pagina } = e.dove;
    if (SCHEDE.some(([id]) => id === sezione) && dati[sezione]) vista.scheda = sezione;
    if (vista.scheda === 'riparto' && origine) vista.parte = ctx.righe.find((r) => chiaveBlocco(r) === origine.split('|')[0])?.parte ?? vista.parte;
    vista.soloSegnalate = false;
    disegnaTabella();
    const cella = origine ? [...zona.querySelectorAll('#rev-tabella [data-origine]')].find((x) => x.dataset.origine === origine) : null;
    if (cella) {
      cella.scrollIntoView({ block: 'center', inline: 'center' });
      cella.classList.add('in-vista');
      setTimeout(() => cella.classList.remove('in-vista'), 2500);
    } else $('#rev-schede').scrollIntoView({ block: 'start' });
    pdf.mostra(pagina ?? paginaDi(origine));
  }

  zona.onclick = async (evento) => {
    const { azione, chiave, scheda, parte } = evento.target.closest('[data-azione],[data-scheda],[data-parte]')?.dataset ?? {};
    if (scheda) {
      evento.preventDefault();
      vista.scheda = scheda;
      disegnaTabella();
      return;
    }
    if (parte) {
      vista.parte = Number(parte);
      disegnaTabella();
      return;
    }
    const riga = evento.target.closest('#rev-tabella tr[data-pagina]');
    if (riga) pdf.mostra(Number(riga.dataset.pagina));
    const cella = evento.target.closest('#rev-tabella td.cella');
    if (cella && !azione) correggi(cella);
    if (!azione) return;
    const c = correzioni();
    if (azione === 'mostra') mostra(esiti.find((e) => e.chiave === chiave));
    if (azione === 'accetta-tutti') {
      const { codice } = evento.target.closest('[data-azione]').dataset;
      const stessi = daRisolvere(esiti, c.accettati).filter((e) => e.codice === codice);
      if (await conferma(`Accettare così come sono tutte le ${stessi.length} segnalazioni di questo tipo? Fallo solo se le hai guardate e il documento è davvero così.`, 'Accetta tutte')) {
        salvaCorrezioni({ ...c, accettati: { ...c.accettati, ...Object.fromEntries(stessi.map((e) => [e.chiave, true])) } });
      }
    }
    if (azione === 'accetta') {
      const accettati = { ...c.accettati };
      if (accettati[chiave]) delete accettati[chiave];
      else accettati[chiave] = true;
      salvaCorrezioni({ ...c, accettati });
    }
    if (azione === 'ripristina') {
      const celle = { ...c.celle };
      delete celle[chiave];
      salvaCorrezioni({ ...c, celle });
    }
    if (azione === 'lettura') {
      try {
        await ctx.salva({ stato: 'lettura' });
        ctx.ridisegna();
      } catch (e) {
        ctx.errore(`Non è stato possibile tornare alla lettura: ${e.message}`);
      }
    }
    if (azione === 'importa') preparaImportazione(ctx, $('#rev-importazione'), dati);
    if (azione === 'confronta') mostraConfronto(ctx, $('#rev-importazione'), dati);
  };
  zona.onkeydown = (evento) => {
    if ((evento.key === 'Enter' || evento.key === 'F2') && evento.target.matches?.('#rev-tabella td.cella')) {
      evento.preventDefault();
      correggi(evento.target);
    }
  };
  zona.onchange = (evento) => {
    if (evento.target.id === 'rev-solo') {
      vista.soloSegnalate = evento.target.checked;
      disegnaTabella();
    }
    const colonna = evento.target.dataset.ruolo;
    if (colonna && modificabile) {
      const c = correzioni();
      salvaCorrezioni({ ...c, ruoli: { ...c.ruoli, [colonna]: evento.target.value } });
    }
  };

  disegna();
  // si apre subito la pagina della prima segnalazione, così accanto ai dati c'è già il documento
  const prima = esiti.find((e) => e.livello !== 'ok' && (e.dove.pagina || e.dove.origine));
  pdf.mostra(prima ? prima.dove.pagina ?? paginaDi(prima.dove.origine) : ctx.righe[0]?.pagina_da ?? 1);
}
