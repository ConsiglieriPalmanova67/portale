// Scheda Situazione patrimoniale: attività e passività a fine esercizio con la verifica dei totali;
// sotto, crediti e debiti verso terzi raggruppati per controparte.
import { esc } from '../../ui/html.js';
import { situazionePatrimoniale, raggruppaPartite, inCentesimi } from '../../dati/contabilita.js';
import { soldi } from './comuni.js';

const ORDINI = { decrescente: 'Dall\'importo più alto', crescente: 'Dall\'importo più basso', nome: 'Per nome' };
const PARTITE = [['credito', 'Crediti verso terzi'], ['debito', 'Debiti verso terzi']];

function lato(titolo, voci, totale) {
  return `
    <div class="scorri"><table class="tab-conti">
      <thead><tr><th>${titolo}</th><th class="num">Importo</th></tr></thead>
      <tbody>${voci.map((v) => `<tr><td>${esc(v.voce)}</td><td class="num">${soldi(v.importo)}</td></tr>`).join('')
        || '<tr><td colspan="2" class="nota">Nessuna voce.</td></tr>'}</tbody>
      <tfoot><tr><td>Totale ${titolo.toLowerCase()}</td><td class="num">${soldi(totale)}</td></tr></tfoot>
    </table></div>`;
}

function partiteDi(ctx, esercizio, tipo, titolo) {
  const { memoria } = ctx;
  const r = raggruppaPartite(ctx.dati.partite_terzi, { esercizioId: esercizio.id, tipo, ordine: memoria.ordine, testo: memoria.cerca });
  const filtrato = Boolean(memoria.cerca.trim());
  return `
    <h3>${titolo} <span class="nota">${filtrato ? `trovati ${soldi(r.totale)} su ${soldi(r.totaleComplessivo)}` : `totale ${soldi(r.totaleComplessivo)}`}</span></h3>
    ${r.gruppi.map((g) => `
      <details class="gruppo" ${filtrato ? 'open' : ''}>
        <summary><span>${esc(g.controparte)} <span class="nota">(${g.partite.length})</span></span><span class="num">${soldi(g.totale)}</span></summary>
        <div class="scorri"><table>
          <thead><tr><th>Prot.</th><th>Descrizione</th><th class="num">Importo</th></tr></thead>
          <tbody>${g.partite.map((p) => `<tr><td>${esc(p.protocollo)}</td><td>${esc(p.descrizione)}</td><td class="num">${soldi(inCentesimi(p.importo))}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>`).join('') || `<p class="nota">${filtrato ? 'Nessuna partita corrisponde alla ricerca.' : 'Nessuna partita registrata.'}</p>`}`;
}

export function schedaPatrimoniale(ctx, contenitore) {
  const { dati, anno, memoria } = ctx;
  memoria.ordine ??= 'decrescente';
  memoria.cerca ??= '';
  // la situazione patrimoniale è quella di fine esercizio: di norma sta sul consuntivo
  const haDati = (e) => e && (dati.stato_patrimoniale.some((r) => r.esercizio_id === e.id) || dati.partite_terzi.some((p) => p.esercizio_id === e.id));
  const esercizio = [anno.consuntivo, anno.preventivo].find(haDati);
  if (!esercizio) {
    contenitore.innerHTML = `<p class="avviso">Per il ${esc(anno.anno)} la situazione patrimoniale non è stata caricata${anno.consuntivo ? '' : ': c\'è solo il preventivo, la situazione patrimoniale arriva con il rendiconto'}.</p>`;
    return;
  }
  const sp = situazionePatrimoniale(dati.stato_patrimoniale, esercizio.id);
  const verifica = sp.vuota ? '<p class="avviso">Le voci di attività e passività non sono state caricate: ci sono solo le partite verso terzi.</p>'
    : sp.quadra ? `<p class="avviso fatto" role="status">Attività e passività coincidono: <strong>${soldi(sp.totaleAttivita)}</strong>.</p>`
      : `<p class="avviso grave" role="alert">Attività e passività <strong>non coincidono</strong>: le attività ${sp.differenza > 0 ? 'superano le' : 'sono inferiori alle'} passività di <strong>${soldi(Math.abs(sp.differenza))}</strong>. Controllare i dati caricati.</p>`;

  contenitore.innerHTML = `
    <p class="nota">Situazione al termine dell'esercizio ${esc(anno.anno)} (${esc(esercizio.tipo)}).</p>
    ${sp.vuota ? '' : `<div class="affiancate">${lato('Attività', sp.attivita, sp.totaleAttivita)}${lato('Passività', sp.passivita, sp.totalePassivita)}</div>`}
    ${verifica}
    <h2>Crediti e debiti verso terzi</h2>
    <div class="filtri">
      <input type="search" id="cerca-partite" placeholder="Cerca per controparte, descrizione o protocollo" aria-label="Cerca nelle partite" value="${esc(memoria.cerca)}">
      <select id="ordine-partite" aria-label="Ordine delle controparti">${Object.entries(ORDINI).map(([k, n]) => `<option value="${k}" ${k === memoria.ordine ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    </div>
    <div id="partite"></div>`;

  const disegnaPartite = () => {
    contenitore.querySelector('#partite').innerHTML = PARTITE.map(([tipo, titolo]) => partiteDi(ctx, esercizio, tipo, titolo)).join('');
  };
  contenitore.querySelector('#cerca-partite').addEventListener('input', (evento) => {
    memoria.cerca = evento.target.value;
    disegnaPartite();
  });
  contenitore.querySelector('#ordine-partite').addEventListener('change', (evento) => {
    memoria.ordine = evento.target.value;
    disegnaPartite();
  });
  disegnaPartite();
}
