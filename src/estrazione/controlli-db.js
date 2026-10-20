// Controlli del riparto letto contro l'anagrafica e la contabilità già nel database. Funzioni pure.
// `db` = le righe delle tabelle (unita, soggetti, titolarita, tabelle_millesimali, millesimi, esercizi, posizioni).
import { centesimi, millesimiInteri, leggibile, piatto } from './numeri.js';
import { totaliColonne, fmtMill } from './controlli-riparto.js';
import { esito, somma } from './esito.js';

const dove = (altro) => ({ sezione: 'riparto', ...altro });
const inCorso = (t, oggi) => (!t.dal || t.dal <= oggi) && (!t.al || t.al >= oggi);

// La colonna accanto al nome: "Co" e "As" nei fascicoli fino al 2024, il tipo di unità dal 2025.
const TITOLI = { co: 'conduttore', as: 'assegnatario' };
export const ruoloRiga = (etichetta) => TITOLI[piatto(etichetta)] ?? 'proprietario';
const TIPI_UNITA = [['appartamento', /^app/], ['box', /^box|^autorimessa/], ['posto auto', /^posto/], ['cantina', /^cant/], ['negozio', /^negoz/], ['ufficio', /^uffic/], ['terrazzo', /^terraz/], ['giardino', /^giard/], ['deposito', /^depos/]];
// Il tipo è spesso troncato ("Appartame", "POSTO AU"). null se la colonna non è un tipo di unità.
export const tipoUnita = (etichetta) => TIPI_UNITA.find(([, modello]) => modello.test(piatto(etichetta)))?.[0] ?? null;

// I nomi nel riparto sono spesso troncati o con asterischi: sono "lo stesso nome" se uno è l'inizio dell'altro.
const nomePiatto = (nome) => piatto(String(nome ?? '').replace(/\*+/g, ' '));
export function stessoNome(stampato, registrato) {
  const [a, b] = [nomePiatto(stampato), nomePiatto(registrato)];
  return Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));
}

// Per ogni unità i titolari in corso: → Map unita_id → [{ soggetto_id, ruolo, denominazione }]
export function titolariCorrenti(db, oggi) {
  const nomi = new Map(db.soggetti.map((s) => [s.id, s.denominazione]));
  const perUnita = new Map();
  for (const t of db.titolarita) {
    if (!inCorso(t, oggi)) continue;
    if (!perUnita.has(t.unita_id)) perUnita.set(t.unita_id, []);
    perUnita.get(t.unita_id).push({ soggetto_id: t.soggetto_id, ruolo: t.ruolo, denominazione: nomi.get(t.soggetto_id) ?? '' });
  }
  for (const elenco of perUnita.values()) elenco.sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it'));
  return perUnita;
}

// Colonna del riparto → tabella millesimale dell'anagrafica con lo stesso nome (null se non c'è).
export function tabellaDellaColonna(colonna, tabelle) {
  return tabelle.find((t) => piatto(t.nome) === piatto(colonna.titolo)) ?? null;
}

export function controlliDatabase({ riparto, db, anno, oggi }) {
  if (!riparto) return [];
  const esiti = [];
  const unitaPerCodice = new Map(db.unita.map((u) => [u.codice, u]));
  const letti = new Set(riparto.righe.map((r) => r.codice));

  for (const r of riparto.righe) {
    if (r.codice && !unitaPerCodice.has(r.codice) && r.n === 1) esiti.push(esito('errore', 'unita_sconosciuta', `Riparto, pagina ${r.pagina}: l'unità ${r.codice} non è in anagrafica. Se il codice è stato letto male correggilo; se l'unità è nuova va prima aggiunta in anagrafica.`, dove({ pagina: r.pagina, riga: r.codice, campo: 'anagrafica', origine: `${r.origine}.codice` })));
  }
  const assenti = db.unita.filter((u) => !letti.has(u.codice)).map((u) => u.codice);
  if (assenti.length) esiti.push(esito('errore', 'unita_assente', `Nel riparto ${assenti.length === 1 ? 'manca l\'unità' : `mancano ${assenti.length} unità`} dell'anagrafica: ${assenti.slice(0, 12).join(', ')}${assenti.length > 12 ? '…' : ''}.`, dove({ riga: assenti.join(','), campo: 'anagrafica' })));
  if (!assenti.length && riparto.righe.every((r) => unitaPerCodice.has(r.codice))) esiti.push(esito('ok', 'unita_anagrafica', `Le ${letti.size} unità del riparto sono le stesse dell'anagrafica.`, dove()));

  // righe del riparto per unità (possono essere più d'una: proprietario e conduttore)
  const perCodice = new Map();
  for (const r of riparto.righe) {
    if (!perCodice.has(r.codice)) perCodice.set(r.codice, []);
    perCodice.get(r.codice).push(r);
  }

  // millesimi: quelli stampati contro quelli in anagrafica, tabella per tabella. L'anagrafica è quella di oggi: per un
  // esercizio passato (c'è già un consuntivo più recente) una differenza è normale e non ferma l'importazione.
  const storico = db.esercizi.some((e) => e.tipo === 'consuntivo' && e.anno > anno);
  const registrati = new Map(db.millesimi.map((m) => [`${m.unita_id}|${m.tabella_id}`, Math.round(Number(m.valore) * 1000) || 0]));
  const senzaTabella = [];
  let confrontati = 0;
  let diversi = 0;
  for (const c of totaliColonne(riparto).filter((x) => x.ruolo === 'tabella')) {
    const tabella = tabellaDellaColonna(c, db.tabelle_millesimali);
    if (!tabella) {
      senzaTabella.push(c.titolo);
      continue;
    }
    // l'anagrafica ha tre decimali, la stampa a volte meno: si confronta alla precisione della stampa
    const passo = 10 ** Math.max(0, 3 - c.decimali);
    const arrotonda = (interi) => Math.round(interi / passo) * passo;
    for (const [codice, righe] of perCodice) {
      const unita = unitaPerCodice.get(codice);
      const celle = righe.map((r) => r.valori[c.chiave]).filter(Boolean);
      if (!unita || !celle.length) continue;
      const atteso = arrotonda(registrati.get(`${unita.id}|${tabella.id}`) ?? 0);
      const stampati = celle.map((x) => millesimiInteri(x.millesimi) ?? 0);
      confrontati += 1;
      if (stampati.includes(atteso) || somma(stampati) === atteso) continue;
      diversi += 1;
      esiti.push(esito('avviso', 'millesimi_diversi', storico
        ? `${codice}, «${c.titolo}»: nel fascicolo ${fmtMill(stampati[0])} millesimi, nell'anagrafica di oggi ${fmtMill(atteso)}. Per un esercizio passato è normale se nel frattempo i millesimi sono cambiati; l'anagrafica non viene toccata.`
        : `${codice}, «${c.titolo}»: nel fascicolo ${fmtMill(stampati[0])} millesimi, in anagrafica ${fmtMill(atteso)}. Se il fascicolo è giusto, dopo l'importazione aggiorna l'anagrafica; se è una lettura sbagliata, correggi la cella.`,
        dove({ pagina: righe[0].pagina, riga: codice, campo: `${c.chiave}/millesimi`, origine: `${celle[0].origine}.millesimi` }), { daConfermare: !storico }));
    }
  }
  if (confrontati && !diversi) esiti.push(esito('ok', 'millesimi_diversi', `I millesimi stampati coincidono con l'anagrafica (${confrontati} valori confrontati).`, dove()));
  if (senzaTabella.length) esiti.push(esito('avviso', 'tabella_non_trovata', `Millesimi non confrontati per ${senzaTabella.length === 1 ? 'la colonna' : 'le colonne'} ${senzaTabella.map((t) => `«${t}»`).join(', ')}: in anagrafica non c'è una tabella con lo stesso nome.`, dove({ riga: senzaTabella.join('|'), campo: 'tabelle' })));

  // saldo precedente = saldo finale del consuntivo dell'anno prima
  const precedente = db.esercizi.find((e) => e.anno === anno - 1 && e.tipo === 'consuntivo');
  const colonneSaldo = riparto.colonne.filter((c) => c.ruolo === 'saldo_precedente').map((c) => c.chiave);
  const colonnaSaldo = colonneSaldo[0];
  const vecchie = precedente ? db.posizioni.filter((p) => p.esercizio_id === precedente.id) : [];
  if (colonnaSaldo && vecchie.length) {
    let uguali = 0;
    let differenti = 0;
    for (const [codice, righe] of perCodice) {
      const unita = unitaPerCodice.get(codice);
      const sue = unita ? vecchie.filter((p) => p.unita_id === unita.id && p.saldo_finale !== null && p.saldo_finale !== undefined) : [];
      if (!sue.length) continue;
      const prima = somma(sue.map((p) => Math.round(Number(p.saldo_finale) * 100)));
      const ora = somma(righe.flatMap((r) => colonneSaldo.map((k) => centesimi(r.valori[k]?.importo) ?? 0)));
      if (prima === ora) uguali += 1;
      else {
        differenti += 1;
        esiti.push(esito('avviso', 'saldo_precedente', `${codice}: il saldo precedente stampato è ${leggibile(ora)}, ma il saldo finale del ${anno - 1} nel database è ${leggibile(prima)}.`, dove({ pagina: righe[0].pagina, riga: codice, campo: 'saldo_precedente', origine: `${righe[0].valori[colonnaSaldo]?.origine}.importo` })));
      }
    }
    if (uguali && !differenti) esiti.push(esito('ok', 'saldo_precedente', `I saldi precedenti coincidono con i saldi finali del ${anno - 1} (${uguali} unità confrontate).`, dove()));
  }

  // intestatario stampato contro proprietario corrente
  const titolari = titolariCorrenti(db, oggi);
  for (const [codice, righe] of perCodice) {
    const unita = unitaPerCodice.get(codice);
    if (!unita) continue;
    for (const r of righe) {
      const ruolo = ruoloRiga(r.etichetta);
      const nomi = (titolari.get(unita.id) ?? []).filter((t) => t.ruolo === ruolo).map((t) => t.denominazione);
      if (!r.intestatario || nomi.some((n) => stessoNome(r.intestatario, n)) || stessoNome(r.intestatario, nomi.join(' '))) continue;
      const messaggio = nomi.length
        ? `${codice}: nel fascicolo è intestata a «${r.intestatario}», in anagrafica il ${ruolo} corrente è ${nomi.join(' + ')}. Possibile cambio di proprietà: l'importazione non cambia le titolarità, lo si fa dal dettaglio dell'unità.`
        : `${codice}: nel fascicolo è intestata a «${r.intestatario}», ma in anagrafica l'unità non ha un ${ruolo} corrente.`;
      esiti.push(esito('avviso', 'intestatario_diverso', messaggio, dove({ pagina: r.pagina, riga: `${codice}#${r.n}`, campo: 'intestatario', origine: `${r.origine}.intestatario` })));
    }
  }
  return esiti;
}
