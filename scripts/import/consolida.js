// Unisce i CSV grezzi trascritti dal PDF (uno per pagina) nei file puliti da caricare nel database.
// Uso: node scripts/import/consolida.js <cartella grezzi> <cartella puliti>
// I dati restano fuori dal repository: qui c'è solo la logica.
import fs from 'node:fs';
import path from 'node:path';

const [dirIn, dirOut] = process.argv.slice(2);
if (!dirIn || !dirOut) throw new Error('uso: consolida.js <grezzi> <puliti>');
fs.mkdirSync(dirOut, { recursive: true });

const leggi = (file) => {
  const [testa, ...righe] = fs.readFileSync(path.join(dirIn, file), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const campi = testa.split(';');
  return righe.filter(Boolean).map((r) => Object.fromEntries(r.split(';').map((v, i) => [campi[i], v])));
};
const pagine = (da, a, suffisso) => {
  const out = [];
  for (let p = da; p <= a; p++) out.push(...leggi(`p${String(p).padStart(2, '0')}_${suffisso}.csv`));
  return out;
};
const scrivi = (file, campi, righe) => {
  const testo = [campi.join(';'), ...righe.map((r) => campi.map((c) => r[c] ?? '').join(';'))].join('\n') + '\n';
  fs.writeFileSync(path.join(dirOut, file), testo, 'utf8');
  return righe.length;
};
const soloDati = (righe) => righe.filter((r) => !['ARROT', 'TOTALE'].includes(r.codice));
// "44" è stampato senza A, "A109 .2" con uno spazio
const codiceUnita = (c) => c.replace(/\s+/g, '').replace(/^(\d)/, 'A$1');
const cent = (x) => (x === '' || x === undefined ? 0 : Math.round(parseFloat(x) * 100));
const euro = (c) => (c / 100).toFixed(2);
const giorno = (iso, delta) => new Date(Date.parse(`${iso}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);

// ---- Riparti: quattro sezioni con le stesse righe nello stesso ordine ----
const C1 = soloDati(pagine(29, 35, 'riparto'));
const C2 = soloDati(pagine(36, 42, 'riparto'));
const P1 = soloDati(pagine(45, 51, 'riparto'));
const P2 = soloDati(pagine(52, 58, 'riparto'));
for (const [nome, sez] of [['C2', C2], ['P1', P1], ['P2', P2]]) {
  if (sez.length !== C1.length) throw new Error(`sezione ${nome}: ${sez.length} righe invece di ${C1.length}`);
  sez.forEach((r, i) => {
    if (codiceUnita(r.codice) !== codiceUnita(C1[i].codice)) throw new Error(`sezione ${nome} riga ${i}: codice ${r.codice} invece di ${C1[i].codice}`);
  });
}

// ---- Soggetti: il preventivo riporta i nomi completi, il consuntivo quelli abbreviati ----
const pulisciNome = (grezzo) => {
  const marcatore = (grezzo.match(/\*+/) || [''])[0];
  let nome = grezzo.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
  const troncato = /[\/-]$/.test(nome);
  nome = nome.replace(/\s*[\/-]$/, '').trim();
  return { nome, marcatore, troncato };
};
const soggetti = new Map();
const soggettoDi = (grezzo, unita) => {
  const { nome, marcatore, troncato } = pulisciNome(grezzo);
  if (!soggetti.has(nome)) {
    soggetti.set(nome, { id: `S${String(soggetti.size + 1).padStart(3, '0')}`, denominazione: nome, marcatori: new Set(), nome_troncato: false, grafie: new Set(), unita: new Set() });
  }
  const s = soggetti.get(nome);
  if (marcatore) s.marcatori.add(marcatore);
  if (troncato) s.nome_troncato = true;
  s.grafie.add(grezzo);
  s.unita.add(unita);
  return s.id;
};

// ---- Unità, titolarità, posizioni, rate ----
const SCADENZE = ['2025-01-20', '2025-04-22', '2025-07-10', '2025-10-10'];
const unita = new Set();
const titolarita = [];
const posizioni = [];
const rate = [];
const exPerUnita = new Map();

C1.forEach((r, i) => {
  const u = codiceUnita(r.codice);
  unita.add(u);
  const id = soggettoDi(P1[i].intestatario, u);
  const titolo = r.titolo.replace(/\s+/g, ' ').trim();
  const gg = Number((titolo.match(/(\d+) gg/) || [])[1] || 0);
  let ruolo = 'proprietario';
  let dal = '';
  let al = '';
  let stimata = '';
  if (titolo === 'Co') ruolo = 'conduttore';
  else if (titolo === 'As') ruolo = 'assegnatario';
  else if (titolo.startsWith('ex')) {
    if (!exPerUnita.has(u)) exPerUnita.set(u, []);
    exPerUnita.get(u).push({ indice: titolarita.length, gg });
    stimata = 'si';
  } else if (gg) {
    dal = giorno('2025-01-01', -gg);
    stimata = 'si';
  }
  titolarita.push({ unita: u, soggetto_id: id, ruolo, dal, al, titolo_stampato: titolo, date_stimate: stimata });

  posizioni.push({ esercizio: '2024 consuntivo', unita: u, soggetto_id: id, totale_gestione: C2[i].totale_gestione, saldo_precedente: C2[i].saldo_prec, rate_versate: C2[i].rate_versate, saldo_finale: C2[i].saldo_finale });
  posizioni.push({ esercizio: '2025 preventivo', unita: u, soggetto_id: id, totale_gestione: P2[i].totale_gestione, saldo_precedente: P2[i].saldo_prec, rate_versate: '', saldo_finale: P2[i].totale });
  SCADENZE.forEach((scadenza, n) => rate.push({ esercizio: '2025 preventivo', unita: u, soggetto_id: id, numero: n + 1, scadenza, importo: P2[i][`rata${n + 1}`] }));
});

// Ex proprietari: periodi ricostruiti dai giorni di possesso nel 2024, in sequenza dal 1° gennaio.
// Con due ex sulla stessa unità si assume per primo quello con meno giorni.
for (const ex of exPerUnita.values()) {
  let inizio = '2024-01-01';
  for (const e of [...ex].sort((a, b) => a.gg - b.gg)) {
    const t = titolarita[e.indice];
    if (!e.gg) continue;
    t.dal = inizio === '2024-01-01' ? '' : inizio;
    t.al = giorno(inizio, e.gg - 1);
    inizio = giorno(t.al, 1);
  }
}

// ---- Millesimi ----
const TABELLE = [
  ['t1', '1 - Spese generali', 'condominio', C1, 't1_mill'],
  ['t2', '2 - Ascensore Scala A', 'Scala A', C1, 't2_mill'],
  ['t3', '3 - Riscaldamento', 'condominio', C1, 't3_mill'],
  ['t4', '4 - Proprietà', 'condominio', C1, 't4_mill'],
  ['t5', '5 - Ascensore Scala C', 'Scala C', C1, 't5_mill'],
  ['t6', '6 - Spese generali Condominio B', 'Condominio B', C1, 't6_mill'],
  ['t7', '7 - Spese generali Torre 1', 'Torre 1', C1, 't7_mill'],
  ['t8', '8 - Spese generali Torre 2', 'Torre 2', C1, 't8_mill'],
  ['t9', '9 - Spese generali Torre 3', 'Torre 3', C2, 't9_mill'],
  ['t10', '10 - TV citofoni Torre 1', 'Torre 1', P2, 't10_mill'],
  ['t11', '11 - TV citofoni Torre 3', 'Torre 3', P2, 't11_mill'],
  ['risc_consumi', '3 - Riscaldamento solo consumi', 'condominio', C2, 'risc_consumi_mill'],
  ['cond_c', 'Condominio C', 'Condominio C', C2, 'cond_c_mill'],
];
const millesimi = [];
const tabelle = [];
for (const [chiave, nome, ambito, sezione, campo] of TABELLE) {
  const perUnita = new Map();
  for (const r of sezione) {
    if (r[campo] === '' || r[campo] === undefined) continue;
    const u = codiceUnita(r.codice);
    perUnita.set(u, (perUnita.get(u) || 0) + Math.round(parseFloat(r[campo]) * 1000));
  }
  let totale = 0;
  for (const [u, v] of perUnita) {
    totale += v;
    if (v > 0) millesimi.push({ unita: u, tabella: chiave, valore: (v / 1000).toFixed(3) });
  }
  tabelle.push({ chiave, nome, ambito, totale_dichiarato: (totale / 1000).toFixed(3), unita_con_millesimi: [...perUnita.values()].filter((v) => v > 0).length });
}

// ---- Contabilità ----
const TABELLA_DEL_GRUPPO = [
  [/^SPESE PROPRIETA/i, 't4'], [/^SPESE GENERALI$/i, 't1'], [/^RISCALDAMENTO$/i, 't3'], [/^RISCALDAMENTO SOLO CONSUMI/i, 'risc_consumi'],
  [/CONDOMINIO B/i, 't6'], [/^SPESE GENERALI TORRE 1/i, 't7'], [/^SPESE GENERALI TORRE 2/i, 't8'], [/^SPESE GENERALI TORRE 3/i, 't9'],
  [/SCALA A/i, 't2'], [/SCALA C/i, 't5'], [/^CONDOMINIO C/i, 'cond_c'], [/CITOFONI TORRE 1/i, 't10'], [/CITOFONI TORRE 3/i, 't11'],
];
const tabellaDi = (gruppo) => (TABELLA_DEL_GRUPPO.find(([re]) => re.test(gruppo)) || [null, ''])[1];
const conti = new Map();
const conto = (gruppo, sottoconto) => {
  const k = `${gruppo} / ${sottoconto}`;
  if (!conti.has(k)) conti.set(k, { gruppo, sottoconto, tabella: tabellaDi(gruppo) });
};
const fornitori = new Set();
const spese = pagine(2, 28, 'spese').map((s) => {
  conto(s.gruppo, s.sottoconto);
  if (s.fornitore) fornitori.add(s.fornitore);
  return { esercizio: '2024 consuntivo', gruppo: s.gruppo, sottoconto: s.sottoconto, protocollo: s.protocollo, numero_fattura: s.fattura, descrizione: s.descrizione, fornitore: s.fornitore, data_fattura: s.data_fattura, data_pagamento: s.data_pagamento, importo: s.importo, pagina_pdf: s.pagina };
});
const preventivo = pagine(43, 44, 'preventivo').map((v) => {
  conto(v.gruppo, v.voce);
  return { esercizio: '2025 preventivo', gruppo: v.gruppo, sottoconto: v.voce, descrizione: v.voce, importo: v.importo, pagina_pdf: v.pagina };
});

// ---- Scrittura ----
const conteggi = {
  unita: scrivi('unita.csv', ['codice'], [...unita].map((codice) => ({ codice }))),
  soggetti: scrivi('soggetti.csv', ['id', 'denominazione', 'marcatore', 'nome_troncato', 'grafie_nel_documento', 'unita'],
    [...soggetti.values()].map((s) => ({ id: s.id, denominazione: s.denominazione, marcatore: [...s.marcatori].join(' '), nome_troncato: s.nome_troncato ? 'si' : '', grafie_nel_documento: [...s.grafie].join(' | '), unita: [...s.unita].join(' ') }))),
  titolarita: scrivi('titolarita.csv', ['unita', 'soggetto_id', 'ruolo', 'dal', 'al', 'titolo_stampato', 'date_stimate'], titolarita),
  tabelle_millesimali: scrivi('tabelle_millesimali.csv', ['chiave', 'nome', 'ambito', 'totale_dichiarato', 'unita_con_millesimi'], tabelle),
  millesimi: scrivi('millesimi.csv', ['unita', 'tabella', 'valore'], millesimi),
  conti: scrivi('conti.csv', ['gruppo', 'sottoconto', 'tabella'], [...conti.values()]),
  fornitori: scrivi('fornitori.csv', ['denominazione'], [...fornitori].sort().map((denominazione) => ({ denominazione }))),
  spese: scrivi('spese.csv', ['esercizio', 'gruppo', 'sottoconto', 'protocollo', 'numero_fattura', 'descrizione', 'fornitore', 'data_fattura', 'data_pagamento', 'importo', 'pagina_pdf'], [...spese, ...preventivo]),
  posizioni: scrivi('posizioni.csv', ['esercizio', 'unita', 'soggetto_id', 'totale_gestione', 'saldo_precedente', 'rate_versate', 'saldo_finale'], posizioni),
  rate: scrivi('rate.csv', ['esercizio', 'unita', 'soggetto_id', 'numero', 'scadenza', 'importo'], rate),
};

const somma = (righe, campo) => euro(righe.reduce((s, r) => s + cent(r[campo]), 0));
console.log(conteggi);
console.log('spese 2024:', somma(spese, 'importo'), '| preventivo 2025:', somma(preventivo, 'importo'));
console.log('posizioni 2024, saldo finale:', somma(posizioni.filter((p) => p.esercizio.startsWith('2024')), 'saldo_finale'));
console.log('rate 2025:', somma(rate, 'importo'));
console.table(tabelle);
