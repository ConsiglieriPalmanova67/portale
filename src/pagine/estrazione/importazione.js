// Ultimo passo della revisione: il riepilogo di ciò che verrà scritto, la conferma (esplicita se l'esercizio ha
// già dati) e l'importazione a passi ripetibili. Qui anche il confronto tra i dati estratti e quelli già nel database.
import { esc } from '../../ui/html.js';
import { pianoImportazione, eseguiPiano } from '../../estrazione/importa.js';
import { confrontaConDatabase } from '../../estrazione/confronto.js';

const TABELLE = ['esercizi', 'conti', 'fornitori', 'spese', 'posizioni', 'stato_patrimoniale', 'partite_terzi', 'unita', 'soggetti', 'titolarita'];
const NOMI = { spese: 'voci di spesa', posizioni: 'posizioni delle unità', stato_patrimoniale: 'voci della situazione patrimoniale', partite_terzi: 'partite verso terzi' };
const PASSI = { esercizi: 'esercizi', conti: 'conti', fornitori: 'fornitori', spese: 'spese', posizioni: 'posizioni delle unità', tipi_unita: 'tipi delle unità', stato_patrimoniale: 'situazione patrimoniale', partite_terzi: 'partite verso terzi' };

// Il piano si calcola sul database com'è adesso, non su quello caricato all'ingresso nel portale.
async function calcolaPiano(ctx, dati) {
  const letture = await Promise.all(TABELLE.map((t) => ctx.deposito.leggi(t)));
  const db = Object.fromEntries(TABELLE.map((t, i) => [t, letture[i]]));
  return { db, piano: pianoImportazione({ estrazione: ctx.estrazione, dati, db, oggi: ctx.stato.oggi }) };
}

const elenco = (voci) => `<ul>${voci.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;

export async function preparaImportazione(ctx, zona, dati) {
  zona.innerHTML = '<p class="avviso" role="status">Preparazione dell\'importazione…</p>';
  zona.scrollIntoView({ block: 'start' });
  let piano;
  try {
    ({ piano } = await calcolaPiano(ctx, dati));
  } catch (e) {
    zona.innerHTML = '';
    ctx.errore(`Non è stato possibile preparare l'importazione: ${e.message}`, () => preparaImportazione(ctx, zona, dati));
    return;
  }
  if (!ctx.attiva()) return;
  const gia = piano.esistenti.length > 0;
  zona.innerHTML = `
    <section class="importazione">
      <h2>Importazione nella contabilità</h2>
      <p class="nota">Ecco cosa verrà scritto. Nulla è ancora stato salvato.</p>
      <div class="scorri"><table>
        <tbody>${piano.riepilogo.map(([nome, valore]) => `<tr><th scope="row">${esc(nome)}</th><td>${esc(valore === 0 ? 'nessuno' : valore)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="nota">Le posizioni sono intestate a chi oggi in anagrafica è proprietario (o conduttore) dell'unità: l'importazione non cambia mai le titolarità.</p>
      ${piano.avvisi.length ? `<div class="avviso"><strong>Da sapere</strong>${elenco(piano.avvisi)}</div>` : ''}
      ${piano.errori.length ? `<div class="avviso grave" role="alert"><strong>L'importazione non può partire</strong>${elenco(piano.errori)}Correggi i dati nella revisione e riprova.</div>` : ''}
      ${gia ? `<div class="avviso grave" role="alert"><strong>L'esercizio ha già dati nel database.</strong>
        ${elenco(piano.esistenti.map((e) => `${e.tipo} ${e.anno}: ${Object.entries(e.conteggi).map(([t, n]) => `${n} ${NOMI[t]}`).join(', ')}`))}
        Importando, questi dati vengono <strong>eliminati e sostituiti</strong> con quelli del fascicolo. Con «Confronta con il database» puoi vedere prima che cosa cambierebbe.
        <label class="interruttore"><input type="checkbox" id="imp-sostituisci"> Sì, sostituisci i dati già presenti</label></div>` : ''}
      <div class="azioni">
        <button type="button" id="imp-conferma" ${piano.errori.length || gia ? 'disabled' : ''}>${gia ? 'Sostituisci e importa' : 'Conferma e importa'}</button>
        <button type="button" class="secondario" id="imp-annulla">Non ora</button>
      </div>
      <p class="nota" id="imp-stato" role="status"></p>
    </section>`;
  const $ = (selettore) => zona.querySelector(selettore);
  $('#imp-annulla').onclick = () => { zona.innerHTML = ''; };
  $('#imp-sostituisci')?.addEventListener('change', (evento) => { $('#imp-conferma').disabled = !evento.target.checked || piano.errori.length > 0; });

  // dal secondo tentativo in poi si sta ripetendo un'importazione interrotta: i dati scritti a metà vanno sostituiti
  let iniziata = false;
  $('#imp-conferma').onclick = async () => {
    const bottone = $('#imp-conferma');
    bottone.disabled = true;
    $('#imp-annulla').disabled = true;
    try {
      const sostituisci = iniziata || Boolean($('#imp-sostituisci')?.checked);
      iniziata = true;
      await eseguiPiano(ctx.deposito, piano, { sostituisci, avanza: (passo) => { if ($('#imp-stato')) $('#imp-stato').textContent = `Scrittura in corso: ${PASSI[passo]}…`; } });
      await ctx.salva({ stato: 'importata' });
      await ctx.aggiornaDati();
      if (!ctx.attiva()) return;
      // la pagina si ridisegna in sola lettura, con in testa il collegamento alla contabilità
      ctx.ridisegna();
      window.scrollTo(0, 0);
    } catch (e) {
      if (!ctx.attiva()) return;
      bottone.disabled = false;
      bottone.textContent = 'Riprova l\'importazione';
      $('#imp-annulla').disabled = false;
      $('#imp-stato').textContent = '';
      ctx.errore(`Importazione non completata: ${e.message} Premi «Riprova l'importazione»: i passi già scritti vengono riscritti, senza doppioni.`);
    }
  };
}

export async function mostraConfronto(ctx, zona, dati) {
  zona.innerHTML = '<p class="avviso" role="status">Confronto con il database…</p>';
  zona.scrollIntoView({ block: 'start' });
  let confronto;
  try {
    const { db, piano } = await calcolaPiano(ctx, dati);
    confronto = confrontaConDatabase({ piano, db });
  } catch (e) {
    zona.innerHTML = '';
    ctx.errore(`Confronto non riuscito: ${e.message}`, () => mostraConfronto(ctx, zona, dati));
    return;
  }
  if (!ctx.attiva()) return;
  const anno = esc(ctx.estrazione.anno);
  zona.innerHTML = `
    <section class="importazione">
      <h2>Confronto con il database</h2>
      ${!confronto.confrontabile ? `<p class="avviso">Nel database non c'è ancora il consuntivo ${anno}: non c'è nulla con cui confrontare.</p>`
        : confronto.differenze ? `<p class="avviso grave" role="status"><strong>${confronto.differenze} differenze</strong> tra i dati estratti (con le correzioni) e quelli del consuntivo ${anno} nel database.</p>`
          : `<p class="avviso fatto" role="status"><strong>Nessuna differenza</strong>: i dati estratti coincidono con quelli del consuntivo ${anno} nel database.</p>`}
      ${confronto.confrontabile ? confronto.sezioni.map((s) => `
        <details class="gruppo" ${s.differenze.length ? 'open' : ''}>
          <summary><span>${esc(s.nome)}</span><span class="nota">${s.uguali} uguali, ${s.differenze.length} differenze</span></summary>
          ${s.differenze.length ? `<div class="scorri"><table>
            <thead><tr><th>Dove</th><th>Estratto dal documento</th><th>Nel database</th></tr></thead>
            <tbody>${s.differenze.map((x) => `<tr><td>${esc(x.dove)}</td><td>${esc(x.estratto)}</td><td>${esc(x.database)}</td></tr>`).join('')}</tbody>
          </table></div>` : ''}
        </details>`).join('') : ''}
      <div class="azioni"><button type="button" class="secondario" id="conf-chiudi">Chiudi il confronto</button></div>
    </section>`;
  zona.querySelector('#conf-chiudi').onclick = () => { zona.innerHTML = ''; };
}
