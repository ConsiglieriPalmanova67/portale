// Modifiche all'anagrafica dal dettaglio di un'unità: correzione di un nominativo e cambio di proprietà.
import { deposito } from '../dati/client.js';
import { costruisciModello } from '../dati/modello.js';
import { pianoCambioProprieta, etichetteDaAggiornare } from '../dati/anagrafica.js';
import { creaEsecutore } from '../ui/esegui.js';
import { esc, data, RUOLI, normalizza } from '../ui/html.js';
import { conferma } from './assemblea/comuni.js';

// Dopo ogni scrittura si rileggono soggetti e titolarità e si ricostruisce il modello di tutte le pagine.
async function rileggiAnagrafica(stato) {
  [stato.dati.soggetti, stato.dati.titolarita] = await Promise.all([deposito.leggi('soggetti'), deposito.leggi('titolarita')]);
  stato.modello = costruisciModello(stato.dati, stato.oggi);
}

// Le teste di una seduta in corso sono congelate con il nome di allora: una correzione va riportata anche lì.
// Le assemblee chiuse restano com'erano, come il loro verbale.
async function rinominaTesteInCorso(stato) {
  const inCorso = await deposito.leggi('assemblee', { stato: 'in_corso' });
  for (const assemblea of inCorso) {
    const teste = await deposito.leggi('teste_assemblea', { assemblea_id: assemblea.id });
    for (const t of etichetteDaAggiornare(teste, stato.dati.soggetti)) {
      await deposito.aggiorna('teste_assemblea', { id: t.id }, { etichetta: t.etichetta });
    }
  }
}

const unitaDelSoggetto = (stato, soggettoId) => stato.modello.unita
  .filter((u) => [...u.proprietari, ...u.altri].some((v) => v.soggetto.id === soggettoId))
  .map((u) => u.codice);

function moduloNominativo(stato, s) {
  const unita = unitaDelSoggetto(stato, s.id);
  return `
    <form class="modulo" data-modulo="nominativo" data-soggetto="${esc(s.id)}">
      <label class="largo">Nominativo <input type="text" name="denominazione" value="${esc(s.denominazione)}" required></label>
      <label>Email <input type="email" name="email" value="${esc(s.email)}"></label>
      <label>Telefono <input type="tel" name="telefono" value="${esc(s.telefono)}"></label>
      <label class="largo">Note <input type="text" name="note" value="${esc(s.note)}"></label>
      ${unita.length > 1 ? `<p class="nota largo">La correzione vale per tutte le unità di questo soggetto: ${esc(unita.join(', '))}.</p>` : ''}
      <div class="azioni">
        <button type="submit">Salva nominativo</button>
        <button type="button" class="secondario" data-azione="chiudi">Annulla</button>
      </div>
      <p class="errore largo" role="alert"></p>
    </form>`;
}

function moduloCambio(stato, memoria) {
  return `
    <form class="modulo" data-modulo="cambio">
      <label>Data del cambio (primo giorno dei nuovi proprietari)
        <input type="date" name="data" value="${esc(memoria.data)}" required>
      </label>
      <fieldset class="largo">
        <legend>Nuovi proprietari</legend>
        ${memoria.nuovi.length
          ? `<ul class="scelti">${memoria.nuovi.map((n, i) => `
              <li>${esc(n.denominazione)} ${n.id ? '' : '<span class="etichetta">nuovo nominativo</span>'}
                <button type="button" class="secondario" data-azione="togli" data-indice="${i}">Togli</button></li>`).join('')}</ul>`
          : '<p class="nota">Nessuno ancora. Per i comproprietari aggiungi un nominativo alla volta.</p>'}
        <label>Già in anagrafica
          <input type="text" name="esistente" list="elenco-soggetti" placeholder="Scrivi per cercare e scegli dall'elenco" autocomplete="off">
        </label>
        <datalist id="elenco-soggetti">
          ${[...stato.modello.soggetti.values()].sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it'))
            .map((s) => `<option value="${esc(s.denominazione)}"></option>`).join('')}
        </datalist>
        <button type="button" class="secondario" data-azione="aggiungi-esistente">Aggiungi dall'anagrafica</button>
        <label>Non ancora in anagrafica
          <input type="text" name="nuovo" placeholder="Cognome e nome, o ragione sociale">
        </label>
        <button type="button" class="secondario" data-azione="aggiungi-nuovo">Aggiungi nuovo nominativo</button>
      </fieldset>
      <div class="azioni">
        <button type="submit">Registra cambio di proprietà</button>
        <button type="button" class="secondario" data-azione="chiudi">Annulla</button>
      </div>
      <p class="errore largo" role="alert"></p>
    </form>`;
}

// `ridisegna()` ridisegna l'intero dettaglio dell'unità dopo una scrittura.
export function strumentiUnita(stato, zona, unita, ridisegna) {
  const memoria = (stato.memoriaUnita ??= {});
  const m = (memoria[unita.id] ??= { aperto: null, soggetto: null, data: '', nuovi: [] });
  const titolari = [...unita.proprietari, ...unita.altri];

  zona.innerHTML = `
    <h2>Modifiche all'anagrafica</h2>
    <div id="esito-modifica" class="avviso" role="alert" hidden></div>
    <div class="scorri"><table>
      <thead><tr><th>Titolare</th><th>Titolo</th><th></th></tr></thead>
      <tbody>${titolari.map((v) => `
        <tr>
          <td>${esc(v.soggetto.denominazione)}</td><td>${RUOLI[v.ruolo]}${v.dal ? ` dal ${data(v.dal)}` : ''}</td>
          <td class="tasti"><button type="button" class="secondario" data-azione="correggi" data-soggetto="${esc(v.soggetto.id)}">Correggi nominativo</button></td>
        </tr>
        ${m.aperto === 'nominativo' && m.soggetto === v.soggetto.id ? `<tr class="riga-modulo"><td colspan="3">${moduloNominativo(stato, v.soggetto)}</td></tr>` : ''}`).join('')
        || '<tr><td colspan="3" class="nota">Nessun titolare in corso.</td></tr>'}</tbody>
    </table></div>
    <p class="azioni"><button type="button" class="secondario" data-azione="cambio">Cambio di proprietà…</button></p>
    ${m.aperto === 'cambio' ? moduloCambio(stato, m) : ''}
    <p class="nota">Il cambio di proprietà conserva lo storico: i proprietari precedenti restano visibili come cessati. Le sedute già aperte e le assemblee chiuse mantengono le teste di allora.</p>`;

  const ridisegnaZona = () => strumentiUnita(stato, zona, unita, ridisegna);
  const esecutore = creaEsecutore(zona.querySelector('#esito-modifica'), async () => {
    await rileggiAnagrafica(stato);
    ridisegna();
  });
  const errore = (form, testo) => { form.querySelector('.errore').textContent = testo; };
  const aggiungi = (form, voce) => {
    if (m.nuovi.some((n) => normalizza(n.denominazione) === normalizza(voce.denominazione))) return errore(form, 'Questo nominativo è già nell\'elenco dei nuovi proprietari.');
    m.data = form.data.value;
    m.nuovi.push(voce);
    ridisegnaZona();
  };

  zona.onclick = (evento) => {
    const { azione, soggetto, indice } = evento.target.dataset;
    const form = evento.target.closest('form');
    if (azione === 'correggi') Object.assign(m, { aperto: 'nominativo', soggetto });
    else if (azione === 'cambio') Object.assign(m, { aperto: 'cambio' });
    else if (azione === 'chiudi') Object.assign(m, { aperto: null, soggetto: null, data: '', nuovi: [] });
    else if (azione === 'togli') { m.data = form.data.value; m.nuovi.splice(Number(indice), 1); } else if (azione === 'aggiungi-esistente') {
      const cercato = normalizza(form.esistente.value.trim());
      const trovati = [...stato.modello.soggetti.values()].filter((s) => normalizza(s.denominazione) === cercato);
      if (trovati.length !== 1) return errore(form, cercato ? 'Scegli un nominativo dall\'elenco proposto: quello scritto non corrisponde a un soggetto in anagrafica.' : 'Scrivi il nome e scegli dall\'elenco.');
      return aggiungi(form, { id: trovati[0].id, denominazione: trovati[0].denominazione });
    } else if (azione === 'aggiungi-nuovo') {
      const nome = form.nuovo.value.trim().replace(/\s+/g, ' ');
      if (!nome) return errore(form, 'Scrivi il nominativo da aggiungere.');
      const esiste = [...stato.modello.soggetti.values()].find((s) => normalizza(s.denominazione) === normalizza(nome));
      return aggiungi(form, esiste ? { id: esiste.id, denominazione: esiste.denominazione } : { id: null, denominazione: nome.toUpperCase() });
    } else return undefined;
    return ridisegnaZona();
  };

  zona.onsubmit = async (evento) => {
    evento.preventDefault();
    const form = evento.target;
    if (form.dataset.modulo === 'nominativo') {
      const valori = {
        denominazione: form.denominazione.value.trim().replace(/\s+/g, ' '),
        email: form.email.value.trim() || null, telefono: form.telefono.value.trim() || null, note: form.note.value.trim() || null,
      };
      if (!valori.denominazione) return errore(form, 'Il nominativo non può essere vuoto.');
      const id = form.dataset.soggetto;
      Object.assign(m, { aperto: null, soggetto: null });
      return esecutore.esegui(async () => {
        await deposito.aggiorna('soggetti', { id }, valori);
        await rileggiAnagrafica(stato);
        await rinominaTesteInCorso(stato);
      });
    }

    const giorno = form.data.value;
    m.data = giorno;
    // i nominativi nuovi non hanno ancora un id: per decidere cosa cambia basta un segnaposto
    const piano = pianoCambioProprieta({ titolarita: stato.dati.titolarita, unitaId: unita.id, nuovi: m.nuovi.map((n, i) => n.id ?? `nuovo-${i}`), data: giorno });
    if (piano.errori.length) return errore(form, piano.errori.join(' '));
    const nome = (id) => stato.modello.soggetti.get(id)?.denominazione ?? '?';
    const escono = piano.chiudi.map((c) => nome(stato.dati.titolarita.find((t) => t.id === c.id)?.soggetto_id));
    const testo = `Cambio di proprietà di ${unita.codice} dal ${data(giorno)}.\n`
      + `${escono.length ? `Cessano: ${escono.join(', ')}.\n` : ''}Nuovi proprietari: ${m.nuovi.map((n) => n.denominazione).join(', ')}.`;
    if (!(await conferma(testo, 'Registra il cambio'))) return undefined;

    // Passi ripetibili: riprovando dopo un errore a metà non si creano doppioni.
    const scelti = m.nuovi.map((n) => ({ ...n }));
    let apertureFatte = false;
    Object.assign(m, { aperto: null, data: '', nuovi: [] });
    return esecutore.esegui(async () => {
      for (const n of scelti) n.id ??= (await deposito.inserisci('soggetti', [{ denominazione: n.denominazione }]))[0].id;
      const definitivo = pianoCambioProprieta({ titolarita: await deposito.leggi('titolarita'), unitaId: unita.id, nuovi: scelti.map((n) => n.id), data: giorno });
      if (definitivo.errori.length && !apertureFatte) throw new Error(definitivo.errori.join(' '));
      if (!apertureFatte && definitivo.crea.length) await deposito.inserisci('titolarita', definitivo.crea);
      apertureFatte = true;
      for (const c of piano.chiudi) await deposito.aggiorna('titolarita', { id: c.id }, { al: c.al });
    });
  };
}
