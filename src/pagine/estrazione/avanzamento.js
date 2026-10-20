// Fase di lettura: l'elenco dei blocchi con il loro stato, aggiornato mentre arrivano le risposte. Si può
// interrompere e riprendere, e rileggere un blocco fallito. Quando tutti i blocchi sono fatti si passa alla revisione.
import { esc } from '../../ui/html.js';
import { TIPI_SEZIONE, blocchiDaRighe, chiaveBlocco } from '../../estrazione/blocchi.js';
import { leggiBlocchi, dividiRiga, IN_PARALLELO } from '../../estrazione/lettura.js';

const STATI = { in_attesa: ['in attesa', ''], in_corso: ['in lettura…', 'stato-delega'], fatto: ['letto', 'stato-presente'], errore: ['errore', 'stato-respinto'] };
const numeri = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });
export const nomeBlocco = (b) => `${TIPI_SEZIONE[b.sezione].split(' (')[0]}${b.parte ? `, parte ${b.parte}` : ''} — pagin${b.pagina_da === b.pagina_a ? `a ${b.pagina_da}` : `e ${b.pagina_da}-${b.pagina_a}`}`;

export function faseLettura(ctx, zona) {
  // in lettura adesso (in questa pagina): un blocco rimasto "in corso" da una pagina chiusa è solo da riprendere
  let occupata = false;
  let fermata = false;
  ctx.allUscita(() => { fermata = true; });

  const riga = (r) => {
    const [nome, classe] = STATI[occupata || r.stato !== 'in_corso' ? r.stato : 'in_attesa'];
    return `
      <tr data-blocco="${esc(chiaveBlocco(r))}">
        <td>${esc(nomeBlocco(r))}</td>
        <td><span class="etichetta ${classe}">${nome}</span>${r.errore ? `<br><span class="nota">${esc(r.errore)}</span>` : ''}</td>
        <td class="num">${r.tentativi || ''}</td>
        <td class="num">${r.token_ingresso ? `${numeri.format(r.token_ingresso)} / ${numeri.format(r.token_uscita)}` : ''}</td>
        <td class="tasti">${!occupata && (r.stato === 'errore' || r.stato === 'fatto') ? `<button type="button" class="secondario" data-azione="rileggi" data-blocco="${esc(chiaveBlocco(r))}">Rileggi</button>` : ''}
          ${!occupata && r.stato === 'errore' && r.pagina_a > r.pagina_da ? `<button type="button" class="secondario" data-azione="dividi" data-blocco="${esc(chiaveBlocco(r))}" title="Legge una pagina per volta: serve quando il blocco intero supera il tempo massimo">Dividi in pagine</button>` : ''}</td>
      </tr>`;
  };

  function disegna() {
    // se nel frattempo l'estrazione è stata annullata o ha cambiato fase, questa vista non deve più disegnarsi
    if (!ctx.attiva() || ctx.estrazione.stato !== 'lettura') return;
    const fatti = ctx.righe.filter((r) => r.stato === 'fatto').length;
    const falliti = ctx.righe.filter((r) => r.stato === 'errore').length;
    const daFare = ctx.righe.length - fatti;
    zona.innerHTML = `
      <section class="est-lettura">
        <h2>Lettura delle sezioni</h2>
        <p class="avviso ${daFare ? '' : 'fatto'}" role="status"><strong>${fatti} di ${ctx.righe.length} blocchi letti</strong>${falliti ? `, ${falliti} non riuscit${falliti === 1 ? 'o' : 'i'}` : ''}.
          ${occupata ? `Lettura in corso, al massimo ${IN_PARALLELO} blocchi per volta${fermata ? ': interruzione richiesta, si attendono i blocchi già partiti' : ''}…`
            : daFare ? 'La lettura è ferma: i blocchi già letti restano salvati.' : 'Tutti i blocchi sono stati letti.'}</p>
        <progress max="${ctx.righe.length}" value="${fatti}" aria-label="Blocchi letti"></progress>
        <div class="azioni">
          ${occupata ? `<button type="button" class="secondario" data-azione="interrompi" ${fermata ? 'disabled' : ''}>Interrompi</button>` : ''}
          ${!occupata && daFare ? `<button type="button" data-azione="riprendi">${falliti === daFare ? 'Rileggi i blocchi non riusciti' : 'Riprendi la lettura'}</button>` : ''}
          ${!occupata && !daFare ? '<button type="button" data-azione="revisione">Vai alla revisione</button>' : ''}
          ${!occupata ? '<button type="button" class="secondario" data-azione="mappa">Torna alla mappa</button>' : ''}
        </div>
        <div class="scorri"><table>
          <thead><tr><th>Blocco</th><th>Stato</th><th class="num">Tentativi</th><th class="num">Token ingresso / uscita</th><th></th></tr></thead>
          <tbody>${ctx.righe.map(riga).join('')}</tbody>
        </table></div>
      </section>`;
  }

  async function leggi(soloQuesti = null) {
    if (occupata) return;
    occupata = true;
    fermata = false;
    disegna();
    try {
      const [lettore, documento] = await Promise.all([ctx.lettore(), ctx.aperto()]);
      await leggiBlocchi({
        lettore, documento, deposito: ctx.deposito, blocchi: blocchiDaRighe(ctx.estrazione.mappa, ctx.righe), righe: ctx.righe, soloQuesti, fermati: () => fermata,
        aggiorna: () => {
          ctx.disegnaTestata();
          disegna();
        },
      });
      // rileggere un blocco cancella le correzioni fatte a mano sulle sue celle: i dati sotto sono cambiati
      if (soloQuesti) {
        const celle = Object.fromEntries(Object.entries(ctx.estrazione.correzioni?.celle ?? {}).filter(([chiave]) => !soloQuesti.includes(chiave.split('|')[0])));
        await ctx.salva({ correzioni: { ...(ctx.estrazione.correzioni ?? {}), celle } });
      }
    } catch (e) {
      ctx.errore(`La lettura si è fermata: ${e.message}`, () => leggi(soloQuesti));
    }
    occupata = false;
    try {
      await ctx.rileggiRighe();
    } catch { /* si resta con le righe che si hanno: il prossimo gesto le rilegge */ }
    disegna();
  }

  zona.onclick = async (evento) => {
    const { azione, blocco } = evento.target.dataset;
    if (!azione) return;
    if (azione === 'interrompi') {
      fermata = true;
      disegna();
    }
    if (azione === 'riprendi') leggi();
    if (azione === 'rileggi') leggi([blocco]);
    if (azione === 'dividi') {
      const riga = ctx.righe.find((r) => chiaveBlocco(r) === blocco);
      try {
        await dividiRiga(ctx.deposito, riga);
        await ctx.rileggiRighe();
        leggi();
      } catch (e) {
        ctx.errore(`Non è stato possibile dividere il blocco: ${e.message}`);
      }
    }
    if (azione === 'revisione' || azione === 'mappa') {
      try {
        await ctx.salva({ stato: azione === 'revisione' ? 'revisione' : 'indice' });
        ctx.ridisegna();
      } catch (e) {
        ctx.errore(`Non è stato possibile cambiare fase: ${e.message}`);
      }
    }
  };

  disegna();
  // subito dopo la conferma della mappa la lettura parte da sola; rientrando nella pagina si aspetta il tasto
  if (ctx.avviaLettura) {
    ctx.avviaLettura = false;
    leggi();
  }
}
