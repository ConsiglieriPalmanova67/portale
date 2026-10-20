// Importazione della convocazione da PDF: estrazione del testo, anteprima modificabile, conferma.
// Nulla viene salvato finché non si conferma. Alla conferma: assemblea in bozza, punti all'ordine
// del giorno (tabella e maggioranza si scelgono dopo), PDF in archivio. Se un passaggio fallisce
// si riparte da dove si era arrivati, senza creare una seconda assemblea.
import { testoDaPdf } from '../../dati/pdf.js';
import { leggiConvocazione } from '../../assemblea/convocazione.js';
import { esc, data } from '../../ui/html.js';
import { TIPI, CONVOCAZIONI, TIPI_PUNTO, ARCHIVIO_VERBALI, percorsoConvocazione, titoloAssemblea } from './comuni.js';

const opzioni = (voci, scelta, vuota) => `${vuota ? `<option value="">${esc(vuota)}</option>` : ''}${Object.entries(voci).map(([valore, nome]) =>
  `<option value="${valore}" ${valore === scelta ? 'selected' : ''}>${esc(nome)}</option>`).join('')}`;

function rigaPunto(punto = { testo: '', tipo: 'delibera' }) {
  return `
    <li class="punto-bozza">
      <textarea name="punto_testo" rows="2" aria-label="Testo del punto" placeholder="Testo del punto">${esc(punto.testo)}</textarea>
      <select name="punto_tipo" aria-label="Tipo del punto">${opzioni(TIPI_PUNTO, punto.tipo)}</select>
      <span class="tasti">
        <button type="button" class="secondario" data-azione="su" aria-label="Sposta su">↑</button>
        <button type="button" class="secondario" data-azione="giu" aria-label="Sposta giù">↓</button>
        <button type="button" class="secondario" data-azione="elimina-punto">Elimina</button>
      </span>
    </li>`;
}

function anteprima(file, letta) {
  // la seduta che si tiene davvero è di norma la seconda convocazione; la prima se la seconda manca
  const haSeconda = Object.values(letta.seconda).some(Boolean);
  const haPrima = Object.values(letta.prima).some(Boolean);
  const convocazione = !haSeconda && haPrima ? 'prima' : 'seconda';
  const seduta = letta[convocazione];
  return `
    <section class="importazione">
      <h2>Convocazione letta da «${esc(file.name || 'PDF')}»</h2>
      ${letta.avvisi.length
        ? `<div class="avviso" role="status"><strong>Da controllare prima di confermare</strong><ul>${letta.avvisi.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`
        : '<p class="avviso fatto" role="status">Tutti i campi sono stati riconosciuti. Controllali comunque prima di confermare.</p>'}
      <form class="modulo" id="anteprima">
        <p class="nota largo">Nulla viene salvato finché non premi «Crea l'assemblea». Tabella millesimale e maggioranza di ogni punto si scelgono dopo, nell'ordine del giorno.</p>
        <label>Tipo <select name="tipo" required>${opzioni(TIPI, letta.tipo, letta.tipo ? '' : 'Scegli il tipo…')}</select></label>
        <label>Data della lettera <input type="date" name="data_lettera" value="${esc(letta.data_lettera)}"></label>
        <fieldset class="largo campi">
          <legend>Seduta (la convocazione in cui l'assemblea si tiene davvero)</legend>
          <label>Convocazione <select name="convocazione">${opzioni(CONVOCAZIONI, convocazione)}</select></label>
          <label>Data <input type="date" name="data" required value="${esc(seduta.data)}"></label>
          <label>Ora <input type="time" name="ora" value="${esc(seduta.ora)}"></label>
          <label class="largo">Luogo <input type="text" name="luogo" value="${esc(seduta.luogo)}"></label>
        </fieldset>
        <fieldset class="largo campi" id="prima-convocazione" ${convocazione === 'prima' ? 'hidden' : ''}>
          <legend>Prima convocazione</legend>
          <label>Data <input type="date" name="prima_data" value="${esc(haSeconda ? letta.prima.data : '')}"></label>
          <label>Ora <input type="time" name="prima_ora" value="${esc(haSeconda ? letta.prima.ora : '')}"></label>
          <label class="largo">Luogo <input type="text" name="prima_luogo" value="${esc(haSeconda ? letta.prima.luogo : '')}"></label>
        </fieldset>
        <fieldset class="largo">
          <legend>Ordine del giorno</legend>
          <ol class="punti-bozza">${letta.punti.map(rigaPunto).join('')}</ol>
          <div><button type="button" class="secondario" data-azione="aggiungi-punto">Aggiungi un punto</button></div>
        </fieldset>
        <p id="stessa-data" class="avviso largo" role="status" hidden></p>
        <div class="azioni">
          <button type="submit">Crea l'assemblea</button>
          <button type="button" class="secondario" data-azione="annulla">Annulla</button>
        </div>
        <p class="errore" role="alert"></p>
      </form>
    </section>`;
}

// Dal modulo ai valori da salvare; lancia un Error se manca qualcosa.
function leggiModulo(form) {
  const v = Object.fromEntries(new FormData(form));
  const testo = (valore) => String(valore ?? '').replace(/\s+/g, ' ').trim() || null;
  const punti = [...form.querySelectorAll('.punto-bozza')].map((riga) => ({
    testo: testo(riga.querySelector('[name="punto_testo"]').value), tipo: riga.querySelector('[name="punto_tipo"]').value,
  }));
  const vuoto = punti.findIndex((p) => !p.testo);
  if (vuoto >= 0) throw new Error(`Il punto ${vuoto + 1} è vuoto: scrivi il testo oppure eliminalo.`);
  const seconda = v.convocazione === 'seconda';
  return {
    assemblea: {
      tipo: v.tipo, convocazione: v.convocazione, data: v.data, ora: v.ora || null, luogo: testo(v.luogo),
      // i campi della prima convocazione servono solo se la seduta è la seconda
      prima_data: seconda ? v.prima_data || null : null, prima_ora: seconda ? v.prima_ora || null : null, prima_luogo: seconda ? testo(v.prima_luogo) : null,
      data_lettera: v.data_lettera || null,
    },
    punti,
  };
}

// `opzioni`: deposito, esistenti() → assemblee già registrate, scegliAltro() riapre la scelta del file,
// allaChiusura() viene chiamata quando l'anteprima si chiude senza andare al dettaglio.
export async function importaConvocazione(zona, file, { deposito, esistenti, scegliAltro, allaChiusura }) {
  // un'importazione nuova prende il posto di quella precedente
  const gettone = {};
  zona.gettone = gettone;
  const mia = () => zona.gettone === gettone && zona.isConnected;
  const chiudi = () => {
    zona.innerHTML = '';
    allaChiusura();
  };

  zona.innerHTML = `<p class="avviso" role="status">Lettura di «${esc(file.name || 'PDF')}»…</p>`;
  zona.scrollIntoView({ block: 'nearest' });
  let letta;
  try {
    letta = leggiConvocazione(await testoDaPdf(file));
  } catch (errore) {
    if (!mia()) return;
    zona.innerHTML = `<p class="avviso grave" role="alert"><span>${esc(errore.message)}</span>
      <button type="button" data-azione="altro">Scegli un altro file</button> <button type="button" class="secondario" data-azione="annulla">Chiudi</button></p>`;
    zona.onclick = (evento) => {
      const { azione } = evento.target.dataset;
      if (azione === 'annulla') chiudi();
      if (azione === 'altro') scegliAltro();
    };
    return;
  }
  if (!mia()) return;

  zona.innerHTML = anteprima(file, letta);
  const form = zona.querySelector('#anteprima');
  const errore = form.querySelector('.errore');
  const invia = form.querySelector('button[type="submit"]');
  // fin dove è arrivato il salvataggio: serve a riprovare senza doppioni
  const avanzamento = { assembleaId: null, passo: 'niente' };

  // stessa data di un'assemblea già registrata: si avvisa, senza bloccare
  const controllaData = () => {
    const stesse = esistenti().filter((a) => a.data === form.data.value && a.id !== avanzamento.assembleaId);
    const avviso = form.querySelector('#stessa-data');
    avviso.hidden = !stesse.length;
    avviso.textContent = stesse.length
      ? `Attenzione: per il ${data(form.data.value)} risulta già registrata ${stesse.map((a) => `l'${titoloAssemblea(a).toLowerCase()}`).join(' e ')}. Se è la stessa non crearne un'altra: puoi comunque proseguire.`
      : '';
  };
  controllaData();

  form.onchange = (evento) => {
    if (evento.target.name === 'data') controllaData();
    if (evento.target.name === 'convocazione') form.querySelector('#prima-convocazione').hidden = evento.target.value === 'prima';
  };

  zona.onclick = (evento) => {
    const { azione } = evento.target.dataset;
    const riga = evento.target.closest('.punto-bozza');
    if (azione === 'aggiungi-punto') {
      form.querySelector('.punti-bozza').insertAdjacentHTML('beforeend', rigaPunto());
      form.querySelector('.punto-bozza:last-child textarea').focus();
    }
    if (azione === 'elimina-punto') riga.remove();
    if (azione === 'su' && riga.previousElementSibling) riga.previousElementSibling.before(riga);
    if (azione === 'giu' && riga.nextElementSibling) riga.nextElementSibling.after(riga);
    if (azione === 'annulla') chiudi();
  };

  async function salva({ assemblea, punti }) {
    if (avanzamento.assembleaId) {
      // secondo tentativo: l'assemblea c'è già, si aggiornano i suoi dati e si riscrivono i suoi punti
      const [attuale] = await deposito.leggi('assemblee', { id: avanzamento.assembleaId });
      if (attuale && attuale.stato !== 'bozza') throw new Error('l\'assemblea creata al primo tentativo nel frattempo è stata aperta: completala dalla sua pagina.');
      if (attuale) {
        await deposito.aggiorna('assemblee', { id: attuale.id }, assemblea);
        await deposito.elimina('punti_odg', { assemblea_id: attuale.id });
      } else {
        // nel frattempo è stata eliminata: si ricomincia da capo
        avanzamento.assembleaId = null;
      }
      avanzamento.passo = attuale ? 'assemblea' : 'niente';
    }
    if (!avanzamento.assembleaId) {
      const [creata] = await deposito.inserisci('assemblee', [{ ...assemblea, stato: 'bozza' }]);
      avanzamento.assembleaId = creata.id;
      avanzamento.passo = 'assemblea';
    }
    const id = avanzamento.assembleaId;
    if (punti.length) await deposito.inserisci('punti_odg', punti.map((p, i) => ({ assemblea_id: id, ordine: i + 1, testo: p.testo, tipo: p.tipo })));
    avanzamento.passo = 'punti';
    const percorso = await deposito.caricaFile(ARCHIVIO_VERBALI, percorsoConvocazione(id), file);
    await deposito.aggiorna('assemblee', { id }, { convocazione_path: percorso });
  }

  const FALLITO = {
    niente: (m) => `Assemblea non creata: ${m} Nulla è stato salvato: premi di nuovo «Crea l'assemblea» per riprovare.`,
    assemblea: (m) => `L'assemblea è stata creata, ma i punti all'ordine del giorno non sono stati salvati: ${m} Premi «Riprova a completare»: non verrà creata una seconda assemblea.`,
    punti: (m) => `Assemblea e punti sono stati salvati, ma il PDF della convocazione non è stato archiviato: ${m} Premi «Riprova a completare»: non verrà creata una seconda assemblea.`,
  };

  form.onsubmit = async (evento) => {
    evento.preventDefault();
    if (invia.disabled) return;
    let valori;
    try {
      valori = leggiModulo(form);
    } catch (e) {
      errore.textContent = e.message;
      return;
    }
    errore.textContent = '';
    invia.disabled = true;
    try {
      await salva(valori);
      if (mia()) location.hash = `#/assemblee/${encodeURIComponent(avanzamento.assembleaId)}`;
    } catch (e) {
      errore.textContent = FALLITO[avanzamento.passo](e.message);
      if (avanzamento.assembleaId) {
        invia.textContent = 'Riprova a completare';
        form.querySelector('[data-azione="annulla"]').textContent = 'Chiudi (l\'assemblea resta tra le pianificate, da completare a mano)';
      }
    } finally {
      invia.disabled = false;
    }
  };
}
