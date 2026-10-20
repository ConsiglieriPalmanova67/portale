// Conteggi di una seduta: funzioni pure, senza rete né DOM.
// Le funzioni di src/calcolo/ ragionano per `chiave` della testa; il database usa gli `id`
// di teste_assemblea. Qui si fa la traduzione: la chiave passata al calcolo è l'id della riga.
// I pesi sono sempre interi (millesimi × 1000), come in src/calcolo/: per mostrarli usare daInteri.
import { pesaTeste } from '../calcolo/teste.js';
import { calcolaPresenti } from '../calcolo/presenze.js';
import { quorumCostitutivo } from '../calcolo/quorum.js';
import { controllaDeleghe } from '../calcolo/deleghe.js';
import { esitoVoto, MAGGIORANZE } from '../calcolo/maggioranze.js';
import { daInteri } from '../calcolo/numeri.js';

// Dal modello (calcolato alla data dell'assemblea) alle righe da scrivere in teste_assemblea.
export function congelaTeste(modello) {
  return modello.teste.map((t) => ({
    chiave: t.chiave,
    etichetta: t.etichetta,
    soggetti: t.soggetti.map((s) => s.id),
    unita: t.unita.map((u) => u.id),
  }));
}

const perEtichetta = (a, b) => a.etichetta.localeCompare(b.etichetta, 'it') || (a.id < b.id ? -1 : 1);
const conChiave = (teste) => teste.map((t) => ({ ...t, chiave: t.id }));
const tempo = (iso) => (iso ? Date.parse(iso) : null);
const millesimiTesto = (peso) => daInteri(peso).toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// Valori da salvare quando una testa entra in sala. Chi rientra dopo un'uscita conserva l'ora del primo ingresso:
// se la si spostasse, la testa sparirebbe all'indietro dalla fotografia dell'appello (e dal quorum del Report).
export const datiIngresso = (presenza, adesso) => ({ stato: 'presente', ora_ingresso: presenza?.ora_ingresso ?? adesso, ora_uscita: null });

// Era in sala di persona in quel momento? Senza momento vale lo stato registrato.
function inSala(presenza, momento) {
  if (momento === null) return presenza.stato === 'presente';
  const ingresso = tempo(presenza.ora_ingresso);
  if (ingresso === null || ingresso > momento) return false;
  if (presenza.stato === 'presente') return true;
  const uscita = tempo(presenza.ora_uscita);
  return uscita !== null && uscita > momento;
}

// Stato della seduta adesso oppure, se si passa `adesso`, com'era in quel momento
// (serve per esempio a verificare il quorum all'ora dell'appello).
export function statoSeduta({ assemblea, teste, presenze, deleghe, millesimi, tabellaProprietaId, adesso = null }) {
  const momento = tempo(adesso);
  const ordinate = [...teste].sort(perEtichetta);
  const perId = new Map(ordinate.map((t) => [t.id, t]));
  const pesate = pesaTeste(conChiave(ordinate), millesimi, tabellaProprietaId);
  const pesoPerId = new Map(pesate.map((t) => [t.chiave, t.peso]));

  const presenzaPerTesta = new Map(presenze.map((p) => [p.testa_id, p]));
  const delegheValide = deleghe.filter((d) => perId.has(d.delegante_testa_id) && (momento === null || tempo(d.ora_registrazione) <= momento));
  const delegaPerTesta = new Map(delegheValide.map((d) => [d.delegante_testa_id, d]));

  const perCalcolo = delegheValide.map((d) => ({
    delegante: d.delegante_testa_id,
    delegato_testa: d.delegato_testa_id ?? null,
    delegato_esterno: d.delegato_esterno ?? null,
    amministratore: Boolean(d.amministratore),
  }));
  const { presenti, avvisi: avvisiPresenze } = calcolaPresenti(
    presenze.filter((p) => perId.has(p.testa_id)).map((p) => ({ testa: p.testa_id, stato: inSala(p, momento) ? 'presente' : 'assente' })),
    perCalcolo,
  );

  const nomeDelegato = (d) => (d.delegato_testa_id ? perId.get(d.delegato_testa_id)?.etichetta ?? '?' : (d.delegato_esterno ?? '').trim());
  const righe = ordinate.map((testa) => {
    const presenza = presenzaPerTesta.get(testa.id);
    const diPersona = presenza ? inSala(presenza, momento) : false;
    const d = delegaPerTesta.get(testa.id);
    return {
      testa,
      peso: pesoPerId.get(testa.id) ?? 0,
      stato: diPersona ? 'presente' : presenti.has(testa.id) ? 'delega' : 'assente',
      delegato: d ? {
        nome: nomeDelegato(d),
        testa: d.delegato_testa_id ? perId.get(d.delegato_testa_id) ?? null : null,
        esterno: d.delegato_testa_id ? null : d.delegato_esterno ?? null,
        amministratore: Boolean(d.amministratore),
        // la delega fa contare la testa solo se chi la porta è in sala e il delegante non c'è di persona
        valida: !diPersona && presenti.has(testa.id),
        delega: d,
      } : null,
      oraIngresso: presenza?.ora_ingresso ?? null,
      oraUscita: presenza?.ora_uscita ?? null,
    };
  });

  const nome = (id) => perId.get(id)?.etichetta ?? '?';
  // chiave del delegato nel calcolo: id della testa oppure "esterno:nome in minuscolo"
  const nomeDaChiave = (chiave) => (perId.has(chiave) ? nome(chiave) : String(chiave).replace(/^esterno:/, '') || 'delegato esterno');
  const avvisi = [...avvisiPresenze, ...controllaDeleghe(pesate, perCalcolo)].map((a) => {
    switch (a.tipo) {
      case 'conflitto':
        return { tipo: a.tipo, testa: perId.get(a.testa), messaggio: `${nome(a.testa)} è presente di persona ma ha anche rilasciato una delega: conta una volta sola, la delega va tolta.` };
      case 'delegato_assente':
        return { tipo: a.tipo, testa: perId.get(a.testa), delegato: nome(a.delegato), messaggio: `${nome(a.testa)} ha delegato ${nome(a.delegato)}, che non è presente di persona: la testa non conta come presente.` };
      case 'amministratore':
        return { tipo: a.tipo, testa: perId.get(a.testa), messaggio: `${nome(a.testa)} ha delegato l'amministratore: la legge non lo consente.` };
      case 'oltre_quinto_teste':
        return { tipo: a.tipo, delegato: nomeDaChiave(a.delegato), teste: a.teste, messaggio: `${nomeDaChiave(a.delegato)} rappresenta per delega ${a.teste} teste: più di un quinto delle ${pesate.length} teste.` };
      case 'oltre_quinto_millesimi':
        return { tipo: a.tipo, delegato: nomeDaChiave(a.delegato), peso: a.peso, messaggio: `${nomeDaChiave(a.delegato)} rappresenta per delega ${millesimiTesto(a.peso)} millesimi: più di un quinto del totale.` };
      default:
        return { ...a, messaggio: a.tipo };
    }
  });

  return { righe, presenti, quorum: quorumCostitutivo(pesate, presenti, assemblea.convocazione), avvisi };
}

// Stato di un punto all'ordine del giorno.
// Per un punto aperto `presenti` è l'insieme attuale (statoSeduta().presenti); per un punto chiuso
// vale la fotografia salvata alla chiusura (punto.presenti_al_voto): chi è arrivato dopo è assente.
// Riguarda solo le teste con millesimi nella tabella del punto. `esito` è null se manca la maggioranza.
export function statoPunto({ punto, teste, millesimi, presenti, voti }) {
  const pesate = punto.tabella_id ? pesaTeste(conChiave([...teste].sort(perEtichetta)), millesimi, punto.tabella_id) : [];
  const alVoto = punto.votato_il ? new Set(punto.presenti_al_voto ?? []) : presenti;
  const perId = new Map(teste.map((t) => [t.id, t]));
  const votoPerTesta = new Map(
    voti.filter((v) => v.punto_id === undefined || v.punto_id === punto.id).map((v) => [v.testa_id, v.voto]),
  );

  const votanti = [];
  const assenti = [];
  for (const t of pesate) {
    const testa = perId.get(t.id);
    if (alVoto.has(t.id)) votanti.push({ testa, peso: t.peso, voto: votoPerTesta.get(t.id) ?? null });
    else assenti.push({ testa, peso: t.peso });
  }

  const esito = MAGGIORANZE[punto.maggioranza]
    ? esitoVoto(pesate, alVoto, votanti.filter((v) => v.voto).map((v) => ({ testa: v.testa.id, voto: v.voto })), punto.maggioranza)
    : null;

  return { votanti, assenti, esito, mancanti: votanti.filter((v) => !v.voto).length };
}
