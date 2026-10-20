import { calcolaTeste, pesaTeste } from '../calcolo/teste.js';
import { daInteri } from '../calcolo/numeri.js';

// Ordine naturale dei codici: A2 prima di A10, A109.1 dopo A109.
const numeroCodice = (codice) => parseFloat(codice.replace(/^[^\d]*/, '')) || 0;
export const perCodice = (a, b) => numeroCodice(a.codice) - numeroCodice(b.codice) || a.codice.localeCompare(b.codice);

const inCorso = (t, oggi) => (!t.dal || t.dal <= oggi) && (!t.al || t.al >= oggi);

// Dalle righe grezze del database alle strutture che servono alle schermate.
// Funzione pura: nessun accesso a rete o DOM.
export function costruisciModello(dati, oggi) {
  const soggetti = new Map(dati.soggetti.map((s) => [s.id, s]));
  const tabelle = [...dati.tabelle_millesimali].sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));
  const tabellaProprieta = tabelle.find((t) => /propriet/i.test(t.nome)) ?? null;
  const tabellePerId = new Map(tabelle.map((t) => [t.id, t]));

  const unita = new Map(dati.unita.map((u) => [u.id, { ...u, proprietari: [], altri: [], storico: [], futuri: [], millesimi: {}, parti: [], proprieta: 0 }]));

  for (const t of dati.titolarita) {
    const u = unita.get(t.unita_id);
    const voce = { soggetto: soggetti.get(t.soggetto_id), ruolo: t.ruolo, dal: t.dal, al: t.al };
    if (!u || !voce.soggetto) continue;
    // una titolarità che parte da una data futura (cambio di proprietà già registrato) non è storico
    if (t.dal && t.dal > oggi) u.futuri.push(voce);
    else if (!inCorso(t, oggi)) u.storico.push(voce);
    else if (t.ruolo === 'proprietario') u.proprietari.push(voce);
    else u.altri.push(voce);
  }

  for (const m of dati.millesimi) {
    const u = unita.get(m.unita_id);
    const tabella = tabellePerId.get(m.tabella_id);
    if (!u || !tabella) continue;
    const valore = Number(m.valore);
    u.millesimi[m.tabella_id] = valore;
    if (tabella.id === tabellaProprieta?.id) u.proprieta = valore;
    // L'appartenenza a scala o torre si ricava dai millesimi, non si inserisce a mano.
    if (valore > 0 && tabella.ambito !== 'condominio' && !u.parti.includes(tabella.ambito)) u.parti.push(tabella.ambito);
  }
  for (const u of unita.values()) u.parti.sort((a, b) => a.localeCompare(b, 'it'));

  const elencoUnita = [...unita.values()].sort(perCodice);
  const parti = [...new Set(elencoUnita.flatMap((u) => u.parti))].sort((a, b) => a.localeCompare(b, 'it'));

  const testeGrezze = calcolaTeste(dati.titolarita, oggi);
  const pesi = tabellaProprieta
    ? new Map(pesaTeste(testeGrezze, dati.millesimi, tabellaProprieta.id).map((t) => [t.chiave, t.peso]))
    : new Map();
  const teste = testeGrezze
    .map((t) => ({
      chiave: t.chiave,
      etichetta: t.soggetti.map((id) => soggetti.get(id)?.denominazione ?? '?').join(' + '),
      soggetti: t.soggetti.map((id) => soggetti.get(id)).filter(Boolean),
      unita: t.unita.map((id) => unita.get(id)).filter(Boolean).sort(perCodice),
      proprieta: daInteri(pesi.get(t.chiave) ?? 0),
    }))
    .sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it'));

  return { soggetti, tabelle, tabellaProprieta, unita: elencoUnita, unitaPerCodice: new Map(elencoUnita.map((u) => [u.codice, u])), parti, teste };
}

// Spese di un esercizio raggruppate per gruppo e sottoconto, con i totali.
export function raggruppaSpese(spese, conti, fornitori, esercizioId) {
  const contoPerId = new Map(conti.map((c) => [c.id, c]));
  const fornitorePerId = new Map(fornitori.map((f) => [f.id, f.denominazione]));
  const gruppi = new Map();
  let totale = 0;
  for (const s of spese) {
    if (s.esercizio_id !== esercizioId) continue;
    const conto = contoPerId.get(s.conto_id);
    if (!conto) continue;
    const importo = Math.round(Number(s.importo) * 100);
    if (!gruppi.has(conto.gruppo)) gruppi.set(conto.gruppo, { nome: conto.gruppo, totale: 0, sottoconti: new Map() });
    const g = gruppi.get(conto.gruppo);
    if (!g.sottoconti.has(conto.sottoconto)) g.sottoconti.set(conto.sottoconto, { nome: conto.sottoconto, totale: 0, voci: [] });
    const sc = g.sottoconti.get(conto.sottoconto);
    sc.voci.push({ ...s, fornitore: fornitorePerId.get(s.fornitore_id) ?? '' });
    sc.totale += importo;
    g.totale += importo;
    totale += importo;
  }
  const inEuro = (c) => c / 100;
  return {
    totale: inEuro(totale),
    gruppi: [...gruppi.values()].map((g) => ({
      nome: g.nome,
      totale: inEuro(g.totale),
      sottoconti: [...g.sottoconti.values()].map((sc) => ({ ...sc, totale: inEuro(sc.totale) })),
    })),
  };
}
