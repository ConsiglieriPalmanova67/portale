// Etichette e piccoli attrezzi condivisi dalle pagine dell'assemblea.
import { statoPunto } from '../../assemblea/seduta.js';
import { ESITI, esitoPunto } from '../../assemblea/delibere.js';
import { esc, data, ora } from '../../ui/html.js';

export const CONDOMINIO = 'Condominio Palmanova 67';

export const TIPI = { ordinaria: 'Ordinaria', straordinaria: 'Straordinaria' };
export const CONVOCAZIONI = { prima: 'Prima convocazione', seconda: 'Seconda convocazione' };
export const STATI = { bozza: 'Da aprire', in_corso: 'In corso', chiusa: 'Chiusa' };
export const TIPI_PUNTO = { delibera: 'Delibera', nomina_consiglieri: 'Nomina dei consiglieri' };

export const VOTI = { favorevole: 'Favorevole', contrario: 'Contrario', astenuto: 'Astenuto' };

export const titoloAssemblea = (a) => `Assemblea ${(TIPI[a.tipo] ?? '').toLowerCase()} del ${data(a.data)}`;

export const nonAperta = (cosa) => `<p class="avviso">La seduta non è ancora aperta: ${esc(cosa)} si registrano dopo aver premuto "Apri seduta".</p>`;

// Vista "Solo presenti" delle schede Presenze e Votazioni: vale per questo dispositivo e non tocca i dati.
const CHIAVE_VISTA = 'assemblea.soloPresenti';
export function soloPresenti() {
  try { return localStorage.getItem(CHIAVE_VISTA) === '1'; } catch { return false; }
}
export function ricordaVista(valore) {
  try { localStorage.setItem(CHIAVE_VISTA, valore ? '1' : '0'); } catch { /* memoria del dispositivo non disponibile: la scelta vale finché la pagina resta aperta */ }
}

// Stato di un punto con i dati della seduta: per un punto chiuso vale la fotografia dei presenti al voto.
export const statoDelPunto = (ctx, punto) => statoPunto({
  punto, teste: ctx.teste, millesimi: ctx.stato.dati.millesimi, presenti: ctx.seduta.presenti, voti: ctx.voti,
});

// Orari utili a spiegare perché una testa è assente a un punto: arrivo, uscita, delega registrata.
export function orariAssente(ctx, testaId) {
  const presenza = ctx.presenze.find((p) => p.testa_id === testaId);
  const delega = ctx.deleghe.find((d) => d.delegante_testa_id === testaId);
  return [
    presenza?.ora_ingresso ? `arrivo ore ${ora(presenza.ora_ingresso)}` : '',
    presenza?.ora_uscita ? `uscita ore ${ora(presenza.ora_uscita)}` : '',
    delega ? `delega registrata alle ${ora(delega.ora_registrazione)}` : '',
  ].filter(Boolean).join(', ');
}

// Esito di un punto come etichetta. Un esito registrato a mano (assemblee archiviate senza seduta) lo dice sempre.
// A un punto senza esito di un'assemblea chiusa non si può più dire "da votare": l'esito non è stato registrato.
const CLASSI_ESITO = { approvata: 'stato-presente', respinta: 'stato-respinto', non_deliberata: 'stato-avviso', da_votare: '' };
export const ESITO_A_MANO = 'esito registrato a mano';
export const nomeEsito = (stato, assemblea) => (stato === 'da_votare' && assemblea?.stato === 'chiusa' ? 'Esito non registrato' : ESITI[stato]);
export function etichettaEsito(punto, assemblea) {
  const e = esitoPunto(punto);
  return `<span class="etichetta ${CLASSI_ESITO[e.stato]}">${esc(nomeEsito(e.stato, assemblea)).toLowerCase()}</span>${e.manuale ? ` <span class="etichetta">${ESITO_A_MANO}</span>` : ''}`;
}

// Per le schede di ciò che senza seduta non esiste (presenze, deleghe, voti) in un'assemblea registrata come già svolta.
export const senzaSeduta = (cosa) => `<p class="avviso">Assemblea registrata come già svolta, senza seduta dal vivo: nel portale non ci sono ${esc(cosa)} registrate.
  Gli esiti dei punti si inseriscono a mano nell'ordine del giorno.</p>`;

// Finestra di scelta dentro la pagina: "Annulla" più un tasto per ogni scelta ({ valore, etichetta }); l'ultima è
// quella in evidenza. Restituisce una Promise con il valore della scelta premuta, oppure null (Annulla o Esc).
export function scegli(testo, scelte) {
  return new Promise((risolvi) => {
    const finestra = document.createElement('dialog');
    finestra.className = 'conferma';
    finestra.innerHTML = `
      <p>${esc(testo)}</p>
      <div class="azioni">
        <button type="button" class="secondario" value="">Annulla</button>
        ${scelte.map((s, i) => `<button type="button" ${i < scelte.length - 1 ? 'class="secondario"' : ''} value="${esc(s.valore)}">${esc(s.etichetta)}</button>`).join('')}
      </div>`;
    const chiudi = (esito) => {
      if (!finestra.isConnected) return;
      finestra.close();
      finestra.remove();
      risolvi(esito);
    };
    finestra.addEventListener('click', (evento) => {
      const bottone = evento.target.closest('button');
      if (bottone) chiudi(bottone.value || null);
    });
    // tasto Esc: vale come "Annulla"
    finestra.addEventListener('close', () => chiudi(null));
    document.body.append(finestra);
    finestra.showModal();
  });
}

// Finestra di conferma dentro la pagina. Restituisce una Promise: true solo se si preme il tasto di conferma.
export const conferma = (testo, etichettaOk = 'Conferma') => scegli(testo, [{ valore: 'si', etichetta: etichettaOk }]).then((scelta) => scelta === 'si');

// Ora prevista della seduta: il database la restituisce come "21:00:00", qui serve "21:00".
export const oraBreve = (orario) => String(orario ?? '').slice(0, 5);
// "20/10/2026 ore 21:00"; senza ora resta la sola data.
export const quando = (giorno, orario) => [data(giorno), orario ? `ore ${oraBreve(orario)}` : ''].filter(Boolean).join(' ');

// Convocazioni e verbali stanno nello stesso archivio privato.
export const ARCHIVIO_VERBALI = 'verbali';
export const percorsoConvocazione = (assembleaId) => `convocazioni/${assembleaId}.pdf`;
export const STATI_VERBALE = { bozza: 'Bozza', definitivo: 'Definitivo' };

// Apre un file dell'archivio in una nuova scheda. La scheda si apre subito, dentro il gesto dell'utente
// (altrimenti il browser la blocca), e riceve l'indirizzo temporaneo appena il deposito lo fornisce.
// Se il browser non concede la scheda, il tasto diventa un collegamento da premere.
export async function apriFile(deposito, bucket, percorso, bottone) {
  const scheda = window.open('', '_blank');
  // il file aperto non deve poter comandare la scheda del portale (window.opener)
  if (scheda) scheda.opener = null;
  bottone.disabled = true;
  try {
    const url = await deposito.urlFile(bucket, percorso);
    if (scheda) scheda.location.replace(url);
    else bottone.outerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">Apri il file</a>`;
  } catch (errore) {
    scheda?.close();
    throw errore;
  } finally {
    bottone.disabled = false;
  }
}

// La regola di voto dell'argomento di un punto, in chiaro: che cosa serve perché la delibera sia valida.
export const spiegaRegola = (regola) => `<strong>${esc(regola.titolo)}</strong>: servono contemporaneamente
  ${regola.requisiti.map((r, i) => `${i + 1}) ${esc(r)}`).join('; ')}. <span class="nota">(${esc(regola.riferimento)}${regola.note ? `. ${esc(regola.note)}` : ''})</span>`;
