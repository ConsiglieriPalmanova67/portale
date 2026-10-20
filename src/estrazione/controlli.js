// Controlli di quadratura sui dati assemblati di un fascicolo. Funzioni pure.
// Ogni controllo produce { livello: 'errore'|'avviso'|'ok', codice, messaggio, dove, chiave, daConfermare }:
//   dove = { sezione, pagina?, riga?, campo?, origine? (la cella da evidenziare), origini? (le altre celle coinvolte) }
//   chiave = identifica il controllo tra una verifica e l'altra: serve a ricordare quelli accettati a mano.
// Somme in centesimi interi e millesimi × 1000.
import { centesimi, leggibile, piatto } from './numeri.js';
import { controlliRiparto, totaliColonne } from './controlli-riparto.js';
import { esito, somma } from './esito.js';

export { esito };

const diverso = (a, b) => `${leggibile(a)} invece di ${leggibile(b)} (differenza ${leggibile(a - b)})`;

// Raggruppa in ordine di comparsa: → [{ chiave, primo, elementi }]
function raggruppa(elementi, chiaveDi) {
  const gruppi = new Map();
  for (const e of elementi) {
    const k = chiaveDi(e);
    if (!gruppi.has(k)) gruppi.set(k, { chiave: k, primo: e, elementi: [] });
    gruppi.get(k).elementi.push(e);
  }
  return [...gruppi.values()];
}

export function controlliSpese(spese) {
  const esiti = [];
  const dove = (altro) => ({ sezione: 'spese', ...altro });
  const { voci, totali } = spese;
  for (const v of voci) {
    if (centesimi(v.importo) === null) esiti.push(esito('errore', 'importo_illeggibile', `Pagina ${v.pagina}: la voce ${v.protocollo || v.descrizione} non ha un importo leggibile («${v.importo ?? ''}»).`, dove({ pagina: v.pagina, riga: `${v.pagina}/${v.protocollo}/${v.descrizione}`, campo: 'importo', origine: `${v.origine}.importo` })));
    if (!piatto(v.gruppo) || !piatto(v.sottoconto)) esiti.push(esito('errore', 'voce_senza_conto', `Pagina ${v.pagina}: la voce ${v.protocollo || v.descrizione} non ha gruppo o sottoconto.`, dove({ pagina: v.pagina, riga: `${v.pagina}/${v.protocollo}/${v.descrizione}`, campo: 'sottoconto', origine: `${v.origine}.sottoconto` })));
  }
  // stessa pagina, stesso protocollo, stesso importo: la voce è stata letta due volte
  for (const g of raggruppa(voci.filter((v) => piatto(v.protocollo)), (v) => `${v.pagina}|${piatto(v.protocollo)}|${centesimi(v.importo)}|${piatto(v.descrizione)}`)) {
    if (g.elementi.length > 1) esiti.push(esito('errore', 'voce_duplicata', `Pagina ${g.primo.pagina}: la voce ${g.primo.protocollo} (${g.primo.importo}) compare ${g.elementi.length} volte.`, dove({ pagina: g.primo.pagina, riga: `${g.primo.pagina}/${g.primo.protocollo}`, campo: 'protocollo', origine: `${g.elementi[1].origine}.importo`, origini: g.elementi.map((v) => `${v.origine}.importo`) })));
  }

  const kConto = (x) => `${piatto(x.gruppo)}|${piatto(x.sottoconto)}`;
  const parziali = raggruppa(totali.filter((t) => t.tipo === 'parziale_sottoconto'), kConto);
  const sottoconti = raggruppa(voci, kConto);
  let tornano = 0;
  for (const sc of sottoconti) {
    const nome = `${sc.primo.gruppo} / ${sc.primo.sottoconto}`;
    const parziale = parziali.find((p) => p.chiave === sc.chiave)?.primo;
    const calcolato = somma(sc.elementi.map((v) => centesimi(v.importo)));
    const origini = sc.elementi.map((v) => `${v.origine}.importo`);
    if (!parziale) esiti.push(esito('avviso', 'parziale_mancante', `${nome}: il parziale del sottoconto non è stato letto (somma delle voci ${leggibile(calcolato)}).`, dove({ pagina: sc.elementi.at(-1).pagina, riga: nome, campo: 'parziale', origini })));
    else if (centesimi(parziale.importo) !== calcolato) esiti.push(esito('errore', 'parziale_sottoconto', `${nome}: le voci sommano ${diverso(calcolato, centesimi(parziale.importo))} del parziale stampato a pagina ${parziale.pagina}.`, dove({ pagina: parziale.pagina, riga: nome, campo: 'parziale', origine: `${parziale.origine}.importo`, origini })));
    else tornano += 1;
  }
  for (const p of parziali) {
    if (!sottoconti.some((sc) => sc.chiave === p.chiave)) esiti.push(esito('errore', 'parziale_senza_voci', `Pagina ${p.primo.pagina}: c'è un parziale per ${p.primo.gruppo} / ${p.primo.sottoconto} (${p.primo.importo}) ma nessuna voce con quel sottoconto.`, dove({ pagina: p.primo.pagina, riga: `${p.primo.gruppo} / ${p.primo.sottoconto}`, campo: 'parziale', origine: `${p.primo.origine}.importo` })));
  }
  if (sottoconti.length && tornano === sottoconti.length) esiti.push(esito('ok', 'parziale_sottoconto', `Spese: tutti i ${tornano} sottoconti tornano con il parziale stampato.`, dove()));

  const gruppi = totaliGruppi(spese);
  const stampati = raggruppa(totali.filter((t) => t.tipo === 'totale_gruppo'), (t) => piatto(t.gruppo));
  let gruppiOk = 0;
  for (const g of gruppi) {
    const stampato = stampati.find((s) => s.chiave === piatto(g.gruppo))?.primo;
    if (!stampato) esiti.push(esito('avviso', 'totale_gruppo_mancante', `${g.gruppo}: il totale del gruppo non è stato letto (somma delle voci ${leggibile(g.totale)}).`, dove({ riga: g.gruppo, campo: 'totale' })));
    else if (centesimi(stampato.importo) !== g.totale) esiti.push(esito('errore', 'totale_gruppo', `${g.gruppo}: le voci sommano ${diverso(g.totale, centesimi(stampato.importo))} del totale stampato a pagina ${stampato.pagina}.`, dove({ pagina: stampato.pagina, riga: g.gruppo, campo: 'totale', origine: `${stampato.origine}.importo` })));
    else gruppiOk += 1;
  }
  if (gruppi.length && gruppiOk === gruppi.length) esiti.push(esito('ok', 'totale_gruppo', `Spese: tutti i ${gruppiOk} gruppi tornano con il totale stampato.`, dove()));

  const generale = totali.find((t) => t.tipo === 'totale_generale');
  const totale = somma(gruppi.map((g) => g.totale));
  if (!generale) esiti.push(esito('avviso', 'totale_rendiconto_mancante', `Il totale del rendiconto non è stato letto (somma dei gruppi ${leggibile(totale)}).`, dove({ campo: 'totale_generale' })));
  else if (centesimi(generale.importo) !== totale) esiti.push(esito('errore', 'totale_rendiconto', `I gruppi sommano ${diverso(totale, centesimi(generale.importo))} del totale del rendiconto stampato a pagina ${generale.pagina}.`, dove({ pagina: generale.pagina, campo: 'totale_generale', origine: `${generale.origine}.importo` })));
  else esiti.push(esito('ok', 'totale_rendiconto', `Spese: la somma dei gruppi coincide con il totale del rendiconto (${leggibile(totale)}).`, dove()));
  return esiti;
}

// → [{ gruppo, totale }] dalle voci, nell'ordine del rendiconto.
export function totaliGruppi(spese) {
  return raggruppa(spese.voci, (v) => piatto(v.gruppo)).map((g) => ({ gruppo: g.primo.gruppo, totale: somma(g.elementi.map((v) => centesimi(v.importo))) }));
}

export function controlliPreventivo(preventivo) {
  const esiti = [];
  const dove = (altro) => ({ sezione: 'preventivo', ...altro });
  let tornano = 0;
  for (const g of preventivo.gruppi) {
    const voci = somma(g.voci.map((v) => centesimi(v.importo)));
    for (const v of g.voci) {
      if (centesimi(v.importo) === null) esiti.push(esito('errore', 'importo_illeggibile', `Preventivo, ${g.gruppo} / ${v.voce}: importo non leggibile.`, dove({ riga: `${g.gruppo} / ${v.voce}`, campo: 'importo', origine: `${v.origine}.importo` })));
    }
    if (centesimi(g.totale) === null) esiti.push(esito('avviso', 'totale_gruppo_mancante', `Preventivo, ${g.gruppo}: il totale del gruppo non è stato letto (somma delle voci ${leggibile(voci)}).`, dove({ riga: g.gruppo, campo: 'totale' })));
    else if (centesimi(g.totale) !== voci) esiti.push(esito('errore', 'preventivo_gruppo', `Preventivo, ${g.gruppo}: le voci sommano ${diverso(voci, centesimi(g.totale))} del totale del gruppo.`, dove({ riga: g.gruppo, campo: 'totale', origine: `${g.origine}.totale`, origini: g.voci.map((v) => `${v.origine}.importo`) })));
    else tornano += 1;
  }
  const calcolato = somma(preventivo.gruppi.flatMap((g) => g.voci.map((v) => centesimi(v.importo))));
  if (centesimi(preventivo.totale) === null) esiti.push(esito('avviso', 'preventivo_totale_mancante', `Preventivo: il totale non è stato letto (somma delle voci ${leggibile(calcolato)}).`, dove({ campo: 'totale' })));
  else if (centesimi(preventivo.totale) !== calcolato) esiti.push(esito('errore', 'preventivo_totale', `Preventivo: le voci sommano ${diverso(calcolato, centesimi(preventivo.totale))} del totale stampato.`, dove({ campo: 'totale', origine: preventivo.origineTotale })));
  else if (tornano === preventivo.gruppi.length) esiti.push(esito('ok', 'preventivo_totale', `Preventivo: voci, totali di gruppo e totale (${leggibile(calcolato)}) coincidono.`, dove()));
  return esiti;
}

const VERSO_TERZI = { credito: /crediti v\w* terzi/, debito: /debiti v\w* terzi/ };
const latoPartita = (sezione) => (/credit/i.test(sezione) ? 'credito' : /debit/i.test(sezione) ? 'debito' : null);

export function controlliPatrimoniale(patrimoniale) {
  const esiti = [];
  const dove = (altro) => ({ sezione: 'patrimoniale', ...altro });
  const totali = {};
  for (const [lato, nome] of [['attivita', 'attività'], ['passivita', 'passività']]) {
    // le voci di un dettaglio sono già nella loro riga di somma
    totali[lato] = somma(patrimoniale[lato].filter((v) => !v.dettaglio).map((v) => centesimi(v.importo)));
    const stampato = centesimi(patrimoniale[`totale_${lato}`]);
    if (stampato === null) esiti.push(esito('avviso', 'patrimoniale_totale_mancante', `Situazione patrimoniale: il totale delle ${nome} non è stato letto.`, dove({ riga: lato, campo: 'totale' })));
    else if (stampato !== totali[lato]) esiti.push(esito('errore', 'patrimoniale_totale', `Situazione patrimoniale: le ${nome} sommano ${diverso(totali[lato], stampato)} del totale stampato.`, dove({ riga: lato, campo: 'totale', origine: `${patrimoniale.origine}|totale_${lato}`, origini: patrimoniale[lato].filter((v) => !v.dettaglio).map((v) => `${v.origine}.importo`) })));
  }
  if (totali.attivita !== totali.passivita) esiti.push(esito('errore', 'patrimoniale_pareggio', `Situazione patrimoniale: attività ${leggibile(totali.attivita)} e passività ${leggibile(totali.passivita)} non coincidono.`, dove({ campo: 'pareggio' })));
  else if (!esiti.some((e) => e.livello === 'errore')) esiti.push(esito('ok', 'patrimoniale_pareggio', `Situazione patrimoniale: attività e passività coincidono (${leggibile(totali.attivita)}).`, dove()));
  return esiti;
}

export function controlliPartite(partite, patrimoniale) {
  const esiti = [];
  const dove = (altro) => ({ sezione: 'partite', ...altro });
  for (const r of partite.righe) {
    if (!latoPartita(r.sezione)) esiti.push(esito('errore', 'partita_senza_lato', `Pagina ${r.pagina}: per la partita ${r.protocollo || r.descrizione} non si capisce se è un credito o un debito.`, dove({ pagina: r.pagina, riga: `${r.protocollo}/${r.descrizione}`, campo: 'sezione', origine: `${r.origine}.sezione` })));
    if (centesimi(r.importo) === null) esiti.push(esito('errore', 'importo_illeggibile', `Pagina ${r.pagina}: la partita ${r.protocollo || r.descrizione} non ha un importo leggibile.`, dove({ pagina: r.pagina, riga: `${r.protocollo}/${r.descrizione}`, campo: 'importo', origine: `${r.origine}.importo` })));
  }
  for (const [lato, nome] of [['credito', 'crediti'], ['debito', 'debiti']]) {
    const righe = partite.righe.filter((r) => latoPartita(r.sezione) === lato);
    const calcolato = somma(righe.map((r) => centesimi(r.importo)));
    const stampato = partite.totali.find((t) => latoPartita(t.sezione) === lato);
    const origini = righe.map((r) => `${r.origine}.importo`);
    if (!stampato) {
      if (righe.length) esiti.push(esito('avviso', 'partite_totale_mancante', `Il totale dei ${nome} verso terzi non è stato letto (somma delle righe ${leggibile(calcolato)}).`, dove({ riga: lato, campo: 'totale' })));
    } else if (centesimi(stampato.importo) !== calcolato) esiti.push(esito('errore', 'partite_totale', `I ${nome} verso terzi sommano ${diverso(calcolato, centesimi(stampato.importo))} del totale stampato.`, dove({ riga: lato, campo: 'totale', origine: `${stampato.origine}.importo`, origini })));
    else esiti.push(esito('ok', 'partite_totale', `I ${nome} verso terzi tornano con il totale stampato (${leggibile(calcolato)}).`, dove({ riga: lato })));
    // la stessa cifra sta nella situazione patrimoniale
    const voce = patrimoniale?.[lato === 'credito' ? 'attivita' : 'passivita'].find((v) => VERSO_TERZI[lato].test(piatto(`${v.gruppo ?? ''} ${v.voce}`)));
    if (voce && centesimi(voce.importo) !== calcolato) esiti.push(esito('errore', 'partite_patrimoniale', `I ${nome} verso terzi sommano ${leggibile(calcolato)}, ma nella situazione patrimoniale la voce «${voce.voce}» è ${leggibile(centesimi(voce.importo))}.`, { sezione: 'patrimoniale', riga: lato, campo: 'verso_terzi', origine: `${voce.origine}.importo`, origini }));
    else if (voce) esiti.push(esito('ok', 'partite_patrimoniale', `I ${nome} verso terzi coincidono con la voce della situazione patrimoniale.`, { sezione: 'patrimoniale', riga: lato }));
  }
  return esiti;
}

// Il raffronto non si importa (si ricalcola): serve solo come riprova delle spese.
export function controlliRaffronto(raffronto, spese) {
  const esiti = [];
  const gruppi = spese ? totaliGruppi(spese) : [];
  for (const r of raffronto.righe.filter((x) => x.livello === 'gruppo')) {
    const consuntivo = centesimi(r.valori[1]);
    const calcolato = gruppi.find((g) => piatto(g.gruppo) === piatto(r.gruppo));
    if (calcolato && consuntivo !== null && consuntivo !== calcolato.totale) esiti.push(esito('avviso', 'raffronto_gruppo', `Raffronto, ${r.gruppo}: il consuntivo stampato (${leggibile(consuntivo)}) è diverso dalla somma delle spese lette (${leggibile(calcolato.totale)}).`, { sezione: 'raffronto', riga: r.gruppo, campo: 'consuntivo', origine: `${r.origine}.valori.1` }));
  }
  if (gruppi.length && !esiti.length && raffronto.righe.length) esiti.push(esito('ok', 'raffronto_gruppo', 'Raffronto: i consuntivi dei gruppi coincidono con le spese lette.', { sezione: 'raffronto' }));
  return esiti;
}

// Spese e riparto devono raccontare la stessa cosa: il totale di ogni gruppo è quello di una colonna del riparto.
export function controlliTraSezioni(spese, riparto) {
  const esiti = [];
  const dove = (altro) => ({ sezione: 'riparto', ...altro });
  const colonne = totaliColonne(riparto);
  const gruppi = totaliGruppi(spese);
  const gestione = colonne.find((c) => c.ruolo === 'totale_gestione');
  const totaleSpese = somma(gruppi.map((g) => g.totale));
  if (gestione && gestione.totale !== null) {
    if (gestione.totale !== totaleSpese) esiti.push(esito('errore', 'spese_totale_gestione', `Il totale delle spese (${leggibile(totaleSpese)}) è diverso dal totale gestione del riparto (${leggibile(gestione.totale)}).`, dove({ campo: 'totale_gestione', origine: `${riparto.totale[gestione.chiave]?.origine}.importo` })));
    else esiti.push(esito('ok', 'spese_totale_gestione', `Il totale delle spese coincide con il totale gestione del riparto (${leggibile(totaleSpese)}).`, dove()));
  }
  // ogni gruppo cerca la colonna con lo stesso totale (a parità, quella col nome più simile); quel che resta si confronta in blocco
  const libere = colonne.filter((c) => (c.ruolo === 'tabella' || c.ruolo === 'movimenti_personali') && c.totale !== null);
  const parole = (t) => new Set(piatto(t).split(' ').filter((p) => p.length > 2));
  const somiglianza = (a, b) => [...parole(a)].filter((p) => parole(b).has(p)).length;
  const senzaColonna = [];
  for (const g of gruppi) {
    const candidate = libere.filter((c) => c.totale === g.totale).sort((a, b) => somiglianza(b.titolo, g.gruppo) - somiglianza(a.titolo, g.gruppo));
    if (candidate.length) libere.splice(libere.indexOf(candidate[0]), 1);
    else senzaColonna.push(g);
  }
  const resto = libere.filter((c) => c.totale !== 0);
  if (!senzaColonna.length && !resto.length) esiti.push(esito('ok', 'gruppo_colonna', `Ogni gruppo di spesa ha nel riparto una colonna con lo stesso totale (${gruppi.length} gruppi).`, dove()));
  else if (somma(senzaColonna.map((g) => g.totale)) === somma(resto.map((c) => c.totale))) esiti.push(esito('ok', 'gruppo_colonna', `I gruppi di spesa tornano con le colonne del riparto (${senzaColonna.length} gruppi ripartiti insieme su ${resto.length} colonne).`, dove()));
  else {
    esiti.push(esito('errore', 'gruppo_colonna', `Spese e riparto non tornano: ${senzaColonna.map((g) => `${g.gruppo} ${leggibile(g.totale)}`).join('; ') || 'nessun gruppo'} senza una colonna uguale; colonne senza gruppo: ${resto.map((c) => `${c.titolo} ${leggibile(c.totale)}`).join('; ') || 'nessuna'}.`, dove({ campo: 'gruppi' })));
  }
  return esiti;
}

// Tutti i controlli interni al fascicolo. → elenco di esiti.
export function controlla(dati) {
  const esiti = [];
  for (const chiave of dati.mancanti ?? []) esiti.push(esito('errore', 'blocco_mancante', `Il blocco ${chiave.replace(':', ' da pagina ')} non è stato letto.`, { sezione: chiave.split(':')[0], riga: chiave }));
  if (dati.spese) esiti.push(...controlliSpese(dati.spese));
  if (dati.riparto) esiti.push(...controlliRiparto(dati.riparto));
  if (dati.spese && dati.riparto) esiti.push(...controlliTraSezioni(dati.spese, dati.riparto));
  if (dati.patrimoniale) esiti.push(...controlliPatrimoniale(dati.patrimoniale));
  if (dati.partite) esiti.push(...controlliPartite(dati.partite, dati.patrimoniale));
  if (dati.preventivo) esiti.push(...controlliPreventivo(dati.preventivo));
  if (dati.raffronto) esiti.push(...controlliRaffronto(dati.raffronto, dati.spese));
  for (const x of dati.incerte ?? []) esiti.push(esito('avviso', 'lettura_incerta', `Pagina ${x.pagina}: lettura incerta di ${x.campo || 'un valore'}${x.riga ? ` (${x.riga})` : ''}${x.nota ? `: ${x.nota}` : ''}.`, { sezione: x.sezione, pagina: x.pagina, riga: `${x.pagina}/${x.riga}`, campo: x.campo }));
  return esiti;
}

// Quelli che fermano l'importazione finché non si correggono o non si accettano uno per uno.
export const daRisolvere = (esiti, accettati = {}) => esiti.filter((e) => (e.livello === 'errore' || e.daConfermare) && !accettati?.[e.chiave]);
