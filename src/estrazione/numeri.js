// Dai valori trascritti dal PDF (testo, come stampati: "-1.250,00", "(0,412)", "15/03/2025") ai numeri.
// Funzioni pure. Un valore vuoto o illeggibile diventa null: "non c'è" è diverso da zero.

// "-1.250,00" → -1250; "0,412" → 0.412; "12,00-" → -12; accetta anche i numeri già tali e la forma "1234.56".
export function numero(valore) {
  if (typeof valore === 'number') return Number.isFinite(valore) ? valore : null;
  let testo = String(valore ?? '').replace(/[\s€()]/g, '').replace(/[−–]/g, '-');
  if (!testo) return null;
  // segno meno in coda, come in certi tabulati
  if (/^[\d.,]+-$/.test(testo)) testo = `-${testo.slice(0, -1)}`;
  if (testo.includes(',')) testo = testo.replace(/\./g, '').replace(',', '.');
  else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(testo)) testo = testo.replace(/\./g, '');
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(testo) ? Number(testo) : null;
}

// Importo in centesimi interi (null se manca).
export const centesimi = (valore) => {
  const n = numero(valore);
  return n === null ? null : Math.round(n * 100);
};
// Millesimi × 1000, interi (null se mancano).
export const millesimiInteri = (valore) => {
  const n = numero(valore);
  return n === null ? null : Math.round(n * 1000);
};
// Quante cifre decimali sono stampate: serve a sapere quanto è arrotondato un millesimo.
export function decimali(valore) {
  const testo = String(valore ?? '').replace(/[\s()]/g, '');
  const separatore = testo.includes(',') ? ',' : '.';
  const posizione = testo.lastIndexOf(separatore);
  return posizione < 0 ? 0 : testo.length - posizione - 1;
}

// Centesimi → "1234.56", la forma che va nel database.
export const inEuro = (cent) => (cent === null || cent === undefined ? null : (cent / 100).toFixed(2));
// Centesimi → "1.234,56" per i messaggi.
const fmt = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
export const leggibile = (cent) => (cent === null || cent === undefined ? '—' : fmt.format(cent / 100));

// "19/05/2025" o "19.05.25" → "2025-05-19"; una data già ISO resta com'è; il resto diventa null.
export function dataIso(valore) {
  const testo = String(valore ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(testo)) return testo;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(testo);
  if (!m) return null;
  const [giorno, mese] = [Number(m[1]), Number(m[2])];
  const anno = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

// Per confrontare nomi e titoli: minuscole, senza accenti, senza segni, spazi singoli.
export const piatto = (testo) => String(testo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
