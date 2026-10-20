// Trasforma i CSV puliti in blocchi di testo compatti da caricare nelle tabelle di appoggio del database.
// Ogni blocco ha un'impronta md5: il caricamento la ricontrolla lato database prima di inserire.
// Uso: node scripts/import/prepara_carico.js <cartella puliti> <cartella carico>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [dirIn, dirOut] = process.argv.slice(2);
if (!dirIn || !dirOut) throw new Error('uso: prepara_carico.js <puliti> <carico>');
fs.mkdirSync(dirOut, { recursive: true });

const leggi = (file) => {
  const [testa, ...righe] = fs.readFileSync(path.join(dirIn, file), 'utf8').trim().split(/\r?\n/);
  const campi = testa.split(';');
  return righe.filter(Boolean).map((r) => Object.fromEntries(r.split(';').map((v, i) => [campi[i], v])));
};
const SEP = '|';
const riga = (...valori) => {
  for (const v of valori) if (String(v ?? '').includes(SEP)) throw new Error(`il valore contiene "${SEP}": ${v}`);
  return valori.map((v) => v ?? '').join(SEP);
};
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
  parti.forEach((p, i) => {
    const testo = p.join('\n');
    if (testo.includes('$p$')) throw new Error('il testo contiene il delimitatore $p$');
    const file = `${nome}${parti.length > 1 ? `_${i + 1}` : ''}.txt`;
    fs.writeFileSync(path.join(dirOut, file), testo, 'utf8');
    blocchi.push({ file, tabella: nome, righe: p.length, caratteri: testo.length, md5: crypto.createHash('md5').update(testo, 'utf8').digest('hex') });
  });
};

const soggetti = leggi('soggetti.csv');
const conti = leggi('conti.csv');
const indiceConto = new Map(conti.map((c, i) => [`${c.gruppo} / ${c.sottoconto}`, i + 1]));
const ruoloDi = new Map();
const titolarita = leggi('titolarita.csv');

scrivi('unita', leggi('unita.csv').map((u) => riga(u.codice)));
scrivi('soggetti', soggetti.map((s) => riga(s.id, s.denominazione,
  [s.marcatore && `marcatore nel riparto: ${s.marcatore}`, s.nome_troncato && 'nome troncato nel riparto'].filter(Boolean).join(', '))));
scrivi('titolarita', titolarita.map((t) => riga(t.unita, t.soggetto_id, t.ruolo, t.dal, t.al)));
scrivi('tabelle', leggi('tabelle_millesimali.csv').map((t) => riga(t.chiave, t.nome, t.ambito, t.totale_dichiarato)));
scrivi('millesimi', leggi('millesimi.csv').map((m) => riga(m.unita, m.tabella, m.valore)));
scrivi('conti', conti.map((c, i) => riga(i + 1, c.gruppo, c.sottoconto, c.tabella)));
scrivi('fornitori', leggi('fornitori.csv').map((f) => riga(f.denominazione)));
scrivi('spese', leggi('spese.csv').map((s) => riga(s.esercizio.startsWith('2024') ? 'c' : 'p', indiceConto.get(`${s.gruppo} / ${s.sottoconto}`),
  s.protocollo, s.numero_fattura, s.descrizione, s.fornitore, s.data_fattura, s.data_pagamento, s.importo)));

// Una riga per riga del riparto: saldi 2024, saldi 2025 e le quattro rate.
// Le righe di posizioni.csv e rate.csv sono nello stesso ordine di titolarita.csv.
const posizioni = leggi('posizioni.csv');
const rate = leggi('rate.csv');
scrivi('posizioni', titolarita.map((t, i) => {
  const c = posizioni[2 * i];
  const p = posizioni[2 * i + 1];
  const r = rate.slice(4 * i, 4 * i + 4);
  if (c.unita !== t.unita || p.unita !== t.unita || r[0].unita !== t.unita || c.soggetto_id !== t.soggetto_id) throw new Error(`righe non allineate alla posizione ${i}`);
  const chiave = `${t.unita}/${t.soggetto_id}/${t.ruolo}`;
  if (ruoloDi.has(chiave)) throw new Error(`posizione doppia: ${chiave}`);
  ruoloDi.set(chiave, true);
  return riga(t.unita, t.soggetto_id, t.ruolo, c.totale_gestione, c.saldo_precedente, c.rate_versate, c.saldo_finale,
    p.totale_gestione, p.saldo_precedente, p.saldo_finale, ...r.map((x) => x.importo));
}));

fs.writeFileSync(path.join(dirOut, 'indice.json'), JSON.stringify(blocchi, null, 2));
console.table(blocchi.map(({ file, righe, caratteri, md5 }) => ({ file, righe, caratteri, md5 })));
console.log('totale caratteri', blocchi.reduce((s, b) => s + b.caratteri, 0));
