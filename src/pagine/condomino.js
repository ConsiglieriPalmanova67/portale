// Scheda di un condomino (#/condomini/<id del soggetto>): unità e titoli, millesimi per tabella, situazione
// contabile e, per ogni assemblea, presenza, deleghe rilasciate e ricevute, voto su ogni punto.
// Anagrafica e contabilità sono già in memoria; i dati delle assemblee si leggono dal deposito all'apertura.
import { esc, euro, millesimi, data, ora, RUOLI, segno, linkCondomino, linkEmail } from '../ui/html.js';
import { deposito, caricaDati } from '../dati/client.js';
import * as controlla from '../dati/contatti.js';
import { statoSeduta } from '../assemblea/seduta.js';
import { perCodice, costruisciModello } from '../dati/modello.js';
import { TIPI } from './unita.js';

const VOTI = { favorevole: ['Favorevole', 'stato-presente'], contrario: ['Contrario', 'stato-respinto'], astenuto: ['Astenuto', 'stato-avviso'] };
const STATI_ASSEMBLEA = { bozza: 'in preparazione', in_corso: 'in corso', chiusa: 'chiusa' };
const etichetta = (testo, classe = '') => `<span class="etichetta ${classe}">${esc(testo)}</span>`;
const quando = (a) => `${data(a.data)}${a.ora ? ` ore ${esc(String(a.ora).slice(0, 5))}` : ''}`;

export function schedaCondomino(stato, contenitore, id) {
  const { modello, dati } = stato;
  const soggetto = modello.soggetti.get(id);
  if (!soggetto) {
    contenitore.innerHTML = `<p>Condomino non trovato. <a href="#/unita">Torna alle unità</a></p>`;
    return;
  }

  // titoli del soggetto su ogni unità: in corso, passati, futuri
  const titoli = [];
  for (const u of modello.unita) {
    for (const [elenco, quale] of [[u.proprietari, 'in corso'], [u.altri, 'in corso'], [u.futuri, 'futuro'], [u.storico, 'cessato']]) {
      for (const v of elenco) if (v.soggetto.id === id) titoli.push({ unita: u, ...v, quale });
    }
  }
  const correnti = titoli.filter((t) => t.quale === 'in corso').sort((a, b) => perCodice(a.unita, b.unita));
  const altriTitoli = titoli.filter((t) => t.quale !== 'in corso').sort((a, b) => perCodice(a.unita, b.unita));
  const proprie = correnti.filter((t) => t.ruolo === 'proprietario').map((t) => t.unita);
  const mieTeste = modello.teste.filter((t) => t.soggetti.some((s) => s.id === id));
  const consigliere = dati.consiglieri.find((c) => c.soggetto_id === id && (!c.fine_mandato || c.fine_mandato >= stato.oggi));

  const contitolari = (u, ruolo) => [...u.proprietari, ...u.altri].filter((v) => v.soggetto.id !== id && v.ruolo === ruolo).map((v) => linkCondomino(v.soggetto)).join(', ');
  const tabelle = modello.tabelle.filter((t) => proprie.some((u) => u.millesimi[t.id] > 0));
  const dettaglioUnita = proprie.length > 1 && proprie.length <= 6;

  const posizioni = dati.posizioni.filter((p) => p.soggetto_id === id);
  // il preventivo di un anno vale solo finché non c'è il consuntivo dello stesso anno
  const conPosizioni = dati.esercizi.filter((e) => posizioni.some((p) => p.esercizio_id === e.id));
  const esercizi = conPosizioni.filter((e) => e.tipo === 'consuntivo' || !conPosizioni.some((c) => c.tipo === 'consuntivo' && c.anno === e.anno))
    .sort((a, b) => b.anno - a.anno);
  const somma = (righe, campo) => righe.reduce((t, p) => t + Math.round(Number(p[campo] ?? 0) * 100), 0) / 100;
  const codiceUnita = new Map(modello.unita.map((u) => [u.id, u.codice]));

  contenitore.innerHTML = `
    <p><a href="#/unita">← Unità</a></p>
    <header class="testata">
      <h1>${esc(soggetto.denominazione)}</h1>
      <p>${consigliere ? etichetta(`Consigliere${consigliere.carica ? ` — ${consigliere.carica}` : ''}`, 'stato-delega') : ''}</p>
      ${soggetto.note ? `<p class="nota">${esc(soggetto.note)}</p>` : ''}
    </header>

    <div class="riquadri">
      <div class="riquadro"><span class="nota">Unità in proprietà</span><span class="valore">${proprie.length}</span></div>
      <div class="riquadro"><span class="nota">Millesimi di proprietà</span><span class="valore">${millesimi(proprie.reduce((s, u) => s + u.proprieta, 0))}</span>
        <span class="nota">somma delle sue unità${proprie.some((u) => u.proprietari.length > 1) ? ', alcune in comproprietà' : ''}</span></div>
      ${mieTeste.map((t) => `<div class="riquadro"><span class="nota">In assemblea vota come</span><span>${esc(t.etichetta)}</span>
        <span class="nota">${millesimi(t.proprieta)} millesimi · ${t.unita.length} unità</span></div>`).join('')}
    </div>

    <section id="condomino-contatti"></section>

    <h2>Unità</h2>
    <div class="scorri"><table>
      <thead><tr><th>Unità</th><th>Tipo</th><th>Titolo</th><th>Dal</th><th>Con</th><th class="num">Millesimi proprietà</th></tr></thead>
      <tbody>${correnti.map((t) => `
        <tr>
          <td><a href="#/unita/${encodeURIComponent(t.unita.codice)}"><strong>${esc(t.unita.codice)}</strong></a></td>
          <td>${esc(TIPI[t.unita.tipo] ?? '')}</td>
          <td>${RUOLI[t.ruolo]}</td><td>${data(t.dal)}</td>
          <td>${contitolari(t.unita, t.ruolo)}</td>
          <td class="num">${t.ruolo === 'proprietario' ? millesimi(t.unita.proprieta) : ''}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="nota">Nessuna unità con titolo in corso.</td></tr>'}</tbody>
    </table></div>
    ${altriTitoli.length ? `
      <details class="assenti"><summary>Titoli cessati o futuri (${altriTitoli.length})</summary>
        <div class="scorri"><table>
          <thead><tr><th>Unità</th><th>Titolo</th><th>Dal</th><th>Al</th><th>Stato</th></tr></thead>
          <tbody>${altriTitoli.map((t) => `<tr class="spento"><td><a href="#/unita/${encodeURIComponent(t.unita.codice)}">${esc(t.unita.codice)}</a></td>
            <td>${RUOLI[t.ruolo]}</td><td>${data(t.dal)}</td><td>${data(t.al)}</td><td>${t.quale === 'futuro' ? 'non ancora iniziato' : 'cessato'}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>` : ''}

    <h2>Millesimi per tabella</h2>
    <div class="scorri"><table>
      <thead><tr><th>Tabella</th>${dettaglioUnita ? proprie.map((u) => `<th class="num">${esc(u.codice)}</th>`).join('') : ''}<th class="num">Totale</th><th class="num">Totale tabella</th><th class="num">Quota</th></tr></thead>
      <tbody>${tabelle.map((t) => {
        const totale = proprie.reduce((s, u) => s + (u.millesimi[t.id] ?? 0), 0);
        const quota = Number(t.totale_dichiarato) ? (100 * totale) / Number(t.totale_dichiarato) : null;
        return `<tr><td><a href="#/millesimi/${t.id}">${esc(t.nome)}</a></td>
          ${dettaglioUnita ? proprie.map((u) => `<td class="num">${u.millesimi[t.id] ? millesimi(u.millesimi[t.id]) : ''}</td>`).join('') : ''}
          <td class="num"><strong>${millesimi(totale)}</strong></td><td class="num">${millesimi(t.totale_dichiarato)}</td>
          <td class="num">${quota === null ? '' : `${quota.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`}</td></tr>`;
      }).join('') || `<tr><td colspan="${dettaglioUnita ? proprie.length + 4 : 4}" class="nota">Nessun millesimo: non è proprietario di unità.</td></tr>`}</tbody>
    </table></div>

    <h2>Situazione contabile</h2>
    ${esercizi.length ? `<div class="scorri"><table>
      <thead><tr><th>Esercizio</th><th>Unità</th><th class="num">Totale gestione</th><th class="num">Saldo precedente</th><th class="num">Rate versate</th><th class="num">Saldo finale</th></tr></thead>
      <tbody>${esercizi.map((e) => { const righe = posizioni.filter((p) => p.esercizio_id === e.id).sort((a, b) => (codiceUnita.get(a.unita_id) ?? '').localeCompare(codiceUnita.get(b.unita_id) ?? '', 'it', { numeric: true })); return righe.map((p) => `
        <tr><td>${e.anno}${e.tipo === 'preventivo' ? ' preventivo' : ''}</td><td>${esc(codiceUnita.get(p.unita_id) ?? '')}${p.ruolo && p.ruolo !== 'proprietario' ? ` ${etichetta(RUOLI[p.ruolo] ?? p.ruolo)}` : ''}</td>
          <td class="num ${segno(p.totale_gestione)}">${euro(p.totale_gestione)}</td><td class="num ${segno(p.saldo_precedente)}">${euro(p.saldo_precedente)}</td>
          <td class="num">${e.tipo === 'consuntivo' ? euro(p.rate_versate) : ''}</td><td class="num ${segno(p.saldo_finale)}"><strong>${euro(p.saldo_finale)}</strong></td></tr>`).join('')
        + (righe.length > 1 ? `<tr class="totale"><td colspan="2"><strong>Totale ${e.anno}${e.tipo === 'preventivo' ? ' (preventivo)' : ''}</strong></td>${['totale_gestione', 'saldo_precedente'].map((c) => `<td class="num ${segno(somma(righe, c))}"><strong>${euro(somma(righe, c))}</strong></td>`).join('')}<td class="num"><strong>${e.tipo === 'consuntivo' ? euro(somma(righe, 'rate_versate')) : ''}</strong></td><td class="num ${segno(somma(righe, 'saldo_finale'))}"><strong>${euro(somma(righe, 'saldo_finale'))}</strong></td></tr>` : ''); }).join('')}</tbody>
    </table></div>
    <p class="nota">Saldo negativo = da versare; positivo = a credito. Per ogni anno vale il consuntivo; il preventivo compare solo per gli anni non ancora chiusi.</p>` : '<p class="nota">Nessuna posizione contabile intestata.</p>'}

    <h2>Assemblee</h2>
    <div id="condomino-assemblee"><p class="nota">Caricamento delle assemblee…</p></div>`;

  contattiCondomino(stato, contenitore.querySelector('#condomino-contatti'), soggetto);

  caricaAssemblee(stato, id).then((html) => {
    const zona = contenitore.querySelector('#condomino-assemblee');
    if (zona) zona.innerHTML = html;
  }).catch((errore) => {
    const zona = contenitore.querySelector('#condomino-assemblee');
    if (zona) zona.innerHTML = `<p class="avviso grave" role="alert">Non è stato possibile leggere le assemblee: ${esc(errore.message)}</p>`;
  });
}

async function caricaAssemblee(stato, id) {
  const { modello, dati } = stato;
  const [assemblee, teste, presenze, deleghe, punti] = await Promise.all(
    ['assemblee', 'teste_assemblea', 'presenze', 'deleghe', 'punti_odg'].map((t) => deposito.leggi(t)),
  );
  const coinvolte = assemblee.filter((a) => teste.some((t) => t.assemblea_id === a.id && t.soggetti.includes(id)))
    .sort((a, b) => b.data.localeCompare(a.data));
  if (!coinvolte.length) return '<p class="nota">Non risulta in nessuna assemblea registrata nel portale (le teste di un\'assemblea si fissano all\'apertura della seduta).</p>';
  const puntiDi = (a) => punti.filter((p) => p.assemblea_id === a.id).sort((x, y) => x.ordine - y.ordine);
  const idPunti = coinvolte.flatMap(puntiDi).map((p) => p.id);
  const voti = idPunti.length ? await deposito.leggi('voti', { punto_id: idPunti }) : [];
  const conMillesimi = (testa, tabellaId) => testa.unita.some((u) => dati.millesimi.some((m) => m.unita_id === u && m.tabella_id === tabellaId && Number(m.valore) > 0));

  return coinvolte.map((a, i) => {
    const suoi = teste.filter((t) => t.assemblea_id === a.id);
    const seduta = statoSeduta({
      assemblea: a, teste: suoi, presenze: presenze.filter((p) => p.assemblea_id === a.id), deleghe: deleghe.filter((d) => d.assemblea_id === a.id),
      millesimi: dati.millesimi, tabellaProprietaId: modello.tabellaProprieta?.id,
    });
    const mie = seduta.righe.filter((r) => r.testa.soggetti.includes(id));
    const aperta = a.stato !== 'bozza';
    return `
      <details class="gruppo" ${i === 0 ? 'open' : ''}>
        <summary><span>Assemblea ${esc(a.tipo)} del ${quando(a)}</span><span class="nota">${STATI_ASSEMBLEA[a.stato] ?? esc(a.stato)}</span></summary>
        <div class="scheda-assemblea">
          ${mie.map((r) => schedaTesta(r, seduta, a, aperta)).join('')}
          ${puntiDi(a).length ? `<div class="scorri"><table>
            <thead><tr><th>Punto all'ordine del giorno</th><th>Suo voto</th><th>Esito</th></tr></thead>
            <tbody>${puntiDi(a).map((p) => `<tr><td>${p.ordine}. ${esc(p.testo)}</td><td>${mie.map((r) => votoSulPunto(r, p, voti, conMillesimi)).join('<br>')}</td>
              <td>${p.votato_il ? (p.esito?.approvato ? etichetta('approvato', 'stato-presente') : etichetta('respinto', 'stato-respinto')) : ''}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="nota">Nessun punto all\'ordine del giorno registrato.</p>'}
          <p><a href="#/assemblee/${encodeURIComponent(a.id)}">Apri l'assemblea</a></p>
        </div>
      </details>`;
  }).join('');
}

// Presenza della testa e deleghe in quella seduta.
function schedaTesta(r, seduta, a, aperta) {
  const condivisa = r.testa.soggetti.length > 1 ? `<p class="nota">Testa condivisa: ${esc(r.testa.etichetta)}</p>` : '';
  let presenza;
  if (!aperta) presenza = etichetta('seduta non ancora aperta');
  else if (r.stato === 'presente') presenza = `${etichetta('presente di persona', 'stato-presente')}${r.oraIngresso ? ` dalle ${ora(r.oraIngresso)}` : ''}`;
  else if (r.stato === 'delega') presenza = `${etichetta('rappresentato per delega', 'stato-delega')} da ${esc(r.delegato.nome)}${r.delegato.amministratore ? ' (amministratore)' : ''}`;
  else presenza = etichetta(a.stato === 'chiusa' ? 'assente' : 'non presente', 'stato-respinto');
  const delegaNonValida = r.delegato && !r.delegato.valida && aperta
    ? `<p class="nota">Delega rilasciata a ${esc(r.delegato.nome)}, ma non conta: ${r.stato === 'presente' ? 'è presente di persona' : 'il delegato non è in sala'}.</p>` : '';
  const ricevute = seduta.righe.filter((x) => x.delegato?.testa?.id === r.testa.id);
  return `
    <p><strong>Presenza:</strong> ${presenza}</p>${condivisa}${delegaNonValida}
    ${r.delegato ? `<p><strong>Delega rilasciata a:</strong> ${esc(r.delegato.nome)}${r.delegato.esterno ? ' (esterno)' : ''}${r.delegato.delega?.scansione_path ? ' · scansione in archivio' : ''}</p>` : ''}
    <p><strong>Deleghe ricevute:</strong> ${ricevute.length ? ricevute.map((x) => `${esc(x.testa.etichetta)}${x.delegato.valida ? '' : ' <span class="nota">(non valida)</span>'}`).join(', ') : 'nessuna'}</p>`;
}

function votoSulPunto(r, p, voti, conMillesimi) {
  if (p.tabella_id && !conMillesimi(r.testa, p.tabella_id)) return '<span class="nota">non vota (nessun millesimo nella tabella)</span>';
  if (!p.votato_il) return '<span class="nota">non ancora votato</span>';
  if (!(p.presenti_al_voto ?? []).includes(r.testa.id)) return etichetta('assente al voto');
  const voto = voti.find((v) => v.punto_id === p.id && v.testa_id === r.testa.id)?.voto;
  const tramite = r.stato === 'delega' ? ` <span class="nota">tramite ${esc(r.delegato.nome)}</span>` : '';
  return voto ? `${etichetta(VOTI[voto][0], VOTI[voto][1])}${tramite}` : `<span class="nota">voto non espresso</span>${tramite}`;
}

// Contatti del condomino, con il modulo per modificarli.
function contattiCondomino(stato, zona, soggetto) {
  const tel = (v) => `<a href="tel:${esc(String(v).replace(/[^\d+]/g, ''))}">${esc(v)}</a>`;
  const mostra = () => {
    const voci = [
      soggetto.email && linkEmail(soggetto.email),
      soggetto.telefono && `tel. ${tel(soggetto.telefono)}`, soggetto.cellulare && `cell. ${tel(soggetto.cellulare)}`,
    ].filter(Boolean);
    zona.innerHTML = `<h2>Contatti</h2>
      <p>${voci.join(' · ') || '<span class="nota">Nessun contatto registrato.</span>'}
        <button type="button" class="secondario" data-azione="modifica">Modifica</button></p>`;
  };
  const modulo = () => {
    zona.innerHTML = `<h2>Contatti</h2>
      <form class="modulo">
        <label>Email <input name="email" type="text" inputmode="email" placeholder="più indirizzi separati da virgola" value="${esc(soggetto.email ?? '')}"></label>
        <label>Telefono <input name="telefono" type="tel" value="${esc(soggetto.telefono ?? '')}"></label>
        <label>Cellulare <input name="cellulare" type="tel" value="${esc(soggetto.cellulare ?? '')}"></label>
        <p class="errore largo" role="alert"></p>
        <div class="azioni largo"><button type="submit">Salva</button> <button type="button" class="secondario" data-azione="annulla">Annulla</button></div>
      </form>`;
    zona.querySelector('input').focus();
  };
  zona.onclick = (evento) => {
    if (evento.target.dataset.azione === 'modifica') modulo();
    if (evento.target.dataset.azione === 'annulla') mostra();
  };
  zona.onsubmit = async (evento) => {
    evento.preventDefault();
    const form = evento.target;
    const errore = form.querySelector('.errore');
    let valori;
    try {
      valori = { email: controlla.email(form.email.value), telefono: controlla.telefono(form.telefono.value), cellulare: controlla.telefono(form.cellulare.value) };
    } catch (e) {
      errore.textContent = e.message;
      return;
    }
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      await deposito.aggiorna('soggetti', { id: soggetto.id }, valori);
      Object.assign(soggetto, valori);
      stato.dati = await caricaDati();
      stato.modello = costruisciModello(stato.dati, stato.oggi);
      mostra();
    } catch (e) {
      errore.textContent = `Non salvato: ${e.message}`;
      form.querySelector('button[type="submit"]').disabled = false;
    }
  };
  mostra();
}
