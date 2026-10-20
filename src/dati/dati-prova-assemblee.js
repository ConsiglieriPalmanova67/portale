// Dati finti per la modalità prova: assemblee, verbali, to-do e documenti. Tre assemblee:
//   - asm-prova (2026): preparata, ancora da aprire, per provare la seduta dal vivo;
//   - asm-2025: conclusa con la seduta registrata (teste congelate, presenze, una delega, voti ed esiti calcolati);
//   - asm-2024: archiviata come già svolta, senza seduta: esiti e testi delle delibere registrati a mano.
import { costruisciModello } from './modello.js';
import { congelaTeste, statoPunto } from '../assemblea/seduta.js';
import { esitoManuale } from '../assemblea/delibere.js';

const dueCifre = (n) => String(n).padStart(2, '0');

const assemblea = (valori) => ({
  convocazione: 'seconda', luogo: null, ora: null, prima_data: null, prima_ora: null, prima_luogo: null, data_lettera: null, convocazione_path: null,
  ora_apertura: null, ora_appello: null, ora_chiusura: null, stato: 'bozza', ...valori,
});
const punto = (id, assemblea_id, ordine, testo, extra = {}) => ({
  id, assemblea_id, ordine, testo, tipo: 'delibera', candidati: [], tabella_id: null, maggioranza: null,
  votato_il: null, presenti_al_voto: null, esito: null, note: null, ...extra,
});

// Seduta del 20/05/2025: 25 teste congelate a quella data, 16 presenti di persona, una per delega, tre votazioni chiuse.
function seduta2025(anagrafica, tabellaProprieta) {
  const id = 'asm-2025';
  const teste = congelaTeste(costruisciModello(anagrafica, '2025-05-20')).map((t, i) => ({ id: `t25-${dueCifre(i + 1)}`, assemblea_id: id, ...t }));
  const inSala = teste.slice(0, 16);
  const delegante = teste[16];
  const presenze = teste.map((t) => (inSala.includes(t)
    ? { assemblea_id: id, testa_id: t.id, stato: 'presente', ora_ingresso: '2025-05-20T19:00:00Z', ora_uscita: null }
    : { assemblea_id: id, testa_id: t.id, stato: 'assente', ora_ingresso: null, ora_uscita: null }));
  const deleghe = [{
    id: 'del25-1', assemblea_id: id, delegante_testa_id: delegante.id, delegato_testa_id: inSala[0].id, delegato_esterno: null,
    amministratore: false, nota: null, scansione_path: null, ora_registrazione: '2025-05-20T19:02:00Z',
  }];
  const presenti = [...inSala, delegante].map((t) => t.id);

  // per ogni punto: quanti dei 17 presenti sono contrari e quanti astenuti (gli altri favorevoli)
  const schema = [
    ['p25-1', 'Approvazione del rendiconto 2024 e del relativo riparto', 'terzo', 0, 0, 'Rendiconto approvato all\'unanimità dei presenti.'],
    ['p25-2', 'Approvazione del preventivo 2025', 'terzo', 3, 1, null],
    ['p25-3', 'Installazione di un impianto di videosorveglianza', 'meta', 12, 0, 'Proposta respinta: se ne riparlerà con nuovi preventivi.'],
  ];
  const voti = [];
  const punti = schema.map(([puntoId, testo, maggioranza, contrari, astenuti, note], i) => {
    const delPunto = presenti.map((testa_id, n) => ({ punto_id: puntoId, testa_id, voto: n < contrari ? 'contrario' : n < contrari + astenuti ? 'astenuto' : 'favorevole' }));
    voti.push(...delPunto);
    const base = punto(puntoId, id, i + 1, testo, { tabella_id: tabellaProprieta, maggioranza, note });
    // l'esito è quello che il portale calcola alla chiusura della votazione
    const { esito } = statoPunto({ punto: base, teste, millesimi: anagrafica.millesimi, presenti: new Set(presenti), voti: delPunto });
    return { ...base, votato_il: `2025-05-20T${['19:30', '19:45', '20:05'][i]}:00Z`, presenti_al_voto: presenti, esito };
  });
  return { teste, presenze, deleghe, voti, punti };
}

export function assembleeProva(anagrafica, tabelle) {
  const s25 = seduta2025(anagrafica, tabelle.proprieta);
  const assemblee = [
    assemblea({
      id: 'asm-prova', data: '2026-11-20', ora: '20:30:00', tipo: 'ordinaria', luogo: 'Sala comune (esempio)',
      prima_data: '2026-11-19', prima_ora: '07:00:00', prima_luogo: 'Studio di prova, via Finta 1', data_lettera: '2026-10-28',
      convocazione_path: 'convocazioni/asm-prova.pdf',
    }),
    assemblea({
      id: 'asm-2025', data: '2025-05-20', ora: '21:00:00', tipo: 'ordinaria', luogo: 'Sala comune (esempio)', stato: 'chiusa', data_lettera: '2025-04-28',
      ora_apertura: '2025-05-20T19:05:00Z', ora_appello: '2025-05-20T19:15:00Z', ora_chiusura: '2025-05-20T21:10:00Z',
      convocazione_path: 'convocazioni/asm-2025.pdf',
    }),
    assemblea({ id: 'asm-2024', data: '2024-04-18', ora: '20:30:00', tipo: 'ordinaria', luogo: 'Sala comune (esempio)', stato: 'chiusa' }),
  ];
  const punti_odg = [
    punto('punto-prova-1', 'asm-prova', 1, 'Approvazione del rendiconto 2025', { tabella_id: tabelle.proprieta, maggioranza: 'terzo' }),
    punto('punto-prova-2', 'asm-prova', 2, 'Sostituzione della cabina dell\'ascensore della Scala A', { tabella_id: tabelle.scalaA, maggioranza: 'meta' }),
    punto('punto-prova-3', 'asm-prova', 3, 'Nomina dei consiglieri', {
      tabella_id: tabelle.proprieta, maggioranza: 'terzo', tipo: 'nomina_consiglieri',
      candidati: [{ soggetto_id: 's01', parte_rappresentata: 'Scala A' }, { soggetto_id: 's21', parte_rappresentata: 'Torre 1' }],
    }),
    ...s25.punti,
    // assemblea archiviata: tabella e maggioranza possono mancare, come dopo l'importazione di una convocazione
    punto('p24-1', 'asm-2024', 1, 'Approvazione del rendiconto 2023', { tabella_id: tabelle.proprieta, maggioranza: 'terzo', esito: esitoManuale(true), note: 'Approvato all\'unanimità dei presenti, come da verbale.' }),
    punto('p24-2', 'asm-2024', 2, 'Rifacimento dell\'impermeabilizzazione del tetto della Torre 1', { esito: esitoManuale(false), note: 'Respinta: il preventivo è stato ritenuto troppo alto.' }),
    punto('p24-3', 'asm-2024', 3, 'Sostituzione del cancello carraio', { esito: esitoManuale(null), note: 'Rinviata alla prossima assemblea in attesa di un secondo preventivo.' }),
    punto('p24-4', 'asm-2024', 4, 'Varie ed eventuali'),
  ];
  const verbali = [
    { id: 'verb-2025', assemblea_id: 'asm-2025', file_path: 'asm-2025/verb-2025.txt', testo: 'Verbale di esempio dell\'assemblea del 20 maggio 2025.', stato: 'definitivo' },
    { id: 'verb-2024', assemblea_id: 'asm-2024', file_path: null, testo: 'Verbale di esempio, solo testo.', stato: 'bozza' },
  ];
  const todo = [
    { id: 'todo-1', titolo: 'Chiedere un secondo preventivo per il cancello carraio', descrizione: null, assemblea_id: 'asm-2024', punto_id: 'p24-3', responsabile: 'Amministratore', data_apertura: '2024-04-18', scadenza: '2024-09-30', data_chiusura: '2024-09-12', stato: 'chiuso', criticita: null },
    { id: 'todo-2', titolo: 'Raccogliere nuovi preventivi per la videosorveglianza', descrizione: 'Almeno tre preventivi, con e senza registrazione.', assemblea_id: 'asm-2025', punto_id: 'p25-3', responsabile: 'Consiglio', data_apertura: '2025-05-20', scadenza: '2026-12-15', data_chiusura: null, stato: 'aperto', criticita: 'Due ditte non hanno ancora risposto.' },
    { id: 'todo-3', titolo: 'Aggiornare la bacheca dell\'ingresso', descrizione: null, assemblea_id: null, punto_id: null, responsabile: null, data_apertura: '2026-09-01', scadenza: null, data_chiusura: null, stato: 'in_corso', criticita: null },
  ];
  const documento = (id, titolo, tipo, anno, data_documento, assemblea_id, note = null) => ({
    id, titolo, tipo, anno, data_documento, assemblea_id, file_path: `${anno ?? 'senza-anno'}/${id}.txt`, nome_file: `${id}-esempio.txt`, note,
    creato_da: null, creato_il: '2026-03-20T10:00:00Z', modificato_da: null, modificato_il: null,
  });
  const documenti = [
    documento('doc-rendiconto-2025', 'Rendiconto consuntivo 2025', 'rendiconto', 2025, '2026-03-15', 'asm-prova', 'Documento di esempio: all\'ordine del giorno della prossima assemblea.'),
    documento('doc-preventivo-2026', 'Preventivo 2026', 'preventivo', 2026, '2026-03-15', 'asm-prova'),
    documento('doc-regolamento', 'Regolamento di condominio', 'altro', null, null, null),
    // l'unico PDF vero dell'archivio di prova: il fascicolo di fantasia da cui provare l'estrazione dei dati
    { ...documento('doc-fascicolo-2026', 'Fascicolo del rendiconto 2026 (di fantasia)', 'rendiconto', 2026, '2027-03-10', null, 'PDF di esempio: da qui si prova «Estrai i dati».'),
      file_path: '2026/doc-fascicolo-2026.pdf', nome_file: 'fascicolo-2026-esempio.pdf' },
  ];
  return {
    assemblee, punti_odg, teste_assemblea: s25.teste, presenze: s25.presenze, deleghe: s25.deleghe, voti: s25.voti, verbali, todo, documenti,
  };
}

// I file che nei dati di prova risultano già in archivio: { 'bucket/percorso': contenuto }. Sono brevi testi finti.
export function fileProva() {
  const finto = (testo) => new Blob([`${testo}\n\nFile di esempio della modalità prova: non è un documento vero.\n`], { type: 'text/plain;charset=utf-8' });
  return {
    'documenti/2025/doc-rendiconto-2025.txt': finto('Rendiconto consuntivo 2025'),
    'documenti/2026/doc-preventivo-2026.txt': finto('Preventivo 2026'),
    'documenti/senza-anno/doc-regolamento.txt': finto('Regolamento di condominio'),
    'verbali/convocazioni/asm-prova.pdf': finto('Convocazione dell\'assemblea del 20 novembre 2026'),
    'verbali/convocazioni/asm-2025.pdf': finto('Convocazione dell\'assemblea del 20 maggio 2025'),
    'verbali/asm-2025/verb-2025.txt': finto('Verbale dell\'assemblea del 20 maggio 2025'),
  };
}
