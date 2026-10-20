// Contabilità: si sceglie l'anno e le schede usano il consuntivo e/o il preventivo di quell'anno.
// Indirizzo: #/contabilita/<anno>/<scheda>. Ogni scheda è una funzione disegna(ctx, contenitore) elencata in SCHEDE;
// `ctx` = { stato, dati, anni (tutti, da eserciziPerAnno), anno (quello scelto: { anno, consuntivo, preventivo }), memoria }.
import { esc } from '../ui/html.js';
import { eserciziPerAnno } from '../dati/contabilita.js';
import { schedaSpese } from './contabilita/spese.js';
import { schedaRaffronto } from './contabilita/raffronto.js';
import { schedaPatrimoniale } from './contabilita/patrimoniale.js';
import { schedaAndamento } from './contabilita/andamento.js';

const SCHEDE = [
  { id: 'spese', titolo: 'Spese', disegna: schedaSpese },
  { id: 'raffronto', titolo: 'Preventivo / consuntivo', disegna: schedaRaffronto },
  { id: 'patrimoniale', titolo: 'Situazione patrimoniale', disegna: schedaPatrimoniale },
  { id: 'andamento', titolo: 'Andamento negli anni', disegna: schedaAndamento },
];

// Scelte fatte nelle schede (ordinamenti, ricerca…): restano mentre si passa da una scheda o da un anno all'altro.
const memoria = {};

const contenuto = (a) => (a.consuntivo && a.preventivo ? 'consuntivo e preventivo' : a.consuntivo ? 'solo consuntivo' : 'solo preventivo');

export function contabilita(stato, contenitore, parametro, schedaScelta) {
  const { dati } = stato;
  const anni = eserciziPerAnno(dati.esercizi);
  if (!anni.length) {
    contenitore.innerHTML = '<p class="nota">Nessun esercizio caricato.</p>';
    return;
  }
  // i vecchi collegamenti portavano l'id dell'esercizio al posto dell'anno
  const cercato = dati.esercizi.find((e) => e.id === parametro)?.anno ?? parametro;
  // senza scelta: l'ultimo anno che ha un consuntivo, altrimenti l'ultimo
  const anno = anni.find((a) => String(a.anno) === String(cercato)) ?? anni.findLast((a) => a.consuntivo) ?? anni.at(-1);
  const scheda = SCHEDE.find((s) => s.id === schedaScelta) ?? SCHEDE[0];

  contenitore.innerHTML = `
    <header class="testata">
      <h1>Contabilità</h1>
      <p class="nota">Dati importati dai rendiconti e dai preventivi dell'amministratore: sola consultazione.</p>
    </header>
    <div class="filtri">
      <label class="interruttore">Anno
        <select id="anno">${anni.map((a) => `<option value="${esc(a.anno)}" ${a === anno ? 'selected' : ''}>${esc(a.anno)} — ${contenuto(a)}</option>`).join('')}</select>
      </label>
    </div>
    <nav class="schede" aria-label="Schede della contabilità">${SCHEDE.map((s) =>
      `<a href="#/contabilita/${esc(anno.anno)}/${s.id}" ${s === scheda ? 'aria-current="page"' : ''}>${esc(s.titolo)}</a>`).join('')}</nav>
    <section id="conti-scheda"></section>`;

  contenitore.querySelector('#anno').addEventListener('change', (evento) => {
    location.hash = `#/contabilita/${evento.target.value}/${scheda.id}`;
  });
  // sugli schermi stretti le schede scorrono: quella scelta deve restare in vista
  contenitore.querySelector('.schede [aria-current="page"]').scrollIntoView({ block: 'nearest', inline: 'nearest' });
  memoria[scheda.id] ??= {};
  scheda.disegna({ stato, dati, anni, anno, memoria: memoria[scheda.id] }, contenitore.querySelector('#conti-scheda'));
}
