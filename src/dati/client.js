// Accesso al portale e caricamento iniziale dei dati. Letture e scritture passano dal deposito.
// In modalità prova (`?prova`) non c'è accesso: si entra subito, con dati finti in memoria.
import { deposito, supabase, inProva } from './deposito.js';

export { deposito, inProva };

export async function sessioneCorrente() {
  if (inProva) return { user: { email: 'modalità prova' } };
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function accedi(email, password) {
  if (inProva) return;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email o password non corretti.' : error.message);
}

// Password dimenticata: Supabase manda all'email un link che riporta a questa pagina con una sessione di recupero.
// La risposta è la stessa che l'email esista o no, così non si scopre chi è registrato.
export async function chiediNuovaPassword(email) {
  if (inProva) return;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
  if (error) throw new Error(error.message);
}

// Arrivati dal link dell'email (l'indirizzo porta type=recovery): si deve scegliere la nuova password.
// Il segnale si legge in deposito-supabase.js, prima che la libreria ripulisca l'indirizzo.
export const arrivoDaRecupero = inProva ? false : (await import('./deposito-supabase.js')).arrivoDaRecupero;

export function quandoRecupero(callback) {
  if (inProva) return;
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') callback();
  });
}

export async function impostaPassword(password) {
  if (inProva) return;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export const esci = async () => {
  if (!inProva) await supabase.auth.signOut();
};

export async function sonoConsigliere() {
  if (inProva) return true;
  const { data, error } = await supabase.rpc('is_consigliere');
  if (error) throw new Error(error.message);
  return data === true;
}

// Sessione scaduta o chiusa da un'altra scheda.
export function quandoEsce(callback) {
  if (inProva) return;
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') callback();
  });
}

const TABELLE = ['unita', 'soggetti', 'titolarita', 'tabelle_millesimali', 'millesimi', 'esercizi', 'conti', 'fornitori', 'spese', 'posizioni', 'rate', 'consiglieri', 'stato_patrimoniale', 'partite_terzi', 'amministratori'];

// Anagrafica e contabilità sono poche migliaia di righe: si caricano tutte all'ingresso.
// I dati delle assemblee si leggono invece dal deposito quando servono, così sono sempre aggiornati.
export async function caricaDati() {
  const risultati = await Promise.all(TABELLE.map((t) => deposito.leggi(t)));
  return Object.fromEntries(TABELLE.map((t, i) => [t, risultati[i]]));
}
