// Dai dati assemblati e verificati di un fascicolo alle scritture nel database.
// pianoImportazione è pura: decide cosa scrivere e lo descrive. eseguiPiano lo scrive attraverso il deposito,
// a passi ripetibili: ogni tabella dell'esercizio viene svuotata e riscritta, così un'importazione
// interrotta a metà si può ripetere senza doppioni.
import { centesimi, inEuro, dataIso, piatto } from './numeri.js';
import { ruoloRiga, tipoUnita, stessoNome, titolariCorrenti } from './controlli-db.js';

const testo = (valore) => String(valore ?? '').replace(/\s+/g, ' ').trim();
const oNulla = (valore) => testo(valore) || null;
const kConto = (gruppo, sottoconto) => `${piatto(gruppo)}|${piatto(sottoconto)}`;
const latoPartita = (sezione) => (/credit/i.test(sezione) ? 'credito' : /debit/i.test(sezione) ? 'debito' : null);
// Le tabelle che contengono i dati di un esercizio, e la sezione del fascicolo da cui si riempiono:
// una tabella si tocca solo se il fascicolo letto ha quella sezione.
const DI_ESERCIZIO = { spese: 'spese', posizioni: 'riparto', stato_patrimoniale: 'patrimoniale', partite_terzi: 'partite' };

// → { anno, annoPreventivo, tocca, esistenti, passi, errori, avvisi, riepilogo }
//   tocca: le tabelle del consuntivo che l'importazione riscrive
//   esistenti: [{ anno, tipo, conteggi: { tabella: righe } }] = dati già presenti che l'importazione sostituirebbe
//   passi: [{ passo, righe }] nell'ordine in cui vanno scritti (vedi eseguiPiano)
// `db` = righe di esercizi, conti, fornitori, unita, soggetti, titolarita, spese, posizioni, stato_patrimoniale, partite_terzi.
export function pianoImportazione({ estrazione, dati, db, oggi }) {
  const errori = [];
  const avvisi = [];
  const anno = Number(estrazione.anno);
  const annoPreventivo = Number(/\b(20\d\d)\b/.exec(dati.preventivo?.esercizio ?? '')?.[1]) || anno + 1;
  const importo = (valore, cosa) => {
    const c = centesimi(valore);
    if (c === null) errori.push(`${cosa}: importo non leggibile («${valore ?? ''}»).`);
    return inEuro(c ?? 0);
  };

  const esercizi = [{ anno, tipo: 'consuntivo', inizio: `${anno}-01-01`, fine: `${anno}-12-31` }];
  if (dati.preventivo?.gruppi.length) esercizi.push({ anno: annoPreventivo, tipo: 'preventivo', inizio: `${annoPreventivo}-01-01`, fine: `${annoPreventivo}-12-31` });
  const esistenti = [];
  for (const e of esercizi) {
    const presente = db.esercizi.find((x) => x.anno === e.anno && x.tipo === e.tipo);
    if (!presente) continue;
    // del preventivo si riscrivono solo le voci di spesa: posizioni e rate dell'anno nuovo non si toccano
    const tabelle = e.tipo === 'consuntivo' ? Object.keys(DI_ESERCIZIO).filter((t) => dati[DI_ESERCIZIO[t]]) : ['spese'];
    const conteggi = Object.fromEntries(tabelle.map((t) => [t, db[t].filter((r) => r.esercizio_id === presente.id).length]).filter(([, n]) => n));
    if (Object.keys(conteggi).length) esistenti.push({ anno: e.anno, tipo: e.tipo, conteggi });
  }

  // conti: quelli che ci sono già si riusano con il loro nome; i nuovi prendono la tabella dagli altri conti del gruppo
  const contiNoti = new Map(db.conti.map((c) => [kConto(c.gruppo, c.sottoconto), c]));
  const contiNuovi = new Map();
  const conto = (gruppo, sottoconto) => {
    const k = kConto(gruppo, sottoconto);
    const noto = contiNoti.get(k) ?? contiNuovi.get(k);
    if (noto) return { gruppo: noto.gruppo, sottoconto: noto.sottoconto };
    const delGruppo = db.conti.find((c) => piatto(c.gruppo) === piatto(gruppo) && c.tabella_id);
    const nuovo = { gruppo: delGruppo?.gruppo ?? testo(gruppo), sottoconto: testo(sottoconto), tabella_id: delGruppo?.tabella_id ?? null };
    if (!nuovo.tabella_id) avvisi.push(`Conto nuovo «${nuovo.gruppo} / ${nuovo.sottoconto}»: nel gruppo non ci sono altri conti da cui dedurre la tabella millesimale, resta senza tabella.`);
    contiNuovi.set(k, nuovo);
    return { gruppo: nuovo.gruppo, sottoconto: nuovo.sottoconto };
  };
  const fornitoriNoti = new Set(db.fornitori.map((f) => f.denominazione));
  const fornitoriNuovi = new Set();
  const fornitore = (nome) => {
    const pulito = oNulla(nome);
    if (pulito && !fornitoriNoti.has(pulito)) fornitoriNuovi.add(pulito);
    return pulito;
  };

  const spese = (dati.spese?.voci ?? []).map((v) => ({
    esercizio: { anno, tipo: 'consuntivo' }, conto: conto(v.gruppo, v.sottoconto), fornitore: fornitore(v.fornitore),
    protocollo: oNulla(v.protocollo), descrizione: testo(v.descrizione) || testo(v.sottoconto), numero_fattura: oNulla(v.fattura),
    data_fattura: dataIso(v.data_fattura), data_pagamento: dataIso(v.data_pagamento), importo: importo(v.importo, `Spesa ${v.protocollo || v.descrizione} (pagina ${v.pagina})`),
  }));
  // nel preventivo c'è una riga per voce, con la descrizione uguale al nome della voce
  const voci = (dati.preventivo?.gruppi ?? []).flatMap((g) => g.voci.map((v) => ({
    esercizio: { anno: annoPreventivo, tipo: 'preventivo' }, conto: conto(g.gruppo, v.voce), fornitore: null, protocollo: null, descrizione: testo(v.voce),
    numero_fattura: null, data_fattura: null, data_pagamento: null, importo: importo(v.importo, `Preventivo ${g.gruppo} / ${v.voce}`),
  })));

  // posizioni: una per unità e ruolo, intestata a chi in anagrafica ha quel ruolo oggi
  const posizioni = new Map();
  const tipi = [];
  if (dati.riparto) {
    // per ruolo, le colonne che lo hanno (i saldi precedenti possono essere più d'una: si sommano)
    const chiave = Object.fromEntries(['totale_gestione', 'saldo_precedente', 'rate_versate', 'saldo_finale'].map((r) => [r, dati.riparto.colonne.filter((c) => c.ruolo === r).map((c) => c.chiave)]));
    if (!chiave.totale_gestione.length) errori.push('Riparto: manca la colonna «Totale gestione»: le posizioni delle unità non si possono scrivere.');
    const unitaPerCodice = new Map(db.unita.map((u) => [u.codice, u]));
    const titolari = titolariCorrenti(db, oggi);
    for (const r of chiave.totale_gestione.length ? dati.riparto.righe : []) {
      const unita = unitaPerCodice.get(r.codice);
      if (!unita) {
        errori.push(`Riparto: l'unità ${r.codice || '(senza codice)'} non è in anagrafica.`);
        continue;
      }
      const ruolo = ruoloRiga(r.etichetta);
      const candidati = (titolari.get(unita.id) ?? []).filter((t) => t.ruolo === ruolo);
      if (!candidati.length) {
        errori.push(`${r.codice}: in anagrafica l'unità non ha un ${ruolo} corrente a cui intestare la posizione.`);
        continue;
      }
      const scelto = candidati.find((t) => stessoNome(r.intestatario, t.denominazione)) ?? candidati[0];
      if (candidati.length > 1) avvisi.push(`${r.codice}: più di un ${ruolo} corrente (${candidati.map((t) => t.denominazione).join(', ')}); la posizione è intestata a ${scelto.denominazione}.`);
      const k = `${unita.id}|${scelto.soggetto_id}|${ruolo}`;
      const valore = (campo) => {
        const letti = chiave[campo].map((k) => centesimi(r.valori[k]?.importo)).filter((v) => v !== null);
        return letti.length ? letti.reduce((a, b) => a + b, 0) : null;
      };
      const gia = posizioni.get(k);
      if (gia) avvisi.push(`${r.codice}: più righe del riparto per lo stesso ${ruolo}; gli importi sono sommati in una sola posizione.`);
      const p = gia ?? { unita_id: unita.id, codice: r.codice, soggetto_id: scelto.soggetto_id, ruolo, totale_gestione: null, saldo_precedente: null, rate_versate: null, saldo_finale: null };
      for (const campo of Object.keys(chiave)) {
        const v = valore(campo);
        if (v !== null) p[campo] = (p[campo] ?? 0) + v;
      }
      posizioni.set(k, p);
      const tipo = tipoUnita(r.etichetta);
      if (tipo && tipo !== unita.tipo && !tipi.some((t) => t.unita_id === unita.id)) tipi.push({ unita_id: unita.id, codice: r.codice, tipo, prima: unita.tipo ?? null });
    }
  }
  const righePosizioni = [...posizioni.values()].map((p) => ({ ...p, totale_gestione: inEuro(p.totale_gestione), saldo_precedente: inEuro(p.saldo_precedente), rate_versate: inEuro(p.rate_versate), saldo_finale: inEuro(p.saldo_finale) }));

  const patrimoniale = ['attivita', 'passivita'].flatMap((lato) => (dati.patrimoniale?.[lato] ?? []).filter((v) => testo(v.importo) && !v.dettaglio)
    .map((v, i) => ({ lato, ordine: i + 1, voce: [testo(v.gruppo), testo(v.voce)].filter(Boolean).join(': '), importo: importo(v.importo, `Situazione patrimoniale, ${v.voce}`) })));
  const partite = (dati.partite?.righe ?? []).map((p) => {
    const tipo = latoPartita(p.sezione);
    if (!tipo) errori.push(`Partita ${p.protocollo || p.descrizione}: non si capisce se è un credito o un debito.`);
    return { tipo: tipo ?? 'debito', controparte: oNulla(p.controparte), protocollo: oNulla(p.protocollo), descrizione: testo(p.descrizione) || '(senza descrizione)', importo: importo(p.importo, `Partita ${p.protocollo || p.descrizione}`) };
  });

  const passi = [
    { passo: 'esercizi', righe: esercizi },
    { passo: 'conti', righe: [...contiNuovi.values()] },
    { passo: 'fornitori', righe: [...fornitoriNuovi].map((denominazione) => ({ denominazione })) },
    { passo: 'spese', righe: [...spese, ...voci] },
    { passo: 'posizioni', righe: righePosizioni },
    { passo: 'tipi_unita', righe: tipi },
    { passo: 'stato_patrimoniale', righe: patrimoniale },
    { passo: 'partite_terzi', righe: partite },
  ];
  const riepilogo = [
    ['Esercizi', esercizi.map((e) => `${e.tipo} ${e.anno}${db.esercizi.some((x) => x.anno === e.anno && x.tipo === e.tipo) ? ' (già presente)' : ' (nuovo)'}`).join(', ')],
    ['Voci di spesa del consuntivo', spese.length], ['Voci del preventivo', voci.length],
    ['Conti nuovi', contiNuovi.size ? [...contiNuovi.values()].map((c) => `${c.gruppo} / ${c.sottoconto}`).join('; ') : 0],
    ['Fornitori nuovi', fornitoriNuovi.size ? [...fornitoriNuovi].join('; ') : 0],
    ['Posizioni delle unità', righePosizioni.length], ['Tipi di unità da aggiornare', tipi.length ? tipi.map((t) => `${t.codice} → ${t.tipo}`).join(', ') : 0],
    ['Voci della situazione patrimoniale', patrimoniale.length], ['Partite verso terzi', partite.length],
  ];
  const tocca = Object.keys(DI_ESERCIZIO).filter((t) => dati[DI_ESERCIZIO[t]]);
  return { anno, annoPreventivo, tocca, esistenti, passi, errori: [...new Set(errori)], avvisi: [...new Set(avvisi)], riepilogo };
}

const A_PEZZI = 500;
async function inserisciTutte(deposito, tabella, righe) {
  for (let i = 0; i < righe.length; i += A_PEZZI) await deposito.inserisci(tabella, righe.slice(i, i + A_PEZZI));
}

// Scrive il piano. `sostituisci`: true se chi usa il portale ha confermato di sostituire i dati già presenti
// (o se si sta ripetendo un'importazione interrotta). `avanza(passo)` viene chiamata prima di ogni passo.
export async function eseguiPiano(deposito, piano, { sostituisci = false, avanza = () => {} } = {}) {
  if (piano.errori.length) throw new Error(`l'importazione non può partire: ${piano.errori[0]}`);
  const righeDi = (nome) => piano.passi.find((p) => p.passo === nome).righe;

  avanza('esercizi');
  let presenti = await deposito.leggi('esercizi');
  const mancanti = righeDi('esercizi').filter((e) => !presenti.some((x) => x.anno === e.anno && x.tipo === e.tipo));
  if (mancanti.length) await deposito.inserisci('esercizi', mancanti);
  presenti = await deposito.leggi('esercizi');
  const idEsercizio = ({ anno, tipo }) => presenti.find((x) => x.anno === anno && x.tipo === tipo).id;
  const consuntivo = idEsercizio({ anno: piano.anno, tipo: 'consuntivo' });
  const tocca = (tabella) => piano.tocca.includes(tabella);
  // esercizi di cui si riscrivono le spese: il consuntivo (se il rendiconto è stato letto) e il preventivo (se c'è)
  const speseDi = [...new Set([...(tocca('spese') ? [consuntivo] : []), ...righeDi('spese').map((s) => idEsercizio(s.esercizio))])];

  // ultima verifica sul database vero: nel frattempo qualcuno potrebbe aver caricato l'esercizio
  if (!sostituisci) {
    for (const tabella of [...new Set(['spese', ...piano.tocca])]) {
      const gia = (await deposito.leggi(tabella, { esercizio_id: tabella === 'spese' ? speseDi : consuntivo })).length;
      if (gia) throw new Error(`l'esercizio ha già dati (${tabella}: ${gia} righe). Serve la conferma per sostituirli.`);
    }
  }

  avanza('conti');
  const contiPresenti = await deposito.leggi('conti');
  await inserisciTutte(deposito, 'conti', righeDi('conti').filter((c) => !contiPresenti.some((x) => x.gruppo === c.gruppo && x.sottoconto === c.sottoconto)));
  const conti = new Map((await deposito.leggi('conti')).map((c) => [`${c.gruppo}|${c.sottoconto}`, c.id]));

  avanza('fornitori');
  const fornitoriPresenti = new Set((await deposito.leggi('fornitori')).map((f) => f.denominazione));
  await inserisciTutte(deposito, 'fornitori', righeDi('fornitori').filter((f) => !fornitoriPresenti.has(f.denominazione)));
  const fornitori = new Map((await deposito.leggi('fornitori')).map((f) => [f.denominazione, f.id]));

  avanza('spese');
  for (const id of speseDi) await deposito.elimina('spese', { esercizio_id: id });
  await inserisciTutte(deposito, 'spese', righeDi('spese').map(({ esercizio, conto, fornitore, ...resto }) => {
    const conto_id = conti.get(`${conto.gruppo}|${conto.sottoconto}`);
    if (!conto_id) throw new Error(`conto non trovato: ${conto.gruppo} / ${conto.sottoconto}`);
    return { esercizio_id: idEsercizio(esercizio), conto_id, fornitore_id: fornitore ? fornitori.get(fornitore) ?? null : null, ...resto };
  }));

  avanza('posizioni');
  if (tocca('posizioni')) await deposito.elimina('posizioni', { esercizio_id: consuntivo });
  await inserisciTutte(deposito, 'posizioni', righeDi('posizioni').map(({ codice, ...p }) => ({ ...p, esercizio_id: consuntivo })));

  avanza('tipi_unita');
  for (const t of righeDi('tipi_unita')) await deposito.aggiorna('unita', { id: t.unita_id }, { tipo: t.tipo });

  avanza('stato_patrimoniale');
  if (tocca('stato_patrimoniale')) await deposito.elimina('stato_patrimoniale', { esercizio_id: consuntivo });
  await inserisciTutte(deposito, 'stato_patrimoniale', righeDi('stato_patrimoniale').map((v) => ({ ...v, esercizio_id: consuntivo })));

  avanza('partite_terzi');
  if (tocca('partite_terzi')) await deposito.elimina('partite_terzi', { esercizio_id: consuntivo });
  await inserisciTutte(deposito, 'partite_terzi', righeDi('partite_terzi').map((p) => ({ ...p, esercizio_id: consuntivo })));
  return { consuntivo };
}
