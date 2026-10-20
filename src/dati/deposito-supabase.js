// Unico file che parla con Supabase. Realizza l'interfaccia descritta in deposito.js.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

// Arrivo dal link «password dimenticata»: si legge prima che il client ripulisca l'indirizzo.
export const arrivoDaRecupero = /type=recovery/.test(location.hash);
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// L'API restituisce al massimo 1000 righe per richiesta: si legge a pagine.
const PAGINA = 1000;
// Per leggere a pagine serve un ordine stabile: la chiave primaria. Dove non è indicata è `id`.
const CHIAVE_PRIMARIA = {
  millesimi: ['unita_id', 'tabella_id'],
  rate: ['posizione_id', 'numero'],
  presenze: ['assemblea_id', 'testa_id'],
  voti: ['punto_id', 'testa_id'],
};
// Durata degli indirizzi temporanei dei file, in secondi.
const DURATA_URL = 300;

const CODICI = {
  23505: 'esiste già una riga con questi dati',
  23503: 'la riga è collegata ad altri dati e non si può togliere o non trova il dato a cui si riferisce',
  23514: 'un valore non è tra quelli ammessi',
  42501: 'non hai il permesso per questa operazione (mandato di consigliere scaduto?)',
  PGRST301: 'la sessione è scaduta: esci e rientra',
};

// Ogni errore diventa un Error con un messaggio che si può mostrare a chi usa il portale.
function leggibile(dove, errore) {
  const testo = String(errore?.message ?? errore ?? '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(testo)) {
    return new Error(`${dove}: connessione assente, l'operazione non è stata eseguita.`);
  }
  return new Error(`${dove}: ${CODICI[errore?.code] ?? (testo || 'errore sconosciuto')}`);
}

// supabase-js restituisce { data, error } ma se manca la rete può anche lanciare: si coprono entrambi i casi.
async function esegui(dove, richiesta) {
  let risposta;
  try {
    risposta = await richiesta();
  } catch (errore) {
    throw leggibile(dove, errore);
  }
  if (risposta.error) throw leggibile(dove, risposta.error);
  return risposta;
}

function conChiave(chiave) {
  if (!chiave || !Object.keys(chiave).length) throw new Error('Serve una chiave: senza, l\'operazione toccherebbe tutte le righe.');
}

export function creaDepositoSupabase(client = supabase) {
  return {
    async leggi(tabella, filtri = {}) {
      // un elenco vuoto di valori ammessi non può dare righe: inutile chiedere
      if (Object.values(filtri).some((v) => Array.isArray(v) && !v.length)) return [];
      const righe = [];
      for (let da = 0; ; da += PAGINA) {
        const { data } = await esegui(tabella, () => {
          let domanda = client.from(tabella).select('*');
          for (const [colonna, valore] of Object.entries(filtri)) {
            domanda = Array.isArray(valore) ? domanda.in(colonna, valore) : domanda.eq(colonna, valore);
          }
          for (const colonna of CHIAVE_PRIMARIA[tabella] ?? ['id']) domanda = domanda.order(colonna);
          return domanda.range(da, da + PAGINA - 1);
        });
        righe.push(...data);
        if (data.length < PAGINA) return righe;
      }
    },

    async inserisci(tabella, righe) {
      if (!righe.length) return [];
      const { data } = await esegui(tabella, () => client.from(tabella).insert(righe).select());
      return data;
    },

    async aggiorna(tabella, chiave, valori) {
      conChiave(chiave);
      const { data } = await esegui(tabella, () => client.from(tabella).update(valori).match(chiave).select());
      return data;
    },

    async salva(tabella, righe, colonneChiave) {
      if (!colonneChiave?.length) throw new Error('Servono le colonne chiave per sapere quali righe esistono già.');
      if (!righe.length) return [];
      const { data } = await esegui(tabella, () => client.from(tabella).upsert(righe, { onConflict: colonneChiave.join(',') }).select());
      return data;
    },

    async elimina(tabella, chiave) {
      conChiave(chiave);
      const { count } = await esegui(tabella, () => client.from(tabella).delete({ count: 'exact' }).match(chiave));
      return count ?? 0;
    },

    async caricaFile(bucket, percorso, file) {
      const { data } = await esegui(`Archivio ${bucket}`, () =>
        client.storage.from(bucket).upload(percorso, file, { upsert: true, contentType: file.type || undefined }));
      return data.path;
    },

    async urlFile(bucket, percorso) {
      const { data } = await esegui(`Archivio ${bucket}`, () => client.storage.from(bucket).createSignedUrl(percorso, DURATA_URL));
      return data.signedUrl;
    },

    async eliminaFile(bucket, percorso) {
      await esegui(`Archivio ${bucket}`, () => client.storage.from(bucket).remove([percorso]));
    },

    ascolta(tabelle, callback) {
      let canale = client.channel(`modifiche-${crypto.randomUUID()}`);
      for (const tabella of tabelle) {
        canale = canale.on('postgres_changes', { event: '*', schema: 'public', table: tabella }, () => callback(tabella));
      }
      canale.subscribe();
      return () => { client.removeChannel(canale); };
    },
  };
}
