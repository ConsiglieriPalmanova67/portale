// Il lettore finto della modalità prova: stessa interfaccia di lettore.js, nessuna chiamata. "Legge" il fascicolo
// di fantasia di fascicolo-prova.js con un piccolo ritardo, così si vede l'avanzamento, e la prima volta fa fallire
// un blocco con un errore non temporaneo, così si può provare la rilettura. I token sono numeri inventati.
import { fascicoloProva, PAGINE_FASCICOLO } from '../dati/fascicolo-prova.js';
import { chiaveBlocco } from './blocchi.js';
import { ErroreLettura } from './lettura.js';

export const MODELLO_PROVA = 'lettore finto (modalità prova)';
const BLOCCO_DIFETTOSO = 'riparto:11';

// `db` = le righe dell'anagrafica (unita, soggetti, titolarita, millesimi): il fascicolo si costruisce su quelle.
export function creaLettoreProva(db, { anno, oggi, ritardo = 700 } = {}) {
  const pausa = (ms) => new Promise((risolvi) => { setTimeout(risolvi, ms); });
  const fascicolo = () => fascicoloProva(db, { anno, oggi, conErrori: true });
  const giaFalliti = new Set();
  return {
    finto: true,
    async apri() {
      return { pagine: PAGINE_FASCICOLO, peso: 0 };
    },
    async indice(documento, avanza = () => {}) {
      avanza(0, 1);
      await pausa(ritardo);
      return { dati: fascicolo().indice, token_ingresso: 21500, token_uscita: 420, modello: MODELLO_PROVA };
    },
    // Un verbale di fantasia costruito sui punti dell'assemblea: esiti, una cosa da fare, le nomine se c'è un punto di nomina.
    async verbale(documento, { punti = [], consiglieri = [] } = {}) {
      await pausa(ritardo * 2);
      const elenco = punti.length ? punti : [{ ordine: 1, testo: 'Approvazione del rendiconto' }, { ordine: 2, testo: 'Lavori di manutenzione' }];
      const dati = {
        data: '', tipo: 'ordinaria', convocazione: 'seconda', ora_inizio: '21:00', ora_fine: '23:10', luogo: 'Sala riunioni', presidente: 'ALBERI Ada', segretario: 'ABETI Aldo',
        costituita: 'si', presenti: '18 condomini per 640,000 millesimi',
        punti: elenco.map((p, i) => {
          const nomina = /nomin|consiglier/i.test(p.testo);
          return {
            ordine: p.ordine, titolo: p.testo, esito: i === 2 ? 'respinto' : 'approvato', voti: 'favorevoli 15, contrari 3',
            sintesi: nomina ? 'Sono nominati i consiglieri indicati.' : i === 1 ? 'Si approvano i lavori con un tetto di spesa di 12.000 euro.' : 'Il punto è approvato.',
            cose_da_fare: i === 1 ? [{ descrizione: 'Richiedere tre preventivi per i lavori', responsabile: 'amministratore', scadenza: '30/11/2026', importo: '12.000 euro' }] : [],
            nomine: nomina ? consiglieri.slice(0, 2).map((nome) => ({ ruolo: 'consigliere', nome, compenso: '', durata: '', note: '' })) : [],
          };
        }),
        note: 'Verbale di fantasia (modalità prova).', incerte: [],
      };
      return { dati, token_ingresso: 6000, token_uscita: 1800, modello: MODELLO_PROVA };
    },
    async blocco(documento, b) {
      const chiave = chiaveBlocco(b);
      await pausa(ritardo * (0.6 + (b.pagina_da % 4) * 0.35));
      if (chiave === BLOCCO_DIFETTOSO && !giaFalliti.has(chiave)) {
        giaFalliti.add(chiave);
        throw new ErroreLettura('La risposta è stata troncata (errore simulato dalla modalità prova): premi «Rileggi».');
      }
      const dati = fascicolo().blocchi[chiave];
      // una mappa corretta a mano può chiedere pagine che il fascicolo finto non ha
      if (!dati) throw new ErroreLettura(`Il fascicolo di prova non ha un blocco ${b.sezione} che comincia a pagina ${b.pagina_da}: rimetti la mappa proposta.`);
      const pagine = b.pagina_a - b.pagina_da + 1 + (b.contesto ? 1 : 0);
      return { dati: structuredClone(dati), token_ingresso: 2400 * pagine + 900, token_uscita: Math.round(JSON.stringify(dati).length / 3.2), modello: MODELLO_PROVA };
    },
  };
}
