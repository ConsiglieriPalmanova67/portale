// Attrezzi comuni ai test dell'estrazione: il fascicolo di fantasia della modalità prova, già diviso in blocchi.
import { datiProva } from '../../src/dati/dati-prova.js';
import { fascicoloProva } from '../../src/dati/fascicolo-prova.js';
import { blocchiDaMappa, chiaveBlocco } from '../../src/estrazione/blocchi.js';
import { assembla } from '../../src/estrazione/assembla.js';

export const OGGI = '2026-10-13';

// → { db, blocchi (righe come in estrazioni_blocchi), indice, dati(correzioni) }
export function fascicolo({ conErrori = false, anno = 2026 } = {}) {
  const db = datiProva();
  const f = fascicoloProva(db, { anno, conErrori, oggi: OGGI });
  const blocchi = blocchiDaMappa(f.indice.sezioni).map((b) => ({ ...b, stato: 'fatto', dati: f.blocchi[chiaveBlocco(b)] }));
  return { db, blocchi, indice: f.indice, dati: (correzioni = {}) => assembla(blocchi, correzioni) };
}
export const codici = (esiti, livello) => esiti.filter((e) => !livello || e.livello === livello).map((e) => e.codice);
export const senzaOk = (esiti) => esiti.filter((e) => e.livello !== 'ok');
