// Un fascicolo di rendiconto di fantasia (13 pagine) coerente con l'anagrafica finta di dati-prova.js:
// è ciò che il lettore finto della modalità prova "legge", blocco per blocco, e la base dei test dell'estrazione.
// Nessun nome o importo reale. Con `conErrori` contiene qualche lettura sbagliata voluta, per vedere i controlli all'opera:
//   - una voce di spesa letta male (il parziale del sottoconto non torna);
//   - una cella del riparto letta male (rapporto tra importo e millesimi anomalo);
//   - due millesimi diversi dall'anagrafica; un intestatario diverso dal proprietario corrente; una lettura incerta.
// I valori sono testo, come stampati: "-1.250,00", "52,500", "10/02/2026".

const fmt = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const eur = (centesimi) => fmt.format(centesimi / 100);
const mill = (valore) => valore.toFixed(3).replace('.', ',');
const somma = (valori) => valori.reduce((s, v) => s + v, 0);

export const PAGINE_FASCICOLO = 13;
export const MAPPA_FASCICOLO = [
  { tipo: 'altro', pagina_da: 1, pagina_a: 1, titolo: 'Lettera di accompagnamento', parte: null },
  { tipo: 'patrimoniale', pagina_da: 2, pagina_a: 2, titolo: 'Conto economico e situazione patrimoniale', parte: null },
  { tipo: 'partite', pagina_da: 3, pagina_a: 3, titolo: 'Dettaglio debiti e crediti', parte: null },
  { tipo: 'raffronto', pagina_da: 4, pagina_a: 4, titolo: 'Raffronto preventivo/consuntivo', parte: null },
  { tipo: 'spese', pagina_da: 5, pagina_a: 8, titolo: 'Rendiconto consuntivo', parte: null },
  { tipo: 'riparto', pagina_da: 9, pagina_a: 10, titolo: 'Riparto consuntivo', parte: 1 },
  { tipo: 'riparto', pagina_da: 11, pagina_a: 11, titolo: 'Riparto consuntivo (segue)', parte: 2 },
  { tipo: 'riparto', pagina_da: 12, pagina_a: 12, titolo: 'Riparto consuntivo (rate e saldi)', parte: 3 },
  { tipo: 'preventivo', pagina_da: 13, pagina_a: 13, titolo: 'Preventivo', parte: null },
];

// [pagina, gruppo, sottoconto, protocollo, fattura, descrizione, fornitore, giorno/mese fattura, giorno/mese pagamento, centesimi]
const VOCI = [
  [5, 'SPESE GENERALI', 'PULIZIE', 'G12', 'Fatt. 14', 'PULIZIA SCALE PRIMO QUADRIMESTRE', 'PULITO ESEMPIO S.N.C.', '10/02', '20/02', -125000],
  [5, 'SPESE GENERALI', 'PULIZIE', 'G48', 'Fatt. 61', 'PULIZIA SCALE SECONDO QUADRIMESTRE', 'PULITO ESEMPIO S.N.C.', '12/06', '25/06', -125000],
  [5, 'SPESE GENERALI', 'PULIZIE', 'G91', 'Fatt. 102', 'PULIZIA STRAORDINARIA CANTINE', 'PULITO ESEMPIO S.N.C.', '03/11', '18/11', -31040],
  [5, 'SPESE GENERALI', 'GIARDINO', 'G30', 'Fatt. 7', 'POTATURA SIEPI', 'VERDE FINTO S.A.S.', '28/03', '10/04', -48050],
  [6, 'SPESE GENERALI', 'GIARDINO', 'G77', 'Fatt. 19', 'TAGLIO DEL PRATO', 'VERDE FINTO S.A.S.', '15/09', '30/09', -22000],
  [6, 'SPESE GENERALI', 'ASSICURAZIONE', 'G5', '', 'POLIZZA GLOBALE FABBRICATI', 'ASSICURAZIONI ESEMPIO S.P.A.', '15/01', '15/01', -190000],
  [6, 'SPESE GENERALI', 'DISINFESTAZIONE', 'G60', 'Fatt. 33', 'DERATTIZZAZIONE LOCALI COMUNI', 'DERATTIZZA FINTA S.R.L.', '02/07', '20/07', -18500],
  [7, 'ASCENSORE SCALA A', 'MANUTENZIONE', 'G8', 'Fatt. 120', 'CANONE PRIMO SEMESTRE', 'ASCENSORI DI PROVA S.P.A.', '20/01', '31/01', -47500],
  [7, 'ASCENSORE SCALA A', 'MANUTENZIONE', 'G52', 'Fatt. 480', 'CANONE SECONDO SEMESTRE', 'ASCENSORI DI PROVA S.P.A.', '01/07', '15/07', -47500],
  [7, 'ASCENSORE SCALA A', 'ENERGIA ELETTRICA', 'G21', '', 'FORZA MOTRICE GENNAIO/GIUGNO', '', '05/07', '05/07', -21035],
  [7, 'ASCENSORE SCALA A', 'ENERGIA ELETTRICA', 'G66', '', 'FORZA MOTRICE LUGLIO/DICEMBRE', '', '20/12', '20/12', -22815],
  [8, 'RISCALDAMENTO TORRE 1', 'GAS', 'G15', 'Fatt. 901', 'GAS GENNAIO/MARZO', 'GAS FINTO S.R.L.', '10/04', '30/04', -210000],
  [8, 'RISCALDAMENTO TORRE 1', 'GAS', 'G40', 'Fatt. 1877', 'GAS APRILE/SETTEMBRE', 'GAS FINTO S.R.L.', '10/10', '31/10', -185060],
  [8, 'RISCALDAMENTO TORRE 1', 'GAS', 'G88', 'Fatt. 2410', 'GAS OTTOBRE/DICEMBRE', 'GAS FINTO S.R.L.', '28/12', '30/12', -241025],
  [8, 'SPESE PERSONALI', 'SOLLECITI DI PAGAMENTO', 'P3', '', 'SOLLECITO DI PAGAMENTO UNITA\' A7', '', '14/05', '14/05', -1220],
  [8, 'SPESE PERSONALI', 'SOLLECITI DI PAGAMENTO', 'P4', '', 'SOLLECITO DI PAGAMENTO UNITA\' A20', '', '14/05', '14/05', -1220],
];
// gruppo di spesa → [titolo della colonna del riparto, id della tabella millesimale in dati-prova.js]
const TABELLE = { 'SPESE GENERALI': ['1 - SPESE GENERALI', 'tab-generali'], 'ASCENSORE SCALA A': ['2 - ASCENSORE SCALA A', 'tab-scala-a'], 'RISCALDAMENTO TORRE 1': ['8 - SPESE GENERALI TORRE 1', 'tab-torre-1'] };
// millesimi stampati nel fascicolo diversi da quelli in anagrafica (la somma della tabella resta 1000)
const MILLESIMI_CAMBIATI = { 'A12|tab-generali': 31.5, 'A13|tab-generali': 44 };
const PERSONALI = { A7: -1220, A20: -1220 };
const SALDI_PRECEDENTI = { A1: 180, A4: -1540, A10: -2500, A15: 4210, A22: -830 };
// preventivo dell'anno dopo: [gruppo, voce, centesimi]
const PREVENTIVO = [
  ['SPESE GENERALI', 'PULIZIE', -290000], ['SPESE GENERALI', 'GIARDINO', -70000], ['SPESE GENERALI', 'ASSICURAZIONE', -195000], ['SPESE GENERALI', 'DISINFESTAZIONE', -20000],
  ['ASCENSORE SCALA A', 'MANUTENZIONE', -98000], ['ASCENSORE SCALA A', 'ENERGIA ELETTRICA', -45000], ['RISCALDAMENTO TORRE 1', 'GAS', -650000],
];

function raggruppa(elementi, chiaveDi) {
  const gruppi = new Map();
  for (const e of elementi) gruppi.set(chiaveDi(e), [...(gruppi.get(chiaveDi(e)) ?? []), e]);
  return [...gruppi];
}

// `db` = datiProva(). → { pagine, indice, blocchi: { "sezione:pagina": dati del blocco }, righePagina: testo di ogni pagina }
export function fascicoloProva(db, { anno = 2026, conErrori = true, oggi = `${anno + 1}-03-01` } = {}) {
  const giorno = (gm) => `${gm}/${anno}`;
  const voci = VOCI.map(([pagina, gruppo, sottoconto, protocollo, fattura, descrizione, fornitore, df, dp, c]) =>
    ({ pagina, gruppo, sottoconto, protocollo, fattura, descrizione, fornitore, data_fattura: giorno(df), data_pagamento: giorno(dp), centesimi: c, importo: eur(c) }));
  const totali = [];
  for (const [gruppo, sue] of raggruppa(voci, (v) => v.gruppo)) {
    for (const [sottoconto, righe] of raggruppa(sue, (v) => v.sottoconto)) totali.push({ pagina: righe.at(-1).pagina, tipo: 'parziale_sottoconto', gruppo, sottoconto, etichetta: 'Parziale sottoconto', importo: eur(somma(righe.map((v) => v.centesimi))) });
    totali.push({ pagina: sue.at(-1).pagina, tipo: 'totale_gruppo', gruppo, sottoconto: '', etichetta: 'Totale', importo: eur(somma(sue.map((v) => v.centesimi))) });
  }
  const totaleSpese = somma(voci.map((v) => v.centesimi));
  totali.push({ pagina: 8, tipo: 'totale_generale', gruppo: '', sottoconto: '', etichetta: 'TOTALE', importo: eur(totaleSpese) });
  const totaleGruppo = (gruppo) => somma(voci.filter((v) => v.gruppo === gruppo).map((v) => v.centesimi));

  // riparto: ogni gruppo sulla sua tabella, in proporzione ai millesimi stampati; il resto va negli arrotondamenti
  const inCorso = (t) => t.ruolo === 'proprietario' && (!t.dal || t.dal <= oggi) && (!t.al || t.al >= oggi);
  const nome = new Map(db.soggetti.map((s) => [s.id, s.denominazione.toUpperCase()]));
  const millesimo = (u, tabella) => MILLESIMI_CAMBIATI[`${u.codice}|${tabella}`] ?? Number(db.millesimi.find((m) => m.unita_id === u.id && m.tabella_id === tabella)?.valore ?? 0);
  const unita = db.unita.map((u, i) => {
    const quote = Object.fromEntries(Object.entries(TABELLE).map(([gruppo, [, tabella]]) => {
      const m = millesimo(u, tabella);
      return [gruppo, { millesimi: m, centesimi: Math.round((totaleGruppo(gruppo) * m) / 1000) }];
    }));
    const personali = PERSONALI[u.codice] ?? 0;
    const gestione = somma(Object.values(quote).map((q) => q.centesimi)) + personali;
    const precedente = SALDI_PRECEDENTI[u.codice] ?? 0;
    // le rate versate: la quota arrotondata alla decina di euro
    const rate = Math.round(-gestione / 1000) * 1000;
    const intestatari = db.titolarita.filter((t) => t.unita_id === u.id && inCorso(t)).map((t) => nome.get(t.soggetto_id));
    return { codice: u.codice, pagina: i < 13 ? 9 : 10, intestatario: intestatari.join(' / '), etichetta: u.codice === 'A26' ? 'Box' : 'Appartame', quote, personali, gestione, precedente, rate, finale: gestione + precedente + rate };
  });
  const cella = (colonna, centesimi, millesimi) => ({ colonna, importo: eur(centesimi), millesimi: millesimi === undefined ? '' : mill(millesimi) });
  const riga = (u, celle, pagina = u.pagina) => ({ pagina, codice: u.codice, intestatario: u.intestatario, etichetta: u.etichetta, celle });
  const gruppi = Object.keys(TABELLE);
  const arrotondamento = Object.fromEntries(gruppi.map((g) => [g, totaleGruppo(g) - somma(unita.map((u) => u.quote[g].centesimi))]));
  const totaleArrotondamenti = somma(Object.values(arrotondamento));
  const totaleCella = (colonna, g) => cella(colonna, totaleGruppo(g), somma(unita.map((u) => u.quote[g].millesimi)));
  const colonneTabella = (lista) => lista.map((g) => ({ titolo: TABELLE[g][0], millesimi: true }));
  const celleTabella = (u, lista) => lista.map((g, i) => cella(i + 1, u.quote[g].centesimi, u.quote[g].millesimi));
  const parte1 = (righe, ultima) => ({
    colonne: colonneTabella(gruppi.slice(0, 2)), righe: righe.map((u) => riga(u, celleTabella(u, gruppi.slice(0, 2)))),
    arrotondamenti: ultima ? gruppi.slice(0, 2).map((g, i) => ({ colonna: i + 1, importo: eur(arrotondamento[g]) })) : [],
    totale: ultima ? gruppi.slice(0, 2).map((g, i) => totaleCella(i + 1, g)) : [], incerte: [],
  });
  const parte2 = {
    colonne: [...colonneTabella(gruppi.slice(2)), { titolo: 'Movimenti personali', millesimi: false }, { titolo: 'Totale gestione', millesimi: false }, { titolo: 'Saldi di fine Es. prec.', millesimi: false }],
    righe: unita.map((u) => riga(u, [...celleTabella(u, gruppi.slice(2)), cella(2, u.personali), cella(3, u.gestione), cella(4, u.precedente)], 11)),
    arrotondamenti: [{ colonna: 1, importo: eur(arrotondamento[gruppi[2]]) }, { colonna: 3, importo: eur(totaleArrotondamenti) }],
    totale: [totaleCella(1, gruppi[2]), cella(2, somma(unita.map((u) => u.personali))), cella(3, totaleSpese), cella(4, somma(unita.map((u) => u.precedente)))],
    incerte: conErrori ? [{ pagina: 11, riga: 'A20', campo: 'Saldi di fine Es. prec.', nota: 'cifra poco leggibile nella scansione' }] : [],
  };
  const parte3 = {
    colonne: [{ titolo: 'Rate versate', millesimi: false }, { titolo: 'Saldo finale', millesimi: false }],
    righe: unita.map((u) => riga(u, [cella(1, u.rate), cella(2, u.finale)], 12)),
    arrotondamenti: [{ colonna: 2, importo: eur(totaleArrotondamenti) }],
    totale: [cella(1, somma(unita.map((u) => u.rate))), cella(2, somma(unita.map((u) => u.finale)) + totaleArrotondamenti)], incerte: [],
  };

  const debiti = [['PULITO ESEMPIO S.N.C.', 'G91', 'PULIZIA STRAORDINARIA CANTINE', 31040], ['ASCENSORI DI PROVA S.P.A.', 'G52', 'CANONE SECONDO SEMESTRE', 47500], ['GAS FINTO S.R.L.', 'G88', 'GAS OTTOBRE/DICEMBRE', 241025], ['', 'G95', 'RITENUTE D\'ACCONTO DA VERSARE', 14000]];
  const crediti = [['ASSICURAZIONI ESEMPIO S.P.A.', 'G70', 'RIMBORSO SINISTRO DA INCASSARE', 35000], ['', 'P9', 'RIMBORSO SPESE POSTALI', 4500]];
  const totaleDebiti = somma(debiti.map((d) => d[3]));
  const totaleCrediti = somma(crediti.map((c) => c[3]));
  const partita = (sezione) => ([controparte, protocollo, descrizione, c]) => ({ pagina: 3, sezione, controparte, protocollo, descrizione, importo: eur(c) });
  const attivita = [['', 'Crediti v/condòmini', 152000], ['', 'Crediti v/terzi', totaleCrediti], ['Disponibilità', 'Banca di Prova c/c', 620010], ['', 'cassa contanti', 8000]];
  const totaleAttivita = somma(attivita.map((a) => a[2]));
  const passivita = [['', 'Debiti v/terzi', totaleDebiti], ['Fondi', 'FONDO DI RISERVA', 400000]];
  passivita.unshift(['', 'Debiti v/condòmini', totaleAttivita - somma(passivita.map((p) => p[2]))]);
  const voce = ([gruppo, nomeVoce, c]) => ({ gruppo, voce: nomeVoce, importo: eur(c) });

  const consuntivoPrima = { 'SPESE GENERALI': -560000, 'ASCENSORE SCALA A': -140000, 'RISCALDAMENTO TORRE 1': -640000, 'SPESE PERSONALI': 0 };
  const raffronto = {
    colonne: [`Preventivo ${anno}`, `Consuntivo ${anno}`, 'Differenza'],
    righe: [...raggruppa(voci, (v) => v.gruppo).map(([gruppo]) => ({ livello: 'gruppo', gruppo, voce: '', valori: [consuntivoPrima[gruppo], totaleGruppo(gruppo), totaleGruppo(gruppo) - consuntivoPrima[gruppo]].map(eur) })),
      { livello: 'totale', gruppo: 'TOTALE', voce: '', valori: [somma(Object.values(consuntivoPrima)), totaleSpese, totaleSpese - somma(Object.values(consuntivoPrima))].map(eur) }],
    incerte: [],
  };
  const preventivo = {
    esercizio: `Esercizio ordinario "${anno + 1}"`,
    gruppi: raggruppa(PREVENTIVO, (p) => p[0]).map(([gruppo, righe]) => ({ gruppo, totale: eur(somma(righe.map((r) => r[2]))), voci: righe.map((r) => ({ voce: r[1], importo: eur(r[2]) })) })),
    totale: eur(somma(PREVENTIVO.map((p) => p[2]))), riquadro: [{ etichetta: 'Totale gestione', importo: eur(somma(PREVENTIVO.map((p) => p[2]))) }], incerte: [],
  };

  const letta = ({ centesimi, ...v }) => v;
  const blocchi = {
    'patrimoniale:2': { data: `31/12/${anno}`, attivita: attivita.map(voce), passivita: passivita.map(voce), totale_attivita: eur(totaleAttivita), totale_passivita: eur(totaleAttivita), incerte: [] },
    'partite:3': { righe: [...crediti.map(partita('Crediti v/terzi')), ...debiti.map(partita('Debiti v/terzi'))], totali: [{ sezione: 'Crediti v/terzi', importo: eur(totaleCrediti) }, { sezione: 'Debiti v/terzi', importo: eur(totaleDebiti) }], incerte: [] },
    'raffronto:4': raffronto,
    'spese:5': { voci: voci.filter((v) => v.pagina <= 7).map(letta), totali: totali.filter((t) => t.pagina <= 7), incerte: [] },
    'spese:8': { voci: voci.filter((v) => v.pagina === 8).map(letta), totali: totali.filter((t) => t.pagina === 8), incerte: [] },
    'riparto:9': parte1(unita, true),
    'riparto:11': parte2,
    'riparto:12': parte3,
    'preventivo:13': preventivo,
  };
  // il testo delle pagine si prepara prima di sporcare i dati: sul "documento" le cifre sono quelle giuste
  const righePagina = testoPagine(structuredClone(blocchi), anno);
  if (conErrori) {
    blocchi['spese:5'].voci[1].importo = eur(-128000);
    const a7 = blocchi['riparto:9'].righe[6].celle[0];
    a7.importo = eur(-Math.abs(unita[6].quote['SPESE GENERALI'].centesimi) - 900);
    blocchi['riparto:9'].righe[8].intestatario = 'ROSSI REMO';
  }
  return { pagine: PAGINE_FASCICOLO, indice: { sezioni: MAPPA_FASCICOLO.map((s) => ({ ...s })), esercizio: String(anno), note: 'Fascicolo di fantasia della modalità prova.' }, blocchi, righePagina };
}

// Il testo di ogni pagina del fascicolo finto, per disegnarne il PDF: → [[righe della pagina 1], …]
function testoPagine(blocchi, anno) {
  const pagine = Array.from({ length: PAGINE_FASCICOLO }, () => []);
  const scrivi = (pagina, ...righe) => pagine[pagina - 1].push(...righe);
  scrivi(1, 'CONDOMINIO DI FANTASIA', '', `Rendiconto dell'esercizio ${anno} e preventivo ${anno + 1}`, '', 'Documento di esempio della modalità prova: non è un documento vero.');
  const sp = blocchi['patrimoniale:2'];
  scrivi(2, `SITUAZIONE PATRIMONIALE al ${sp.data}`, '', 'ATTIVITA\'', ...sp.attivita.map((v) => `  ${v.gruppo ? `${v.gruppo}: ` : ''}${v.voce}    ${v.importo}`), `TOTALE ATTIVITA'    ${sp.totale_attivita}`, '',
    'PASSIVITA\'', ...sp.passivita.map((v) => `  ${v.gruppo ? `${v.gruppo}: ` : ''}${v.voce}    ${v.importo}`), `TOTALE PASSIVITA'    ${sp.totale_passivita}`);
  const pt = blocchi['partite:3'];
  scrivi(3, 'Dettaglio debiti e crediti', '');
  for (const t of pt.totali) scrivi(3, t.sezione, ...pt.righe.filter((r) => r.sezione === t.sezione).map((r) => `  ${r.controparte || '-'}   (${r.protocollo}) ${r.descrizione}    ${r.importo}`), `  Totale    ${t.importo}`, '');
  const rf = blocchi['raffronto:4'];
  scrivi(4, 'RAFFRONTO PREVENTIVO/CONSUNTIVO', rf.colonne.join('   |   '), '', ...rf.righe.map((r) => `${r.gruppo}    ${r.valori.join('    ')}`));
  for (const chiave of ['spese:5', 'spese:8']) {
    const b = blocchi[chiave];
    let aperto = '';
    for (const v of b.voci) {
      if (!pagine[v.pagina - 1].length) scrivi(v.pagina, `RENDICONTO CONSUNTIVO - Esercizio ordinario "${anno}"`, '');
      const conto = `${v.gruppo} / ${v.sottoconto}`;
      if (conto !== aperto) scrivi(v.pagina, conto);
      aperto = conto;
      scrivi(v.pagina, `  protocollo: ${v.protocollo} fattura: ${v.fattura}  ${v.descrizione}  ${v.fornitore}    ${v.importo}`);
      for (const t of b.totali.filter((x) => x.pagina === v.pagina && x.gruppo === v.gruppo && (x.sottoconto === v.sottoconto || x.tipo !== 'parziale_sottoconto'))) {
        const ultima = b.voci.filter((x) => x.gruppo === v.gruppo && (t.tipo !== 'parziale_sottoconto' || x.sottoconto === v.sottoconto)).at(-1) === v;
        if (ultima) scrivi(v.pagina, `      ${t.tipo === 'parziale_sottoconto' ? 'Parziale sottoconto' : `Totale ${t.gruppo}`}    ${t.importo}`);
      }
    }
  }
  scrivi(8, '', `TOTALE    ${blocchi['spese:8'].totali.at(-1).importo}`);
  const tabella = (pagina, b, righe, conTotali) => {
    scrivi(pagina, 'RIPARTO CONSUNTIVO', `Unità   |   ${b.colonne.map((c) => c.titolo).join('   |   ')}`, '');
    const celle = (lista) => lista.map((c) => `${c.importo}${c.millesimi ? ` (${c.millesimi})` : ''}`).join('    ');
    scrivi(pagina, ...righe.map((r) => `${r.codice} ${r.intestatario} ${r.etichetta}    ${celle(r.celle)}`));
    if (conTotali) scrivi(pagina, `Arrotondamenti    ${b.arrotondamenti.map((c) => c.importo).join('    ')}`, `TOTALE COMPLESSIVO    ${celle(b.totale)}`);
  };
  const p1 = blocchi['riparto:9'];
  tabella(9, p1, p1.righe.filter((r) => r.pagina === 9), false);
  tabella(10, p1, p1.righe.filter((r) => r.pagina === 10), true);
  tabella(11, blocchi['riparto:11'], blocchi['riparto:11'].righe, true);
  tabella(12, blocchi['riparto:12'], blocchi['riparto:12'].righe, true);
  const pv = blocchi['preventivo:13'];
  scrivi(13, `PREVENTIVO - ${pv.esercizio}`, '');
  for (const g of pv.gruppi) scrivi(13, g.gruppo, ...g.voci.map((v) => `  ${v.voce}    ${v.importo}`), `      Totale    ${g.totale}`);
  scrivi(13, '', `TOTALE    ${pv.totale}`);
  return pagine;
}
