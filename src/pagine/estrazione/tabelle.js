// Le tabelle della revisione: i dati assemblati di ogni sezione, con le celle modificabili.
// Ogni cella porta in `data-origine` la chiave della correzione ("sezione:pagina|percorso.campo") e ogni riga in
// `data-pagina` la pagina del PDF da cui viene. Qui si costruisce solo l'HTML: i gesti li gestisce revisione.js.
import { esc } from '../../ui/html.js';
import { RUOLI_COLONNA } from '../../estrazione/assembla.js';

export const SCHEDE = [['spese', 'Spese'], ['riparto', 'Riparto'], ['patrimoniale', 'Situazione patrimoniale'], ['partite', 'Debiti e crediti'], ['preventivo', 'Preventivo'], ['raffronto', 'Raffronto']];
const TIPI_TOTALE = { parziale_sottoconto: 'Parziale sottoconto', totale_gruppo: 'Totale gruppo', totale_generale: 'Totale rendiconto', altro: 'Altro' };
const paginaDi = (origine) => Number(/:(\d+)\|/.exec(origine ?? '')?.[1]) || '';

// stile = { segni: Map chiave della cella → 'errore'|'avviso'|'coinvolta', corrette: { chiave: valore letto in origine }, modificabile }
export function creaTabelle(stile) {
  const segnata = (chiave) => stile.segni.has(chiave);
  function cella(chiave, valore, classi = '') {
    if (!chiave || chiave.startsWith('undefined')) return `<td class="${classi}">${esc(valore)}</td>`;
    const segno = stile.segni.get(chiave);
    const corretta = chiave in stile.corrette;
    return `<td class="cella ${classi} ${segno ? `segnata-${segno}` : ''} ${corretta ? 'corretta' : ''}" data-origine="${esc(chiave)}" ${stile.modificabile ? 'tabindex="0"' : ''}
      ${corretta ? `title="Corretta a mano. Letto dal documento: ${esc(stile.corrette[chiave] || '(vuoto)')}"` : ''}>${esc(valore)}</td>`;
  }
  const num = (chiave, valore) => cella(chiave, valore, 'num');
  // con "solo segnalate" restano le righe che hanno almeno una cella segnalata o corretta
  const visibile = (soloSegnalate, chiavi) => !soloSegnalate || chiavi.some((k) => segnata(k) || k in stile.corrette);
  const nessuna = (colonne, soloSegnalate) => `<tr><td colspan="${colonne}" class="nota">${soloSegnalate ? 'Nessuna riga segnalata.' : 'Nessuna riga.'}</td></tr>`;

  function spese(d, { soloSegnalate }) {
    const campi = ['gruppo', 'sottoconto', 'protocollo', 'fattura', 'descrizione', 'fornitore', 'data_fattura', 'data_pagamento'];
    const voci = d.voci.filter((v) => visibile(soloSegnalate, [...campi, 'importo'].map((c) => `${v.origine}.${c}`)));
    const totali = d.totali.filter((t) => visibile(soloSegnalate, [`${t.origine}.importo`]));
    return `
      <h3>Voci <span class="nota">(${voci.length} di ${d.voci.length})</span></h3>
      <div class="scorri"><table class="tab-revisione">
        <thead><tr><th>Pag.</th><th>Gruppo</th><th>Sottoconto</th><th>Prot.</th><th>Fattura</th><th>Descrizione</th><th>Fornitore</th><th>Data fatt.</th><th>Data pag.</th><th class="num">Importo</th></tr></thead>
        <tbody>${voci.map((v) => `<tr data-pagina="${esc(v.pagina)}"><td>${esc(v.pagina)}</td>${campi.map((c) => cella(`${v.origine}.${c}`, v[c])).join('')}${num(`${v.origine}.importo`, v.importo)}</tr>`).join('') || nessuna(10, soloSegnalate)}</tbody>
      </table></div>
      <h3>Parziali e totali stampati <span class="nota">(${totali.length} di ${d.totali.length})</span></h3>
      <div class="scorri"><table class="tab-revisione">
        <thead><tr><th>Pag.</th><th>Tipo</th><th>Gruppo</th><th>Sottoconto</th><th class="num">Importo</th></tr></thead>
        <tbody>${totali.map((t) => `<tr data-pagina="${esc(t.pagina)}"><td>${esc(t.pagina)}</td><td>${esc(TIPI_TOTALE[t.tipo] ?? t.tipo)}${t.etichetta && t.tipo === 'altro' ? ` — ${esc(t.etichetta)}` : ''}</td>
          ${cella(`${t.origine}.gruppo`, t.gruppo)}${cella(`${t.origine}.sottoconto`, t.sottoconto)}${num(`${t.origine}.importo`, t.importo)}</tr>`).join('') || nessuna(5, soloSegnalate)}</tbody>
      </table></div>`;
  }

  // Il riparto si rivede una parte alla volta, com'è stampato: stesse righe, colonne diverse.
  function riparto(d, { soloSegnalate, parte }) {
    const p = d.parti.find((x) => x.parte === parte) ?? d.parti[0];
    const colonne = p.colonne.map((k) => d.colonne.find((c) => c.chiave === k));
    const chiaviRiga = (r) => [`${r.origine}.codice`, `${r.origine}.intestatario`, `${r.origine}.etichetta`, ...Object.values(r.celle).flatMap((c) => [`${c.origine}.importo`, `${c.origine}.millesimi`])];
    const righe = p.righe.filter((r) => visibile(soloSegnalate, chiaviRiga(r)));
    const celle = (insieme, soloImporto) => colonne.map((c) => {
      const x = insieme[c.chiave];
      if (!x) return `<td></td>${c.millesimi ? '<td></td>' : ''}`;
      return `${num(`${x.origine}.importo`, x.importo)}${c.millesimi ? (soloImporto ? '<td></td>' : num(`${x.origine}.millesimi`, x.millesimi)) : ''}`;
    }).join('');
    return `
      <div class="filtri">${d.parti.map((x) => `<button type="button" class="secondario" data-parte="${x.parte}" aria-pressed="${x.parte === p.parte}">Parte ${x.parte} <span class="nota">(${x.colonne.length} colonne)</span></button>`).join('')}
        <span class="nota">${righe.length} di ${p.righe.length} righe</span></div>
      <div class="scorri"><table class="tab-revisione tab-riparto">
        <thead>
          <tr><th rowspan="2">Pag.</th><th rowspan="2">Codice</th><th rowspan="2">Intestatario</th><th rowspan="2">Tipo / titolo</th>
            ${colonne.map((c) => `<th colspan="${c.millesimi ? 2 : 1}">${esc(c.titolo)}<br>
              <select data-ruolo="${esc(c.chiave)}" aria-label="Ruolo della colonna ${esc(c.titolo)}" ${stile.modificabile ? '' : 'disabled'}>${Object.entries(RUOLI_COLONNA).map(([ruolo, nome]) => `<option value="${ruolo}" ${ruolo === c.ruolo ? 'selected' : ''}>${esc(nome)}</option>`).join('')}</select></th>`).join('')}</tr>
          <tr>${colonne.map((c) => `<th class="num">importo</th>${c.millesimi ? '<th class="num">millesimi</th>' : ''}`).join('')}</tr>
        </thead>
        <tbody>${righe.map((r) => `<tr data-pagina="${esc(r.pagina)}"><td>${esc(r.pagina)}</td>${cella(`${r.origine}.codice`, r.codiceStampato === r.codice ? r.codice : `${r.codiceStampato} → ${r.codice}`)}
          ${cella(`${r.origine}.intestatario`, r.intestatario)}${cella(`${r.origine}.etichetta`, r.etichetta)}${celle(r.celle)}</tr>`).join('') || nessuna(4 + colonne.length * 2, soloSegnalate)}</tbody>
        <tfoot>
          <tr data-pagina="${esc(p.righe.at(-1)?.pagina ?? '')}"><td></td><td colspan="3">Arrotondamenti</td>${celle(p.arrotondamenti, true)}</tr>
          <tr data-pagina="${esc(p.righe.at(-1)?.pagina ?? '')}"><td></td><td colspan="3">Totale complessivo</td>${celle(p.totale)}</tr>
        </tfoot>
      </table></div>
      <p class="nota">Un codice mostrato come «44 → A44» è stato normalizzato: a sinistra com'è stampato, a destra com'è in anagrafica.</p>`;
  }

  function patrimoniale(d) {
    const lato = (nome, titolo) => `
      <div class="scorri"><table class="tab-revisione">
        <thead><tr><th>${titolo}</th><th>Voce</th><th class="num">Importo</th></tr></thead>
        <tbody>${d[nome].map((v) => `<tr data-pagina="${paginaDi(v.origine)}">${cella(`${v.origine}.gruppo`, v.gruppo)}${cella(`${v.origine}.voce`, v.voce)}${num(`${v.origine}.importo`, v.importo)}</tr>`).join('') || nessuna(3)}</tbody>
        <tfoot><tr data-pagina="${paginaDi(d.origine)}"><td colspan="2">Totale stampato</td>${num(d.origine ? `${d.origine}|totale_${nome}` : '', d[`totale_${nome}`])}</tr></tfoot>
      </table></div>`;
    return `<p class="nota">Situazione al ${esc(d.data || '(data non letta)')}. La prima colonna è il titolo sotto cui la voce è rientrata (per esempio «Disponibilità»), se c'è.</p>
      <div class="affiancate">${lato('attivita', 'Attività')}${lato('passivita', 'Passività')}</div>`;
  }

  function partite(d, { soloSegnalate }) {
    const righe = d.righe.filter((r) => visibile(soloSegnalate, ['sezione', 'controparte', 'protocollo', 'descrizione', 'importo'].map((c) => `${r.origine}.${c}`)));
    return `
      <div class="scorri"><table class="tab-revisione">
        <thead><tr><th>Pag.</th><th>Elenco</th><th>Controparte</th><th>Prot.</th><th>Descrizione</th><th class="num">Importo</th></tr></thead>
        <tbody>${righe.map((r) => `<tr data-pagina="${esc(r.pagina)}"><td>${esc(r.pagina)}</td>${['sezione', 'controparte', 'protocollo', 'descrizione'].map((c) => cella(`${r.origine}.${c}`, r[c])).join('')}${num(`${r.origine}.importo`, r.importo)}</tr>`).join('') || nessuna(6, soloSegnalate)}</tbody>
        <tfoot>${d.totali.map((t) => `<tr data-pagina="${paginaDi(t.origine)}"><td></td><td colspan="4">Totale stampato — ${esc(t.sezione)}</td>${num(`${t.origine}.importo`, t.importo)}</tr>`).join('')}</tfoot>
      </table></div>`;
  }

  function preventivo(d) {
    return `<p class="nota">${esc(d.esercizio || 'Esercizio non letto')}: una riga per voce, il totale del gruppo sulla riga del gruppo.</p>
      <div class="scorri"><table class="tab-revisione tab-conti">
        <thead><tr><th>Gruppo / voce</th><th class="num">Importo</th><th class="num">Totale del gruppo</th></tr></thead>
        <tbody>${d.gruppi.map((g) => `
          <tr class="riga-gruppo" data-pagina="${paginaDi(g.origine)}">${cella(`${g.origine}.gruppo`, g.gruppo)}<td></td>${num(`${g.origine}.totale`, g.totale)}</tr>
          ${g.voci.map((v) => `<tr data-pagina="${paginaDi(v.origine)}">${cella(`${v.origine}.voce`, v.voce, 'rientro')}${num(`${v.origine}.importo`, v.importo)}<td></td></tr>`).join('')}`).join('') || nessuna(3)}</tbody>
        <tfoot><tr data-pagina="${paginaDi(d.origineTotale)}"><td>Totale stampato</td><td></td>${num(d.origineTotale ?? '', d.totale)}</tr></tfoot>
      </table></div>`;
  }

  function raffronto(d) {
    return `<p class="nota">Il raffronto non si importa (il portale lo ricalcola): serve come riprova delle spese lette.</p>
      <div class="scorri"><table class="tab-revisione tab-conti">
        <thead><tr><th>Gruppo</th><th>Voce</th>${[0, 1, 2].map((i) => `<th class="num">${esc(d.colonne[i] ?? `Colonna ${i + 1}`)}</th>`).join('')}</tr></thead>
        <tbody>${d.righe.map((r) => `<tr class="${r.livello === 'voce' ? '' : 'riga-gruppo'}" data-pagina="${paginaDi(r.origine)}">${cella(`${r.origine}.gruppo`, r.gruppo)}${cella(`${r.origine}.voce`, r.voce)}
          ${[0, 1, 2].map((i) => num(`${r.origine}.valori.${i}`, r.valori[i] ?? '')).join('')}</tr>`).join('') || nessuna(5)}</tbody>
      </table></div>`;
  }

  return { spese, riparto, patrimoniale, partite, preventivo, raffronto };
}
