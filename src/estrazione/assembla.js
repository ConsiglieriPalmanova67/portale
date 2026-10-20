// Dai blocchi letti (uno per gruppo di pagine) ai dati del fascicolo in un'unica struttura.
// Funzioni pure. I valori restano testo, come stampati: li interpretano i controlli e l'importazione.
// Ogni dato porta con sé `origine`, "sezione:pagina|percorso" dentro il blocco da cui viene: è la chiave
// con cui si salvano le correzioni fatte a mano (estrazioni.correzioni.celle) senza toccare i dati letti.
import { chiaveBlocco } from './blocchi.js';
import { piatto, centesimi } from './numeri.js';

const copia = (valore) => structuredClone(valore);
const elenco = (valore) => (Array.isArray(valore) ? valore : []);
const testo = (valore) => String(valore ?? '').replace(/\s+/g, ' ').trim();

// Scrive `valore` nel punto `percorso` ("voci.3.importo") di un oggetto; i pezzi mancanti non si creano.
function scriviIn(oggetto, percorso, valore) {
  const passi = percorso.split('.');
  let punto = oggetto;
  for (const passo of passi.slice(0, -1)) {
    punto = punto?.[passo];
    if (punto === null || typeof punto !== 'object') return false;
  }
  punto[passi.at(-1)] = valore;
  return true;
}
export function leggiIn(oggetto, percorso) {
  return percorso.split('.').reduce((punto, passo) => (punto === null || punto === undefined ? undefined : punto[passo]), oggetto);
}

// I blocchi con le correzioni applicate (copie: gli originali non cambiano).
// celle = { "sezione:pagina|percorso": valore }
export function applicaCorrezioni(blocchi, celle = {}) {
  const perBlocco = new Map();
  for (const [chiave, valore] of Object.entries(celle ?? {})) {
    const [blocco, percorso] = chiave.split('|');
    if (!perBlocco.has(blocco)) perBlocco.set(blocco, []);
    perBlocco.get(blocco).push([percorso, valore]);
  }
  return blocchi.map((b) => {
    const modifiche = perBlocco.get(chiaveBlocco(b));
    if (!modifiche || !b.dati) return b;
    const dati = copia(b.dati);
    for (const [percorso, valore] of modifiche) scriviIn(dati, percorso, valore);
    return { ...b, dati };
  });
}

// "44" è stampato senza A; "A109 .2" e "A109" + ".2 NOME" sono l'unità A109.2.
export function normalizzaCodice(codice, intestatario = '') {
  let pulito = String(codice ?? '').replace(/\s+/g, '').toUpperCase();
  let nome = testo(intestatario);
  const coda = /^\.(\d+)\s+/.exec(nome);
  if (coda && pulito) {
    pulito += `.${coda[1]}`;
    nome = nome.slice(coda[0].length);
  }
  if (/^\d/.test(pulito)) pulito = `A${pulito}`;
  return { codice: pulito, intestatario: nome };
}

// Ruolo di una colonna del riparto, dal titolo: le tabelle millesimali non ne hanno.
const RUOLI = [
  ['totale_gestione', /totale\s+(di\s+)?gestione/],
  ['saldo_precedente', /sald[oi].*(prec|es\b)/],
  ['rate_versate', /(rate|versament[oi]).*(versat|pagat|incass)|^versamenti$|^rate versate$/],
  ['saldo_finale', /saldo\s+(finale|a\s+(debito|credito)|di\s+fine\s+esercizio$)|^saldo$/],
  ['movimenti_personali', /moviment[oi]\s+personal|spese\s+personal|addebiti\s+personal/],
];
export const RUOLI_COLONNA = { tabella: 'Tabella millesimale', movimenti_personali: 'Movimenti personali', totale_gestione: 'Totale gestione', saldo_precedente: 'Saldo precedente', rate_versate: 'Rate versate', saldo_finale: 'Saldo finale', altro: 'Altra colonna (non usata)' };
export function ruoloColonna(titolo, haMillesimi) {
  const t = piatto(titolo);
  return RUOLI.find(([, modello]) => modello.test(t))?.[0] ?? (haMillesimi || /^\d+\s/.test(t) ? 'tabella' : 'altro');
}
const chiaveColonna = (titolo) => piatto(titolo).replace(/ /g, '_') || 'colonna';

const inOrdine = (blocchi, sezione) => blocchi.filter((b) => b.sezione === sezione && b.stato === 'fatto' && b.dati)
  .sort((a, b) => a.pagina_da - b.pagina_da);
// La pagina di contesto non va trascritta: se qualcosa di quella pagina arriva lo stesso, si scarta.
const delBlocco = (b) => (r) => !Number(r.pagina) || Number(r.pagina) >= b.pagina_da;

function assemblaSpese(blocchi) {
  const voci = [];
  const totali = [];
  for (const b of blocchi) {
    const chiave = chiaveBlocco(b);
    unisciSeguito(voci, b);
    elenco(b.dati.voci).forEach((v, i) => delBlocco(b)(v) && voci.push({ ...v, descrizione: conIntestatario(v), origine: `${chiave}|voci.${i}` }));
    elenco(b.dati.totali).forEach((t, i) => delBlocco(b)(t) && totali.push({ ...t, origine: `${chiave}|totali.${i}` }));
  }
  completaTitoli(voci, totali);
  return { voci, totali };
}

// Nelle spese personali la riga del protocollo comincia con l'unità e il nome a cui la spesa è addebitata
// ("A21 ROSSI MARIO - protocollo: P9"): si tengono in testa alla descrizione.
function conIntestatario(v) {
  const chi = testo(v.intestato_a);
  return chi && !piatto(v.descrizione).startsWith(piatto(chi)) ? `${chi} - ${testo(v.descrizione)}` : v.descrizione;
}

// Una voce cominciata in fondo all'ultima pagina di un blocco prosegue nella prima del blocco dopo: chi legge
// il blocco dopo ne riporta il resto in "seguito", e qui lo si riattacca all'ultima voce già raccolta.
function unisciSeguito(voci, b) {
  const s = b.dati.seguito;
  const ultima = voci.at(-1);
  if (!s || !ultima || !['descrizione', 'fornitore', 'data_fattura', 'data_pagamento'].some((c) => testo(s[c]))) return;
  if (testo(s.protocollo) && piatto(s.protocollo) !== piatto(ultima.protocollo)) return;
  if (testo(s.descrizione)) ultima.descrizione = `${testo(ultima.descrizione)} ${testo(s.descrizione)}`.trim();
  for (const c of ['fornitore', 'data_fattura', 'data_pagamento']) if (!testo(ultima[c]) && testo(s[c])) ultima[c] = testo(s[c]);
  ultima.seguito_da = chiaveBlocco(b);
}

// Gruppo e sottoconto sono stampati una volta sola, dove cominciano: nelle pagine successive il lettore
// non li vede e li lascia vuoti. Le voci sono in ordine, quindi valgono gli ultimi titoli incontrati.
// Un parziale o un totale senza titolo va al sottoconto (o al gruppo) ancora senza il suo che ha quella somma.
function completaTitoli(voci, totali) {
  let gruppo = '';
  let sottoconto = '';
  for (const v of voci) {
    if (testo(v.gruppo) && piatto(v.gruppo) !== piatto(gruppo)) { gruppo = testo(v.gruppo); if (!testo(v.sottoconto)) sottoconto = ''; }
    if (testo(v.sottoconto)) sottoconto = testo(v.sottoconto);
    if (!testo(v.gruppo) && gruppo) { v.gruppo = gruppo; v.titoli_dedotti = true; }
    if (!testo(v.sottoconto) && sottoconto) { v.sottoconto = sottoconto; v.titoli_dedotti = true; }
  }
  const somme = (chiaveDi) => {
    const m = new Map();
    for (const v of voci) {
      const k = chiaveDi(v);
      const c = centesimi(v.importo);
      if (!m.has(k)) m.set(k, { gruppo: testo(v.gruppo), sottoconto: testo(v.sottoconto), somma: 0 });
      if (c !== null) m.get(k).somma += c;
    }
    return m;
  };
  const completa = (tipo, chiaveDi, haTitolo, assegna) => {
    const candidati = somme(chiaveDi);
    for (const t of totali) if (t.tipo === tipo && haTitolo(t)) candidati.delete(chiaveDi(t));
    for (const t of totali) {
      if (t.tipo !== tipo || haTitolo(t)) continue;
      const trovato = [...candidati.entries()].find(([, c]) => c.somma === centesimi(t.importo));
      if (!trovato) continue;
      assegna(t, trovato[1]);
      t.titoli_dedotti = true;
      candidati.delete(trovato[0]);
    }
  };
  const chiaveSottoconto = (x) => `${piatto(x.gruppo)}|${piatto(x.sottoconto)}`;
  completa('parziale_sottoconto', chiaveSottoconto, (t) => testo(t.gruppo) && testo(t.sottoconto), (t, c) => { t.gruppo = c.gruppo; t.sottoconto = c.sottoconto; });
  completa('totale_gruppo', (x) => piatto(x.gruppo), (t) => testo(t.gruppo), (t, c) => { t.gruppo = c.gruppo; });
}

const SPECIALI = [['arrotondamenti', /^arrot/], ['totale', /^total/]];
const rigaSpeciale = (r) => SPECIALI.find(([, modello]) => modello.test(piatto(r.codice)) || (!testo(r.codice) && modello.test(piatto(r.intestatario))))?.[0] ?? null;

// Una parte del riparto: più blocchi consecutivi con le stesse colonne.
function assemblaParte(numero, blocchi, chiaviUsate, ruoliScelti) {
  const colonne = [];
  const parte = { parte: numero, colonne: [], righe: [], arrotondamenti: {}, totale: {}, colonneDiverse: [] };
  blocchi.forEach((b, indiceBlocco) => {
    const chiave = chiaveBlocco(b);
    // indice della colonna nel blocco (da 1) → chiave della colonna nella parte
    const diQuesto = elenco(b.dati.colonne).map((c) => {
      let k = chiaveColonna(c.titolo);
      if (chiaviUsate.has(k) && chiaviUsate.get(k) !== numero) k = `${k}_p${numero}`;
      if (!colonne.some((x) => x.chiave === k)) {
        if (indiceBlocco > 0) parte.colonneDiverse.push({ pagina: b.pagina_da, titolo: testo(c.titolo) });
        chiaviUsate.set(k, numero);
        colonne.push({ chiave: k, titolo: testo(c.titolo), millesimi: Boolean(c.millesimi), ruolo: ruoliScelti[k] ?? ruoloColonna(c.titolo, Boolean(c.millesimi)), parte: numero });
      }
      return k;
    });
    const celle = (lista, percorso) => Object.fromEntries(elenco(lista).filter((c) => diQuesto[Number(c.colonna) - 1])
      .map((c) => [diQuesto[Number(c.colonna) - 1], { importo: c.importo ?? '', millesimi: c.millesimi ?? '', origine: `${chiave}|${percorso}.${elenco(lista).indexOf(c)}` }]));
    elenco(b.dati.righe).forEach((r, i) => {
      const speciale = rigaSpeciale(r);
      if (speciale) Object.assign(parte[speciale], celle(r.celle, `righe.${i}.celle`));
      else {
        const { codice, intestatario } = normalizzaCodice(r.codice, r.intestatario);
        parte.righe.push({ origine: `${chiave}|righe.${i}`, pagina: Number(r.pagina) || b.pagina_da, codice, codiceStampato: testo(r.codice), intestatario, etichetta: testo(r.etichetta), celle: celle(r.celle, `righe.${i}.celle`) });
      }
    });
    Object.assign(parte.arrotondamenti, celle(b.dati.arrotondamenti, 'arrotondamenti'));
    Object.assign(parte.totale, celle(b.dati.totale, 'totale'));
  });
  parte.colonne = colonne.map((c) => c.chiave);
  return { parte, colonne };
}

// Le parti unite in una riga per unità. Se tutte hanno la stessa sequenza di codici si uniscono per posizione
// (regge anche più righe con lo stesso codice); altrimenti per codice e numero d'ordine tra le righe con quel codice.
function unisciParti(parti) {
  const conOccorrenza = (righe) => {
    const visti = new Map();
    return righe.map((r) => {
      const n = (visti.get(r.codice) ?? 0) + 1;
      visti.set(r.codice, n);
      return { ...r, n };
    });
  };
  const liste = parti.map((p) => conOccorrenza(p.righe));
  const allineate = liste.every((l) => l.length === liste[0].length && l.every((r, i) => r.codice === liste[0][i].codice));
  const unite = [];
  const perChiave = new Map();
  liste.forEach((lista, indiceParte) => lista.forEach((r, i) => {
    const chiave = allineate ? i : `${r.codice}#${r.n}`;
    if (!perChiave.has(chiave)) {
      const nuova = { codice: r.codice, n: r.n, intestatario: r.intestatario, etichetta: r.etichetta, pagina: r.pagina, origine: r.origine, valori: {}, parti: [] };
      perChiave.set(chiave, nuova);
      unite.push(nuova);
    }
    const unita = perChiave.get(chiave);
    unita.intestatario ||= r.intestatario;
    unita.etichetta ||= r.etichetta;
    unita.parti.push(parti[indiceParte].parte);
    Object.assign(unita.valori, r.celle);
  }));
  return unite;
}

function assemblaRiparto(blocchi, ruoliScelti = {}) {
  const numeri = [...new Set(blocchi.map((b) => b.parte ?? 1))].sort((a, b) => a - b);
  const chiaviUsate = new Map();
  const colonne = [];
  const parti = numeri.map((n) => {
    const fatta = assemblaParte(n, blocchi.filter((b) => (b.parte ?? 1) === n), chiaviUsate, ruoliScelti);
    colonne.push(...fatta.colonne);
    return fatta.parte;
  });
  return {
    colonne, parti, righe: unisciParti(parti),
    arrotondamenti: Object.assign({}, ...parti.map((p) => p.arrotondamenti)), totale: Object.assign({}, ...parti.map((p) => p.totale)),
  };
}

function assemblaPreventivo(blocchi) {
  const esito = { esercizio: '', gruppi: [], totale: '', origineTotale: null, riquadro: [] };
  for (const b of blocchi) {
    const chiave = chiaveBlocco(b);
    esito.esercizio ||= testo(b.dati.esercizio);
    elenco(b.dati.gruppi).forEach((g, i) => {
      const voci = elenco(g.voci).map((v, j) => ({ ...v, origine: `${chiave}|gruppi.${i}.voci.${j}` }));
      const ultimo = esito.gruppi.at(-1);
      // un gruppo a cavallo di due blocchi è lo stesso gruppo: il totale è stampato dove finisce
      if (ultimo && i === 0 && piatto(ultimo.gruppo) === piatto(g.gruppo) && !testo(ultimo.totale)) {
        ultimo.voci.push(...voci);
        ultimo.totale = g.totale ?? '';
        ultimo.origine = `${chiave}|gruppi.${i}`;
      } else esito.gruppi.push({ gruppo: testo(g.gruppo), totale: g.totale ?? '', origine: `${chiave}|gruppi.${i}`, voci });
    });
    if (testo(b.dati.totale)) Object.assign(esito, { totale: b.dati.totale, origineTotale: `${chiave}|totale` });
    esito.riquadro.push(...elenco(b.dati.riquadro).map((r, i) => ({ ...r, origine: `${chiave}|riquadro.${i}` })));
  }
  return esito;
}

function assemblaRaffronto(blocchi) {
  const esito = { colonne: [], righe: [] };
  for (const b of blocchi) {
    if (!esito.colonne.length) esito.colonne = elenco(b.dati.colonne).map(testo);
    esito.righe.push(...elenco(b.dati.righe).map((r, i) => ({ ...r, valori: elenco(r.valori), origine: `${chiaveBlocco(b)}|righe.${i}` })));
  }
  return esito;
}

// Nella situazione patrimoniale a volte un importo è spiegato da un dettaglio: alcune voci in una colonna interna
// seguite da una riga senza nome con la loro somma. Nel totale conta solo la somma: le voci del dettaglio si segnano
// (dettaglio: true) e la riga della somma prende come nome l'elenco del dettaglio.
function segnaDettagli(voci) {
  voci.forEach((v, i) => {
    if (testo(v.voce) || i < 2) return;
    const totale = centesimi(v.importo);
    if (totale === null) return;
    let somma = 0;
    for (let k = i - 1; k >= 0; k -= 1) {
      const sopra = voci[k];
      if (sopra.dettaglio || testo(sopra.gruppo) || centesimi(sopra.importo) === null) break;
      somma += centesimi(sopra.importo);
      if (somma === totale && i - k >= 2) {
        const dettaglio = voci.slice(k, i);
        dettaglio.forEach((d) => { d.dettaglio = true; });
        v.voce = `Dettaglio: ${dettaglio.map((d) => `${testo(d.voce)} ${testo(d.importo)}`).join('; ')}`;
        v.dalDettaglio = true;
        return;
      }
    }
  });
  return voci;
}

function assemblaPatrimoniale(blocchi) {
  const esito = { data: '', attivita: [], passivita: [], totale_attivita: '', totale_passivita: '', origine: null };
  for (const b of blocchi) {
    const chiave = chiaveBlocco(b);
    esito.data ||= testo(b.dati.data);
    for (const lato of ['attivita', 'passivita']) {
      esito[lato].push(...elenco(b.dati[lato]).map((v, i) => ({ ...v, origine: `${chiave}|${lato}.${i}` })));
      if (testo(b.dati[`totale_${lato}`])) Object.assign(esito, { [`totale_${lato}`]: b.dati[`totale_${lato}`], origine: chiave });
    }
  }
  segnaDettagli(esito.attivita);
  segnaDettagli(esito.passivita);
  return esito;
}

function assemblaPartite(blocchi) {
  const esito = { righe: [], totali: [] };
  for (const b of blocchi) {
    const chiave = chiaveBlocco(b);
    elenco(b.dati.righe).forEach((r, i) => delBlocco(b)(r) && esito.righe.push({ ...r, origine: `${chiave}|righe.${i}` }));
    esito.totali.push(...elenco(b.dati.totali).map((t, i) => ({ ...t, origine: `${chiave}|totali.${i}` })));
  }
  return esito;
}

const SEZIONI = { spese: assemblaSpese, preventivo: assemblaPreventivo, raffronto: assemblaRaffronto, patrimoniale: assemblaPatrimoniale, partite: assemblaPartite };

// blocchi: le righe di estrazioni_blocchi; correzioni: estrazioni.correzioni ({ celle, ruoli, accettati }).
// → { spese, riparto, preventivo, raffronto, patrimoniale, partite (null se la sezione non c'è), incerte, mancanti }
export function assembla(blocchi, correzioni = {}) {
  const corretti = applicaCorrezioni(blocchi, correzioni?.celle);
  const dati = { incerte: [], mancanti: blocchi.filter((b) => b.stato !== 'fatto').map(chiaveBlocco) };
  for (const [sezione, costruisci] of Object.entries(SEZIONI)) {
    const suoi = inOrdine(corretti, sezione);
    dati[sezione] = suoi.length ? costruisci(suoi) : null;
  }
  const riparto = inOrdine(corretti, 'riparto');
  dati.riparto = riparto.length ? assemblaRiparto(riparto, correzioni?.ruoli) : null;
  for (const b of corretti) {
    if (b.stato !== 'fatto' || !b.dati) continue;
    dati.incerte.push(...elenco(b.dati.incerte).map((x) => ({ sezione: b.sezione, blocco: chiaveBlocco(b), pagina: Number(x.pagina) || b.pagina_da, riga: testo(x.riga), campo: testo(x.campo), nota: testo(x.nota) })));
  }
  return dati;
}

// Le correzioni come elenco leggibile: cosa era stato letto e cosa è stato scritto a mano.
export function elencoCorrezioni(blocchi, celle = {}) {
  const perChiave = new Map(blocchi.map((b) => [chiaveBlocco(b), b]));
  return Object.entries(celle ?? {}).map(([chiave, valore]) => {
    const [blocco, percorso] = chiave.split('|');
    const b = perChiave.get(blocco);
    return { chiave, sezione: b?.sezione ?? blocco.split(':')[0], pagina: b?.pagina_da ?? null, percorso, letto: b?.dati ? leggiIn(b.dati, percorso) ?? '' : '', corretto: valore };
  });
}
