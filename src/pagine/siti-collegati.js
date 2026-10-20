// Riquadro «Siti collegati»: i siti esterni del condominio (portale dell'amministratore, fornitori…) con indirizzo
// e nome utente. La password non si salva mai: il sito si apre in una nuova scheda e l'accesso lo fa chi lo usa,
// con il gestore password del browser.
import { esc } from '../ui/html.js';
import { deposito } from '../dati/client.js';
import { indirizzoWeb } from '../dati/contatti.js';


function modulo(sito) {
  return `
    <form class="modulo" data-sito-modulo="${esc(sito?.id ?? '')}">
      <label>Nome <input name="nome" required placeholder="per esempio Portale amministratore" value="${esc(sito?.nome ?? '')}"></label>
      <label>Indirizzo <input name="indirizzo" required inputmode="url" placeholder="www.esempio.it" value="${esc(sito?.indirizzo ?? '')}"></label>
      <label>Nome utente <input name="utente" autocomplete="off" placeholder="facoltativo" value="${esc(sito?.utente ?? '')}"></label>
      <label>Note <input name="note" placeholder="facoltative" value="${esc(sito?.note ?? '')}"></label>
      <p class="nota">La password non si salva qui: la ricorda il browser quando accedi al sito.</p>
      <p class="errore" role="alert"></p>
      <div class="azioni"><button type="submit">Salva</button> <button type="button" class="secondario" data-sito="annulla">Annulla</button></div>
    </form>`;
}

export function riquadroSiti(zona) {
  let siti = [];
  let aperto = null; // id del sito in modifica, 'nuovo', oppure null
  let mancaTabella = false;

  const disegna = () => {
    zona.innerHTML = `
      <h2>Siti collegati</h2>
      ${mancaTabella ? '<p class="avviso">I siti collegati non sono ancora attivi nel database (manca la tabella «siti_collegati»).</p>' : ''}
      <ul class="siti">${siti.map((s) => (aperto === s.id ? `<li>${modulo(s)}</li>` : `
        <li class="sito">
          <a class="pulsante" href="${esc(s.indirizzo)}" target="_blank" rel="noopener noreferrer" title="Si apre in una nuova scheda: l'accesso lo fai tu">Apri e accedi</a>
          <strong>${esc(s.nome)}</strong>
          <br><span class="nota">${esc(new URL(s.indirizzo).hostname)}</span>
          ${s.utente ? `<br><span class="nota">utente</span> <code>${esc(s.utente)}</code>
            <button type="button" class="collegamento piccolo" data-sito="copia" data-id="${esc(s.id)}">copia</button>` : ''}
          ${s.note ? `<br><span class="nota">${esc(s.note)}</span>` : ''}
          <br><button type="button" class="collegamento piccolo" data-sito="modifica" data-id="${esc(s.id)}">modifica</button>
          · <button type="button" class="collegamento piccolo" data-sito="elimina" data-id="${esc(s.id)}">elimina</button>
        </li>`)).join('') || (mancaTabella ? '' : '<li class="nota">Nessun sito: aggiungi per esempio il portale dell’amministratore.</li>')}</ul>
      ${aperto === 'nuovo' ? modulo(null) : mancaTabella ? '' : '<button type="button" class="secondario" data-sito="nuovo">Aggiungi un sito</button>'}`;
    zona.querySelector('form [name="nome"]')?.focus();
  };

  const carica = async () => {
    try {
      siti = (await deposito.leggi('siti_collegati')).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      mancaTabella = false;
    } catch (e) {
      // la tabella si crea con la migrazione 017: senza, il riquadro lo dice e il resto della pagina funziona
      mancaTabella = true;
      siti = [];
      if (!/siti_collegati|relation|schema cache|does not exist/i.test(e.message)) {
        if (zona.isConnected) zona.innerHTML = `<h2>Siti collegati</h2><p class="errore">Non letti: ${esc(e.message)}</p>`;
        return;
      }
    }
    if (zona.isConnected) disegna();
  };

  zona.addEventListener('click', async (evento) => {
    const bottone = evento.target.closest('[data-sito]');
    if (!bottone) return;
    const { sito: azione, id } = bottone.dataset;
    const sito = siti.find((s) => s.id === id);
    if (azione === 'nuovo') aperto = 'nuovo';
    if (azione === 'annulla') aperto = null;
    if (azione === 'modifica') aperto = id;
    if (azione === 'copia' && sito) {
      try {
        await navigator.clipboard.writeText(sito.utente);
        bottone.textContent = 'copiato';
        setTimeout(() => { bottone.textContent = 'copia'; }, 1500);
      } catch {
        bottone.textContent = 'copia non riuscita';
      }
      return;
    }
    if (azione === 'elimina' && sito) {
      if (!window.confirm(`Togliere «${sito.nome}» dai siti collegati?`)) return;
      try {
        await deposito.elimina('siti_collegati', { id });
      } catch (e) {
        window.alert(`Non eliminato: ${e.message}`);
      }
      await carica();
      return;
    }
    disegna();
  });

  zona.addEventListener('submit', async (evento) => {
    const form = evento.target.closest('[data-sito-modulo]');
    if (!form) return;
    evento.preventDefault();
    evento.stopPropagation();
    const errore = form.querySelector('.errore');
    const v = (n) => form.elements[n].value.trim();
    let valori;
    try {
      if (!v('nome')) throw new Error('Scrivi il nome del sito.');
      valori = { nome: v('nome'), indirizzo: indirizzoWeb(v('indirizzo')), utente: v('utente') || null, note: v('note') || null };
    } catch (e) {
      errore.textContent = e.message;
      return;
    }
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      const id = form.dataset.sitoModulo;
      if (id) await deposito.aggiorna('siti_collegati', { id }, valori);
      else await deposito.inserisci('siti_collegati', [valori]);
      aperto = null;
      await carica();
    } catch (e) {
      errore.textContent = `Non salvato: ${e.message}`;
      form.querySelector('button[type="submit"]').disabled = false;
    }
  });

  carica();
}
