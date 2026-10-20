// Piccoli attrezzi condivisi dalle schede della contabilità. I calcoli restituiscono centesimi interi: qui si mostrano.
import { esc, euro, segno } from '../../ui/html.js';

const VUOTO = '<span class="spento">—</span>';
const fmtPercento = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });

// Importo in centesimi → "1.234,56 €"; null (voce assente) → trattino.
export const soldi = (centesimi) => (centesimi === null || centesimi === undefined ? VUOTO : euro(centesimi / 100));
// Come soldi, con il segno sempre in vista: serve per differenze e variazioni.
export const conSegno = (centesimi) => (centesimi === null || centesimi === undefined ? VUOTO : `${centesimi > 0 ? '+' : ''}${euro(centesimi / 100)}`);
export const percento = (valore) => (valore === null || valore === undefined ? VUOTO : `${fmtPercento.format(valore)}%`);
// Classe per colorare un importo in centesimi.
export const colore = (centesimi) => segno(centesimi ?? 0);
// Le differenze si leggono come variazione della spesa: + = si spende di più (rosso), − = si risparmia (verde).
// Le spese sono registrate in negativo: per loro la differenza dei valori va girata di segno.
export const comeSpesa = (valore, inNegativo) => (valore === null || valore === undefined ? valore : inNegativo ? 0 - valore || 0 : valore);
export const coloreSpesa = (delta) => (!delta ? '' : delta > 0 ? 'neg' : 'pos');

export const TIPI_ESERCIZIO = { consuntivo: 'Consuntivo', preventivo: 'Preventivo' };

// Macro voci (i gruppi con il subtotale): si possono chiudere tutte, per vedere solo i subtotali, o una per una.
// Le righe delle voci portano data-di="<gruppo>"; i gruppi chiusi restano in memoria.chiusi tra una scheda e l'altra.
export const tastiMacroVoci = () => `<span class="nota">Mostra</span>
  <button type="button" class="secondario" data-macro="chiudi">Solo macro voci</button>
  <button type="button" class="secondario" data-macro="apri">Tutte le voci</button>`;
export const apriChiudi = (nome, memoria) => {
  const chiuso = memoria.chiusi?.has(nome);
  return `<button type="button" class="apri-gruppo" data-gruppo="${esc(nome)}" aria-expanded="${!chiuso}" title="${chiuso ? 'Mostra' : 'Nascondi'} le voci">${chiuso ? '▸' : '▾'}</button>`;
};
export const nascosta = (nome, memoria) => (memoria.chiusi?.has(nome) ? 'hidden' : '');
export function gestisciMacroVoci(zona, memoria) {
  memoria.chiusi ??= new Set();
  const aggiorna = () => {
    for (const r of zona.querySelectorAll('tr[data-di]')) r.hidden = memoria.chiusi.has(r.dataset.di);
    for (const b of zona.querySelectorAll('[data-gruppo]')) {
      const chiuso = memoria.chiusi.has(b.dataset.gruppo);
      b.textContent = chiuso ? '▸' : '▾';
      b.setAttribute('aria-expanded', String(!chiuso));
      b.title = `${chiuso ? 'Mostra' : 'Nascondi'} le voci`;
    }
  };
  zona.addEventListener('click', (evento) => {
    const gruppo = evento.target.closest('[data-gruppo]')?.dataset.gruppo;
    const macro = evento.target.closest('[data-macro]')?.dataset.macro;
    if (gruppo !== undefined) {
      if (memoria.chiusi.has(gruppo)) memoria.chiusi.delete(gruppo); else memoria.chiusi.add(gruppo);
    } else if (macro === 'chiudi') {
      for (const b of zona.querySelectorAll('[data-gruppo]')) memoria.chiusi.add(b.dataset.gruppo);
    } else if (macro === 'apri') {
      memoria.chiusi.clear();
    } else return;
    aggiorna();
  });
  aggiorna();
}
