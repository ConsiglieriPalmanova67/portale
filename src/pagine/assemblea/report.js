// Scheda Report: il documento da allegare al verbale (si stampa o si salva in PDF dal browser)
// e il foglio presenze in bianco, da stampare prima della seduta come riserva.
// Nessun dato contabile: solo presenze, deleghe e voti.
import { MAGGIORANZE } from '../../calcolo/maggioranze.js';
import { daInteri } from '../../calcolo/numeri.js';
import { costruisciModello } from '../../dati/modello.js';
import { congelaTeste, statoSeduta } from '../../assemblea/seduta.js';
import { esc, millesimi, ora, data } from '../../ui/html.js';
import { esitoPunto } from '../../assemblea/delibere.js';
import { CONDOMINIO, TIPI, CONVOCAZIONI, TIPI_PUNTO, ESITO_A_MANO, nomeEsito, titoloAssemblea, statoDelPunto, orariAssente, oraBreve, quando } from './comuni.js';

const peso = (interi) => millesimi(daInteri(interi));
const teste = (n) => `${n} ${n === 1 ? 'testa' : 'teste'}`;

function intestazione(ctx, sottotitolo) {
  const a = ctx.assemblea;
  const voce = (nome, valore) => `<div><dt>${nome}</dt><dd>${valore || '—'}</dd></div>`;
  // ora prevista e prima convocazione compaiono solo se indicate
  const prima = [quando(a.prima_data, a.prima_ora), a.prima_luogo].filter(Boolean).join(', ');
  return `
    <header>
      <p class="report-condominio">${esc(CONDOMINIO)}</p>
      <h1>${esc(titoloAssemblea(a))}</h1>
      <p class="nota">${sottotitolo}</p>
      <dl class="report-dati">
        ${voce('Data', data(a.data))}${a.ora ? voce('Ora prevista', esc(oraBreve(a.ora))) : ''}${voce('Luogo', esc(a.luogo))}${voce('Tipo', esc(TIPI[a.tipo]))}${voce('Convocazione', esc(CONVOCAZIONI[a.convocazione]))}
        ${ctx.senzaSeduta ? '' : `${voce('Apertura', ora(a.ora_apertura))}${voce('Appello', ora(a.ora_appello))}${voce('Chiusura', ora(a.ora_chiusura))}`}
        ${prima ? voce('Prima convocazione', esc(prima)) : ''}
      </dl>
    </header>`;
}

function rigaQuorum(nome, q) {
  return `<tr><td>${nome}</td><td class="num">${q.testePresenti} di ${q.testeTotali}</td><td class="num">${peso(q.pesoPresente)} di ${peso(q.pesoTotale)}</td>
    <td><strong>${q.raggiunto ? 'raggiunto' : 'non raggiunto'}</strong></td></tr>`;
}

function quorum(ctx) {
  const a = ctx.assemblea;
  // com'era la sala all'ora dell'appello: ingressi, uscite e deleghe successivi non contano
  const allAppello = a.ora_appello ? statoSeduta({
    assemblea: a, teste: ctx.teste, presenze: ctx.presenze, deleghe: ctx.deleghe,
    millesimi: ctx.stato.dati.millesimi, tabellaProprietaId: ctx.stato.modello.tabellaProprieta?.id, adesso: a.ora_appello,
  }).quorum : null;
  return `
    <h2>Quorum costitutivo (${esc(CONVOCAZIONI[a.convocazione]).toLowerCase()})</h2>
    <table>
      <thead><tr><th>Momento</th><th class="num">Teste presenti</th><th class="num">Millesimi presenti</th><th>Quorum</th></tr></thead>
      <tbody>
        ${allAppello ? rigaQuorum(`All'appello (ore ${ora(a.ora_appello)})`, allAppello) : '<tr><td colspan="4">Appello non registrato.</td></tr>'}
        ${rigaQuorum(a.stato === 'chiusa' ? `Alla chiusura${a.ora_chiusura ? ` (ore ${ora(a.ora_chiusura)})` : ''}` : 'In questo momento', ctx.seduta.quorum)}
      </tbody>
    </table>`;
}

function foglioPresenze(ctx) {
  const { righe } = ctx.seduta;
  const inSala = righe.filter((r) => r.stato !== 'assente');
  // usciti: non più in sala, ma con un ingresso registrato
  const usciti = righe.filter((r) => r.stato === 'assente' && r.oraIngresso);
  const mai = righe.filter((r) => r.stato === 'assente' && !r.oraIngresso);
  const riga = (r, come) => `
    <tr><td>${esc(r.testa.etichetta)}</td><td>${esc(ctx.unitaDi(r.testa))}</td><td class="num">${peso(r.peso)}</td>
      <td>${come}</td><td>${r.stato === 'delega' ? ora(r.delegato.delega.ora_registrazione) : ora(r.oraIngresso)}</td><td>${ora(r.oraUscita)}</td></tr>`;
  const somma = (elenco) => elenco.reduce((s, r) => s + r.peso, 0);
  return `
    <h2>Foglio presenze</h2>
    <table>
      <thead><tr><th>Testa</th><th>Unità</th><th class="num">Millesimi</th><th>Presenza</th><th>Registrata</th><th>Uscita</th></tr></thead>
      <tbody>
        ${inSala.map((r) => riga(r, r.stato === 'delega' ? `per delega a ${esc(r.delegato.nome)}` : 'di persona')).join('')}
        ${usciti.map((r) => riga(r, 'uscito')).join('')}
        ${inSala.length + usciti.length ? '' : '<tr><td colspan="6">Nessuna presenza registrata.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="2">Presenti: ${teste(inSala.length)} (${inSala.filter((r) => r.stato === 'presente').length} di persona, ${inSala.filter((r) => r.stato === 'delega').length} per delega)</td>
        <td class="num">${peso(somma(inSala))}</td><td colspan="3">su ${teste(righe.length)} e ${peso(somma(righe))} millesimi</td></tr></tfoot>
    </table>
    <h3>Assenti (${mai.length})</h3>
    <p class="report-elenco">${mai.map((r) => `${esc(r.testa.etichetta)} <span class="nota">(${esc(ctx.unitaDi(r.testa))}; ${peso(r.peso)})</span>`).join(' · ') || 'Nessuno.'}</p>`;
}

function elencoDeleghe(ctx) {
  const rigaPerTesta = new Map(ctx.seduta.righe.map((r) => [r.testa.id, r]));
  const deleghe = [...ctx.deleghe].sort((a, b) => (a.ora_registrazione < b.ora_registrazione ? -1 : 1));
  return `
    <h2>Deleghe (${deleghe.length})</h2>
    ${deleghe.length ? `<table>
      <thead><tr><th>Delegante</th><th>Unità</th><th>Delegato</th><th>Registrata</th><th>Scansione</th><th>Note</th></tr></thead>
      <tbody>${deleghe.map((d) => {
        const r = rigaPerTesta.get(d.delegante_testa_id);
        const stato = !r ? '' : r.stato === 'delega' ? '' : r.stato === 'presente' ? 'in conflitto: il delegante è presente di persona' : 'non valida: il delegato non è in sala';
        return `<tr><td>${esc(r?.testa.etichetta ?? '?')}</td><td>${r ? esc(ctx.unitaDi(r.testa)) : ''}</td>
          <td>${esc(r?.delegato?.nome ?? d.delegato_esterno ?? '?')}${d.delegato_testa_id ? '' : ' (esterno)'}${d.amministratore ? ' — amministratore' : ''}</td>
          <td>${ora(d.ora_registrazione)}</td><td>${d.scansione_path ? 'in archivio' : 'mancante'}</td>
          <td>${[stato, d.nota].filter(Boolean).map(esc).join('; ')}</td></tr>`;
      }).join('')}</tbody>
    </table>` : '<p>Nessuna delega registrata.</p>'}
    ${ctx.seduta.avvisi.length ? `<h3>Avvisi dei controlli</h3><ul>${ctx.seduta.avvisi.map((a) => `<li>${esc(a.messaggio)}</li>`).join('')}</ul>` : ''}`;
}

function puntoReport(ctx, punto, numero) {
  const { modello } = ctx.stato;
  const tabella = modello.tabelle.find((t) => t.id === punto.tabella_id);
  const stato = statoDelPunto(ctx, punto);
  const { esito } = stato;
  const titolo = `<h3>Punto ${numero}. ${esc(punto.testo)}</h3>`;
  const candidati = punto.tipo === 'nomina_consiglieri' ? `<p>${esc(TIPI_PUNTO[punto.tipo])}. Candidati: ${(punto.candidati ?? []).map((c) =>
    `${esc(modello.soggetti.get(c.soggetto_id)?.denominazione ?? '?')}${c.parte_rappresentata ? ` (${esc(c.parte_rappresentata)})` : ''}`).join(', ') || 'nessuno indicato'}.</p>` : '';
  const regole = `<p>Tabella: <strong>${esc(tabella?.nome ?? 'non indicata')}</strong> — Maggioranza richiesta: <strong>${esc(MAGGIORANZE[punto.maggioranza]?.etichetta ?? 'non indicata')}</strong></p>`;
  const note = punto.note ? `<p class="nota">Note: ${esc(punto.note)}</p>` : '';
  if (!esito) return `<section class="report-punto">${titolo}${candidati}${regole}${note}<p><strong>Non votato</strong> (tabella o maggioranza non indicate).</p></section>`;

  const votato = stato.votanti.some((v) => v.voto);
  if (!punto.votato_il && !votato) return `<section class="report-punto">${titolo}${candidati}${regole}${note}<p><strong>Votazione non effettuata.</strong></p></section>`;

  const gruppo = (nome, voto, conteggio) => {
    const nomi = stato.votanti.filter((v) => v.voto === voto);
    return `<tr><th scope="row">${nome}</th><td class="num">${conteggio.teste}</td><td class="num">${peso(conteggio.peso)}</td>
      <td>${nomi.map((v) => `${esc(v.testa.etichetta)} <span class="nota">(${peso(v.peso)})</span>`).join(' · ') || '—'}</td></tr>`;
  };
  return `
    <section class="report-punto">
      ${titolo}${candidati}${regole}${note}
      <p>${punto.votato_il ? `Votazione chiusa alle <strong>${ora(punto.votato_il)}</strong>.` : '<strong>Votazione non ancora chiusa: conteggio provvisorio.</strong>'}
        Presenti ${punto.votato_il ? 'in quel momento' : 'adesso'}: <strong>${teste(esito.presenti.teste)}</strong> e <strong>${peso(esito.presenti.peso)}</strong> millesimi su ${peso(esito.pesoTotale)} della tabella.</p>
      <table>
        <thead><tr><th>Voto</th><th class="num">Teste</th><th class="num">Millesimi</th><th>Nominativi (millesimi)</th></tr></thead>
        <tbody>
          ${gruppo('Favorevoli', 'favorevole', esito.favorevoli)}${gruppo('Contrari', 'contrario', esito.contrari)}${gruppo('Astenuti', 'astenuto', esito.astenuti)}
          ${stato.mancanti ? gruppo('Voto mancante', null, esito.nonEspressi) : ''}
        </tbody>
      </table>
      <p><strong>Assenti alla votazione (${stato.assenti.length}):</strong>
        ${stato.assenti.map((a) => {
          const orari = orariAssente(ctx, a.testa.id);
          return `${esc(a.testa.etichetta)} <span class="nota">(${peso(a.peso)}${orari ? `; ${esc(orari)}` : ''})</span>`;
        }).join(' · ') || 'nessuno.'}</p>
      <p class="report-esito">Esito${punto.votato_il ? '' : ' provvisorio'}: <strong>${esito.approvato ? 'APPROVATO' : 'RESPINTO'}</strong></p>
    </section>`;
}

// Assemblea registrata come già svolta: non esistono presenze, deleghe né voti. Il riepilogo riporta solo
// i punti con l'esito e il testo della delibera inseriti a mano, e lo dice.
function riepilogoSenzaSeduta(ctx) {
  const { modello } = ctx.stato;
  const punti = ctx.punti.map((p, i) => {
    const e = esitoPunto(p);
    const candidati = p.tipo === 'nomina_consiglieri' ? `<p>${esc(TIPI_PUNTO[p.tipo])}. Candidati: ${(p.candidati ?? []).map((c) =>
      `${esc(modello.soggetti.get(c.soggetto_id)?.denominazione ?? '?')}${c.parte_rappresentata ? ` (${esc(c.parte_rappresentata)})` : ''}`).join(', ') || 'nessuno indicato'}.</p>` : '';
    return `
      <section class="report-punto">
        <h3>Punto ${i + 1}. ${esc(p.testo)}</h3>
        ${candidati}
        <p class="report-esito">${e.manuale ? `Esito: <strong>${esc(nomeEsito(e.stato, ctx.assemblea)).toUpperCase()}</strong> <span class="nota">(${ESITO_A_MANO})</span>` : '<strong>Esito non registrato.</strong>'}</p>
        ${p.note ? `<p>Delibera: ${esc(p.note)}</p>` : ''}
      </section>`;
  }).join('');
  return `
    <article class="report">
      ${intestazione(ctx, 'Riepilogo dell\'assemblea — <strong>registrata nel portale come già svolta, senza seduta dal vivo</strong>')}
      <p>Presenze, deleghe e voti di questa assemblea non sono stati registrati nel portale: per quorum, presenti e conteggio dei voti fa fede il verbale.
        Gli esiti qui sotto sono stati inseriti a mano.</p>
      <h2>Punti all'ordine del giorno</h2>
      ${punti || '<p>Nessun punto all\'ordine del giorno.</p>'}
      <p class="nota report-piede">Documento prodotto dal portale del consiglio: non sostituisce il verbale firmato.</p>
    </article>`;
}

function report(ctx) {
  if (ctx.assemblea.stato === 'bozza') {
    return '<p class="avviso no-stampa">Il report si compila dopo l\'apertura della seduta. Intanto si può stampare il foglio presenze in bianco.</p>';
  }
  if (ctx.senzaSeduta) return riepilogoSenzaSeduta(ctx);
  return `
    <article class="report">
      ${intestazione(ctx, `Report da allegare al verbale${ctx.assemblea.stato === 'chiusa' ? '' : ' — <strong>seduta ancora in corso: dati provvisori</strong>'}`)}
      ${quorum(ctx)}
      ${foglioPresenze(ctx)}
      ${elencoDeleghe(ctx)}
      <h2>Votazioni</h2>
      ${ctx.punti.map((p, i) => puntoReport(ctx, p, i + 1)).join('') || '<p>Nessun punto all\'ordine del giorno.</p>'}
      <p class="nota report-piede">Documento prodotto dal portale del consiglio: non sostituisce il verbale firmato.</p>
    </article>`;
}

// Prima dell'apertura le teste sono quelle che risultano alla data dell'assemblea; dopo, quelle congelate.
function foglioInBianco(ctx) {
  const { stato, assemblea } = ctx;
  let righe;
  // anche per un'assemblea registrata come già svolta non ci sono teste congelate: valgono quelle alla sua data
  if (assemblea.stato === 'bozza' || ctx.senzaSeduta) {
    const modello = costruisciModello(stato.dati, assemblea.data);
    const pesoPerChiave = new Map(modello.teste.map((t) => [t.chiave, t.proprieta]));
    righe = congelaTeste(modello).map((t) => ({ etichetta: t.etichetta, unita: ctx.unitaDi(t), millesimi: millesimi(pesoPerChiave.get(t.chiave) ?? 0) }));
  } else {
    righe = ctx.seduta.righe.map((r) => ({ etichetta: r.testa.etichetta, unita: ctx.unitaDi(r.testa), millesimi: peso(r.peso) }));
  }
  righe.sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it'));
  return `
    <article class="report foglio-bianco">
      ${intestazione(ctx, 'Foglio presenze')}
      <table>
        <thead><tr><th>N.</th><th>Testa</th><th>Unità</th><th class="num">Millesimi</th><th>Firma</th><th>Per delega a (nome)</th><th>Firma del delegato</th></tr></thead>
        <tbody>${righe.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.etichetta)}</td><td>${esc(r.unita)}</td><td class="num">${r.millesimi}</td><td class="firma"></td><td class="firma"></td><td class="firma"></td></tr>`).join('')
          || '<tr><td colspan="7">Alla data dell\'assemblea non risulta nessun proprietario.</td></tr>'}</tbody>
      </table>
      <p class="nota report-piede">${teste(righe.length)}. Ora di inizio: ________ &nbsp; Ora di fine: ________</p>
    </article>`;
}

export function schedaReport(ctx, contenitore) {
  const memoria = ctx.memoria.report;
  memoria.vista ??= ctx.assemblea.stato === 'bozza' ? 'bianco' : 'report';
  const bianco = memoria.vista === 'bianco';
  contenitore.innerHTML = `
    <div class="azioni no-stampa">
      <button type="button" class="secondario" data-vista="report" aria-pressed="${!bianco}">Report per il verbale</button>
      <button type="button" class="secondario" data-vista="bianco" aria-pressed="${bianco}">Foglio presenze in bianco</button>
      <button type="button" data-azione="stampa">Stampa o salva in PDF</button>
    </div>
    ${bianco ? foglioInBianco(ctx) : report(ctx)}`;
  contenitore.onclick = (evento) => {
    const { vista, azione } = evento.target.dataset;
    if (vista) {
      memoria.vista = vista;
      schedaReport(ctx, contenitore);
    }
    if (azione === 'stampa') window.print();
  };
}
