// Lettura di un verbale (#/lettura-verbale/<id dell'estrazione>): il verbale si fa leggere una volta sola (la risposta
// resta salvata in estrazioni_blocchi), poi si rivedono le proposte e si registra solo ciò che si conferma:
// esito e sintesi dei punti, to-do, mandati dei consiglieri, incarico dell'amministratore.
import { deposito, inProva, caricaDati, sessioneCorrente } from '../dati/client.js';
import { ARCHIVIO_DOCUMENTI } from '../dati/documenti.js';
import { costruisciModello } from '../dati/modello.js';
import { esc, data } from '../ui/html.js';
import { conferma, titoloAssemblea } from './assemblea/comuni.js';
import { proponi, pianoScritture } from '../verbale/proposta.js';
import { moduloRevisione, leggiRevisione } from './verbale-revisione.js';

const numeri = new Intl.NumberFormat('it-IT');
const COSTITUITA = { si: 'validamente costituita', no: 'non costituita o deserta', non_indicato: 'costituzione non indicata' };

async function creaLettore(stato) {
  if (inProva) {
    const { creaLettoreProva } = await import('../estrazione/lettore-prova.js');
    return creaLettoreProva(stato.dati, { oggi: stato.oggi });
  }
  const [{ creaLettoreVero }, { supabase }] = await Promise.all([import('../estrazione/lettore.js'), import('../dati/deposito.js')]);
  return creaLettoreVero(supabase);
}

export async function letturaVerbale(stato, contenitore, id) {
  let attiva = true;
  stato.allUscita = () => { attiva = false; };
  contenitore.innerHTML = `
    <p><a href="#/documenti">← Documenti</a></p>
    <header class="testata" id="lv-testata"><h1>Lettura del verbale</h1></header>
    <div id="lv-errore" class="avviso grave" role="alert" hidden></div>
    <div id="lv-corpo"><p class="nota">Caricamento…</p></div>`;
  const $ = (s) => contenitore.querySelector(s);
  const errore = (testo) => {
    if (!attiva) return;
    $('#lv-errore').textContent = testo;
    $('#lv-errore').hidden = !testo;
    if (testo) $('#lv-errore').scrollIntoView({ block: 'nearest' });
  };

  const [estrazione] = await deposito.leggi('estrazioni', { id });
  if (!estrazione || estrazione.tipo !== 'verbale') {
    $('#lv-corpo').innerHTML = '<p>Lettura non trovata. <a href="#/documenti">Torna ai documenti</a></p>';
    return;
  }
  const assembleaId = estrazione.mappa?.assemblea_id;
  const [[documento], [assemblea], blocchi] = await Promise.all([
    deposito.leggi('documenti', { id: estrazione.documento_id }), deposito.leggi('assemblee', { id: assembleaId }),
    deposito.leggi('estrazioni_blocchi', { estrazione_id: id }),
  ]);
  if (!attiva) return;
  if (!assemblea) {
    $('#lv-corpo').innerHTML = '<p class="avviso grave">L\'assemblea collegata a questa lettura non esiste più.</p>';
    return;
  }
  let blocco = blocchi.find((b) => b.sezione === 'verbale') ?? null;

  const testata = () => {
    const token = blocco ? `Token usati: ${numeri.format(blocco.token_ingresso ?? 0)} in ingresso, ${numeri.format(blocco.token_uscita ?? 0)} in uscita.` : '';
    $('#lv-testata').innerHTML = `<h1>Lettura del verbale</h1>
      <p><strong>${esc(documento?.titolo ?? 'Documento non più in archivio')}</strong> — <a href="#/assemblee/${encodeURIComponent(assemblea.id)}">${esc(titoloAssemblea(assemblea))}</a></p>
      <p class="nota">${token} ${estrazione.stato === 'importata' ? '<span class="etichetta stato-presente">registrato</span>' : ''}</p>`;
  };

  async function leggi() {
    errore('');
    $('#lv-corpo').innerHTML = '<p class="avviso" role="status">Lettura del verbale in corso: di solito meno di un minuto…</p>';
    try {
      if (!blocco) [blocco] = await deposito.inserisci('estrazioni_blocchi', [{ estrazione_id: id, sezione: 'verbale', pagina_da: 1, pagina_a: 1, stato: 'in_corso', tentativi: 1 }]);
      else [blocco] = await deposito.aggiorna('estrazioni_blocchi', { id: blocco.id }, { stato: 'in_corso', errore: null, tentativi: (blocco.tentativi ?? 0) + 1 });
      const lettore = await creaLettore(stato);
      const risposta = await fetch(await deposito.urlFile(ARCHIVIO_DOCUMENTI, documento.file_path));
      if (!risposta.ok) throw new Error('il file del verbale non si scarica dall\'archivio.');
      const aperto = await lettore.apri(await risposta.blob());
      const punti = (await deposito.leggi('punti_odg', { assemblea_id: assemblea.id })).sort((a, b) => a.ordine - b.ordine);
      const letto = await lettore.verbale(aperto, { punti, consiglieri: [...stato.modello.soggetti.values()].slice(0, 2).map((s) => s.denominazione) });
      [blocco] = await deposito.aggiorna('estrazioni_blocchi', { id: blocco.id }, {
        stato: 'fatto', dati: letto.dati, pagina_a: aperto.pagine ?? 1,
        token_ingresso: (blocco.token_ingresso ?? 0) + (letto.token_ingresso ?? 0), token_uscita: (blocco.token_uscita ?? 0) + (letto.token_uscita ?? 0),
      });
      await deposito.aggiorna('estrazioni', { id }, { stato: 'revisione', modello: letto.modello ?? null });
      estrazione.stato = 'revisione';
    } catch (e) {
      if (blocco) [blocco] = await deposito.aggiorna('estrazioni_blocchi', { id: blocco.id }, { stato: 'errore', errore: e.message }).catch(() => [blocco]);
      if (!attiva) return;
      $('#lv-corpo').innerHTML = `<p class="avviso grave" role="alert">La lettura non è riuscita: ${esc(e.message)}</p>
        <div class="azioni"><button type="button" id="lv-rileggi">Riprova la lettura</button></div>`;
      $('#lv-rileggi').onclick = leggi;
      testata();
      return;
    }
    if (attiva) disegna();
  }

  async function disegna() {
    testata();
    if (estrazione.stato === 'importata') {
      const fatto = estrazione.correzioni?.registrato ?? [];
      $('#lv-corpo').innerHTML = `<p class="avviso fatto">Il verbale è stato letto e registrato.</p>
        ${fatto.length ? `<ul>${fatto.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        <p><a href="#/todo">Vai ai to-do</a> · <a href="#/consiglio">Vai al Consiglio</a> · <a href="#/assemblee/${encodeURIComponent(assemblea.id)}">Vai all'assemblea</a></p>`;
      return;
    }
    if (blocco?.stato !== 'fatto') {
      $('#lv-corpo').innerHTML = `${blocco?.stato === 'errore' ? `<p class="avviso grave">L'ultima lettura non è riuscita: ${esc(blocco.errore)}</p>` : ''}
        <div class="azioni"><button type="button" id="lv-leggi">${blocco ? 'Riprova la lettura' : 'Avvia la lettura'}</button></div>`;
      $('#lv-leggi').onclick = leggi;
      return;
    }

    const [punti, consiglieri, amministratori, sessione] = await Promise.all([
      deposito.leggi('punti_odg', { assemblea_id: assemblea.id }), deposito.leggi('consiglieri'), deposito.leggi('amministratori'), sessioneCorrente(),
    ]);
    if (!attiva) return;
    const soggetti = [...stato.modello.soggetti.values()].sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it'));
    const lettura = blocco.dati;
    const proposta = proponi({ lettura, assemblea, punti, consiglieri, soggetti, amministratori, utenteId: sessione?.user?.id ?? null });
    const nomeSoggetto = (sid) => stato.modello.soggetti.get(sid)?.denominazione ?? 'consigliere senza nome';
    $('#lv-corpo').innerHTML = `
      <section class="riquadro">
        <p><strong>Dal verbale:</strong> ${esc([lettura.tipo, lettura.convocazione && `${lettura.convocazione} convocazione`].filter(Boolean).join(', '))}
          ${lettura.data ? `del ${esc(lettura.data)}` : ''}${lettura.ora_inizio ? `, dalle ${esc(lettura.ora_inizio)}` : ''}${lettura.ora_fine ? ` alle ${esc(lettura.ora_fine)}` : ''}${lettura.luogo ? `, ${esc(lettura.luogo)}` : ''}.</p>
        <p>${esc(COSTITUITA[lettura.costituita] ?? '')}${lettura.presenti ? ` — ${esc(lettura.presenti)}` : ''}</p>
        ${lettura.presidente || lettura.segretario ? `<p class="nota">Presidente: ${esc(lettura.presidente || '—')} · Segretario: ${esc(lettura.segretario || '—')}</p>` : ''}
        ${lettura.note ? `<p class="nota">Note del lettore: ${esc(lettura.note)}</p>` : ''}
        ${(lettura.incerte ?? []).length ? `<p class="avviso">Letture dubbie: ${lettura.incerte.map((x) => esc(`${x.riga} ${x.campo}: ${x.nota}`)).join('; ')}</p>` : ''}
        <p class="nota">Assemblea nel portale: ${esc(titoloAssemblea(assemblea))}, ${data(assemblea.data)}. Controlla che sia quella giusta prima di registrare.</p>
      </section>
      ${moduloRevisione(proposta, { soggetti, nomeSoggetto })}
      <div class="azioni"><button type="button" class="secondario" id="lv-rileggi">Rileggi il verbale</button>
        <button type="button" class="secondario pericolo" id="lv-annulla">Annulla la lettura</button></div>`;

    $('#lv-rileggi').onclick = async () => {
      if (await conferma('Rileggere il verbale? La lettura ha di nuovo un piccolo costo e le correzioni fatte qui si perdono.', 'Rileggi')) leggi();
    };
    $('#lv-annulla').onclick = async () => {
      if (!(await conferma('Annullare la lettura di questo verbale? Non viene registrato nulla.', 'Annulla la lettura'))) return;
      await deposito.aggiorna('estrazioni', { id }, { stato: 'annullata' });
      location.hash = '#/documenti';
    };
    $('#verbale-revisione').onsubmit = async (evento) => {
      evento.preventDefault();
      const form = evento.target;
      const problema = leggiRevisione(form, proposta);
      form.querySelector('.errore').textContent = problema ?? '';
      if (problema) return;
      // le scelte fatte a mano possono cambiare chi ha già un mandato e chi resta in carica
      if (proposta.consiglio) {
        const inCarica = (c) => (!c.inizio_mandato || c.inizio_mandato <= assemblea.data) && (!c.fine_mandato || c.fine_mandato >= assemblea.data);
        const scelti = new Set(proposta.consiglio.nominati.filter((n) => n.scelto).map((n) => n.soggettoId));
        for (const n of proposta.consiglio.nominati) n.gia = consiglieri.find((c) => c.soggetto_id === n.soggettoId && inCarica(c)) ?? null;
        for (const d of proposta.consiglio.daChiudere) if (scelti.has(d.consigliere.soggetto_id)) d.scelto = false;
      }
      const passi = pianoScritture(proposta, assemblea);
      if (!passi.length) {
        form.querySelector('.errore').textContent = 'Non c\'è nulla da registrare con le scelte fatte.';
        return;
      }
      if (!(await conferma(`Verranno registrate ${passi.length} modifiche: ${passi.map((p) => p.descrizione).join('; ')}.`, 'Registra'))) return;
      await registra(passi, form.querySelector('button[type="submit"]'));
    };
  }

  // Esegue i passi in ordine; se si interrompe, riprendendo salta quelli già fatti (contati nell'estrazione).
  async function registra(passi, bottone) {
    bottone.disabled = true;
    errore('');
    const fatti = estrazione.correzioni?.passi_fatti ?? 0;
    const idPunto = new Map((await deposito.leggi('punti_odg', { assemblea_id: assemblea.id })).map((p) => [p.ordine, p.id]));
    let n = 0;
    try {
      for (const p of passi) {
        n += 1;
        if (n <= fatti) continue;
        const valori = p.tabella === 'todo' && !p.valori.punto_id && idPunto.has(p.ordinePunto) ? { ...p.valori, punto_id: idPunto.get(p.ordinePunto) } : p.valori;
        if (p.azione === 'inserisci') {
          const [creato] = await deposito.inserisci(p.tabella, [valori]);
          if (p.tabella === 'punti_odg') idPunto.set(creato.ordine, creato.id);
        } else await deposito.aggiorna(p.tabella, p.dove, valori);
        estrazione.correzioni = { ...(estrazione.correzioni ?? {}), passi_fatti: n };
        await deposito.aggiorna('estrazioni', { id }, { correzioni: estrazione.correzioni });
      }
      estrazione.correzioni = { registrato: passi.map((p) => p.descrizione) };
      await deposito.aggiorna('estrazioni', { id }, { stato: 'importata', correzioni: estrazione.correzioni });
      estrazione.stato = 'importata';
      // il documento del verbale resta collegato alla sua assemblea (così compare anche nella pagina Verbali)
      if (documento && documento.assemblea_id !== assemblea.id) await deposito.aggiorna('documenti', { id: documento.id }, { assemblea_id: assemblea.id });
      // consiglieri e amministratori sono nei dati caricati all'ingresso
      stato.dati = await caricaDati();
      stato.modello = costruisciModello(stato.dati, stato.oggi);
    } catch (e) {
      errore(`Registrazione interrotta al passo ${n} di ${passi.length}: ${e.message} I passi precedenti sono salvati: premi di nuovo «Registra quanto scelto» per continuare.`);
      bottone.disabled = false;
      return;
    }
    if (attiva) disegna();
  }

  testata();
  if (estrazione.stato === 'lettura' && !blocco) leggi();
  else disegna();
}
