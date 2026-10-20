// Tutto ciò che arriva dal database passa da esc() prima di finire nell'HTML.
const SOSTITUZIONI = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (valore) => String(valore ?? '').replace(/[&<>"']/g, (c) => SOSTITUZIONI[c]);

// In italiano il punto delle migliaia di norma scatta solo da 10.000: qui lo si vuole sempre.
const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const fmtMillesimi = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: 'always' });
const fmtData = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

export const euro = (n) => (n === null || n === undefined || n === '' ? '' : fmtEuro.format(Number(n)));
export const millesimi = (n) => fmtMillesimi.format(Number(n) || 0);
// Una data non valida (per esempio un anno a cinque cifre scritto per sbaglio) si mostra com'è, senza far fallire la pagina.
export const data = (iso) => {
  if (!iso) return '';
  const giorno = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(giorno.getTime()) ? String(iso) : fmtData.format(giorno);
};

// Ora del dispositivo (HH:MM) di un momento registrato; va bene anche come valore di <input type="time">.
const fmtOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
export const ora = (iso) => (iso ? fmtOra.format(new Date(iso)) : '');
// Correzione a mano di un orario: stesso giorno del momento registrato, nuova ora "HH:MM".
export function conOra(iso, hhmm) {
  const momento = new Date(iso);
  const [ore, minuti] = hhmm.split(':').map(Number);
  momento.setHours(ore, minuti, 0, 0);
  return momento.toISOString();
}

export const RUOLI = { proprietario: 'Proprietario', conduttore: 'Conduttore', assegnatario: 'Assegnatario' };

// Classe per colorare gli importi: i negativi sono addebiti.
export const segno = (n) => (Number(n) < 0 ? 'neg' : Number(n) > 0 ? 'pos' : '');

export const normalizza = (testo) => String(testo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Uno o più indirizzi email (separati da virgola) come collegamenti per scrivere.
export const linkEmail = (testo) => String(testo ?? '').split(/[\s,;]+/).filter(Boolean).map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join(', ');

// Nome di un condomino che porta alla sua scheda.
export const linkCondomino = (soggetto) => (soggetto ? `<a href="#/condomini/${encodeURIComponent(soggetto.id)}">${esc(soggetto.denominazione)}</a>` : '');
