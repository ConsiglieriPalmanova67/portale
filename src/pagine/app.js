import { sessioneCorrente, accedi, esci, sonoConsigliere, caricaDati, quandoEsce, inProva, chiediNuovaPassword, arrivoDaRecupero, quandoRecupero, impostaPassword } from '../dati/client.js';
import { costruisciModello } from '../dati/modello.js';
import { esc } from '../ui/html.js';
import { elencoUnita, dettaglioUnita } from './unita.js';
import { schedaCondomino } from './condomino.js';
import { letturaVerbale } from './lettura-verbale.js';
import { elencoTeste } from './teste.js';
import { contabilita } from './contabilita.js';
import { consiglio } from './consiglio.js';
import { elencoAssemblee } from './assemblea/elenco.js';
import { dettaglioAssemblea } from './assemblea/dettaglio.js';
import { archivioDeleghe } from './archivio-deleghe.js';
import { verbali } from './verbali.js';
import { todo } from './todo.js';
import { documenti } from './documenti.js';
import { delibere } from './delibere.js';
import { estrazione } from './estrazione/pagina.js';
import { CATEGORIE_DOCUMENTO } from '../dati/documenti.js';

const $ = (selettore) => document.querySelector(selettore);
// `allUscita`: una pagina può lasciare qui una funzione da chiamare quando si passa a un'altra
// (per esempio per smettere di ascoltare le modifiche).
const stato = { dati: null, modello: null, oggi: new Date().toISOString().slice(0, 10), allUscita: null };

const PAGINE = {
  // #/unita/<codice>/cambio apre già il modulo del cambio di proprietà
  unita: (c, parametro, scheda) => (parametro ? dettaglioUnita(stato, c, parametro, scheda) : elencoUnita(stato, c)),
  // #/condomini/<id del soggetto>: la scheda di un condomino
  condomini: (c, parametro) => (parametro ? schedaCondomino(stato, c, parametro) : elencoTeste(stato, c)),
  teste: (c) => elencoTeste(stato, c),
  // #/millesimi/<tabella>: le unità immobiliari che partecipano a quella tabella
  millesimi: (c, parametro) => elencoUnita(stato, c, { tabella: parametro }),
  // #/contabilita/<anno>/<scheda>
  contabilita: (c, parametro, scheda) => contabilita(stato, c, parametro, scheda),
  // #/documenti/<sezione>: solo i documenti di quella sezione (vedi CATEGORIE_DOCUMENTO)
  documenti: (c, parametro) => documenti(stato, c, parametro),
  // #/estrazione/<id dell'estrazione>/<scheda della revisione>
  estrazione: (c, parametro, scheda) => estrazione(stato, c, parametro, scheda),
  consiglio: (c) => consiglio(stato, c),
  // #/lettura-verbale/<id dell'estrazione>: dal verbale a esiti, to-do e nomine
  'lettura-verbale': (c, parametro) => letturaVerbale(stato, c, parametro),
  assemblee: (c, parametro, scheda) => (parametro ? dettaglioAssemblea(stato, c, parametro, scheda) : elencoAssemblee(stato, c)),
  deleghe: (c, parametro) => archivioDeleghe(stato, c, parametro),
  delibere: (c) => delibere(stato, c),
  verbali: (c, parametro) => verbali(stato, c, parametro),
  // #/todo/<assemblea>/<punto>: nuovo to-do a partire da un punto all'ordine del giorno
  todo: (c, parametro, punto) => todo(stato, c, parametro, punto),
};
// Pagine senza voce propria nel menu: si accende quella da cui si raggiungono.
const VOCE_MENU = { millesimi: 'unita', deleghe: 'assemblee', estrazione: 'documenti', condomini: 'teste', 'lettura-verbale': 'documenti' };

// Il menu per macrotemi. Ogni voce porta alla sua prima sezione; quando le sezioni sono più d'una compaiono sotto,
// nella seconda riga. Una sezione è [indirizzo dopo "#/", nome].
const MENU = [
  { nome: 'Anagrafica', sezioni: [['unita', 'Unità immobiliari'], ['teste', 'Condomini']] },
  { nome: 'Contabilità', sezioni: [['contabilita', 'Contabilità']] },
  { nome: 'Documenti', sezioni: [['documenti', 'Tutti'], ...Object.entries(CATEGORIE_DOCUMENTO).map(([chiave, c]) => [`documenti/${chiave}`, c.nome])] },
  { nome: 'Consiglio', sezioni: [['consiglio', 'Consiglio']] },
  { nome: 'Assemblea', sezioni: [['assemblee', 'Storico assemblee'], ['delibere', 'Delibere'], ['verbali', 'Verbali']] },
  { nome: 'Punti aperti', sezioni: [['todo', 'Punti aperti']] },
];

// Accende il macrotema della pagina e, nella seconda riga, la sua sezione.
function disegnaMenu(pagina, parametro) {
  const voce = PAGINE[pagina] ? VOCE_MENU[pagina] ?? pagina : 'unita';
  const indirizzo = pagina === 'documenti' && Object.hasOwn(CATEGORIE_DOCUMENTO, parametro ?? '') ? `documenti/${parametro}` : voce;
  const attivo = MENU.find((m) => m.sezioni.some(([i]) => i === indirizzo));
  $('#menu').innerHTML = MENU.map((m) => `<a href="#/${m.sezioni[0][0]}" aria-current="${m === attivo ? 'page' : 'false'}">${esc(m.nome)}</a>`).join('');
  const sotto = $('#sottomenu');
  sotto.hidden = !attivo || attivo.sezioni.length < 2;
  sotto.innerHTML = sotto.hidden ? '' : attivo.sezioni.map(([i, nome]) => `<a href="#/${i}" aria-current="${i === indirizzo ? 'page' : 'false'}">${esc(nome)}</a>`).join('');
  // sugli schermi stretti i menu scorrono: le voci accese devono restare in vista
  for (const acceso of document.querySelectorAll('#menu a[aria-current="page"], #sottomenu a[aria-current="page"]')) {
    acceso.parentElement.scrollLeft = Math.max(0, acceso.offsetLeft - acceso.parentElement.offsetLeft - 16);
  }
}

function mostra(vista) {
  for (const id of ['vista-accesso', 'vista-attesa', 'vista-app']) $(`#${id}`).hidden = id !== vista;
}

function naviga() {
  if (!stato.modello) return;
  const [, pagina = 'unita', parametro, scheda] = location.hash.split('/');
  const disegna = PAGINE[pagina] ?? PAGINE.unita;
  disegnaMenu(pagina, parametro ? decodeURIComponent(parametro) : undefined);
  stato.allUscita?.();
  stato.allUscita = null;
  disegna($('#contenuto'), parametro ? decodeURIComponent(parametro) : undefined, scheda ? decodeURIComponent(scheda) : undefined);
  window.scrollTo(0, 0);
}

async function entra() {
  mostra('vista-attesa');
  $('#attesa-testo').textContent = 'Caricamento dei dati…';
  try {
    if (!(await sonoConsigliere())) {
      await esci();
      mostra('vista-accesso');
      $('#accesso-errore').textContent = 'Questo utente non ha un mandato di consigliere in corso: l\'accesso non è consentito.';
      return;
    }
    stato.dati = await caricaDati();
    stato.modello = costruisciModello(stato.dati, stato.oggi);
    const sessione = await sessioneCorrente();
    $('#utente').textContent = sessione?.user?.email ?? '';
    $('#fascia-prova').hidden = !inProva;
    // in prova anche i documenti stampati lo dicono (vedi body.prova in stili.css)
    document.body.classList.toggle('prova', inProva);
    $('#esci').hidden = inProva;
    mostra('vista-app');
    naviga();
  } catch (errore) {
    mostra('vista-attesa');
    $('#attesa-testo').innerHTML = `Non è stato possibile caricare i dati: ${esc(errore.message)}. <button type="button" id="riprova">Riprova</button>`;
    $('#riprova').addEventListener('click', entra);
  }
}

$('#modulo-accesso').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const bottone = $('#modulo-accesso button');
  $('#accesso-errore').textContent = '';
  bottone.disabled = true;
  try {
    await accedi($('#email').value.trim(), $('#password').value);
    $('#password').value = '';
    await entra();
  } catch (errore) {
    $('#accesso-errore').textContent = errore.message;
  } finally {
    bottone.disabled = false;
  }
});

// Password dimenticata: il link arriva all'email scritta nel modulo.
$('#password-dimenticata').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  $('#accesso-errore').textContent = '';
  $('#accesso-messaggio').textContent = '';
  if (!$('#email').checkValidity() || !email) {
    $('#accesso-errore').textContent = 'Scrivi prima la tua email, poi premi «Password dimenticata?».';
    $('#email').focus();
    return;
  }
  const bottone = $('#password-dimenticata');
  bottone.disabled = true;
  try {
    await chiediNuovaPassword(email);
    $('#accesso-messaggio').textContent = `Se ${email} è registrata, tra poco ti arriva un'email con il link per scegliere una nuova password. Aprilo da questo computer.`;
  } catch (errore) {
    $('#accesso-errore').textContent = `Email non inviata: ${errore.message}`;
  } finally {
    bottone.disabled = false;
  }
});

// Dal link dell'email: si sceglie la nuova password e si entra.
let inRecupero = false;
function chiediPassword() {
  inRecupero = true;
  mostra('vista-accesso');
  $('#modulo-accesso').hidden = true;
  $('#modulo-nuova-password').hidden = false;
  $('#nuova-password').focus();
}
$('#modulo-nuova-password').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const errore = $('#nuova-password-errore');
  const bottone = $('#modulo-nuova-password button');
  errore.textContent = '';
  if ($('#nuova-password').value !== $('#ripeti-password').value) {
    errore.textContent = 'Le due password non sono uguali.';
    return;
  }
  bottone.disabled = true;
  try {
    await impostaPassword($('#nuova-password').value);
    $('#nuova-password').value = '';
    $('#ripeti-password').value = '';
    $('#modulo-nuova-password').hidden = true;
    $('#modulo-accesso').hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
    inRecupero = false;
    await entra();
  } catch (e) {
    errore.textContent = `Password non salvata: ${e.message}`;
  } finally {
    bottone.disabled = false;
  }
});

$('#esci').addEventListener('click', async () => {
  await esci();
  stato.allUscita?.();
  stato.allUscita = null;
  stato.dati = null;
  stato.modello = null;
  $('#contenuto').innerHTML = '';
  mostra('vista-accesso');
});

// Sessione scaduta o chiusa da un'altra scheda: si torna all'accesso.
quandoEsce(() => {
  if (stato.modello) location.reload();
});

window.addEventListener('hashchange', naviga);

quandoRecupero(chiediPassword);
if (arrivoDaRecupero) chiediPassword();
// con il link di recupero la sessione c'è già, ma prima va scelta la password
else if ((await sessioneCorrente()) && !inRecupero) await entra();
else if (!inRecupero) mostra('vista-accesso');
