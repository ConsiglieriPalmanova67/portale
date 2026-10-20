// Il deposito è l'unica porta verso i dati: le pagine leggono e scrivono solo da qui.
// Ha due realizzazioni con la stessa interfaccia:
//   - deposito-supabase.js: il database vero;
//   - deposito-prova.js: in memoria, con i dati finti di dati-prova.js (modalità prova, `?prova` nell'indirizzo).
//
// Interfaccia (tutte le funzioni tranne `ascolta` restituiscono una Promise):
//
//   leggi(tabella, filtri = {})           → righe[]. Filtri di uguaglianza { colonna: valore };
//                                           un valore array significa "uno tra questi". Legge a pagine da 1000.
//   inserisci(tabella, righe)             → righe inserite (con id e valori predefiniti)
//   aggiorna(tabella, chiave, valori)     → righe aggiornate; chiave = { colonna: valore, ... }, mai vuota
//   salva(tabella, righe, colonneChiave)  → righe; inserisce o aggiorna (upsert) secondo le colonne chiave
//   elimina(tabella, chiave)              → numero di righe eliminate; chiave mai vuota
//   caricaFile(bucket, percorso, file)    → percorso salvato (sovrascrive se esiste)
//   urlFile(bucket, percorso)             → URL temporaneo per aprire il file
//   eliminaFile(bucket, percorso)         → niente; toglie il file dall'archivio (se non c'è non è un errore)
//   ascolta(tabelle, callback)            → callback(tabella) a ogni modifica; restituisce la funzione per smettere
//
// Ogni errore diventa un Error con messaggio leggibile: le pagine lo mostrano e offrono di riprovare.

export const inProva = new URLSearchParams(globalThis.location?.search ?? '').has('prova');

// In modalità prova Supabase non viene nemmeno caricato: impossibile toccare i dati veri per sbaglio.
async function crea() {
  if (inProva) {
    const [{ creaDepositoProva }, { datiProva, fileProva }] = await Promise.all([import('./deposito-prova.js'), import('./dati-prova.js')]);
    return { deposito: creaDepositoProva(datiProva(), fileProva()), supabase: null };
  }
  const { creaDepositoSupabase, supabase } = await import('./deposito-supabase.js');
  return { deposito: creaDepositoSupabase(supabase), supabase };
}

// `supabase` serve solo a client.js per l'accesso; in modalità prova è null.
export const { deposito, supabase } = await crea();
