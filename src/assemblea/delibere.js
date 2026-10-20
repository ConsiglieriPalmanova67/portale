// Esiti dei punti all'ordine del giorno e registro delle delibere. Funzioni pure, senza rete né DOM.
//
// L'esito di un punto sta in punti_odg.esito e può avere due origini:
//   - una votazione registrata nel portale: l'oggetto prodotto da esitoVoto (conteggi e `approvato`),
//     valido solo a votazione chiusa (punti_odg.votato_il);
//   - una registrazione a mano, per le assemblee archiviate senza seduta: { manuale: true, approvato: true|false|null }
//     (null = non deliberata o rinviata). In questo caso non esistono conteggi e non se ne inventano.
import { normalizza } from '../ui/html.js';

export const ESITI = { approvata: 'Approvata', respinta: 'Respinta', non_deliberata: 'Non deliberata o rinviata', da_votare: 'Ancora da votare' };

export const esitoManuale = (approvato) => ({ manuale: true, approvato });

// → { stato: chiave di ESITI, manuale, conteggi } — conteggi è l'esito della votazione (favorevoli, contrari,
// astenuti, presenti: { teste, peso }) oppure null.
export function esitoPunto(punto) {
  const { esito } = punto;
  if (esito?.manuale) {
    return { stato: esito.approvato === true ? 'approvata' : esito.approvato === false ? 'respinta' : 'non_deliberata', manuale: true, conteggi: null };
  }
  if (punto.votato_il && esito) return { stato: esito.approvato ? 'approvata' : 'respinta', manuale: false, conteggi: esito };
  return { stato: 'da_votare', manuale: false, conteggi: null };
}

export function contaEsiti(punti) {
  const conta = { approvata: 0, respinta: 0, non_deliberata: 0, da_votare: 0, manuali: 0 };
  for (const p of punti) {
    const e = esitoPunto(p);
    conta[e.stato] += 1;
    if (e.manuale) conta.manuali += 1;
  }
  return conta;
}

// Tutti i punti di tutte le assemblee, dall'assemblea più recente; dentro un'assemblea nell'ordine del giorno.
// → [{ assemblea, punto, numero, anno, stato, manuale, conteggi, delibera, todo: [to-do nati dal punto] }]
export function registroDelibere({ assemblee, punti, todo }) {
  const todoPerPunto = new Map();
  for (const t of todo) {
    if (!t.punto_id) continue;
    if (!todoPerPunto.has(t.punto_id)) todoPerPunto.set(t.punto_id, []);
    todoPerPunto.get(t.punto_id).push(t);
  }
  return [...assemblee]
    .sort((a, b) => (a.data === b.data ? 0 : a.data < b.data ? 1 : -1))
    .flatMap((assemblea) => punti
      .filter((p) => p.assemblea_id === assemblea.id)
      .sort((a, b) => a.ordine - b.ordine)
      .map((punto, i) => ({
        assemblea, punto, numero: i + 1, anno: Number(String(assemblea.data).slice(0, 4)),
        ...esitoPunto(punto), delibera: punto.note ?? '', todo: todoPerPunto.get(punto.id) ?? [],
      })));
}

// filtri: testo (cercato nel testo del punto e della delibera), anno, esito (chiave di ESITI); quelli vuoti non filtrano.
export function filtraDelibere(righe, { testo = '', anno = '', esito = '' }) {
  const cercato = normalizza(testo.trim());
  return righe.filter((r) => (!cercato || normalizza(`${r.punto.testo} ${r.delibera}`).includes(cercato))
    && (!anno || r.anno === Number(anno))
    && (!esito || r.stato === esito));
}

// Punti di ogni anno: non sono "ripetizioni" da segnalare.
// (il rendiconto e il preventivo dell'esercizio, non quelli straordinari: «rendiconto sentenza Termocentro» va seguito)
const ORDINARI = [/rendicont\w* (consuntiv\w* )?esercizio/, /preventiv\w* esercizio/, /nomin[ae].*consiglier|consiglier.*nomin/, /nomin[ae].*amministrator|amministrator.*(nomin|conferm|emolument)/, /^varie|varie ed eventuali/, /revisor/];
export const puntoOrdinario = (testo) => ORDINARI.some((r) => r.test(normalizza(testo)));

// Parole che contano in un titolo: senza articoli e preposizioni, e senza le parole generiche delle pratiche
// ("progetto", "incarico", "relazione del tecnico", "delibere in merito"), che da sole non dicono di che cosa si parla.
const VUOTE = new Set(['delle', 'della', 'dello', 'degli', 'dei', 'del', 'dal', 'dai', 'nel', 'nella', 'nei', 'con', 'per', 'tra', 'fra', 'sul', 'sulla', 'alla', 'alle',
  'agli', 'all', 'che', 'una', 'uno', 'gli', 'non', 'piu', 'come', 'loro', 'parte', 'seguito', 'delibere', 'delibera', 'merito', 'eventuale', 'eventuali',
  'relativa', 'relative', 'relativo', 'approvazione', 'esame', 'discussione', 'progetto', 'progettazione', 'relazione', 'tecnico', 'incaricato', 'incarico',
  'aggiornamento', 'pratica', 'opere', 'valutazione', 'valutazioni', 'professionista', 'intervento', 'interventi', 'lavori', 'ratifica', 'proposta']);
const parole = (testo) => new Set(normalizza(testo).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !VUOTE.has(p) && !/^\d+$/.test(p)).map((p) => p.slice(0, 7)));

// Due titoli parlano della stessa cosa se almeno metà delle parole che contano (del più corto) sono comuni, e almeno due.
export function stessoArgomento(a, b) {
  const [x, y] = [parole(a), parole(b)];
  const comuni = [...x].filter((p) => y.has(p)).length;
  const corto = Math.min(x.size, y.size);
  // un titolo con una sola parola che conta (per esempio «Progetto CIS») basta che la ritrovi
  return corto > 0 && comuni >= Math.min(2, corto) && comuni / corto >= 0.5;
}

// Per ogni punto di un'assemblea tenuta, i punti dello stesso argomento nelle assemblee tenute prima.
// Si escludono le sedute deserte o rinviate, i punti ordinari e quelli segnati a mano come nuovi.
// righe: quelle di registroDelibere. → Map id del punto → [righe precedenti, dalla più recente]
export function ricorrenze(righe) {
  const valide = righe.filter((r) => !r.assemblea.esito_seduta && !puntoOrdinario(r.punto.testo));
  const esito = new Map();
  for (const r of valide) {
    if (r.punto.non_ricorrente) continue;
    const prima = valide.filter((x) => x.assemblea.data < r.assemblea.data && stessoArgomento(x.punto.testo, r.punto.testo));
    if (prima.length) esito.set(r.punto.id, prima);
  }
  return esito;
}
