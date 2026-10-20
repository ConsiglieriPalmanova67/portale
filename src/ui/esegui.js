// Scritture delle pagine semplici (verbali, to-do): una alla volta; se una fallisce l'errore resta
// in vista nel riquadro con il tasto "Riprova". Dopo ogni scrittura, riuscita o no, si chiama `dopo`
// (di norma: rileggere e ridisegnare), così la pagina mostra quello che c'è davvero nel deposito.
import { esc } from './html.js';

export function creaEsecutore(riquadro, dopo) {
  let occupato = false;
  const mostra = (testo, riprova) => {
    riquadro.innerHTML = `<span>${esc(testo)}</span> <button type="button" data-fai="riprova">Riprova</button> <button type="button" class="secondario" data-fai="chiudi">Chiudi</button>`;
    riquadro.hidden = false;
    riquadro.onclick = (evento) => {
      const fai = evento.target.dataset.fai;
      if (!fai) return;
      riquadro.hidden = true;
      if (fai === 'riprova') riprova();
    };
    riquadro.scrollIntoView({ block: 'nearest' });
  };
  async function esegui(azione) {
    if (occupato) return;
    occupato = true;
    riquadro.hidden = true;
    let fallita = null;
    try {
      await azione();
    } catch (errore) {
      fallita = errore;
    }
    try {
      await dopo();
    } catch (errore) {
      fallita ??= errore;
    }
    occupato = false;
    if (fallita && riquadro.isConnected) mostra(`Operazione non riuscita: ${fallita.message}`, () => esegui(azione));
  }
  return { esegui, mostra };
}

// Estensione di un file scelto dall'utente, per comporre il percorso nell'archivio.
export const estensione = (file) => (file.name?.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'bin').toLowerCase();
