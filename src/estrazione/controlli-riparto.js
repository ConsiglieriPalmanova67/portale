// Controlli sul riparto assemblato (vedi assembla.js): sequenza delle unità nelle parti, totali di colonna,
// proporzione tra importi e millesimi, somme di riga. Funzioni pure; forma degli esiti in controlli.js.
import { centesimi, millesimiInteri, decimali, leggibile } from './numeri.js';
import { esito, somma } from './esito.js';

const dove = (altro) => ({ sezione: 'riparto', ...altro });
const fmtMillesimi = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: 'always' });
export const fmtMill = (interi) => fmtMillesimi.format(interi / 1000);

// Per ogni colonna: somma delle righe, arrotondamenti, totale stampato (centesimi; millesimi × 1000).
// `totale` è quello stampato; se manca, quello calcolato.
export function totaliColonne(riparto) {
  return riparto.colonne.map((c) => {
    const celle = riparto.righe.map((r) => r.valori[c.chiave]).filter(Boolean);
    const sommaRighe = somma(celle.map((x) => centesimi(x.importo)));
    const arrotondamento = centesimi(riparto.arrotondamenti[c.chiave]?.importo) ?? 0;
    const stampato = centesimi(riparto.totale[c.chiave]?.importo);
    return {
      ...c, sommaRighe, arrotondamento, stampato, totale: stampato ?? sommaRighe + arrotondamento,
      sommaMillesimi: somma(celle.map((x) => millesimiInteri(x.millesimi))), millesimiStampati: millesimiInteri(riparto.totale[c.chiave]?.millesimi),
      decimali: Math.max(0, ...celle.map((x) => decimali(x.millesimi))),
    };
  });
}

function sequenza(riparto) {
  const esiti = [];
  const [prima, ...altre] = riparto.parti;
  for (const p of altre) {
    const i = p.righe.findIndex((r, n) => r.codice !== prima.righe[n]?.codice);
    const diversa = i >= 0 ? p.righe[i] : null;
    if (diversa) esiti.push(esito('errore', 'sequenza_unita', `Riparto, parte ${p.parte}, pagina ${diversa.pagina}: alla riga ${i + 1} c'è ${diversa.codice || '(senza codice)'} dove la parte ${prima.parte} ha ${prima.righe[i]?.codice ?? 'nessuna unità'}. Le parti devono elencare le stesse unità nello stesso ordine.`, dove({ pagina: diversa.pagina, riga: `parte ${p.parte}/${i + 1}`, campo: 'codice', origine: `${diversa.origine}.codice` })));
    else if (p.righe.length !== prima.righe.length) esiti.push(esito('errore', 'sequenza_unita', `Riparto: la parte ${p.parte} ha ${p.righe.length} righe, la parte ${prima.parte} ne ha ${prima.righe.length}.`, dove({ pagina: p.righe.at(-1)?.pagina, riga: `parte ${p.parte}`, campo: 'righe' })));
  }
  if (altre.length && !esiti.length) esiti.push(esito('ok', 'sequenza_unita', `Riparto: le ${riparto.parti.length} parti elencano le stesse ${prima.righe.length} righe nello stesso ordine.`, dove()));
  for (const p of riparto.parti) {
    for (const c of p.colonneDiverse ?? []) esiti.push(esito('avviso', 'colonne_diverse', `Riparto, parte ${p.parte}: da pagina ${c.pagina} compare la colonna «${c.titolo}», che nelle pagine prima non c'era. Forse lì comincia un'altra parte: controlla la mappa.`, dove({ pagina: c.pagina, riga: `parte ${p.parte}`, campo: c.titolo })));
    for (const r of p.righe) {
      if (!r.codice) esiti.push(esito('errore', 'riga_senza_codice', `Riparto, pagina ${r.pagina}: una riga (${r.intestatario || 'senza nome'}) non ha il codice dell'unità.`, dove({ pagina: r.pagina, riga: r.origine, campo: 'codice', origine: `${r.origine}.codice` })));
      for (const [chiave, cella] of Object.entries(r.celle)) {
        if (String(cella.importo ?? '').trim() && centesimi(cella.importo) === null) esiti.push(esito('errore', 'importo_illeggibile', `Riparto, pagina ${r.pagina}, ${r.codice}: importo non leggibile («${cella.importo}»).`, dove({ pagina: r.pagina, riga: `${r.codice}#${r.origine}`, campo: chiave, origine: `${cella.origine}.importo` })));
      }
    }
  }
  return esiti;
}

function colonne(riparto, totali) {
  const esiti = [];
  let tornano = 0;
  let confrontate = 0;
  for (const c of totali) {
    const cellaTotale = riparto.totale[c.chiave];
    if (c.stampato === null) continue;
    confrontate += 1;
    const calcolato = c.sommaRighe + c.arrotondamento;
    if (calcolato !== c.stampato) esiti.push(esito('errore', 'colonna_totale', `Riparto, colonna «${c.titolo}»: le righe${c.arrotondamento ? ' con gli arrotondamenti' : ''} sommano ${leggibile(calcolato)} invece di ${leggibile(c.stampato)} (differenza ${leggibile(calcolato - c.stampato)}).`, dove({ riga: 'totale', campo: c.chiave, origine: `${cellaTotale.origine}.importo` })));
    else tornano += 1;
    if (c.millesimiStampati !== null && c.millesimiStampati !== c.sommaMillesimi) esiti.push(esito('avviso', 'colonna_millesimi', `Riparto, colonna «${c.titolo}»: i millesimi delle righe sommano ${fmtMill(c.sommaMillesimi)} invece di ${fmtMill(c.millesimiStampati)}.`, dove({ riga: 'totale', campo: `${c.chiave}/millesimi`, origine: `${cellaTotale.origine}.millesimi` })));
  }
  if (!confrontate) esiti.push(esito('avviso', 'riparto_totale_mancante', 'Riparto: la riga del totale non è stata letta, i totali di colonna non si possono verificare.', dove({ riga: 'totale', campo: 'totale' })));
  else if (tornano === confrontate) esiti.push(esito('ok', 'colonna_totale', `Riparto: tutte le ${tornano} colonne tornano con la riga del totale.`, dove()));
  return esiti;
}

// Dentro una tabella l'importo è proporzionale ai millesimi: chi si discosta è con buona probabilità una cella letta male.
function proporzioni(riparto, totali) {
  const esiti = [];
  for (const c of totali.filter((x) => x.ruolo === 'tabella')) {
    const millesimiTotali = c.millesimiStampati ?? c.sommaMillesimi;
    if (!millesimiTotali) continue;
    // centesimi per millesimo intero
    const rapporto = (c.stampato ?? c.sommaRighe) / millesimiTotali;
    const perCodice = new Map();
    for (const r of riparto.righe) {
      const cella = r.valori[c.chiave];
      if (!cella) continue;
      if (!perCodice.has(r.codice)) perCodice.set(r.codice, { importo: 0, millesimi: 0, righe: 0, cella, pagina: r.pagina });
      const somme = perCodice.get(r.codice);
      somme.importo += centesimi(cella.importo) ?? 0;
      somme.millesimi += millesimiInteri(cella.millesimi) ?? 0;
      somme.righe += 1;
    }
    // un centesimo di arrotondamento sull'importo, mezza unità dell'ultima cifra stampata sui millesimi
    const margine = 1 + Math.abs(rapporto) * 500 * 10 ** -c.decimali;
    for (const [codice, s] of perCodice) {
      const atteso = rapporto * s.millesimi;
      if (Math.abs(s.importo - atteso) > margine * s.righe + 0.5) esiti.push(esito('avviso', 'rapporto_anomalo', `Riparto, pagina ${s.pagina}, ${codice}, colonna «${c.titolo}»: con ${fmtMill(s.millesimi)} millesimi ci si aspetta circa ${leggibile(Math.round(atteso))}, è stato letto ${leggibile(s.importo)}. Controlla importo e millesimi sul documento.`, dove({ pagina: s.pagina, riga: codice, campo: c.chiave, origine: `${s.cella.origine}.importo`, origini: [`${s.cella.origine}.millesimi`] })));
    }
  }
  return esiti;
}

function righe(riparto) {
  const esiti = [];
  const di = (ruolo) => riparto.colonne.filter((c) => c.ruolo === ruolo).map((c) => c.chiave);
  const [gestione] = di('totale_gestione');
  // i saldi precedenti possono essere più colonne (per esempio una per una gestione straordinaria): si sommano
  const precedenti = di('saldo_precedente');
  const [rate] = di('rate_versate');
  const [finale] = di('saldo_finale');
  const addendi = [...di('tabella'), ...di('movimenti_personali')];
  const valore = (r, chiave) => (chiave ? centesimi(r.valori[chiave]?.importo) : null);
  let gestioneOk = 0;
  let saldoOk = 0;
  for (const r of riparto.righe) {
    const etichetta = `${r.codice}${r.n > 1 ? ` (riga ${r.n})` : ''}`;
    const totale = valore(r, gestione);
    if (totale !== null) {
      const calcolato = somma(addendi.map((k) => valore(r, k)));
      if (calcolato !== totale) esiti.push(esito('errore', 'riga_totale_gestione', `Riparto, ${etichetta}: le tabelle sommano ${leggibile(calcolato)} ma il totale gestione è ${leggibile(totale)} (differenza ${leggibile(calcolato - totale)}).`, dove({ pagina: r.pagina, riga: `${r.codice}#${r.n}`, campo: 'totale_gestione', origine: `${r.valori[gestione].origine}.importo`, origini: addendi.filter((k) => r.valori[k]).map((k) => `${r.valori[k].origine}.importo`) })));
      else gestioneOk += 1;
    }
    const saldo = valore(r, finale);
    if (saldo !== null && totale !== null && precedenti.length && rate) {
      const calcolato = totale + somma(precedenti.map((k) => valore(r, k) ?? 0)) + (valore(r, rate) ?? 0);
      if (calcolato !== saldo) esiti.push(esito('errore', 'riga_saldo_finale', `Riparto, ${etichetta}: totale gestione + ${precedenti.length > 1 ? 'saldi precedenti' : 'saldo precedente'} + rate versate fa ${leggibile(calcolato)}, ma il saldo finale è ${leggibile(saldo)}.`, dove({ pagina: r.pagina, riga: `${r.codice}#${r.n}`, campo: 'saldo_finale', origine: `${r.valori[finale].origine}.importo`, origini: [gestione, ...precedenti, rate].filter((k) => r.valori[k]).map((k) => `${r.valori[k].origine}.importo`) })));
      else saldoOk += 1;
    }
  }
  if (!gestione) esiti.push(esito('avviso', 'colonna_non_trovata', 'Riparto: non è stata riconosciuta la colonna «Totale gestione»: senza, le posizioni delle unità non si possono importare. Controlla il ruolo delle colonne.', dove({ campo: 'totale_gestione' })));
  else if (gestioneOk === riparto.righe.length) esiti.push(esito('ok', 'riga_totale_gestione', `Riparto: in tutte le ${gestioneOk} righe le tabelle sommano al totale gestione.`, dove()));
  if (finale && precedenti.length && rate && saldoOk === riparto.righe.length) esiti.push(esito('ok', 'riga_saldo_finale', `Riparto: in tutte le ${saldoOk} righe il saldo finale torna con totale gestione, ${precedenti.length > 1 ? `i ${precedenti.length} saldi precedenti` : 'saldo precedente'} e rate versate.`, dove()));
  return esiti;
}

export function controlliRiparto(riparto) {
  if (!riparto.parti.length || !riparto.righe.length) return [esito('errore', 'riparto_vuoto', 'Riparto: non è stata letta nessuna riga.', dove({ campo: 'righe' }))];
  const totali = totaliColonne(riparto);
  return [...sequenza(riparto), ...colonne(riparto, totali), ...proporzioni(riparto, totali), ...righe(riparto)];
}

