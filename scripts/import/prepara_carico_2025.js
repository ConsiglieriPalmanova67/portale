// Dal fascicolo 2025 trascritto (CSV grezzi, uno per pagina) ai blocchi di testo da caricare nelle tabelle di appoggio.
// Uso: node scripts/import/prepara_carico_2025.js <cartella grezzi 2025> <cartella carico>
// Ogni blocco ha un'impronta md5 che il caricamento ricontrolla lato database prima di inserire.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [dirIn, dirOut] = process.argv.slice(2);
if (!dirIn || !dirOut) throw new Error('uso: prepara_carico_2025.js <grezzi> <carico>');
fs.mkdirSync(dirOut, { recursive: true });

const leggi = (file) => {
  const [testa, ...righe] = fs.readFileSync(path.join(dirIn, file), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const campi = testa.split(';');
  return righe.filter(Boolean).map((r) => Object.fromEntries(r.split(';').map((v, i) => [campi[i], v])));
};
const pagine = (da, a, suffisso) => {
  const out = [];
  for (let p = da; p <= a; p++) out.push(...leggi(`p${String(p).padStart(2, '0')}_${suffisso}.csv`));
  return out;
};
const SEP = '|';
const riga = (...valori) => valori.map((v) => String(v ?? '').replaceAll(SEP, '/').trim()).join(SEP);
const MAX = 14000;
const blocchi = [];
const scrivi = (nome, righe) => {
  const parti = [[]];
  let lunghezza = 0;
  for (const r of righe) {
    if (lunghezza + r.length > MAX && parti.at(-1).length) { parti.push([]); lunghezza = 0; }
    parti.at(-1).push(r);
    lunghezza += r.length + 1;
  }
  let offset = 0;
  parti.forEach((p, i) => {
    const testo = p.join('\n');
    if (testo.includes('$p$')) throw new Error('il testo contiene il delimitatore $p$');
    const file = `${nome}${parti.length > 1 ? `_${i + 1}` : ''}.txt`;
    fs.writeFileSync(path.join(dirOut, file), testo, 'utf8');
    blocchi.push({ file, tabella: nome, righe: p.length, offset, caratteri: testo.length, md5: crypto.createHash('md5').update(testo, 'utf8').digest('hex') });
    offset += p.length;
  });
};

// "44" è stampato senza A; "A109" + ".2 NOME" è l'unità A109.2
const unita = (r) => {
  let codice = r.codice.replace(/\s+/g, '');
  const m = /^\.(\d)\s+/.exec(r.intestatario.trim());
  if (m) codice += `.${m[1]}`;
  return /^\d/.test(codice) ? `A${codice}` : codice;
};
const TIPI = { appartame: 'appartamento', box: 'box', negozio: 'negozio', 'posto au': 'posto auto', 'posto auto': 'posto auto', terrazzo: 'terrazzo', giardino: 'giardino', cantina: 'cantina', ufficio: 'ufficio', deposito: 'deposito' };
const tipoUnita = (stampato) => {
  const t = TIPI[stampato.trim().toLowerCase()];
  if (!t) throw new Error(`tipo di unità non previsto: "${stampato}"`);
  return t;
};
const soloUnita = (righe) => righe.filter((r) => !['ARROT', 'TOTALE'].includes(r.codice));

// Conti: consuntivo 2025 e preventivo 2026 condividono gruppi e sottoconti
const conti = [];
const indice = new Map();
const conto = (gruppo, sottoconto) => {
  const k = `${gruppo} / ${sottoconto}`;
  if (!indice.has(k)) { conti.push(riga(conti.length + 1, gruppo, sottoconto)); indice.set(k, conti.length); }
  return indice.get(k);
};
const spese = pagine(17, 45, 'spese').map((s) => riga('c', conto(s.gruppo, s.sottoconto), s.protocollo, s.fattura, s.descrizione, s.fornitore, s.data_fattura, s.data_pagamento, s.importo));
const preventivo = pagine(65, 66, 'preventivo').map((v) => riga('p', conto(v.gruppo, v.voce), '', '', v.voce, '', '', '', v.importo));

const parte2 = soloUnita(pagine(52, 57, 'riparto'));
const parte3 = soloUnita(pagine(58, 63, 'riparto'));
const posizioni = soloUnita(pagine(46, 51, 'riparto')).map((r, i) => {
  const u = unita(r);
  if (unita(parte2[i]) !== u || unita(parte3[i]) !== u) throw new Error(`riparto non allineato alla riga ${i}: ${u}`);
  return riga(u, tipoUnita(r.tipo), r.intestatario.replace(/^\.\d\s+/, ''), parte2[i].totale_gestione, parte2[i].saldo_prec, parte3[i].rate_versate, parte3[i].saldo_finale);
});

const patrimoniale = leggi('p05_patrimoniale.csv')
  .filter((v) => v.prospetto === 'situazione_patrimoniale' && Number(v.ordine) > 0)
  .map((v) => riga(v.lato, v.ordine, v.voce, v.importo));
const partite = pagine(10, 13, 'partite').map((p) => riga(/credit/i.test(p.sezione) ? 'credito' : 'debito', p.controparte, p.protocollo, p.descrizione, p.importo));

scrivi('conti25', conti);
scrivi('spese25', [...spese, ...preventivo]);
scrivi('posizioni25', posizioni);
scrivi('patrimoniale25', patrimoniale);
scrivi('partite25', partite);
fs.writeFileSync(path.join(dirOut, 'indice.json'), JSON.stringify(blocchi, null, 2));
console.table(blocchi);
