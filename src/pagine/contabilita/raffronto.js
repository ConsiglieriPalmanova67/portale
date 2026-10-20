// Scheda Raffronto: preventivo e consuntivo dello stesso anno, per gruppo e sottoconto, con gli sforamenti in evidenza.
import { esc } from '../../ui/html.js';
import { raffronto } from '../../dati/contabilita.js';
import { soldi, conSegno, percento, comeSpesa, coloreSpesa, tastiMacroVoci, apriChiudi, nascosta, gestisciMacroVoci } from './comuni.js';

const SFORA = '<span class="etichetta stato-respinto">sforamento</span>';

// differenza e scostamento come variazione della spesa: + rosso (speso più del previsto), − verde (risparmio)
const celle = (r, inNegativo) => {
  const delta = comeSpesa(r.differenza, inNegativo);
  return `
  <td class="num">${soldi(r.preventivo)}</td>
  <td class="num">${soldi(r.consuntivo)}</td>
  <td class="num ${coloreSpesa(delta)}">${conSegno(delta)}</td>
  <td class="num ${coloreSpesa(delta)}">${percento(comeSpesa(r.percento, inNegativo))}</td>`;
};

export function schedaRaffronto(ctx, contenitore) {
  const { dati, anno, memoria } = ctx;
  if (!anno.consuntivo || !anno.preventivo) {
    const manca = anno.consuntivo ? 'preventivo' : 'consuntivo';
    contenitore.innerHTML = `<p class="avviso">Per il ${esc(anno.anno)} è caricato solo il ${anno.consuntivo ? 'consuntivo' : 'preventivo'}: manca il ${manca}, quindi il raffronto non si può fare.
      ${manca === 'consuntivo' ? 'Sarà disponibile quando verrà caricato il rendiconto dell\'anno.' : ''}</p>`;
    return;
  }
  // consuntivo letto solo dal riparto: non c'è il voce per voce, ma il totale sì (somma dei totali di gestione delle unità)
  if (!dati.spese.some((s) => s.esercizio_id === anno.consuntivo.id)) {
    const cent = (v) => Math.round(Number(v ?? 0) * 100);
    const consuntivo = dati.posizioni.filter((p) => p.esercizio_id === anno.consuntivo.id).reduce((t, p) => t + cent(p.totale_gestione), 0);
    const preventivo = dati.spese.filter((s) => s.esercizio_id === anno.preventivo.id).reduce((t, s) => t + cent(s.importo), 0);
    const inNegativo = (preventivo || consuntivo) < 0;
    const delta = comeSpesa(consuntivo - preventivo, inNegativo);
    contenitore.innerHTML = `
      <div class="riquadri">
        <div class="riquadro"><span class="valore">${soldi(preventivo)}</span><span class="nota">preventivo ${esc(anno.anno)}</span></div>
        <div class="riquadro"><span class="valore">${soldi(consuntivo)}</span><span class="nota">consuntivo ${esc(anno.anno)}, dal riparto</span></div>
        <div class="riquadro"><span class="valore ${coloreSpesa(delta)}">${conSegno(delta)}</span><span class="nota">${delta > 0 ? 'spesi in più del previsto' : delta < 0 ? 'spesi in meno del previsto' : 'nessuna differenza'}</span></div>
      </div>
      <p class="avviso">Per il ${esc(anno.anno)} del consuntivo c'è solo il riparto per unità: il confronto si può fare sul totale, non voce per voce.
        Il preventivo voce per voce si vede nella scheda <a href="#/contabilita/${esc(anno.anno)}/spese">Spese</a>, scegliendo «Preventivo».</p>`;
    return;
  }
  const r = raffronto(dati.spese, dati.conti, anno.preventivo.id, anno.consuntivo.id);
  if (!r.gruppi.length) {
    contenitore.innerHTML = `<p class="nota">Per il ${esc(anno.anno)} non ci sono voci né nel preventivo né nel consuntivo.</p>`;
    return;
  }
  const sforati = r.gruppi.flatMap((g) => g.sottoconti).filter((sc) => sc.sforamento);
  const solo = Boolean(memoria.soloSforamenti);
  const gruppi = r.gruppi.map((g) => ({ ...g, sottoconti: g.sottoconti.filter((sc) => !solo || sc.sforamento) })).filter((g) => g.sottoconti.length);
  const scarto = Math.abs(r.totale.differenza);
  const inNegativo = (r.totale.consuntivo ?? r.totale.preventivo ?? 0) < 0;

  contenitore.innerHTML = `
    <div class="riquadri">
      <div class="riquadro"><span class="valore">${soldi(r.totale.preventivo)}</span><span class="nota">preventivo ${esc(anno.anno)}</span></div>
      <div class="riquadro"><span class="valore">${soldi(r.totale.consuntivo)}</span><span class="nota">consuntivo ${esc(anno.anno)}</span></div>
      <div class="riquadro"><span class="valore ${scarto ? (r.totale.sforamento ? 'neg' : 'pos') : ''}">${soldi(scarto)}</span>
        <span class="nota">${!scarto ? 'nessuna differenza' : r.totale.sforamento ? 'spesi in più del previsto' : 'spesi in meno del previsto'}${r.totale.percento === null || !scarto ? '' : ` (${percento(Math.abs(r.totale.percento)).replace('+', '')})`}</span></div>
      <div class="riquadro"><span class="valore ${sforati.length ? 'neg' : ''}">${sforati.length}</span><span class="nota">${sforati.length === 1 ? 'voce oltre il previsto' : 'voci oltre il previsto'}</span></div>
    </div>
    <div class="con-macro"><div class="filtri">
      ${tastiMacroVoci()}
      <label class="interruttore"><input type="checkbox" id="solo-sforamenti" ${solo ? 'checked' : ''}> Solo le voci oltre il previsto</label>
    </div>
    <div class="scorri"><table class="tab-conti">
      <thead><tr><th>Gruppo e voce</th><th class="num">Preventivo</th><th class="num">Consuntivo</th><th class="num">Differenza</th><th class="num">Scostamento</th></tr></thead>
      <tbody>
        <tr class="riga-totale ${r.totale.sforamento ? 'sforamento' : ''}"><td>Totale generale ${r.totale.sforamento ? SFORA : ''}</td>${celle(r.totale, inNegativo)}</tr>${gruppi.map((g) => `
        <tr class="riga-gruppo ${g.sforamento ? 'sforamento' : ''}"><td>${apriChiudi(g.nome, memoria)} ${esc(g.nome)} ${g.sforamento ? SFORA : ''}</td>${celle(g, inNegativo)}</tr>
        ${g.sottoconti.map((sc) => `<tr data-di="${esc(g.nome)}" ${nascosta(g.nome, memoria)} class="${sc.sforamento ? 'sforamento' : ''}"><td class="rientro">${esc(sc.nome)} ${sc.sforamento ? SFORA : ''}</td>${celle(sc, inNegativo)}</tr>`).join('')}`).join('')
        || '<tr><td colspan="5" class="nota">Nessuna voce oltre il previsto.</td></tr>'}</tbody>
    </table></div></div>
    <p class="nota">Differenza = consuntivo − preventivo, con il segno degli importi del rendiconto (le spese sono addebiti); lo scostamento è la differenza
      in percentuale del preventivo. Una voce è «oltre il previsto» quando si è speso più di quanto preventivato; il trattino indica una voce che da quella parte non c'è.</p>`;

  gestisciMacroVoci(contenitore.querySelector('.con-macro'), memoria);
  contenitore.querySelector('#solo-sforamenti').addEventListener('change', (evento) => {
    memoria.soloSforamenti = evento.target.checked;
    schedaRaffronto(ctx, contenitore);
  });
}
