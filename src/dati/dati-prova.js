// Dati finti per la modalità prova: un condominio inventato di 26 unità e 25 teste.
// Nessun nome o importo reale. Ogni chiamata restituisce una copia nuova.
// Qui anagrafica e contabilità; assemblee, verbali, to-do e documenti stanno in dati-prova-assemblee.js.
import { assembleeProva, fileProva as fileAssemblee } from './dati-prova-assemblee.js';
import { fascicoloProva } from './fascicolo-prova.js';
import { pdfDiTesto } from './pdf-finto.js';

// I file già in archivio: quelli delle assemblee e dei documenti, più il PDF del fascicolo di fantasia
// (vedi fascicolo-prova.js) da cui in modalità prova si provano l'estrazione dei dati e la revisione.
export function fileProva() {
  const pagine = fascicoloProva(datiProva()).righePagina;
  return { ...fileAssemblee(), 'documenti/2026/doc-fascicolo-2026.pdf': new Blob([pdfDiTesto(pagine)], { type: 'application/pdf' }) };
}

const T_GENERALI = 'tab-generali';
const T_PROPRIETA = 'tab-proprieta';
const T_SCALA_A = 'tab-scala-a';
const T_TORRE_1 = 'tab-torre-1';

// Millesimi di proprietà delle unità A1…A26 (somma 1000).
const PROPRIETA = [52.5, 47.5, 44, 41.25, 38.75, 36, 40, 35, 42, 33, 39.5, 30.5, 45, 37, 31, 43, 34, 36.5, 38.5, 32, 41, 29, 46, 35.5, 40.5, 31];
// Torre 1 = unità A15…A26 (somma 1000).
const TORRE_1 = [80, 80, 80, 80, 80, 100, 80, 80, 80, 80, 80, 100];

// Proprietari delle unità da A6 in poi, uno per unità.
const SINGOLI = ['LAGHI Lia', 'MONTI Marco', 'NEVI Nora', 'ORTI Omar', 'PRATI VERDI S.R.L.', 'QUERCE Rino', 'RIVI Rosa', 'SASSI Sara', 'TORRI Tino',
  'UVE Ugo', 'VALLI Vera', 'ZOLLE Zeno', 'ABETI Aldo', 'BRINA Bice', 'CIELI Ciro', 'DUNE Dora', 'ERBE Ezio', 'FONTI Fede', 'GHIAIE Gino', 'ISOLE Ines', 'LUNE Livio'];

const dueCifre = (n) => String(n).padStart(2, '0');

// Esercizi, conti, spese, situazione patrimoniale e partite verso terzi.
// Tre anni: 2024 e 2025 con preventivo e consuntivo, 2026 con il solo preventivo.
function contabilitaProva() {
  const esercizio = (id, anno, tipo) => ({ id, anno, tipo, inizio: `${anno}-01-01`, fine: `${anno}-12-31` });
  const esercizi = [
    esercizio('es-2024-prev', 2024, 'preventivo'), esercizio('es-2024', 2024, 'consuntivo'),
    esercizio('es-2025-prev', 2025, 'preventivo'), esercizio('es-2025', 2025, 'consuntivo'),
    esercizio('es-2026', 2026, 'preventivo'),
  ];
  const conti = [
    { id: 'c1', gruppo: 'SPESE GENERALI', sottoconto: 'PULIZIE', tabella_id: T_GENERALI },
    { id: 'c2', gruppo: 'SPESE GENERALI', sottoconto: 'GIARDINO', tabella_id: T_GENERALI },
    { id: 'c3', gruppo: 'ASCENSORE SCALA A', sottoconto: 'MANUTENZIONE', tabella_id: T_SCALA_A },
    { id: 'c4', gruppo: 'SPESE GENERALI', sottoconto: 'ASSICURAZIONE', tabella_id: T_GENERALI },
    { id: 'c5', gruppo: 'ASCENSORE SCALA A', sottoconto: 'ENERGIA ELETTRICA', tabella_id: T_SCALA_A },
    { id: 'c6', gruppo: 'RISCALDAMENTO TORRE 1', sottoconto: 'GAS', tabella_id: T_TORRE_1 },
    { id: 'c7', gruppo: 'SPESE GENERALI', sottoconto: 'VIDEOSORVEGLIANZA', tabella_id: T_GENERALI },
  ];
  const fornitori = [
    { id: 'f1', denominazione: 'PULITO ESEMPIO S.N.C.' }, { id: 'f2', denominazione: 'ASCENSORI DI PROVA S.P.A.' },
    { id: 'f3', denominazione: 'GAS FINTO S.R.L.' }, { id: 'f4', denominazione: 'ASSICURAZIONI ESEMPIO S.P.A.' },
  ];
  const spesa = (id, esercizio_id, conto_id, descrizione, fornitore_id, importo) =>
    ({ id, esercizio_id, conto_id, protocollo: id.toUpperCase(), descrizione, fornitore_id, numero_fattura: null, data_fattura: null, data_pagamento: null, importo });
  // nei preventivi c'è una riga per voce, con la descrizione uguale al nome della voce
  const nomeVoce = new Map(conti.map((c) => [c.id, c.sottoconto.charAt(0) + c.sottoconto.slice(1).toLowerCase()]));
  const preventivo = (esercizio_id, sigla, voci) => Object.entries(voci).map(([conto_id, importo]) =>
    ({ ...spesa(`${sigla}-${conto_id}`, esercizio_id, conto_id, nomeVoce.get(conto_id), null, importo), protocollo: null }));
  const spese = [
    // 2024: preventivo 11.900,00 — consuntivo 12.376,05
    ...preventivo('es-2024-prev', 'pv24', { c1: '-2300.00', c2: '-500.00', c4: '-1800.00', c3: '-900.00', c5: '-400.00', c6: '-6000.00' }),
    spesa('sp24-1', 'es-2024', 'c1', 'Pulizia scale primo semestre', 'f1', '-1150.00'),
    spesa('sp24-2', 'es-2024', 'c1', 'Pulizia scale secondo semestre', 'f1', '-1180.00'),
    spesa('sp24-3', 'es-2024', 'c2', 'Taglio del prato e potature', null, '-450.00'),
    spesa('sp24-4', 'es-2024', 'c4', 'Polizza globale fabbricati', 'f4', '-1800.00'),
    spesa('sp24-5', 'es-2024', 'c3', 'Canone manutenzione ascensore', 'f2', '-880.00'),
    spesa('sp24-6', 'es-2024', 'c5', 'Energia elettrica ascensore', null, '-465.30'),
    spesa('sp24-7', 'es-2024', 'c6', 'Gas primo semestre', 'f3', '-3100.00'),
    spesa('sp24-8', 'es-2024', 'c6', 'Gas secondo semestre', 'f3', '-3350.75'),
    // 2025: preventivo 12.600,00 — consuntivo 12.346,10
    ...preventivo('es-2025-prev', 'pv25', { c1: '-2400.00', c2: '-500.00', c4: '-1850.00', c3: '-900.00', c5: '-450.00', c6: '-6500.00' }),
    spesa('sp1', 'es-2025', 'c1', 'Pulizia scale primo semestre', 'f1', '-1200.00'),
    spesa('sp2', 'es-2025', 'c1', 'Pulizia scale secondo semestre', 'f1', '-1250.00'),
    spesa('sp3', 'es-2025', 'c2', 'Potatura siepi', null, '-480.50'),
    spesa('sp4', 'es-2025', 'c3', 'Canone manutenzione ascensore', 'f2', '-900.00'),
    spesa('sp7', 'es-2025', 'c4', 'Polizza globale fabbricati', 'f4', '-1875.00'),
    spesa('sp8', 'es-2025', 'c5', 'Energia elettrica ascensore', null, '-430.20'),
    spesa('sp9', 'es-2025', 'c6', 'Gas primo semestre', 'f3', '-3000.00'),
    spesa('sp10', 'es-2025', 'c6', 'Gas secondo semestre', 'f3', '-3210.40'),
    // 2026: solo preventivo, 13.500,00, con una voce nuova (videosorveglianza)
    ...preventivo('es-2026', 'pv26', { c1: '-2500.00', c2: '-500.00', c4: '-1900.00', c7: '-800.00', c3: '-950.00', c5: '-450.00', c6: '-6400.00' }),
  ];

  // Situazione patrimoniale a fine 2025: attività e passività coincidono (11.230,75).
  const voce = (lato, ordine, nome, importo) => ({ id: `sp-${lato}-${ordine}`, esercizio_id: 'es-2025', lato, ordine, voce: nome, importo });
  const stato_patrimoniale = [
    voce('attivita', 1, 'Banca c/c ordinario', '8450.30'), voce('attivita', 2, 'Cassa contanti', '120.00'),
    voce('attivita', 3, 'Crediti verso condomini', '2310.45'), voce('attivita', 4, 'Crediti verso terzi', '350.00'),
    voce('passivita', 1, 'Debiti verso fornitori', '3980.25'), voce('passivita', 2, 'Fondo di riserva', '5000.00'),
    voce('passivita', 3, 'Debiti verso condomini (saldi a credito)', '1650.50'), voce('passivita', 4, 'Fondo lavori straordinari', '600.00'),
  ];
  // Crediti (350,00) e debiti (3.980,25) verso terzi a fine 2025: gli stessi totali delle voci qui sopra.
  const partita = (n, tipo, controparte, descrizione, importo) =>
    ({ id: `pt-${n}`, esercizio_id: 'es-2025', tipo, controparte, protocollo: controparte ? `PT${n}` : null, descrizione, importo });
  const partite_terzi = [
    partita(1, 'credito', 'ASSICURAZIONI ESEMPIO S.P.A.', 'Rimborso di un sinistro da incassare', '350.00'),
    partita(2, 'debito', 'PULITO ESEMPIO S.N.C.', 'Fattura pulizie di novembre', '625.00'),
    partita(3, 'debito', 'PULITO ESEMPIO S.N.C.', 'Fattura pulizie di dicembre', '625.00'),
    partita(4, 'debito', 'ASCENSORI DI PROVA S.P.A.', 'Canone del quarto trimestre', '450.00'),
    partita(5, 'debito', 'GAS FINTO S.R.L.', 'Conguaglio gas di dicembre', '1980.25'),
    partita(6, 'debito', null, 'Ritenute d\'acconto da versare', '300.00'),
  ];
  return { esercizi, conti, fornitori, spese, stato_patrimoniale, partite_terzi };
}

export function datiProva() {
  const unita = PROPRIETA.map((_, i) => ({ id: `u${dueCifre(i + 1)}`, codice: `A${i + 1}`, tipo: 'appartamento', piano: null, interno: null, note: null }));

  const nomi = ['ALBERI Ada', 'BOSCHI Bruno', 'CAMPI Carla', 'DORIA Dino', 'ELMI Elena', 'FIORI Franco', 'GALLI Gina', ...SINGOLI];
  const soggetti = nomi.map((denominazione, i) => ({ id: `s${dueCifre(i + 1)}`, denominazione, email: null, telefono: null, note: null }));
  soggetti[1].note = 'Comproprietario con CAMPI Carla';

  const titolo = (unita_id, soggetto_id, ruolo = 'proprietario', dal = null, al = null) =>
    ({ id: `tit-${unita_id}-${soggetto_id}-${ruolo}`, unita_id, soggetto_id, ruolo, dal, al });
  const titolarita = [
    titolo('u01', 's01'), titolo('u02', 's01'), // stesso proprietario su due unità: una testa
    titolo('u03', 's02'), titolo('u03', 's03'), // comproprietari: una testa
    titolo('u04', 's04'), titolo('u04', 's05', 'conduttore'), // il conduttore non vota
    titolo('u05', 's06', 'proprietario', null, '2025-06-30'), titolo('u05', 's07', 'proprietario', '2025-07-01'), // cambio di proprietà
    ...SINGOLI.map((_, i) => titolo(`u${dueCifre(i + 6)}`, `s${dueCifre(i + 8)}`)),
  ];

  const tabelle_millesimali = [
    { id: T_GENERALI, nome: '1 - Spese generali', ambito: 'condominio', totale_dichiarato: '1000.000' },
    { id: T_SCALA_A, nome: '2 - Ascensore Scala A', ambito: 'Scala A', totale_dichiarato: '1000.000' },
    { id: T_PROPRIETA, nome: '4 - Proprietà', ambito: 'condominio', totale_dichiarato: '1000.000' },
    { id: T_TORRE_1, nome: '8 - Spese generali Torre 1', ambito: 'Torre 1', totale_dichiarato: '1000.000' },
  ];
  const millesimi = [
    ...unita.flatMap((u, i) => [T_GENERALI, T_PROPRIETA].map((tabella_id) => ({ unita_id: u.id, tabella_id, valore: PROPRIETA[i].toFixed(3) }))),
    ...unita.slice(0, 10).map((u) => ({ unita_id: u.id, tabella_id: T_SCALA_A, valore: '100.000' })),
    ...unita.slice(14).map((u, i) => ({ unita_id: u.id, tabella_id: T_TORRE_1, valore: TORRE_1[i].toFixed(3) })),
  ];

  const posizioni = [
    { id: 'pos1', unita_id: 'u01', esercizio_id: 'es-2025', soggetto_id: 's01', ruolo: 'proprietario', totale_gestione: '-310.20', saldo_precedente: '12.00', rate_versate: '300.00', saldo_finale: '1.80' },
    { id: 'pos2', unita_id: 'u04', esercizio_id: 'es-2025', soggetto_id: 's04', ruolo: 'proprietario', totale_gestione: '-150.00', saldo_precedente: '0.00', rate_versate: '150.00', saldo_finale: '0.00' },
    { id: 'pos3', unita_id: 'u04', esercizio_id: 'es-2025', soggetto_id: 's05', ruolo: 'conduttore', totale_gestione: '-95.40', saldo_precedente: '0.00', rate_versate: '80.00', saldo_finale: '-15.40' },
    { id: 'pos4', unita_id: 'u01', esercizio_id: 'es-2026', soggetto_id: 's01', ruolo: 'proprietario', totale_gestione: '-320.00', saldo_precedente: '1.80', rate_versate: null, saldo_finale: '-318.20' },
  ];
  const rate = [
    { posizione_id: 'pos4', numero: 1, scadenza: '2026-03-31', importo: '-159.10' },
    { posizione_id: 'pos4', numero: 2, scadenza: '2026-09-30', importo: '-159.10' },
  ];

  const consiglieri = [
    { id: 'cons1', soggetto_id: 's01', utente_id: 'utente-prova', carica: 'Presidente', parte_rappresentata: 'Scala A', inizio_mandato: '2025-05-20', fine_mandato: null, assemblea_nomina_id: null },
    { id: 'cons2', soggetto_id: 's20', utente_id: null, carica: 'Consigliere', parte_rappresentata: 'Torre 1', inizio_mandato: '2025-05-20', fine_mandato: null, assemblea_nomina_id: null },
    { id: 'cons3', soggetto_id: 's09', utente_id: null, carica: 'Consigliere', parte_rappresentata: 'Intero condominio', inizio_mandato: '2023-05-10', fine_mandato: '2025-05-19', assemblea_nomina_id: null },
  ];

  const anagrafica = { unita, soggetti, titolarita, tabelle_millesimali, millesimi };
  return {
    ...anagrafica, ...contabilitaProva(), posizioni, rate, consiglieri,
    ...assembleeProva(anagrafica, { proprieta: T_PROPRIETA, scalaA: T_SCALA_A }),
  };
}
