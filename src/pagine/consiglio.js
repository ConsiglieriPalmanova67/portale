// Consiglio: i consiglieri con i loro contatti e lo storico degli incarichi dell'amministratore, con dati fiscali
// e contatti. Le modifiche si fanno qui, una scheda per volta; dopo il salvataggio si ricaricano i dati.
import { esc, data, linkCondomino, linkEmail } from '../ui/html.js';
import { deposito, caricaDati, sessioneCorrente } from '../dati/client.js';
import { costruisciModello } from '../dati/modello.js';
import * as controlla from '../dati/contatti.js';
import { ibanLeggibile } from '../dati/contatti.js';

const contatti = (r) => [
  r.email ? linkEmail(r.email) : '',
  r.telefono ? `tel. <a href="tel:${esc(r.telefono.replace(/[^\d+]/g, ''))}">${esc(r.telefono)}</a>` : '',
  r.cellulare ? `cell. <a href="tel:${esc(r.cellulare.replace(/[^\d+]/g, ''))}">${esc(r.cellulare)}</a>` : '',
].filter(Boolean).join('<br>') || '<span class="nota">nessun contatto</span>';

const campo = (nome, etichetta, valore, attributi = '') => `<label>${etichetta} <input name="${nome}" value="${esc(valore ?? '')}" ${attributi}></label>`;

const scelte = (voci, scelta, vuota) => `<option value="">${esc(vuota)}</option>${voci.map(([valore, nome]) =>
  `<option value="${esc(valore)}" ${valore === scelta ? 'selected' : ''}>${esc(nome)}</option>`).join('')}`;

// c null = nuovo consigliere. Il condomino collega il consigliere alle sue unità (scheda del condomino, deleghe);
// l'assemblea di nomina è facoltativa.
function moduloConsigliere(c, { soggetti, assemblee, oggi }) {
  return `
    <form class="modulo" data-modulo="consigliere" data-id="${esc(c?.id ?? '')}">
      <h3 class="largo">${c ? 'Modifica il consigliere' : 'Nuovo consigliere'}</h3>
      ${campo('nominativo', 'Nome e cognome', c?.nominativo ?? c?.soggetto?.denominazione, 'required')}
      <label>Condomino (unità) <select name="soggetto_id">${scelte(soggetti.map((x) => [x.id, x.denominazione]), c?.soggetto_id ?? '', 'Non collegato a un condomino')}</select></label>
      ${campo('inizio_mandato', 'Inizio mandato', c ? c.inizio_mandato : oggi, 'type="date" required')}
      ${campo('fine_mandato', 'Fine mandato', c?.fine_mandato, 'type="date"')}
      <label>Assemblea di nomina <select name="assemblea_nomina_id">${scelte(assemblee.map((a) => [a.id, `${data(a.data)} (${a.tipo})`]), c?.assemblea_nomina_id ?? '', 'Non indicata')}</select></label>
      ${campo('carica', 'Carica', c?.carica, 'placeholder="per esempio Presidente"')}
      ${campo('parte_rappresentata', 'Rappresenta', c?.parte_rappresentata, 'placeholder="per esempio Torre 2"')}
      ${campo('email', 'Email', c?.email, 'inputmode="email"')}
      ${campo('telefono', 'Telefono', c?.telefono, 'type="tel"')}
      ${campo('cellulare', 'Cellulare', c?.cellulare, 'type="tel"')}
      <p class="errore largo" role="alert"></p>
      <div class="azioni largo"><button type="submit">Salva</button> <button type="button" class="secondario" data-azione="chiudi">Annulla</button></div>
    </form>`;
}

function moduloAmministratore(a) {
  return `
    <form class="modulo" data-modulo="amministratore" data-id="${esc(a?.id ?? '')}">
      <h3 class="largo">${a ? 'Modifica l\'incarico' : 'Nuovo incarico dell\'amministratore'}</h3>
      ${campo('denominazione', 'Amministratore (studio o nome)', a?.denominazione, 'required')}
      ${campo('partita_iva', 'Partita IVA', a?.partita_iva, 'inputmode="numeric"')}
      ${campo('iban', 'IBAN', ibanLeggibile(a?.iban), 'class="largo"')}
      ${campo('email', 'Email', a?.email, 'inputmode="email"')}
      ${campo('telefono', 'Telefono', a?.telefono, 'type="tel"')}
      ${campo('cellulare', 'Cellulare', a?.cellulare, 'type="tel"')}
      ${campo('dal', 'Dal', a?.dal, 'type="date"')}
      ${campo('al', 'Al', a?.al, 'type="date"')}
      ${campo('compenso', 'Compenso', a?.compenso)}
      <label class="largo">Note <textarea name="note" rows="2">${esc(a?.note ?? '')}</textarea></label>
      <p class="errore largo" role="alert"></p>
      <div class="azioni largo"><button type="submit">Salva</button> <button type="button" class="secondario" data-azione="chiudi">Annulla</button></div>
    </form>`;
}

const MANSIONI = ['Contabilità', 'Segreteria', 'Ufficio tecnico', 'Sinistri e assicurazioni', 'Recupero crediti', 'Collaboratore dell’amministratore'];

// Un collaboratore o referente dello studio dell'amministratore; r null = nuovo, per l'incarico amministratoreId.
function moduloReferente(r, amministratoreId) {
  return `
    <form class="modulo" data-modulo="referente" data-id="${esc(r?.id ?? '')}" data-amministratore="${esc(r?.amministratore_id ?? amministratoreId)}">
      <h3 class="largo">${r ? 'Modifica il referente' : 'Nuovo collaboratore o referente'}</h3>
      ${campo('nome', 'Nome e cognome', r?.nome, 'required')}
      ${campo('mansione', 'Mansione', r?.mansione, 'list="mansioni-referenti" placeholder="per esempio Contabilità"')}
      ${campo('email', 'Email', r?.email, 'inputmode="email"')}
      ${campo('telefono', 'Telefono', r?.telefono, 'type="tel"')}
      ${campo('cellulare', 'Cellulare', r?.cellulare, 'type="tel"')}
      ${campo('note', 'Note', r?.note, 'placeholder="per esempio orari, giorni in ufficio"')}
      <p class="errore largo" role="alert"></p>
      <div class="azioni largo"><button type="submit">Salva</button> <button type="button" class="secondario" data-azione="chiudi">Annulla</button></div>
    </form>`;
}

// Valori del modulo controllati; lancia un Error con il messaggio da mostrare.
function valori(form) {
  const v = (nome) => form.elements[nome]?.value.trim() ?? '';
  const comuni = { email: controlla.email(v('email')), telefono: controlla.telefono(v('telefono')), cellulare: controlla.telefono(v('cellulare')) };
  if (form.dataset.modulo === 'referente') {
    if (!v('nome')) throw new Error('Scrivi nome e cognome del referente.');
    return { nome: v('nome'), mansione: v('mansione') || null, note: v('note') || null, ...comuni };
  }
  if (form.dataset.modulo === 'consigliere') {
    if (!v('nominativo')) throw new Error('Scrivi nome e cognome del consigliere.');
    if (!v('inizio_mandato')) throw new Error('Indica la data di inizio del mandato.');
    if (v('fine_mandato') && v('fine_mandato') < v('inizio_mandato')) throw new Error('La fine del mandato è prima dell’inizio.');
    return {
      nominativo: v('nominativo'), soggetto_id: v('soggetto_id') || null, inizio_mandato: v('inizio_mandato'), fine_mandato: v('fine_mandato') || null,
      assemblea_nomina_id: v('assemblea_nomina_id') || null, carica: v('carica') || null, parte_rappresentata: v('parte_rappresentata') || null, ...comuni,
    };
  }
  if (!v('denominazione')) throw new Error('Scrivi il nome dell\'amministratore.');
  if (v('dal') && v('al') && v('al') < v('dal')) throw new Error('La fine dell\'incarico è prima dell\'inizio.');
  return {
    denominazione: v('denominazione'), partita_iva: controlla.partitaIva(v('partita_iva')), iban: controlla.iban(v('iban')), ...comuni,
    dal: v('dal') || null, al: v('al') || null, compenso: v('compenso') || null, note: v('note') || null,
  };
}

export function consiglio(stato, contenitore) {
  // i gestori stanno su un riquadro della pagina, non sul contenitore comune: cambiando pagina spariscono con lui
  contenitore.innerHTML = '<div id="consiglio-pagina"></div>';
  const pagina = contenitore.querySelector('#consiglio-pagina');
  let aperto = null; // 'consigliere:<id>' | 'consigliere:nuovo' | 'amministratore:<id>' | 'amministratore:nuovo'
  // per il modulo del consigliere: le assemblee (lette a parte, non sono nei dati caricati all'ingresso) e chi è collegato
  let assemblee = [];
  let utenteId = null;
  // collaboratori e referenti dell'amministratore: null finché la tabella non esiste nel database (migrazione 018)
  let referenti = [];
  const caricaReferenti = async () => {
    try {
      referenti = await deposito.leggi('referenti_amministratore');
    } catch {
      referenti = null;
    }
  };
  Promise.all([deposito.leggi('assemblee'), sessioneCorrente()]).then(([tutte, sessione]) => {
    assemblee = [...tutte].sort((a, b) => b.data.localeCompare(a.data));
    utenteId = sessione?.user?.id ?? null;
    if (aperto?.startsWith('consigliere:') && pagina.isConnected) disegna();
  }).catch(() => {});
  caricaReferenti().then(() => pagina.isConnected && disegna());

  function disegna() {
    const { dati, modello, oggi } = stato;
    const righe = dati.consiglieri
      .map((c) => ({ ...c, soggetto: modello.soggetti.get(c.soggetto_id), inCarica: !c.fine_mandato || c.fine_mandato >= oggi }))
      .map((c) => ({ ...c, nome: c.nominativo || c.soggetto?.denominazione || 'Senza nome' }))
      .sort((a, b) => Number(b.inCarica) - Number(a.inCarica) || a.nome.localeCompare(b.nome, 'it'));
    const perModulo = { soggetti: [...modello.soggetti.values()].sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it')), assemblee, oggi };
    const incarichi = [...(dati.amministratori ?? [])].sort((a, b) => (b.dal ?? '').localeCompare(a.dal ?? ''));

    // sotto l'incarico: i collaboratori e referenti dello studio, ognuno con mansione e contatti
    const rigaReferenti = (a) => {
      if (referenti === null) return '';
      const suoi = referenti.filter((x) => x.amministratore_id === a.id)
        .sort((x, y) => (x.mansione ?? '').localeCompare(y.mansione ?? '', 'it') || x.nome.localeCompare(y.nome, 'it'));
      const riga = (x) => (aperto === `referente:${x.id}`
        ? `<tr><td colspan="5">${moduloReferente(x)}</td></tr>`
        : `<tr><td>${esc(x.nome)}</td><td>${esc(x.mansione) || '<span class="nota">—</span>'}</td><td>${contatti(x)}</td><td>${esc(x.note)}</td>
            <td class="nowrap"><button type="button" class="secondario piccolo" data-azione="apri" data-quale="referente:${esc(x.id)}">Modifica</button>
              <button type="button" class="secondario piccolo" data-azione="elimina-referente" data-quale="${esc(x.id)}">Elimina</button></td></tr>`);
      return `<tr class="riga-referenti"><td colspan="7">
        <strong>Collaboratori e referenti</strong>
        ${suoi.length ? `<table class="tab-referenti"><thead><tr><th>Nome</th><th>Mansione</th><th>Contatti</th><th>Note</th><th></th></tr></thead>
          <tbody>${suoi.map(riga).join('')}</tbody></table>` : ' <span class="nota">nessuno indicato</span>'}
        ${aperto === `referente:nuovo:${a.id}` ? moduloReferente(null, a.id)
          : `<div><button type="button" class="secondario piccolo" data-azione="apri" data-quale="referente:nuovo:${esc(a.id)}">Aggiungi collaboratore o referente</button></div>`}
      </td></tr>`;
    };

    pagina.innerHTML = `
      <datalist id="mansioni-referenti">${MANSIONI.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      <header class="testata">
        <h1>Consiglio</h1>
        <p class="nota">I consiglieri si nominano in assemblea: qui si registrano, anche a mano. Chi ha un mandato in corso e un utente collegato può entrare nel portale;
          l'utente per l'accesso si crea a parte, in Supabase.</p>
      </header>
      <div class="scorri"><table>
        <thead><tr><th>Consigliere</th><th>Carica</th><th>Rappresenta</th><th>Contatti</th><th>Mandato</th><th>Accesso al portale</th><th></th></tr></thead>
        <tbody>${righe.map((c) => `
          <tr class="${c.inCarica ? '' : 'spento'}">
            <td><strong>${esc(c.nome)}</strong>${c.soggetto && c.soggetto.denominazione !== c.nome ? `<br><span class="nota">unità di ${linkCondomino(c.soggetto)}</span>` : ''}</td>
            <td>${esc(c.carica)}</td>
            <td>${esc(c.parte_rappresentata) || '<span class="nota">non indicato</span>'}</td>
            <td>${contatti(c)}</td>
            <td>dal ${data(c.inizio_mandato)}${c.fine_mandato ? ` al ${data(c.fine_mandato)}` : '<br><span class="nota">in corso</span>'}</td>
            <td>${c.utente_id ? 'Sì' : '<span class="nota">Utente da creare</span>'}</td>
            <td><button type="button" class="secondario" data-azione="apri" data-quale="consigliere:${esc(c.id)}">Modifica</button></td>
          </tr>
          ${aperto === `consigliere:${c.id}` ? `<tr><td colspan="7">${moduloConsigliere(c, perModulo)}</td></tr>` : ''}`).join('')
          || '<tr><td colspan="7" class="nota">Nessun consigliere registrato.</td></tr>'}</tbody>
      </table></div>
      ${aperto === 'consigliere:nuovo' ? moduloConsigliere(null, perModulo)
        : '<div class="azioni"><button type="button" data-azione="apri" data-quale="consigliere:nuovo">Nuovo consigliere</button></div>'}

      <h2>Amministratore</h2>
      <div class="scorri"><table>
        <thead><tr><th>Amministratore</th><th>Incarico</th><th>Dati fiscali</th><th>Contatti</th><th>Compenso</th><th>Note</th><th></th></tr></thead>
        <tbody>${incarichi.map((a) => `
          <tr class="${a.al && a.al < oggi ? 'spento' : ''}">
            <td><strong>${esc(a.denominazione)}</strong></td>
            <td>${a.dal ? `dal ${data(a.dal)}` : ''}${a.al ? ` al ${data(a.al)}` : '<br><span class="nota">in carica</span>'}
              ${a.assemblea_id ? `<br><a href="#/assemblee/${encodeURIComponent(a.assemblea_id)}">assemblea di nomina</a>` : ''}</td>
            <td>${a.partita_iva ? `P.IVA ${esc(a.partita_iva)}` : '<span class="nota">P.IVA non indicata</span>'}<br>${a.iban ? `IBAN <span class="nowrap">${esc(ibanLeggibile(a.iban))}</span>` : '<span class="nota">IBAN non indicato</span>'}</td>
            <td>${contatti(a)}</td>
            <td>${esc(a.compenso)}</td>
            <td>${esc(a.note)}</td>
            <td><button type="button" class="secondario" data-azione="apri" data-quale="amministratore:${esc(a.id)}">Modifica</button></td>
          </tr>
          ${aperto === `amministratore:${a.id}` ? `<tr><td colspan="7">${moduloAmministratore(a)}</td></tr>` : ''}
          ${rigaReferenti(a)}`).join('')
          || '<tr><td colspan="7" class="nota">Nessun incarico registrato: si registra leggendo il verbale dell\'assemblea che lo nomina, oppure qui sotto a mano.</td></tr>'}</tbody>
      </table></div>
      ${aperto === 'amministratore:nuovo' ? moduloAmministratore(null)
        : '<div class="azioni"><button type="button" class="secondario" data-azione="apri" data-quale="amministratore:nuovo">Aggiungi un incarico a mano</button></div>'}`;
    pagina.querySelector('form [name]')?.focus();
  }

  pagina.onclick = async (evento) => {
    const { azione, quale } = evento.target.dataset;
    if (azione === 'elimina-referente') {
      const x = referenti?.find((y) => y.id === quale);
      if (!x || !window.confirm(`Togliere ${x.nome} dai referenti dell’amministratore?`)) return;
      try {
        await deposito.elimina('referenti_amministratore', { id: quale });
      } catch (e) {
        window.alert(`Non eliminato: ${e.message}`);
      }
      await caricaReferenti();
      disegna();
      return;
    }
    if (azione === 'apri') aperto = quale;
    if (azione === 'chiudi') aperto = null;
    if (azione) disegna();
  };
  pagina.onsubmit = async (evento) => {
    evento.preventDefault();
    const form = evento.target;
    const errore = form.querySelector('.errore');
    const bottone = form.querySelector('button[type="submit"]');
    let nuovi;
    try {
      nuovi = valori(form);
    } catch (e) {
      errore.textContent = e.message;
      return;
    }
    const proprio = form.dataset.modulo === 'consigliere' && form.dataset.id
      && stato.dati.consiglieri.find((c) => c.id === form.dataset.id)?.utente_id === utenteId && utenteId;
    if (proprio && nuovi.fine_mandato && nuovi.fine_mandato < stato.oggi) {
      errore.textContent = 'È il tuo mandato: chiudendolo perderesti l’accesso al portale. Fallo chiudere da un altro consigliere in carica.';
      return;
    }
    bottone.disabled = true;
    try {
      if (form.dataset.modulo === 'referente') {
        if (form.dataset.id) await deposito.aggiorna('referenti_amministratore', { id: form.dataset.id }, nuovi);
        else await deposito.inserisci('referenti_amministratore', [{ ...nuovi, amministratore_id: form.dataset.amministratore }]);
        await caricaReferenti();
        aperto = null;
        disegna();
        return;
      }
      const tabella = form.dataset.modulo === 'consigliere' ? 'consiglieri' : 'amministratori';
      if (form.dataset.id) await deposito.aggiorna(tabella, { id: form.dataset.id }, nuovi);
      else await deposito.inserisci(tabella, [nuovi]);
      stato.dati = await caricaDati();
      stato.modello = costruisciModello(stato.dati, stato.oggi);
      aperto = null;
      disegna();
    } catch (e) {
      errore.textContent = `Non salvato: ${e.message}`;
      bottone.disabled = false;
    }
  };
  disegna();
}
