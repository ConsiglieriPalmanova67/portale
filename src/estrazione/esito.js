// La forma comune degli esiti dei controlli (vedi controlli.js).
export function esito(livello, codice, messaggio, dove = {}, altro = {}) {
  return { livello, codice, messaggio, dove, chiave: [codice, dove.sezione ?? '', dove.riga ?? '', dove.campo ?? ''].join('|'), daConfermare: false, ...altro };
}
export const somma = (valori) => valori.reduce((s, v) => s + (v ?? 0), 0);
