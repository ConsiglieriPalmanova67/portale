// Scheda Spese: le voci dell'anno scelto, per gruppo e sottoconto. Se l'anno ha sia il consuntivo sia il preventivo
// si sceglie quale guardare (di norma il consuntivo); del preventivo c'è una riga per voce.
import { esc, euro, data, normalizza } from '../../ui/html.js';
import { raggruppaSpese } from '../../dati/modello.js';
import { TIPI_ESERCIZIO } from './comuni.js';

export function schedaSpese(ctx, contenitore) {
  const { dati, anno, memoria } = ctx;
  const esercizio = anno[memoria.tipo] ?? anno.consuntivo ?? anno.preventivo;
  const consuntivo = esercizio.tipo === 'consuntivo';
  const riepilogo = raggruppaSpese(dati.spese, dati.conti, dati.fornitori, esercizio.id);
  const entrambi = anno.consuntivo && anno.preventivo;
  // un consuntivo importato da un fascicolo senza il rendiconto voce per voce ha solo il riparto per unità:
  // il totale dell'anno è la somma dei totali di gestione delle posizioni
  const posizioni = dati.posizioni.filter((x) => x.esercizio_id === esercizio.id);
  const dalRiparto = consuntivo && !riepilogo.gruppi.length && posizioni.length > 0;
  const totale = dalRiparto ? posizioni.reduce((t, x) => t + Math.round(Number(x.totale_gestione ?? 0) * 100), 0) / 100 : riepilogo.totale;

  contenitore.innerHTML = `
    <div class="filtri">
      ${entrambi ? Object.entries(TIPI_ESERCIZIO).map(([tipo, nome]) =>
        `<button type="button" class="secondario" data-tipo="${tipo}" aria-pressed="${tipo === esercizio.tipo}">${nome}</button>`).join('')
        : `<span class="etichetta">${esc(TIPI_ESERCIZIO[esercizio.tipo])} ${esc(anno.anno)}</span>`}
      ${consuntivo ? '<input type="search" id="cerca" placeholder="Cerca nelle voci: descrizione, fornitore, protocollo" aria-label="Cerca nelle voci">' : ''}
    </div>
    <div class="riquadri">
      <div class="riquadro"><span class="valore">${euro(totale)}</span><span class="nota">totale ${dalRiparto ? 'gestione dal riparto' : consuntivo ? 'spese' : 'preventivo'} ${esc(anno.anno)}</span></div>
      ${dalRiparto
        ? `<div class="riquadro"><span class="valore">${posizioni.length}</span><span class="nota">posizioni delle unità</span></div>`
        : `<div class="riquadro"><span class="valore">${riepilogo.gruppi.length}</span><span class="nota">gruppi di spesa</span></div>`}
    </div>
    ${dalRiparto ? `<p class="avviso">Per il ${esc(anno.anno)} il fascicolo caricato contiene solo il <strong>riparto per unità</strong>, non il rendiconto voce per voce:
      il totale è la somma dei totali di gestione delle unità, e le singole spese non ci sono. Per averle serve il rendiconto voce per voce
      (con protocolli, fornitori e importi): chiedilo all'amministratore e caricalo in Documenti, poi «Estrai i dati».
      Intanto le quote di ogni unità si vedono nella scheda dell'unità e del condomino.
      ${anno.preventivo ? 'Il <strong>preventivo</strong> dell’anno invece è voce per voce: premi «Preventivo» qui sopra.' : ''}</p>` : ''}
    <div id="gruppi"></div>`;

  const disegna = () => {
    const testo = normalizza(contenitore.querySelector('#cerca')?.value.trim() ?? '');
    const corrisponde = (v) => !testo || normalizza(`${v.descrizione} ${v.fornitore} ${v.protocollo} ${v.numero_fattura}`).includes(testo);
    contenitore.querySelector('#gruppi').innerHTML = riepilogo.gruppi.map((g) => {
      const sottoconti = g.sottoconti.map((sc) => ({ ...sc, voci: sc.voci.filter(corrisponde) })).filter((sc) => sc.voci.length);
      if (!sottoconti.length) return '';
      return `
        <details class="gruppo" ${testo ? 'open' : ''}>
          <summary><span>${esc(g.nome)}</span><span class="num">${euro(g.totale)}</span></summary>
          ${consuntivo ? sottoconti.map((sc) => `
            <details class="sottoconto" ${testo ? 'open' : ''}>
              <summary><span>${esc(sc.nome)} <span class="nota">(${sc.voci.length})</span></span><span class="num">${euro(sc.totale)}</span></summary>
              <div class="scorri"><table>
                <thead><tr><th>Prot.</th><th>Descrizione</th><th>Fornitore</th><th>Fattura</th><th>Pagamento</th><th class="num">Importo</th></tr></thead>
                <tbody>${sc.voci.map((v) => `
                  <tr>
                    <td>${esc(v.protocollo)}</td>
                    <td>${esc(v.descrizione)}${v.numero_fattura ? `<br><span class="nota">${esc(v.numero_fattura)}</span>` : ''}</td>
                    <td>${esc(v.fornitore)}</td><td>${data(v.data_fattura)}</td><td>${data(v.data_pagamento)}</td>
                    <td class="num">${euro(v.importo)}</td>
                  </tr>`).join('')}</tbody>
              </table></div>
            </details>`).join('') : `
            <div class="scorri"><table>
              <thead><tr><th>Voce</th><th class="num">Importo</th></tr></thead>
              <tbody>${sottoconti.map((sc) => `<tr><td>${esc(sc.nome)}</td><td class="num">${euro(sc.totale)}</td></tr>`).join('')}</tbody>
            </table></div>`}
        </details>`;
    }).join('') || `<p class="nota">${testo ? 'Nessuna voce corrisponde alla ricerca.' : (dalRiparto ? '' : 'Nessuna voce caricata per questo esercizio.')}</p>`;
  };

  contenitore.onclick = (evento) => {
    const { tipo } = evento.target.dataset;
    if (!tipo) return;
    memoria.tipo = tipo;
    schedaSpese(ctx, contenitore);
  };
  contenitore.querySelector('#cerca')?.addEventListener('input', disegna);
  disegna();
}
