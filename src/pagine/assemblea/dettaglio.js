// Dettaglio di un'assemblea: testata (testata.js), schede, barra fissa del quorum, aggiornamento in tempo reale.
//
// Ogni scheda è una funzione disegna(ctx, contenitore) elencata in SCHEDE: per aggiungerne una basta una riga.
// `ctx` è il contesto della seduta, uguale per tutte le schede:
//   stato                 dati e modello del portale (anagrafica, millesimi correnti)
//   deposito              letture e scritture
//   assemblea, teste, punti, presenze, deleghe, voti    righe del database, rilette a ogni ricarica
//   verbale               il verbale dell'assemblea, se c'è (per il collegamento al file nella testata)
//   seduta                risultato di statoSeduta(): righe, presenti, quorum, avvisi
//   solaLettura           true ad assemblea chiusa: le schede non offrono modifiche
//   senzaSeduta           true per un'assemblea chiusa senza teste congelate: è stata registrata come già svolta,
//                         non ha presenze né voti e gli esiti dei punti si inseriscono a mano (scheda Ordine del giorno)
//   memoria               oggetto libero per scheda (ricerca, sezioni aperte…): sopravvive ai ridisegni
//   esegui(azione)        esegue una scrittura, mostra l'eventuale errore con "Riprova", poi rilegge e ridisegna
//   ricarica()            rilegge dal deposito e ridisegna tutto
//   rileggi()             rilegge dal deposito senza ridisegnare (dentro un'azione, per decidere sui dati del momento)
//   mostraErrore(testo, riprova)   riquadro di errore con il tasto "Riprova"
//   unitaDi(testa)        codici delle unità della testa, per esempio "A1, A2"
//   allaChiusura          funzioni chiamate quando si lascia la pagina (per esempio lo "smetti" di ascolta)
import { deposito } from '../../dati/client.js';
import { perCodice } from '../../dati/modello.js';
import { statoSeduta } from '../../assemblea/seduta.js';
import { daInteri } from '../../calcolo/numeri.js';
import { esc, millesimi } from '../../ui/html.js';
import { senzaSeduta, etichettaEsito } from './comuni.js';
import { testata, collegaTestata } from './testata.js';
import { schedaOdg, riquadroNuovoPunto } from './odg.js';
import { schedaPresenze } from './presenze.js';
import { schedaDeleghe } from './deleghe.js';
import { schedaVotazioni } from './votazioni.js';
import { schedaReport } from './report.js';
import { schedaVerbale } from './verbale.js';

// `nuovoPunto`: la scheda ha a destra il riquadro «Nuovo punto», fermo mentre la pagina scorre (non nelle schede da
// stampare, Report e Bozza del verbale, che restano a tutta larghezza; mai ad assemblea chiusa).
const SCHEDE = [
  { id: 'odg', titolo: 'Ordine del giorno', disegna: schedaOdg, nuovoPunto: true },
  { id: 'presenze', titolo: 'Presenze', disegna: schedaPresenze, nuovoPunto: true },
  { id: 'deleghe', titolo: 'Deleghe', disegna: schedaDeleghe, nuovoPunto: true },
  { id: 'votazioni', titolo: 'Votazioni', disegna: schedaVotazioni, nuovoPunto: true },
  { id: 'report', titolo: 'Report', disegna: schedaReport },
  // la testata ha già un collegamento «Verbale» (alla pagina Verbali): la scheda ha un nome diverso
  { id: 'verbale', titolo: 'Bozza del verbale', disegna: schedaVerbale },
];

// Che cosa mostrano le schede della seduta dal vivo per un'assemblea registrata come già svolta.
const SENZA_SEDUTA = {
  presenze: () => senzaSeduta('presenze'),
  deleghe: () => senzaSeduta('deleghe'),
  votazioni: (ctx) => `${senzaSeduta('votazioni')}
    <ol class="punti">${ctx.punti.map((p, i) => `<li class="punto"><div class="punto-testo"><strong>${i + 1}. ${esc(p.testo)}</strong>
      <p>${etichettaEsito(p, ctx.assemblea)}</p></div></li>`).join('')}</ol>
    <p><a href="#/assemblee/${encodeURIComponent(ctx.id)}/odg">Vai all'ordine del giorno per registrare o correggere gli esiti</a></p>`,
  // la bozza del verbale nasce da presenze e voti registrati dal vivo, che qui non ci sono
  verbale: (ctx) => `<p class="avviso">Assemblea registrata come già svolta, senza seduta dal vivo: senza presenze né voti registrati
    la bozza del verbale non si compone. Il verbale firmato si allega nella pagina
    <a href="#/verbali/${encodeURIComponent(ctx.id)}">Verbali</a>.</p>`,
};

// Tabelle che un altro dispositivo può modificare durante la seduta.
const TABELLE_VIVE = ['assemblee', 'teste_assemblea', 'punti_odg', 'presenze', 'deleghe', 'voti'];

// Il contesto resta in vita mentre si passa da una scheda all'altra della stessa assemblea.
let corrente = null;

// Legge tutto quello che serve alla seduta; non tocca il contesto.
async function leggiSeduta(ctx) {
  const { stato, id } = ctx;
  const [assemblee, teste, punti, presenze, deleghe, verbali] = await Promise.all([
    deposito.leggi('assemblee', { id }),
    deposito.leggi('teste_assemblea', { assemblea_id: id }),
    deposito.leggi('punti_odg', { assemblea_id: id }),
    deposito.leggi('presenze', { assemblea_id: id }),
    deposito.leggi('deleghe', { assemblea_id: id }),
    deposito.leggi('verbali', { assemblea_id: id }),
  ]);
  if (!assemblee.length) throw new Error('assemblea non trovata');
  const voti = await deposito.leggi('voti', { punto_id: punti.map((p) => p.id) });
  const assemblea = assemblee[0];
  punti.sort((a, b) => a.ordine - b.ordine);
  return {
    // impronta dei dati letti: se dopo una rilettura è uguale, non c'è niente da ridisegnare
    impronta: JSON.stringify([assemblea, teste, punti, presenze, deleghe, voti, verbali]),
    assemblea, teste, presenze, deleghe, voti,
    verbale: verbali[0] ?? null,
    punti,
    solaLettura: assemblea.stato === 'chiusa',
    senzaSeduta: assemblea.stato === 'chiusa' && !teste.length,
    seduta: statoSeduta({
      assemblea, teste, presenze, deleghe,
      millesimi: stato.dati.millesimi, tabellaProprietaId: stato.modello.tabellaProprieta?.id,
    }),
  };
}

async function carica(ctx) {
  Object.assign(ctx, await leggiSeduta(ctx));
}

function barraQuorum(ctx) {
  const a = ctx.assemblea;
  if (a.stato === 'bozza') return '<span>Seduta non ancora aperta.</span>';
  if (ctx.senzaSeduta) return '<span>Assemblea registrata come già svolta: senza seduta dal vivo non ci sono presenze né quorum.</span>';
  const { quorum, righe, avvisi } = ctx.seduta;
  const prima = a.convocazione === 'prima';
  const perDelega = righe.filter((r) => r.stato === 'delega').length;
  // soglie: prima convocazione maggioranza delle teste e 2/3 dei millesimi; seconda 1/3 e 1/3
  const testeNecessarie = prima ? Math.floor(quorum.testeTotali / 2) + 1 : Math.ceil(quorum.testeTotali / 3);
  const pesoNecessario = Math.ceil(((prima ? 2 : 1) * quorum.pesoTotale) / 3);
  return `
    <span><strong>${quorum.testePresenti}</strong> di ${quorum.testeTotali} teste presenti${perDelega ? ` (${perDelega} per delega)` : ''}</span>
    <span><strong>${millesimi(daInteri(quorum.pesoPresente))}</strong> di ${millesimi(daInteri(quorum.pesoTotale))} millesimi</span>
    <span class="${quorum.raggiunto ? 'quorum-si' : 'quorum-no'}">Quorum di ${prima ? 'prima' : 'seconda'} convocazione:
      <strong>${quorum.raggiunto ? 'raggiunto' : 'non raggiunto'}</strong>
      <span class="soglia">(servono ${testeNecessarie} teste e ${millesimi(daInteri(pesoNecessario))} millesimi)</span></span>
    ${avvisi.length ? `<a href="#/assemblee/${encodeURIComponent(a.id)}/deleghe" class="quorum-avvisi">${avvisi.length} ${avvisi.length === 1 ? 'avviso' : 'avvisi'}</a>` : ''}`;
}

function disegna(ctx) {
  const { radice } = ctx;
  const scheda = SCHEDE.find((s) => s.id === ctx.scheda) ?? SCHEDE[0];
  ctx.daDisegnare = false;
  radice.querySelector('#asm-testata').innerHTML = testata(ctx);
  radice.querySelector('#asm-schede').innerHTML = SCHEDE.map((s) =>
    `<a href="#/assemblee/${encodeURIComponent(ctx.id)}/${s.id}" ${s.id === scheda.id ? 'aria-current="page"' : ''}>${esc(s.titolo)}</a>`).join('');
  ctx.memoria[scheda.id] ??= {};
  // un contenitore nuovo a ogni disegno: i gestori di eventi della scheda precedente spariscono con lui
  const contenitore = document.createElement('div');
  const zona = radice.querySelector('#asm-scheda');
  // il campo di ricerca in uso resta in uso anche dopo il ridisegno (il testo lo ricorda già la scheda)
  const attivo = document.activeElement;
  const ricerca = attivo?.type === 'search' && attivo.id && zona.contains(attivo) ? { id: attivo.id, cursore: attivo.selectionStart } : null;
  zona.replaceChildren(contenitore);
  // senza seduta presenze, deleghe e voti non esistono: la scheda lo dice invece di mostrare elenchi vuoti
  if (ctx.senzaSeduta && SENZA_SEDUTA[scheda.id]) contenitore.innerHTML = SENZA_SEDUTA[scheda.id](ctx);
  else scheda.disegna(ctx, contenitore);
  if (ricerca) {
    const campo = contenitore.querySelector(`#${CSS.escape(ricerca.id)}`);
    campo?.focus({ preventScroll: true });
    try { campo?.setSelectionRange(ricerca.cursore, ricerca.cursore); } catch { /* il cursore torna in fondo */ }
  }
  disegnaRiquadro(ctx, scheda);
  radice.querySelector('#asm-quorum').innerHTML = barraQuorum(ctx);
}

// Il riquadro «Nuovo punto» a destra della scheda: ridisegnato a ogni disegno (quel che vi si scrive resta in ctx.memoria).
function disegnaRiquadro(ctx, scheda) {
  const laterale = ctx.radice.querySelector('#asm-laterale');
  const con = Boolean(scheda.nuovoPunto) && !ctx.solaLettura;
  ctx.radice.querySelector('.asm-corpo').classList.toggle('con-laterale', con);
  laterale.hidden = !con;
  if (!con) {
    laterale.replaceChildren();
    return;
  }
  // prima si disegna il riquadro nuovo, poi si toglie il vecchio (vedi riquadroNuovoPunto)
  const riquadro = document.createElement('div');
  riquadroNuovoPunto(ctx, riquadro);
  laterale.replaceChildren(riquadro);
}

function mostraErrore(ctx, testo, riprova) {
  const riquadro = ctx.radice.querySelector('#asm-errore');
  riquadro.innerHTML = `<span>${esc(testo)}</span> <button type="button" data-fai="riprova">Riprova</button> <button type="button" class="secondario" data-fai="chiudi">Chiudi</button>`;
  riquadro.hidden = false;
  riquadro.onclick = (evento) => {
    const fai = evento.target.dataset.fai;
    if (!fai) return;
    riquadro.hidden = true;
    if (fai === 'riprova') riprova();
  };
  riquadro.scrollIntoView({ block: 'nearest' });
}

// Tempo reale: quando un altro dispositivo modifica qualcosa si rilegge e, solo se i dati sono cambiati, si ridisegna.
// Mentre è in corso una scrittura propria, è aperta una finestra di conferma o si sta scrivendo in un campo,
// l'aggiornamento aspetta: ridisegnare ora farebbe perdere quello che si sta facendo.
function ascoltaModifiche(ctx) {
  let attesa = null;
  let daRileggere = false;
  const inScrittura = () => {
    const attivo = document.activeElement;
    return Boolean(attivo && ctx.radice.contains(attivo)
      && attivo.matches('textarea, select, input:not([type="checkbox"], [type="radio"], [type="file"], [type="button"], [type="submit"], [type="search"])'));
  };
  const impegnato = () => ctx.occupato || Boolean(document.querySelector('dialog[open]')) || inScrittura();
  const tra = (millisecondi) => { attesa ??= setTimeout(giro, millisecondi); };

  async function giro() {
    attesa = null;
    if (!ctx.vivo()) return;
    if (impegnato()) { tra(400); return; }
    if (daRileggere) {
      daRileggere = false;
      let letti;
      try {
        letti = await leggiSeduta(ctx);
      } catch (errore) {
        if (ctx.vivo()) mostraErrore(ctx, `Non è stato possibile aggiornare i dati dell'assemblea: ${errore.message}`, () => ctx.ricarica());
        return;
      }
      if (!ctx.vivo()) return;
      // una modifica propria arriva qui già letta e disegnata: l'impronta è la stessa e non si tocca nulla
      if (letti.impronta !== ctx.impronta) {
        Object.assign(ctx, letti);
        ctx.daDisegnare = true;
      }
    }
    // se intanto è partita una scrittura propria, a ridisegnare pensa lei
    if (ctx.daDisegnare && !ctx.occupato) {
      if (impegnato()) { tra(400); return; }
      disegna(ctx);
    }
  }

  // più modifiche ravvicinate (per esempio il flag totale) danno una sola rilettura
  const smetti = ctx.deposito.ascolta(TABELLE_VIVE, () => {
    daRileggere = true;
    tra(150);
  });
  ctx.allaChiusura.push(smetti, () => clearTimeout(attesa));
}

// La barra del quorum è fissa in fondo e va a capo sugli schermi più stretti: la sua altezza (--altezza-quorum) serve al
// riquadro fisso a destra per non finirci sotto.
function misuraQuorum(ctx) {
  const quorum = ctx.radice.querySelector('#asm-quorum');
  if (typeof ResizeObserver !== 'function') return;
  const osserva = new ResizeObserver(() => ctx.radice.style.setProperty('--altezza-quorum', `${quorum.offsetHeight}px`));
  osserva.observe(quorum);
  ctx.allaChiusura.push(() => osserva.disconnect());
}

function creaContesto(stato, contenitore, id) {
  contenitore.innerHTML = `
    <div class="assemblea">
      <p><a href="#/assemblee">← Assemblee</a></p>
      <header class="testata" id="asm-testata"><p class="nota">Caricamento…</p></header>
      <div id="asm-errore" class="avviso grave" role="alert" hidden></div>
      <nav class="schede" id="asm-schede" aria-label="Schede dell'assemblea"></nav>
      <div class="asm-corpo">
        <section id="asm-scheda"></section>
        <aside id="asm-laterale" class="asm-laterale no-stampa" aria-label="Nuovo punto all'ordine del giorno" hidden></aside>
      </div>
      <footer class="quorum" id="asm-quorum" aria-live="polite"></footer>
    </div>`;
  const unitaPerId = new Map(stato.dati.unita.map((u) => [u.id, u]));
  const ctx = {
    stato, deposito, id,
    radice: contenitore.querySelector('.assemblea'),
    scheda: null,
    memoria: {},
    allaChiusura: [],
    occupato: false,
    vivo: () => corrente === ctx && ctx.radice.isConnected,
    unitaDi: (testa) => testa.unita.map((u) => unitaPerId.get(u)).filter(Boolean).sort(perCodice).map((u) => u.codice).join(', '),

    rileggi: () => carica(ctx),
    mostraErrore: (testo, riprova) => mostraErrore(ctx, testo, riprova),

    async ricarica() {
      try {
        await carica(ctx);
      } catch (errore) {
        if (ctx.vivo()) mostraErrore(ctx, `Non è stato possibile leggere i dati dell'assemblea: ${errore.message}`, () => ctx.ricarica());
        return;
      }
      if (ctx.vivo()) disegna(ctx);
    },

    // Una scrittura alla volta: mentre è in corso i tasti sono spenti, così un doppio tocco non la ripete.
    async esegui(azione) {
      if (ctx.occupato) return;
      ctx.occupato = true;
      ctx.radice.setAttribute('aria-busy', 'true');
      ctx.radice.querySelector('#asm-errore').hidden = true;
      let fallita = null;
      try {
        await azione();
      } catch (errore) {
        fallita = errore;
      }
      // si rilegge comunque: la pagina deve mostrare quello che c'è davvero nel deposito
      await ctx.ricarica();
      ctx.occupato = false;
      ctx.radice.removeAttribute('aria-busy');
      if (fallita && ctx.vivo()) mostraErrore(ctx, `Operazione non riuscita: ${fallita.message}`, () => ctx.esegui(azione));
    },
  };
  collegaTestata(ctx, () => disegna(ctx));
  ascoltaModifiche(ctx);
  misuraQuorum(ctx);
  return ctx;
}

export async function dettaglioAssemblea(stato, contenitore, id, scheda) {
  const stessa = corrente && corrente.id === id && corrente.radice.isConnected && corrente.assemblea;
  const ctx = stessa ? corrente : creaContesto(stato, contenitore, id);
  corrente = ctx;
  ctx.scheda = scheda;
  // app.js chiama questa funzione quando si cambia pagina; passando a un'altra scheda la pagina resta la stessa
  stato.allUscita = () => {
    queueMicrotask(() => {
      if (ctx.vivo() && location.hash.startsWith(`#/assemblee/${encodeURIComponent(id)}`)) return;
      if (corrente === ctx) corrente = null;
      for (const chiudi of ctx.allaChiusura.splice(0)) chiudi();
    });
  };
  // cambio di scheda: si mostra subito con i dati già letti, poi si aggiornano
  if (stessa) disegna(ctx);
  await ctx.ricarica();
}
