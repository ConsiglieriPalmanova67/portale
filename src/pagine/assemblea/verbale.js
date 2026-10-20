// Scheda «Bozza del verbale»: la bozza del verbale composta dai dati della seduta (src/verbale/fatti.js e componi.js) e
// dai pochi campi scritti a mano (presidente, segretario, convocante, allegati in più e, per ogni punto, sintesi,
// dichiarazioni e testo della delibera). I campi si salvano da soli in `bozze_verbale` (src/verbale/bozza.js) poco dopo
// l'ultima modifica e all'uscita dal campo, scrivendo solo i campi modificati: due schede o due dispositivi che scrivono
// campi diversi non si cancellano a vicenda. Mentre si scrive si aggiorna solo l'anteprima, mai il modulo: fuoco e
// cursore restano dove sono. I campi stanno anche in ctx.memoria.verbale, così un ridisegno della pagina (tempo reale,
// cambio di scheda) li ritrova come sono, salvati o no. La stessa memoria e lo stesso salvataggio servono le note sul
// punto della scheda Votazioni (notePunto), che sono la sintesi della discussione del verbale.
// Si usa anche ad assemblea chiusa: il verbale si scrive alla fine.
import { esc, ora } from '../../ui/html.js';
import { campiVuoti, puntoInformativo, fattiVerbale } from '../../verbale/fatti.js';
import { componiVerbale } from '../../verbale/componi.js';
import { leggiBozza, aggiornaBozza } from '../../verbale/bozza.js';
import { conferma } from './comuni.js';

const ATTESA_SALVATAGGIO = 800;
const ATTESA_ANTEPRIMA = 150;
// i messaggi informativi («Testo copiato…») spariscono da soli dopo questo tempo
const DURATA_MESSAGGIO = 8000;

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

// I campi da cui parte una bozza ancora mai salvata: il convocante è l'amministratore in carica.
const campiIniziali = (ctx) => () => ({ ...campiVuoti(), convocante: convocantePredefinito(ctx.stato.dati.amministratori, ctx.assemblea.data) });

// Un campo è { punto, campo }: `punto` è l'id del punto per sintesi, dichiarazioni e delibera, vuoto per gli altri.
const chiaveDi = ({ punto, campo }) => (punto ? `${punto}/${campo}` : campo);
const valoreDi = (campi, { punto, campo }) => String((punto ? campi.punti[punto]?.[campo] : campi[campo]) ?? '');
function scriviValore(campi, { punto, campo }, valore) {
  if (!punto) {
    campi[campo] = valore;
    return;
  }
  campi.punti[punto] ??= { sintesi: '', dichiarazioni: '', delibera: '' };
  campi.punti[punto][campo] = valore;
}

// Dopo un salvataggio i campi in memoria sono quelli del deposito (con quel che hanno scritto gli altri): si riportano
// nei campi a schermo, tranne quello in cui si sta scrivendo (si riallinea quando lo si lascia, vedi collegaCampi).
function allinea(ctx, memoria) {
  for (const elemento of ctx.radice.querySelectorAll('.verbale-campi [data-campo], .note-punto [data-campo]')) {
    if (elemento === document.activeElement) continue;
    const valore = valoreDi(memoria.campi, elemento.dataset);
    if (elemento.value !== valore) elemento.value = valore;
  }
  const foglio = ctx.radice.querySelector('.verbale-testo');
  if (foglio) foglio.innerHTML = anteprima(ctx, memoria.campi);
}

// Salvataggio dei campi: uno alla volta e solo dei campi modificati (aggiornaBozza rilegge la riga e scrive solo quelli);
// se intanto si è scritto ancora, al termine ne parte un altro. Lavora solo su ctx e memoria (mai sul modulo disegnato),
// così vale anche dopo un ridisegno e per qualunque scheda che mostri i campi della bozza.
function creaSalvataggio(ctx, memoria) {
  const s = { timer: null, inCorso: false, ancora: false, errore: false, modifiche: new Map() };
  const stato = (testo, grave = false) => {
    memoria.statoSalvataggio = { testo, grave };
    const campo = ctx.radice.querySelector('#vb-salvataggio');
    if (campo) {
      campo.textContent = testo;
      campo.classList.toggle('neg', grave);
    }
  };
  async function salva() {
    clearTimeout(s.timer);
    s.timer = null;
    if (!s.modifiche.size) return;
    if (s.inCorso) { s.ancora = true; return; }
    s.inCorso = true;
    const daScrivere = [...s.modifiche.values()];
    s.modifiche.clear();
    stato('Salvataggio…');
    try {
      const salvati = await aggiornaBozza(ctx.deposito, ctx.id, (campi) => {
        for (const m of daScrivere) scriviValore(campi, m, m.valore);
      }, campiIniziali(ctx));
      // quel che si è scritto mentre si salvava resta in attesa e resta nei campi
      for (const m of s.modifiche.values()) scriviValore(salvati, m, m.valore);
      const cambiati = JSON.stringify(salvati) !== JSON.stringify(memoria.campi);
      memoria.campi = salvati;
      if (cambiati) allinea(ctx, memoria);
      s.errore = false;
      stato(s.modifiche.size ? 'Modifiche da salvare…' : `Campi salvati alle ${adesso()}`);
    } catch (errore) {
      // le modifiche non scritte tornano in attesa, senza coprire quelle scritte dopo
      for (const m of daScrivere) if (!s.modifiche.has(chiaveDi(m))) s.modifiche.set(chiaveDi(m), m);
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
    if (!s.modifiche.size && !s.inCorso) return;
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
    programma(dove, valore) {
      s.modifiche.set(chiaveDi(dove), { punto: dove.punto, campo: dove.campo, valore });
      clearTimeout(s.timer);
      s.timer = setTimeout(salva, ATTESA_SALVATAGGIO);
      if (!s.inCorso) stato('Modifiche da salvare…');
    },
  };
}

// La bozza è una per pagina dell'assemblea: questa scheda e le note in Votazioni usano la stessa memoria.
function bozzaDi(ctx) {
  const memoria = (ctx.memoria.verbale ??= {});
  memoria.salvataggio ??= creaSalvataggio(ctx, memoria);
  return memoria;
}

// Prima lettura dei campi da bozze_verbale, una sola anche se la chiedono due schede.
function caricaCampi(ctx, memoria) {
  memoria.lettura ??= leggiBozza(ctx.deposito, ctx.id, campiIniziali(ctx))
    .then(({ campi }) => { memoria.campi ??= campi; })
    .finally(() => { memoria.lettura = null; });
  return memoria.lettura;
}

// Scrive il valore di un campo a schermo nei campi in memoria e lo mette in coda per il salvataggio.
function registra(memoria, elemento) {
  const dove = { punto: elemento.dataset.punto, campo: elemento.dataset.campo };
  scriviValore(memoria.campi, dove, elemento.value);
  memoria.salvataggio.programma(dove, elemento.value);
}

// Mentre si scrive: memoria e salvataggio ritardato; uscendo da un campo modificato si salva subito. Lasciando un campo
// lo si riallinea alla memoria, dove un salvataggio può aver portato il testo scritto intanto da un altro dispositivo.
function collegaCampi(memoria, zona, aOgniModifica = () => {}) {
  zona.addEventListener('input', (evento) => {
    if (!evento.target.dataset.campo) return;
    registra(memoria, evento.target);
    aOgniModifica();
  });
  zona.addEventListener('change', (evento) => {
    if (evento.target.dataset.campo) memoria.salvataggio.salva();
  });
  zona.addEventListener('focusout', (evento) => {
    const elemento = evento.target;
    if (!elemento.dataset?.campo || !memoria.campi) return;
    const valore = valoreDi(memoria.campi, elemento.dataset);
    if (elemento.value !== valore) elemento.value = valore;
  });
}

// Note sul punto nella scheda Votazioni: sono la «sintesi della discussione» del verbale (per «Varie ed eventuali» le
// comunicazioni), lo stesso campo della scheda Bozza del verbale. Restano modificabili a votazione e assemblea chiuse.
export function notePunto(ctx, punto) {
  const campi = ctx.memoria.verbale?.campi;
  const s = ctx.memoria.verbale?.statoSalvataggio ?? { testo: 'Le note si salvano da sole mentre si scrive.', grave: false };
  const [etichetta, aiuto] = puntoInformativo(punto)
    ? ['Comunicazioni', '(vanno nel verbale)'] : ['Note sul punto', '(vanno nel verbale come sintesi della discussione)'];
  return `
    <label class="note-punto"><span>${etichetta} <span class="nota">${aiuto}</span></span>
      <textarea id="note-punto" rows="3" data-punto="${esc(punto.id)}" data-campo="sintesi"${campi ? '' : ' disabled placeholder="Caricamento delle note…"'}>${campi ? esc(valoreDi(campi, { punto: punto.id, campo: 'sintesi' })) : ''}</textarea></label>
    <p id="vb-salvataggio" class="nota note-stato${s.grave ? ' neg' : ''}" aria-live="polite">${esc(s.testo)}</p>`;
}

// Collega il campo disegnato da notePunto: salvataggio come nella bozza; se i campi non sono ancora letti, li legge.
export function collegaNotePunto(ctx, contenitore) {
  const campo = contenitore.querySelector('#note-punto');
  if (!campo) return;
  const memoria = bozzaDi(ctx);
  collegaCampi(memoria, campo);
  if (memoria.campi) return;
  caricaCampi(ctx, memoria).then(() => {
    if (!campo.isConnected) return;
    campo.value = valoreDi(memoria.campi, campo.dataset);
    campo.disabled = false;
    campo.removeAttribute('placeholder');
  }, (errore) => {
    if (!campo.isConnected) return;
    campo.placeholder = 'Note non lette';
    ctx.mostraErrore(`Non è stato possibile leggere le note del verbale: ${errore.message}`, () => ctx.ricarica());
  });
}

const campoTesto = (etichetta, attributi, valore, righe = 3, aiuto = '', classe = '') => `
  <label${classe ? ` class="${classe}"` : ''}>${etichetta}${aiuto ? ` <span class="nota">${aiuto}</span>` : ''}
    <textarea ${attributi} rows="${righe}">${esc(valore)}</textarea></label>`;

function campiPunto(punto, numero, scritti = {}) {
  const attr = (campo) => `data-punto="${esc(punto.id)}" data-campo="${campo}"`;
  const corpo = puntoInformativo(punto)
    ? campoTesto('Comunicazioni', attr('sintesi'), scritti.sintesi, 3, '(punto senza votazione: solo comunicazioni)')
    : campoTesto('Sintesi della discussione', attr('sintesi'), scritti.sintesi, 3, '(sono anche le note sul punto della scheda Votazioni)')
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

// Riga del messaggio sotto i tasti: si toglie alla prossima azione; quelli informativi anche da soli dopo qualche secondo.
// Senza testo la riga si svuota.
function messaggio(ctx, memoria, testo, grave = false, html = '') {
  clearTimeout(memoria.timerMessaggio);
  memoria.messaggio = testo ? { testo, grave, html } : null;
  const riga = ctx.radice.querySelector('#vb-messaggio');
  if (riga) {
    riga.className = classeMessaggio(memoria.messaggio);
    riga.innerHTML = testoMessaggio(memoria.messaggio);
  }
  if (testo && !grave) memoria.timerMessaggio = setTimeout(() => messaggio(ctx, memoria, ''), DURATA_MESSAGGIO);
}
const classeMessaggio = (m) => `nota no-stampa${m?.grave ? ' neg' : ''}`;
const testoMessaggio = (m) => (m ? `${esc(m.testo)}${m.html ?? ''}` : '');
const rigaMessaggio = (m) => `<p id="vb-messaggio" class="${classeMessaggio(m)}" aria-live="polite">${testoMessaggio(m)}</p>`;

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
  // ctx.esegui fa una scrittura alla volta e, se un'altra è in corso, non fa nulla: lo si dice
  if (ctx.occupato) {
    messaggio(ctx, memoria, 'Un\'altra operazione è in corso: il testo non è stato salvato nei Verbali. Riprova tra qualche secondo.', true);
    return;
  }
  ctx.esegui(async () => {
    // si rilegge al momento della scrittura: riprovando dopo un errore non si crea un secondo verbale
    const attuali = await ctx.deposito.leggi('verbali', { assemblea_id: ctx.id });
    if (attuali.some((v) => v.stato === 'definitivo')) throw new Error('nel frattempo il verbale è diventato definitivo e non viene modificato');
    const esistente = attuali.find((v) => v.stato === 'bozza');
    if (esistente) await ctx.deposito.aggiorna('verbali', { id: esistente.id }, { testo });
    else await ctx.deposito.inserisci('verbali', [{ assemblea_id: ctx.id, testo, stato: 'bozza' }]);
    messaggio(ctx, memoria, `Salvato nei Verbali come bozza alle ${adesso()}.`, false, vai);
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
  collegaCampi(memoria, form, () => {
    aggiornaAnteprima();
    // scrivendo, il messaggio dell'azione di prima non vale più
    if (memoria.messaggio) messaggio(ctx, memoria, '');
  });
  // un testo che non si compone (dati inattesi) diventa un messaggio con «Riprova», non un errore nascosto
  const prova = (fai) => fai().catch((errore) => ctx.mostraErrore(`Operazione non riuscita: ${errore.message}`, () => prova(fai)));
  contenitore.querySelector('.azioni').addEventListener('click', (evento) => {
    const azione = evento.target.closest('button')?.dataset.azione;
    if (!azione) return;
    messaggio(ctx, memoria, '');
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
  const memoria = bozzaDi(ctx);
  // il contenitore più recente: la prima lettura, finita, disegna lì (quello di prima può essere già sparito)
  memoria.contenitore = contenitore;
  if (memoria.campi) {
    disegnaScheda(ctx, memoria, contenitore);
    return;
  }
  contenitore.innerHTML = '<p class="nota">Caricamento della bozza del verbale…</p>';
  caricaCampi(ctx, memoria).then(() => {
    if (memoria.contenitore === contenitore && contenitore.isConnected) disegnaScheda(ctx, memoria, contenitore);
  }, (errore) => {
    if (memoria.contenitore !== contenitore || !contenitore.isConnected) return;
    contenitore.innerHTML = '<p class="avviso">La bozza del verbale non è stata letta.</p>';
    ctx.mostraErrore(`Non è stato possibile leggere la bozza del verbale: ${errore.message}`, () => schedaVerbale(ctx, memoria.contenitore));
  });
}
