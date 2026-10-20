// Lettura e salvataggio della bozza del verbale: una riga di `bozze_verbale` per assemblea, `testo` = JSON dei campi
// scritti a mano (vedi campiVuoti in fatti.js). Si scrive per chiave: subito prima di scrivere si rilegge la riga e si
// applica solo la modifica richiesta (per esempio un solo campo di un solo punto), così due schede o due dispositivi
// che scrivono campi diversi non si cancellano a vicenda. Su uno stesso campo vale l'ultima scrittura.
import { campiVuoti, leggiCampi } from './fatti.js';

// Non c'è un vincolo di unicità: se le righe sono più d'una vale l'ultima modificata.
const quando = (riga) => String(riga.modificato_il ?? riga.creato_il ?? '');

async function rigaDellaBozza(deposito, assembleaId) {
  const righe = await deposito.leggi('bozze_verbale', { assemblea_id: assembleaId });
  return [...righe].sort((x, y) => quando(y).localeCompare(quando(x)))[0] ?? null;
}

// `iniziali`: i campi da cui partire quando la riga non c'è ancora (per esempio con il convocante proposto).
export async function leggiBozza(deposito, assembleaId, iniziali = campiVuoti) {
  const riga = await rigaDellaBozza(deposito, assembleaId);
  return { id: riga?.id ?? null, campi: riga ? leggiCampi(riga.testo) : iniziali() };
}

// Rilegge, applica `modifica(campi)` e salva; restituisce i campi come sono adesso nel deposito.
export async function aggiornaBozza(deposito, assembleaId, modifica, iniziali = campiVuoti) {
  const { id, campi } = await leggiBozza(deposito, assembleaId, iniziali);
  modifica(campi);
  const testo = JSON.stringify(campi);
  if (id && (await deposito.aggiorna('bozze_verbale', { id }, { testo })).length) return campi;
  // nessuna riga, oppure quella letta nel frattempo è stata tolta: se ne crea una
  await deposito.inserisci('bozze_verbale', [{ assemblea_id: assembleaId, testo }]);
  return campi;
}
