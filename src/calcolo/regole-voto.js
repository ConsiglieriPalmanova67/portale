// Regole di voto per argomento: dal testo di un punto all'ordine del giorno, quale maggioranza e quale tabella
// millesimale servono perché la delibera sia valida. Il catalogo cresce una regola alla volta. Funzioni pure.
import { MAGGIORANZE } from './maggioranze.js';
import { normalizza } from '../ui/html.js';

// Ogni regola: `cerca` sono gruppi di espressioni sul testo normalizzato (minuscolo, senza accenti) e ogni gruppo
// deve trovare almeno una corrispondenza; `tabella` 'proprieta' = la tabella di proprietà generale (tabella A).
export const REGOLE = [
  {
    id: 'amministratore',
    titolo: 'Nomina, conferma o revoca dell\'amministratore',
    cerca: [[/amministrator/], [/nomin/, /revoc/, /conferm/, /rinnov/, /elezion/, /elegg/, /sostitu/, /incaric/]],
    maggioranza: 'meta',
    tabella: 'proprieta',
    requisiti: [
      'la maggioranza delle teste intervenute: 50% + 1 dei condòmini presenti di persona o rappresentati per delega (si contano i condòmini, non le persone in sala; i comproprietari di una stessa unità valgono una testa)',
      'almeno 500 millesimi della tabella di proprietà generale (tabella A)',
    ],
    riferimento: 'art. 1136, quarto comma, del Codice Civile',
    note: 'Vale anche in seconda convocazione. I due requisiti servono contemporaneamente.',
  },
];

// La prima regola che riguarda il testo del punto, oppure null.
export function regolaPerTesto(testo) {
  const t = normalizza(testo);
  if (!t.trim()) return null;
  return REGOLE.find((r) => r.cerca.every((gruppo) => gruppo.some((re) => re.test(t)))) ?? null;
}

// La tabella che la regola chiede, tra quelle del condominio (id), oppure null se la regola non la fissa.
export const tabellaDellaRegola = (regola, { tabellaProprietaId }) => (regola.tabella === 'proprieta' ? tabellaProprietaId ?? null : null);

// Il punto rispetta la regola del suo argomento? → { regola, problemi: [testo] } (regola null se nessuna lo riguarda).
export function controllaPunto(punto, contesto) {
  const regola = regolaPerTesto(punto.testo);
  if (!regola) return { regola: null, problemi: [] };
  const problemi = [];
  if (punto.maggioranza !== regola.maggioranza) problemi.push(`la maggioranza richiesta è «${MAGGIORANZE[regola.maggioranza].etichetta}»`);
  const tabella = tabellaDellaRegola(regola, contesto);
  if (tabella && punto.tabella_id !== tabella) problemi.push('si vota sulla tabella di proprietà generale');
  return { regola, problemi };
}
