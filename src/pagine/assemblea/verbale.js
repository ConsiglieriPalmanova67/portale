// Scheda Verbale: la bozza del verbale composta dai dati della seduta (src/verbale/fatti.js e componi.js) e dai pochi
// campi scritti a mano (presidente, segretario, convocante, allegati in più e, per ogni punto, sintesi, dichiarazioni e
// testo della delibera). I campi si salvano da soli in `bozze_verbale` (una riga per assemblea, `testo` = JSON dei campi)
// poco dopo l'ultima modifica e all'uscita dal campo. Mentre si scrive si aggiorna solo l'anteprima, mai il modulo:
// fuoco e cursore restano dove sono. I campi stanno anche in ctx.memoria.verbale, così un ridisegno della pagina
// (tempo reale, cambio di scheda) li ritrova come sono, salvati o no.
// Si usa anche ad assemblea chiusa: il verbale si scrive alla fine.
import { esc, ora } from '../../ui/html.js';
import { campiVuoti, leggiCampi, puntoInformativo, fattiVerbale } from '../../verbale/fatti.js';
import { componiVerbale } from '../../verbale/componi.js';
import { conferma } from './comuni.js';

const ATTESA_SALVATAGGIO = 800;
const ATTESA_ANTEPRIMA = 150;

// L'amministratore in carica alla data dell'assemblea (o, se nessuno lo è, l'ultimo nominato), senza articolo:
// il testo dice «convocata da [convocante]». Funzione pura.
export function convocantePredefinito(amministratori, giorno) {
  const elenco = (amministratori ?? []).filter((a) => String(a?.denominazione ?? '').trim())
    .sort((x, y) => String(y.dal ?? '').localeCompare(String(x.dal ?? '')));
  const inCarica = elenco.find((a) => (!a.dal || !giorno || a.dal <= giorno) && (!a.al || !giorno || a.al >= giorno)) ?? elenco[0];
  return inCarica ? `${inCarica.denominazione.trim()}, amministratore del condominio` : '';
}

// Il testo del verbale (paragrafi separati da una riga vuota) come HTML protetto: un <p> per paragrafo, le righe
// «[DA VERIFICARE: …]» messe in evidenza, i titoli dei paragrafi in grassetto. Funzione pura.
const TITOLO = /^(\d+\. [A-ZÀ-Ú' ]+|PUNTO \d+ – .*)$/;
export function htmlVerbale(testo) {
  return String(testo ?? '').split(/\n{2,}/).filter((b) => b.trim()).map((blocco, i) => {
    const righe = blocco.split('\n').map((riga, j) => {
      if (riga.startsWith('[DA VERIFICARE')) return `<span class="da-verificare">${esc(riga)}</span>`;
      return j === 0 && TITOLO.test(riga) ? `<strong>${esc(riga)}</strong>` : esc(riga);
    });
    // i primi due paragrafi sono l'intestazione: nome del condominio e titolo del verbale
    return `<p${i < 2 ? ' class="vb-intestazione"' : ''}>${righe.join('<br>')}</p>`;
  }).join('');
}

// Nomi suggeriti per presidente e segretario: chi è stato in sala di persona, più i delegati non condomini.
function nomiPresenti(ctx) {
  const nomi = new Set();
  for (const r of ctx.seduta.righe) {
    if (r.stato === 'presente' || r.oraIngresso) nomi.add(r.testa.etichetta);
    if (r.stato === 'delega' && r.delegato?.esterno) nomi.add(r.delegato.esterno.trim());
  }
  return [...nomi].filter(Boolean).sort((a, b) => a.localeCompare(b, 'it'));
}

const testoVerbale = (ctx, campi) => componiVerbale(fattiVerbale(ctx, campi));
const adesso = () => ora(new Date().toISOString());

// Salvataggio dei campi: uno alla volta; se intanto si è scritto ancora, al termine ne parte un altro.
// Lavora solo su ctx e memoria (mai sul modulo disegnato), così vale anche dopo un ridisegno.
function creaSalvataggio(ctx, memoria) {
  const s = { timer: null, inCorso: false, ancora: false, sporco: false, errore: false };
  const stato = (testo, grave = false) => {
    memoria.statoSalvataggio = { testo, grave };
    const campo = ctx.radice.querySelector('#vb-salvataggio');
    if (campo) {
      campo.textContent = testo;
      campo.classList.toggle('neg', grave);
    }
  };
  async function scrivi(testo) {
    if (memoria.rigaId) {
      const aggiornate = await ctx.deposito.aggiorna('bozze_verbale', { id: memoria.rigaId }, { testo });
      if (aggiornate.length) return;
    }
    // nessuna riga ancora, oppure quella letta non c'è più: se ne crea una
    memoria.rigaId = (await ctx.deposito.inserisci('bozze_verbale', [{ assemblea_id: ctx.id, testo }]))[0].id;
  }
  async function salva() {
    clearTimeout(s.timer);
    s.timer = null;
    if (!s.sporco) return;
    if (s.inCorso) { s.ancora = true; return; }
    s.inCorso = true;
    s.sporco = false;
    stato('Salvataggio…');
    try {
      await scrivi(JSON.stringify(memoria.campi));
      s.errore = false;
      stato(s.sporco ? 'Modifiche da salvare…' : `Campi salvati alle ${adesso()}`);
    } catch (errore) {
      s.sporco = true;
      stato(`Campi non salvati: ${errore.message}`, true);
      // il riquadro di errore una volta sola per serie di errori, per non far saltare la pagina a ogni tasto
      if (!s.errore) ctx.mostraErrore(`La bozza del verbale non è stata salvata: ${errore.message}`, () => salva());
      s.errore = true;
    } finally {
      s.inCorso = false;
      if (s.ancora) { s.ancora = false; salva(); }
    }
  }
  // chiudendo la scheda del browser con modifiche non salvate, il browser chiede conferma
  const primaDiUscire = (evento) => {
    if (!s.sporco && !s.inCorso) return;
    salva();
    evento.preventDefault();
    evento.returnValue = '';
  };
  window.addEventListener('beforeunload', primaDiUscire);
  // lasciando la pagina dell'assemblea si salva subito quello che resta
  ctx.allaChiusura.push(() => { salva(); window.removeEventListener('beforeunload', primaDiUscire); });
  return {
    stato,
    salva,
    programma() {
      s.sporco = true;
      clearTimeout(s.timer);
      s.timer = setTimeout(salva, ATTESA_SALVATAGGIO);
      if (!s.inCorso) stato('Modifiche da salvare…');
    },
  };
}

// Prima lettura dei campi da bozze_verbale; senza riga il convocante parte dall'amministratore in carica.
async function caricaCampi(ctx, memoria) {
  const righe = await ctx.deposito.leggi('bozze_verbale', { assemblea_id: ctx.id });
  // non c'è un vincolo di unicità: se le righe sono più d'una vale l'ultima modificata
  const ultima = (r) => String(r.modificato_il ?? r.creato_il ?? '');
  const riga = [...righe].sort((x, y) => ultima(y).localeCompare(ultima(x)))[0] ?? null;
  memoria.rigaId = riga?.id ?? null;
  memoria.campi = riga ? leggiCampi(riga.testo) : { ...campiVuoti(), convocante: convocantePredefinito(ctx.stato.dati.amministratori, ctx.assemblea.data) };
}

const campoTesto = (etichetta, attributi, valore, righe = 3, aiuto = '', classe = '') => `
  <label${classe ? ` class="${classe}"` : ''}>${etichetta}${aiuto ? ` <span class="nota">${aiuto}</span>` : ''}
    <textarea ${attributi} rows="${righe}">${esc(valore)}</textarea></label>`;

function campiPunto(punto, numero, scritti = {}) {
  const attr = (campo) => `data-punto="${esc(punto.id)}" data-campo="${campo}"`;
  const corpo = puntoInformativo(punto)
    ? campoTesto('Comunicazioni', attr('sintesi'), scritti.sintesi, 3, '(punto senza votazione: solo comunicazioni)')
    : campoTesto('Sintesi della discussione', attr('sintesi'), scritti.sintesi)
      + campoTesto('Dichiarazioni a verbale', attr('dichiarazioni'), scritti.dichiarazioni, 2, '(chi le ha chieste e che cosa ha dichiarato)')
      + campoTesto('Testo della delibera posta in votazione', attr('delibera'), scritti.delibera, 3);
  return `<fieldset class="largo vb-punto"><legend>Punto ${numero}. ${esc(punto.testo)}</legend>${corpo}</fieldset>`;
}

function modulo(ctx, campi) {
  const nomi = nomiPresenti(ctx);
  const testo = (etichetta, campo, aiuto = '', classe = '') => `
    <label${classe ? ` class="${classe}"` : ''}>${etichetta}${aiuto ? ` <span class="nota">${aiuto}</span>` : ''}
      <input type="text" data-campo="${campo}" value="${esc(campi[campo])}" autocomplete="off"${campo === 'convocante' ? '' : ' list="vb-presenti"'}></label>`;
  return `
    <form class="modulo verbale-campi no-stampa" autocomplete="off">
      ${testo('Presidente', 'presidente')}
      ${testo('Segretario', 'segretario')}
      <datalist id="vb-presenti">${nomi.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      ${testo('Convocata da', 'convocante', '(nel testo: «convocata da …», senza articolo)', 'largo')}
      ${campoTesto('Allegati in più', 'data-campo="allegati"', campi.allegati, 2, '(uno per riga; avviso, report e deleghe ci sono già)', 'largo')}
      ${ctx.punti.map((p, i) => campiPunto(p, i + 1, campi.punti[p.id])).join('') || '<p class="largo nota">Nessun punto all\'ordine del giorno.</p>'}
    </form>`;
}

function anteprima(ctx, campi) {
  try {
    return htmlVerbale(testoVerbale(ctx, campi));
  } catch (errore) {
    return `<p class="avviso">Non è stato possibile comporre il testo del verbale: ${esc(errore.message)}</p>`;
  }
}

// Scrive il valore di un campo del modulo nei campi in memoria.
function registra(campi, elemento) {
  const { punto, campo } = elemento.dataset;
  if (!punto) {
    campi[campo] = elemento.value;
    return;
  }
  campi.punti[punto] ??= { sintesi: '', dichiarazioni: '', delibera: '' };
  campi.punti[punto][campo] = elemento.value;
}

async function copia(ctx, memoria, contenitore) {
  const testo = testoVerbale(ctx, memoria.campi);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('appunti non disponibili');
    await navigator.clipboard.writeText(testo);
    messaggio(ctx, memoria, 'Testo del verbale copiato: si può incollare in un documento o in una mail.');
  } catch {
    // il browser non concede gli appunti: si seleziona l'anteprima e si prova la copia della selezione;
    // se anche questa non riesce, la selezione resta e basta Ctrl+C (o «Copia» dal menu)
    const foglio = contenitore.querySelector('.verbale-testo');
    if (foglio) getSelection()?.selectAllChildren(foglio);
    let copiato = false;
    try { copiato = Boolean(foglio) && document.execCommand('copy'); } catch { /* resta la selezione */ }
    if (copiato) messaggio(ctx, memoria, 'Testo del verbale copiato: si può incollare in un documento o in una mail.');
    else messaggio(ctx, memoria, 'Questo browser non permette di copiare da qui: il testo dell\'anteprima è selezionato, copialo con Ctrl+C (o tenendo premuto e scegliendo «Copia»).', true);
  }
}

function messaggio(ctx, memoria, testo, grave = false, html = '') {
  memoria.messaggio = { testo, grave, html };
  const riga = ctx.radice.querySelector('#vb-messaggio');
  if (riga) riga.outerHTML = rigaMessaggio(memoria.messaggio);
}
const rigaMessaggio = (m) => `<p id="vb-messaggio" class="nota no-stampa${m?.grave ? ' neg' : ''}" aria-live="polite">${m ? `${esc(m.testo)}${m.html ?? ''}` : ''}</p>`;

// «Salva nei Verbali come bozza»: inserisce o aggiorna il verbale in bozza dell'assemblea; un definitivo non si tocca.
async function salvaNeiVerbali(ctx, memoria) {
  memoria.salvataggio.salva();
  const testo = testoVerbale(ctx, memoria.campi);
  const vai = ` <a href="#/verbali/${encodeURIComponent(ctx.id)}">Apri nei Verbali</a>`;
  let righe;
  try {
    righe = await ctx.deposito.leggi('verbali', { assemblea_id: ctx.id });
  } catch (errore) {
    ctx.mostraErrore(`Non è stato possibile leggere i verbali: ${errore.message}`, () => salvaNeiVerbali(ctx, memoria));
    return;
  }
  if (righe.some((v) => v.stato === 'definitivo')) {
    messaggio(ctx, memoria, 'Per questa assemblea nei Verbali c\'è già un verbale definitivo: non viene modificato. Il testo si può sempre stampare o copiare.', true, vai);
    return;
  }
  const bozza = righe.find((v) => v.stato === 'bozza');
  if (bozza?.testo?.trim() && bozza.testo !== testo
    && !(await conferma('Nei Verbali c\'è già un testo in bozza per questa assemblea. Sostituirlo con il testo di questa bozza?', 'Sostituisci'))) return;
  ctx.esegui(async () => {
    // si rilegge al momento della scrittura: riprovando dopo un errore non si crea un secondo verbale
    const attuali = await ctx.deposito.leggi('verbali', { assemblea_id: ctx.id });
    if (attuali.some((v) => v.stato === 'definitivo')) throw new Error('nel frattempo il verbale è diventato definitivo e non viene modificato');
    const esistente = attuali.find((v) => v.stato === 'bozza');
    if (esistente) await ctx.deposito.aggiorna('verbali', { id: esistente.id }, { testo });
    else await ctx.deposito.inserisci('verbali', [{ assemblea_id: ctx.id, testo, stato: 'bozza' }]);
    memoria.messaggio = { testo: `Salvato nei Verbali come bozza alle ${adesso()}.`, grave: false, html: vai };
  });
}

function disegnaScheda(ctx, memoria, contenitore) {
  const s = memoria.statoSalvataggio ?? { testo: 'I campi si salvano da soli mentre si scrive.', grave: false };
  contenitore.innerHTML = `
    <div class="azioni no-stampa">
      <button type="button" data-azione="stampa">Stampa o salva in PDF</button>
      <button type="button" class="secondario" data-azione="copia">Copia il testo</button>
      <button type="button" class="secondario" data-azione="verbali">Salva nei Verbali come bozza</button>
      <span id="vb-salvataggio" class="nota${s.grave ? ' neg' : ''}" aria-live="polite">${esc(s.testo)}</span>
    </div>
    ${rigaMessaggio(memoria.messaggio)}
    <p class="nota no-stampa">La bozza nasce da presenze, deleghe e voti registrati nel portale${ctx.assemblea.stato === 'chiusa' ? '' : ' e si aggiorna man mano che la seduta va avanti'}.
      Le righe «______» vanno completate a mano; le righe evidenziate «[DA VERIFICARE: …]» vanno controllate e poi tolte prima della firma.</p>
    ${modulo(ctx, memoria.campi)}
    <h2 class="no-stampa">Anteprima del verbale</h2>
    <article class="report verbale-testo">${anteprima(ctx, memoria.campi)}</article>`;

  let attesa = null;
  const aggiornaAnteprima = () => {
    clearTimeout(attesa);
    attesa = setTimeout(() => {
      const foglio = contenitore.querySelector('.verbale-testo');
      if (foglio && contenitore.isConnected) foglio.innerHTML = anteprima(ctx, memoria.campi);
    }, ATTESA_ANTEPRIMA);
  };
  const form = contenitore.querySelector('.verbale-campi');
  // Invio in un campo non deve ricaricare la pagina
  form.addEventListener('submit', (evento) => evento.preventDefault());
  form.addEventListener('input', (evento) => {
    if (!evento.target.dataset.campo) return;
    registra(memoria.campi, evento.target);
    aggiornaAnteprima();
    memoria.salvataggio.programma();
  });
  // uscendo da un campo modificato si salva subito
  form.addEventListener('change', (evento) => {
    if (evento.target.dataset.campo) memoria.salvataggio.salva();
  });
  // un testo che non si compone (dati inattesi) diventa un messaggio con «Riprova», non un errore nascosto
  const prova = (fai) => fai().catch((errore) => ctx.mostraErrore(`Operazione non riuscita: ${errore.message}`, () => prova(fai)));
  contenitore.querySelector('.azioni').addEventListener('click', (evento) => {
    const azione = evento.target.closest('button')?.dataset.azione;
    if (azione === 'stampa') window.print();
    if (azione === 'copia') prova(() => copia(ctx, memoria, memoria.contenitore));
    if (azione === 'verbali') prova(() => salvaNeiVerbali(ctx, memoria));
  });
}

export function schedaVerbale(ctx, contenitore) {
  if (ctx.assemblea.stato === 'bozza') {
    contenitore.innerHTML = '<p class="avviso no-stampa">La bozza del verbale si compone dopo l\'apertura della seduta, con le presenze, le deleghe e i voti registrati.</p>';
    return;
  }
  const memoria = ctx.memoria.verbale;
  memoria.salvataggio ??= creaSalvataggio(ctx, memoria);
  // il contenitore più recente: la prima lettura, finita, disegna lì (quello di prima può essere già sparito)
  memoria.contenitore = contenitore;
  if (memoria.campi) {
    disegnaScheda(ctx, memoria, contenitore);
    return;
  }
  contenitore.innerHTML = '<p class="nota">Caricamento della bozza del verbale…</p>';
  memoria.lettura ??= caricaCampi(ctx, memoria).finally(() => { memoria.lettura = null; });
  memoria.lettura.then(() => {
    if (memoria.contenitore === contenitore && contenitore.isConnected) disegnaScheda(ctx, memoria, contenitore);
  }, (errore) => {
    if (memoria.contenitore !== contenitore || !contenitore.isConnected) return;
    contenitore.innerHTML = '<p class="avviso">La bozza del verbale non è stata letta.</p>';
    ctx.mostraErrore(`Non è stato possibile leggere la bozza del verbale: ${errore.message}`, () => schedaVerbale(ctx, memoria.contenitore));
  });
}
