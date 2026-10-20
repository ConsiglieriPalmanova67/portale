// Calcoli della contabilità: raffronto tra preventivo e consuntivo, andamento negli anni, situazione
// patrimoniale e partite verso terzi. Funzioni pure, senza rete né DOM.
// Tutti gli importi restituiti sono in centesimi interi (per mostrarli: dividere per 100): le somme
// non risentono degli errori di virgola mobile.
import { normalizza } from '../ui/html.js';

export const inCentesimi = (importo) => Math.round(Number(importo) * 100);

const alfabetico = (a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true });
// una cifra decimale; `+ 0` evita lo zero negativo
const percentuale = (parte, intero) => (intero ? Math.round((parte / Math.abs(intero)) * 1000) / 10 + 0 : null);

// Gli esercizi raccolti per anno: → [{ anno, consuntivo, preventivo }] (esercizio oppure null), in ordine di anno.
export function eserciziPerAnno(esercizi) {
  const anni = new Map();
  for (const e of esercizi) {
    if (!anni.has(e.anno)) anni.set(e.anno, { anno: e.anno, consuntivo: null, preventivo: null });
    if (e.tipo === 'consuntivo' || e.tipo === 'preventivo') anni.get(e.anno)[e.tipo] ??= e;
  }
  return [...anni.values()].sort((a, b) => a.anno - b.anno);
}

// Somme per gruppo e sottoconto di più esercizi insieme.
// → Map gruppo → Map sottoconto → Map esercizioId → centesimi. Le spese di un conto sconosciuto si ignorano.
function sommePerConto(spese, conti, esercizi) {
  const contoPerId = new Map(conti.map((c) => [c.id, c]));
  const voluti = new Set(esercizi);
  const gruppi = new Map();
  for (const s of spese) {
    const conto = contoPerId.get(s.conto_id);
    if (!conto || !voluti.has(s.esercizio_id)) continue;
    if (!gruppi.has(conto.gruppo)) gruppi.set(conto.gruppo, new Map());
    const sottoconti = gruppi.get(conto.gruppo);
    if (!sottoconti.has(conto.sottoconto)) sottoconti.set(conto.sottoconto, new Map());
    const somme = sottoconti.get(conto.sottoconto);
    somme.set(s.esercizio_id, (somme.get(s.esercizio_id) ?? 0) + inCentesimi(s.importo));
  }
  return gruppi;
}

// null se nessuno degli addendi esiste: "nessuna voce" è diverso da "zero"
const sommaONulla = (valori) => (valori.some((v) => v !== null) ? valori.reduce((s, v) => s + (v ?? 0), 0) : null);

// Raffronto tra il preventivo e il consuntivo dello stesso anno.
// → { gruppi: [{ nome, preventivo, consuntivo, differenza, percento, sforamento, sottoconti: [stessi campi] }], totale }
// differenza = consuntivo − preventivo; percento = differenza sul preventivo (null se il preventivo manca o è zero);
// sforamento = si è speso più del previsto. Le spese sono di norma registrate in negativo (addebiti):
// il verso si ricava dal segno del totale, così il calcolo regge anche se fossero in positivo.
export function raffronto(spese, conti, preventivoId, consuntivoId) {
  const somme = sommePerConto(spese, conti, [preventivoId, consuntivoId]);
  unificaVoci(somme, [preventivoId, consuntivoId]);
  const grezzi = [...somme].map(([nome, sottoconti]) => ({
    nome,
    sottoconti: [...sottoconti].map(([sottoconto, s]) => ({ nome: sottoconto, preventivo: s.get(preventivoId) ?? null, consuntivo: s.get(consuntivoId) ?? null })).sort(alfabetico),
  })).sort(alfabetico);

  const tutti = grezzi.flatMap((g) => g.sottoconti);
  const preventivo = sommaONulla(tutti.map((x) => x.preventivo));
  const consuntivo = sommaONulla(tutti.map((x) => x.consuntivo));
  const speseInNegativo = (preventivo ?? 0) + (consuntivo ?? 0) < 0;

  const riga = (r) => {
    const differenza = (r.consuntivo ?? 0) - (r.preventivo ?? 0);
    return { ...r, differenza, percento: percentuale(differenza, r.preventivo), sforamento: speseInNegativo ? differenza < 0 : differenza > 0 };
  };
  return {
    gruppi: grezzi.map((g) => {
      const sottoconti = g.sottoconti.map(riga);
      return { ...riga({ nome: g.nome, preventivo: sommaONulla(sottoconti.map((x) => x.preventivo)), consuntivo: sommaONulla(sottoconti.map((x) => x.consuntivo)) }), sottoconti };
    }),
    totale: riga({ preventivo, consuntivo }),
  };
}

// Il nome di una voce senza la quota in fondo ("FORZA MOTRICE 11%" → "forza motrice"), per riconoscerla negli anni.
const nomeVoce = (nome) => normalizza(String(nome).replace(/\s*\d+(?:[.,]\d+)?\s*%\s*$/, ''));

// Il rendiconto a volte sposta una voce da un gruppo a uno affine (CONSUMO METANO da "RISCALDAMENTO" a
// "RISCALDAMENTO SOLO CONSUMI"): per confrontarla negli anni va su una riga sola. Si uniscono due voci con lo
// stesso nome quando il nome di un gruppo comincia con quello dell'altro e gli esercizi con un importo diverso da
// zero non si sovrappongono; la voce va nel gruppo e col nome dell'esercizio più recente. Modifica `somme` (vedi
// sommePerConto) e restituisce da dove vengono le voci unite: Map "gruppo\u0000voce" → ["GRUPPO › VOCE", …].
export function unificaVoci(somme, ordineEsercizi) {
  const posizione = new Map(ordineEsercizi.map((id, i) => [id, i]));
  const conImporto = (s) => [...s].filter(([, v]) => v !== 0).map(([id]) => id);
  const ultimo = (s) => Math.max(-1, ...conImporto(s).map((id) => posizione.get(id) ?? -1));
  const affini = (a, b) => a !== b && (normalizza(a).startsWith(normalizza(b)) || normalizza(b).startsWith(normalizza(a)));
  const chiave = (v) => `${v.gruppo}\u0000${v.voce}`;
  const provenienze = new Map();
  for (let unite = true; unite;) {
    unite = false;
    const voci = [...somme].flatMap(([gruppo, sc]) => [...sc].map(([voce, s]) => ({ gruppo, voce, s })));
    for (const a of voci) {
      const anniA = conImporto(a.s);
      const b = anniA.length && voci.find((x) => affini(x.gruppo, a.gruppo) && nomeVoce(x.voce) === nomeVoce(a.voce)
        && conImporto(x.s).length && !conImporto(x.s).some((id) => anniA.includes(id)));
      if (!b) continue;
      const [da, verso] = ultimo(a.s) < ultimo(b.s) ? [a, b] : [b, a];
      for (const [id, v] of da.s) verso.s.set(id, (verso.s.get(id) ?? 0) + v);
      somme.get(da.gruppo).delete(da.voce);
      if (!somme.get(da.gruppo).size) somme.delete(da.gruppo);
      provenienze.set(chiave(verso), [...(provenienze.get(chiave(verso)) ?? []), `${da.gruppo} › ${da.voce}`, ...(provenienze.get(chiave(da)) ?? [])]);
      provenienze.delete(chiave(da));
      unite = true;
      break;
    }
  }
  return provenienze;
}

// Andamento negli anni: per ogni anno il consuntivo, oppure il preventivo se il consuntivo non c'è.
// → { anni: [{ anno, fonte: 'consuntivo'|'preventivo', esercizioId }],
//     gruppi: [{ nome, valori: [{ importo, variazione, percento }], sottoconti: [{ nome, valori }] }], totale: { valori } }
// `valori` ha un elemento per anno, nello stesso ordine di `anni`. importo è null se la voce in quell'anno non c'è;
// variazione e percento sono null se manca uno dei due importi. La variazione è sull'anno precedente oppure, con
// confronto 'preventivo', sul preventivo dello stesso anno (solo per gli anni che hanno il consuntivo).
export function andamento(spese, conti, esercizi, { confronto = 'anno' } = {}) {
  // un consuntivo senza voci (dal fascicolo è stato letto solo il riparto) non dice nulla voce per voce: vale il preventivo
  const conVoci = new Set(spese.map((s) => s.esercizio_id));
  const anni = eserciziPerAnno(esercizi)
    .map((a) => {
      const consuntivo = a.consuntivo && (conVoci.has(a.consuntivo.id) || !a.preventivo) ? a.consuntivo : null;
      return { anno: a.anno, esercizio: consuntivo ?? a.preventivo, preventivo: consuntivo ? a.preventivo : null, senzaVoci: Boolean(a.consuntivo && !consuntivo) };
    })
    .filter((a) => a.esercizio)
    .map((a) => ({ anno: a.anno, fonte: a.esercizio.tipo, esercizioId: a.esercizio.id, preventivoId: a.preventivo?.id ?? null, consuntivoSenzaVoci: a.senzaVoci }));
  const sulPreventivo = confronto === 'preventivo';
  const somme = sommePerConto(spese, conti, [...anni.map((a) => a.esercizioId), ...(sulPreventivo ? anni.map((a) => a.preventivoId).filter(Boolean) : [])]);
  // gli esercizi in ordine di tempo, il preventivo prima del consuntivo dello stesso anno
  const provenienze = unificaVoci(somme, anni.flatMap((a) => [a.preventivoId, a.esercizioId]).filter(Boolean));

  const conVariazioni = (importi, previsti) => importi.map((importo, i) => {
    const prima = sulPreventivo ? previsti[i] : i > 0 ? importi[i - 1] : null;
    const variazione = importo === null || prima === null ? null : importo - prima;
    return { importo, variazione, percento: variazione === null ? null : percentuale(variazione, prima) };
  });
  const perAnno = (righe) => anni.map((_, i) => sommaONulla(righe.map((r) => r[i])));

  const gruppi = [...somme].map(([nome, sottoconti]) => {
    const righe = [...sottoconti].map(([sottoconto, s]) => ({
      nome: sottoconto, importi: anni.map((a) => s.get(a.esercizioId) ?? null), previsti: anni.map((a) => (a.preventivoId ? s.get(a.preventivoId) ?? null : null)),
    })).sort(alfabetico);
    return { nome, importi: perAnno(righe.map((r) => r.importi)), previsti: perAnno(righe.map((r) => r.previsti)), sottoconti: righe };
  }).sort(alfabetico);

  return {
    anni,
    gruppi: gruppi.map((g) => ({
      nome: g.nome,
      valori: conVariazioni(g.importi, g.previsti),
      sottoconti: g.sottoconti.map((sc) => ({ nome: sc.nome, unite: provenienze.get(`${g.nome}\u0000${sc.nome}`) ?? [], valori: conVariazioni(sc.importi, sc.previsti) })),
    })),
    totale: { valori: conVariazioni(perAnno(gruppi.map((g) => g.importi)), perAnno(gruppi.map((g) => g.previsti))) },
  };
}

const SENZA_CONTROPARTE = 'Senza controparte';

// Crediti o debiti verso terzi di un esercizio, raggruppati per controparte.
// opzioni: esercizioId, tipo ('credito'|'debito'), ordine ('decrescente' predefinito, 'crescente', 'nome'),
// testo (ricerca su controparte, descrizione e protocollo).
// → { gruppi: [{ controparte, totale, partite }], totale (delle partite trovate), totaleComplessivo (di tutte) }
export function raggruppaPartite(partite, { esercizioId, tipo, ordine = 'decrescente', testo = '' }) {
  const cercato = normalizza(testo.trim());
  const gruppi = new Map();
  let totale = 0;
  let totaleComplessivo = 0;
  for (const p of partite) {
    if (p.esercizio_id !== esercizioId || p.tipo !== tipo) continue;
    const importo = inCentesimi(p.importo);
    totaleComplessivo += importo;
    const controparte = (p.controparte ?? '').trim() || SENZA_CONTROPARTE;
    if (cercato && !normalizza(`${controparte} ${p.descrizione} ${p.protocollo ?? ''}`).includes(cercato)) continue;
    if (!gruppi.has(controparte)) gruppi.set(controparte, { controparte, totale: 0, partite: [] });
    const g = gruppi.get(controparte);
    g.partite.push(p);
    g.totale += importo;
    totale += importo;
  }
  const perNome = (a, b) => Number(a.controparte === SENZA_CONTROPARTE) - Number(b.controparte === SENZA_CONTROPARTE)
    || a.controparte.localeCompare(b.controparte, 'it', { numeric: true });
  const ordini = {
    decrescente: (a, b) => Math.abs(b.totale) - Math.abs(a.totale) || perNome(a, b),
    crescente: (a, b) => Math.abs(a.totale) - Math.abs(b.totale) || perNome(a, b),
    nome: perNome,
  };
  return { gruppi: [...gruppi.values()].sort(ordini[ordine] ?? ordini.decrescente), totale, totaleComplessivo };
}

// Situazione patrimoniale di un esercizio: le voci dei due lati nell'ordine del rendiconto, i totali e la verifica.
// → { attivita: [{ voce, importo }], passivita, totaleAttivita, totalePassivita, differenza, quadra, vuota }
export function situazionePatrimoniale(righe, esercizioId) {
  const lato = (nome) => righe
    .filter((r) => r.esercizio_id === esercizioId && r.lato === nome)
    .sort((a, b) => a.ordine - b.ordine)
    .map((r) => ({ voce: r.voce, importo: inCentesimi(r.importo) }));
  const attivita = lato('attivita');
  const passivita = lato('passivita');
  const somma = (voci) => voci.reduce((s, v) => s + v.importo, 0);
  const vuota = !attivita.length && !passivita.length;
  const differenza = somma(attivita) - somma(passivita);
  return { attivita, passivita, totaleAttivita: somma(attivita), totalePassivita: somma(passivita), differenza, quadra: !vuota && differenza === 0, vuota };
}
