// Scheda Andamento: per ogni gruppo e sottoconto una colonna per anno (il consuntivo, oppure il preventivo
// dove il consuntivo non c'è ancora) e la variazione sull'anno precedente. Non dipende dall'anno scelto,
// che viene solo messo in evidenza.
import { esc } from '../../ui/html.js';
import { andamento } from '../../dati/contabilita.js';
import { soldi, conSegno, percento, comeSpesa, coloreSpesa, tastiMacroVoci, apriChiudi, nascosta, gestisciMacroVoci } from './comuni.js';

export function schedaAndamento(ctx, contenitore) {
  const { dati, anno, memoria } = ctx;
  const confronto = memoria.confronto ?? 'anno';
  const a = andamento(dati.spese, dati.conti, dati.esercizi, { confronto });
  if (!a.gruppi.length) {
    contenitore.innerHTML = '<p class="nota">Nessuna voce di spesa caricata.</p>';
    return;
  }
  // le spese sono di norma in negativo: una variazione nello stesso verso è un aumento della spesa
  const inNegativo = a.totale.valori.reduce((s, v) => s + (v.importo ?? 0), 0) < 0;
  const scelto = (i) => (a.anni[i].anno === anno.anno ? 'anno-scelto' : '');
  const cella = (v, i) => `
    <td class="num ${scelto(i)}">${soldi(v.importo)}${v.variazione === null ? '' : `
      <span class="variazione ${coloreSpesa(comeSpesa(v.variazione, inNegativo))}">${conSegno(comeSpesa(v.variazione, inNegativo))}${v.percento === null ? '' : ` (${percento(comeSpesa(v.percento, inNegativo))})`}</span>`}</td>`;
  const celle = (valori) => valori.map(cella).join('');
  // anni con il consuntivo solo dal riparto: nel confronto con il preventivo il totale si confronta con la somma dei
  // totali di gestione delle unità (voce per voce non si può)
  const cent = (v) => Math.round(Number(v ?? 0) * 100);
  const daRiparto = a.anni.map((x) => {
    if (confronto !== 'preventivo' || !x.consuntivoSenzaVoci) return null;
    const cons = dati.esercizi.find((e) => e.anno === x.anno && e.tipo === 'consuntivo');
    return cons ? dati.posizioni.filter((p) => p.esercizio_id === cons.id).reduce((t, p) => t + cent(p.totale_gestione), 0) : null;
  });
  const celleTotale = (valori) => valori.map((v, i) => {
    if (daRiparto[i] === null || v.importo === null) return cella(v, i);
    const delta = comeSpesa(daRiparto[i] - v.importo, inNegativo);
    const pc = v.importo ? comeSpesa(Math.round(((daRiparto[i] - v.importo) / Math.abs(v.importo)) * 1000) / 10, inNegativo) : null;
    return `<td class="num ${scelto(i)}">${soldi(v.importo)}
      <span class="variazione nota">consuntivo dal riparto ${soldi(daRiparto[i])}</span>
      <span class="variazione ${coloreSpesa(delta)}">${conSegno(delta)}${pc === null ? '' : ` (${percento(pc)})`}</span></td>`;
  }).join('');
  const preventivi = a.anni.filter((x) => x.fonte === 'preventivo' && !x.consuntivoSenzaVoci);
  const senzaVoci = a.anni.filter((x) => x.consuntivoSenzaVoci);

  contenitore.innerHTML = `
    <div class="filtri"><span class="nota">Variazione rispetto</span>
      ${[['anno', 'all’anno precedente'], ['preventivo', 'al preventivo dello stesso anno']].map(([k, n]) => `<button type="button" class="secondario" data-confronto="${k}" aria-pressed="${k === confronto}">${n}</button>`).join('')}</div>
    <p class="nota">${confronto === 'preventivo'
      ? 'Sotto ogni importo la differenza tra consuntivo e preventivo dello stesso anno: con il + (in rosso) si è speso più del previsto, con il − (in verde) meno. Gli anni con il solo preventivo, o senza preventivo, non hanno differenza; quelli con il consuntivo solo dal riparto la hanno sul totale generale.'
      : a.anni.length === 1 ? 'È caricato un solo anno: le variazioni compariranno quando ce ne saranno almeno due.'
      : 'Sotto ogni importo la variazione rispetto all\'anno precedente: con il + (in rosso) si spende di più, con il − (in verde) si risparmia.'}
      ${preventivi.length ? `Per ${preventivi.map((x) => esc(x.anno)).join(', ')} il consuntivo non c'è ancora: la colonna riporta il <strong>preventivo</strong>.` : ''}
      ${senzaVoci.length ? `Per ${senzaVoci.map((x) => esc(x.anno)).join(', ')} del consuntivo c'è solo il riparto per unità, senza le singole voci: la colonna riporta il <strong>preventivo</strong>.` : ''}</p>
    <div class="con-macro"><div class="filtri">${tastiMacroVoci()}</div>
    <div class="scorri"><table class="tab-conti tab-andamento">
      <thead><tr><th>Gruppo e voce</th>${a.anni.map((x, i) => `
        <th class="num ${scelto(i)}">${esc(x.anno)}<br><span class="etichetta ${x.fonte === 'preventivo' ? 'stato-avviso' : ''}">${esc(x.fonte)}</span>${x.consuntivoSenzaVoci ? '<br><span class="nota">consuntivo senza voci</span>' : ''}</th>`).join('')}</tr></thead>
      <tbody>
        <tr class="riga-totale"><td>Totale generale</td>${celleTotale(a.totale.valori)}</tr>${a.gruppi.map((g) => `
        <tr class="riga-gruppo"><td>${apriChiudi(g.nome, memoria)} ${esc(g.nome)}</td>${celle(g.valori)}</tr>
        ${g.sottoconti.map((sc) => `<tr data-di="${esc(g.nome)}" ${nascosta(g.nome, memoria)}><td class="rientro">${esc(sc.nome)}${sc.unite.length ? `<br><span class="nota" title="Negli anni in cui il rendiconto la riportava altrove">comprende ${esc(sc.unite.join(', '))}</span>` : ''}</td>${celle(sc.valori)}</tr>`).join('')}`).join('')}</tbody>
    </table></div></div>
    <p class="nota">Il trattino indica una voce che in quell'anno non c'è; in quel caso la variazione non viene calcolata.</p>`;

  gestisciMacroVoci(contenitore.querySelector('.con-macro'), memoria);
  contenitore.onclick = (evento) => {
    const scelta = evento.target.dataset.confronto;
    if (!scelta || scelta === confronto) return;
    memoria.confronto = scelta;
    schedaAndamento(ctx, contenitore);
  };
}
