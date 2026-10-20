// Contatti e dati fiscali: pulizia e controllo prima di salvarli. Funzioni pure.
// Ogni controllo restituisce il valore pulito oppure lancia un Error con un messaggio da mostrare.
const vuoto = (v) => String(v ?? '').trim() === '';

// Uno o più indirizzi, separati da virgola, punto e virgola o spazio: si salvano separati da «, ».
export function email(valore) {
  if (vuoto(valore)) return null;
  const indirizzi = String(valore).split(/[\s,;]+/).filter(Boolean);
  for (const v of indirizzi) if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new Error(`«${v}» non sembra un indirizzo email.`);
  return [...new Set(indirizzi.map((v) => v.toLowerCase()))].join(', ');
}

// Telefono o cellulare: cifre, spazi, "+" iniziale; si tiene com'è scritto, senza spazi doppi.
export function telefono(valore) {
  if (vuoto(valore)) return null;
  const v = String(valore).trim().replace(/\s+/g, ' ');
  if (!/^\+?[\d ./-]{6,20}$/.test(v)) throw new Error(`«${v}» non sembra un numero di telefono.`);
  return v;
}

// Partita IVA italiana: 11 cifre con la cifra di controllo (algoritmo di Luhn sulle prime 10).
export function partitaIva(valore) {
  if (vuoto(valore)) return null;
  const v = String(valore).replace(/^IT/i, '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(v)) throw new Error('La partita IVA ha 11 cifre.');
  let somma = 0;
  for (let i = 0; i < 10; i += 1) {
    let c = Number(v[i]);
    if (i % 2 === 1) {
      c *= 2;
      if (c > 9) c -= 9;
    }
    somma += c;
  }
  if ((10 - (somma % 10)) % 10 !== Number(v[10])) throw new Error('La partita IVA non è valida: controlla le cifre.');
  return v;
}

// IBAN: si tolgono gli spazi, si mette in maiuscolo e si verifica il codice di controllo (modulo 97).
// Per l'Italia la lunghezza è di 27 caratteri.
export function iban(valore) {
  if (vuoto(valore)) return null;
  const v = String(valore).replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) throw new Error('L\'IBAN non è scritto correttamente.');
  if (v.startsWith('IT') && v.length !== 27) throw new Error('Un IBAN italiano ha 27 caratteri.');
  const numeri = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55));
  let resto = 0;
  for (const cifra of numeri) resto = (resto * 10 + Number(cifra)) % 97;
  if (resto !== 1) throw new Error('L\'IBAN non è valido: controlla i caratteri.');
  return v;
}

// IBAN a gruppi di quattro, come si stampa.
export const ibanLeggibile = (v) => (v ? String(v).replace(/(.{4})/g, '$1 ').trim() : '');

// L'indirizzo scritto a mano, reso completo; lancia un Error se non è un indirizzo web.
export function indirizzoWeb(testo) {
  let v = String(testo ?? '').trim();
  if (!v) throw new Error('Scrivi l’indirizzo del sito.');
  if (!/^[a-z]+:\/\//i.test(v)) v = `https://${v}`;
  let url;
  try {
    url = new URL(v);
  } catch {
    throw new Error(`«${testo}» non sembra un indirizzo web.`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) throw new Error(`«${testo}» non sembra un indirizzo web.`);
  return url.href;
}
