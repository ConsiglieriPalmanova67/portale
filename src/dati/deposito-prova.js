// Deposito in memoria per la modalità prova e per i test: stessa interfaccia di deposito-supabase.js
// (vedi deposito.js), nessuna rete. Imita del database quel che serve a non scoprire gli errori
// solo sui dati veri: id generati, valori predefiniti, vincoli di unicità, eliminazioni a cascata.

// Tabelle con chiave primaria composta: non hanno la colonna id.
const SENZA_ID = new Set(['millesimi', 'rate', 'presenze', 'voti']);

const PREDEFINITI = {
  assemblee: () => ({
    convocazione: 'seconda', stato: 'bozza', luogo: null, ora: null, prima_data: null, prima_ora: null, prima_luogo: null,
    data_lettera: null, convocazione_path: null, ora_apertura: null, ora_appello: null, ora_chiusura: null,
  }),
  punti_odg: () => ({ tipo: 'delibera', candidati: [] }),
  presenze: () => ({ stato: 'assente' }),
  deleghe: () => ({ amministratore: false, ora_registrazione: new Date().toISOString() }),
  verbali: () => ({ stato: 'bozza' }),
  todo: () => ({ stato: 'aperto' }),
  documenti: () => ({ anno: null, data_documento: null, assemblea_id: null, nome_file: null, note: null, creato_il: new Date().toISOString() }),
  partite_terzi: () => ({ controparte: null, protocollo: null }),
  estrazioni: () => ({ tipo: 'fascicolo_rendiconto', stato: 'indice', modello: null, pagine: null, mappa: null, correzioni: {}, token_ingresso: 0, token_uscita: 0, creato_il: new Date().toISOString() }),
  estrazioni_blocchi: () => ({ parte: null, stato: 'in_attesa', dati: null, errore: null, tentativi: 0, token_ingresso: 0, token_uscita: 0 }),
};

const UNICI = {
  teste_assemblea: [['assemblea_id', 'chiave']],
  punti_odg: [['assemblea_id', 'ordine']],
  presenze: [['assemblea_id', 'testa_id']],
  deleghe: [['assemblea_id', 'delegante_testa_id']],
  voti: [['punto_id', 'testa_id']],
  stato_patrimoniale: [['esercizio_id', 'lato', 'ordine']],
  estrazioni_blocchi: [['estrazione_id', 'sezione', 'pagina_da']],
  posizioni: [['unita_id', 'esercizio_id', 'soggetto_id', 'ruolo']],
};

// colonna → valori ammessi (i vincoli "check" del database)
const AMMESSI = {
  documenti: { tipo: ['rendiconto', 'preventivo', 'riparto', 'verbale', 'convocazione', 'regolamento', 'comunicazione', 'altro'] },
  // vuota = etichetta ricavata dal collegamento all'assemblea (vedi etichettaTodo)
  todo: { etichetta: [null, undefined, 'segnalazione', 'deliberato'] },
  stato_patrimoniale: { lato: ['attivita', 'passivita'] },
  partite_terzi: { tipo: ['credito', 'debito'] },
  estrazioni: { tipo: ['fascicolo_rendiconto', 'verbale'], stato: ['indice', 'lettura', 'revisione', 'importata', 'annullata'] },
  estrazioni_blocchi: { stato: ['in_attesa', 'in_corso', 'fatto', 'errore'] },
};
// colonne che non possono restare vuote
const OBBLIGATORI = { documenti: ['titolo', 'tipo', 'file_path'], estrazioni: ['documento_id', 'anno'], estrazioni_blocchi: ['estrazione_id', 'sezione', 'pagina_da', 'pagina_a'] };

// tabella eliminata → [tabella figlia, colonna che la collega]
const CASCATA = {
  assemblee: [['teste_assemblea', 'assemblea_id'], ['punti_odg', 'assemblea_id'], ['presenze', 'assemblea_id'], ['deleghe', 'assemblea_id'], ['verbali', 'assemblea_id']],
  teste_assemblea: [['presenze', 'testa_id'], ['deleghe', 'delegante_testa_id'], ['voti', 'testa_id']],
  punti_odg: [['voti', 'punto_id']],
  esercizi: [['stato_patrimoniale', 'esercizio_id'], ['partite_terzi', 'esercizio_id'], ['spese', 'esercizio_id'], ['posizioni', 'esercizio_id']],
  posizioni: [['rate', 'posizione_id']],
  documenti: [['estrazioni', 'documento_id']],
  estrazioni: [['estrazioni_blocchi', 'estrazione_id']],
};
// tabella eliminata → [tabella collegata, colonna che viene svuotata] ("on delete set null")
const SVUOTA = {
  assemblee: [['documenti', 'assemblea_id'], ['todo', 'assemblea_id']],
  punti_odg: [['todo', 'punto_id']],
};

const copia = (valore) => structuredClone(valore);
const corrisponde = (riga, filtri) => Object.entries(filtri).every(([colonna, valore]) =>
  (Array.isArray(valore) ? valore.includes(riga[colonna]) : riga[colonna] === valore));

// `fileIniziali`: { 'bucket/percorso': contenuto } per i file già in archivio nei dati di prova.
export function creaDepositoProva(iniziali = {}, fileIniziali = {}) {
  const tabelle = new Map(Object.entries(copia(iniziali)));
  const file = new Map(Object.entries(fileIniziali));
  const ascoltatori = new Set();

  const righeDi = (tabella) => {
    if (!tabelle.has(tabella)) tabelle.set(tabella, []);
    return tabelle.get(tabella);
  };

  function controllaUnicita(tabella, righe) {
    const vincoli = [...(UNICI[tabella] ?? []), ...(SENZA_ID.has(tabella) ? [] : [['id']])];
    for (const colonne of vincoli) {
      const viste = new Set();
      for (const riga of righe) {
        const chiave = JSON.stringify(colonne.map((c) => riga[c]));
        if (viste.has(chiave)) throw new Error(`${tabella}: esiste già una riga con ${colonne.join(' e ')} uguali.`);
        viste.add(chiave);
      }
    }
    for (const riga of righe) {
      for (const colonna of OBBLIGATORI[tabella] ?? []) {
        if (riga[colonna] === null || riga[colonna] === undefined || riga[colonna] === '') throw new Error(`${tabella}: manca ${colonna}.`);
      }
      for (const [colonna, valori] of Object.entries(AMMESSI[tabella] ?? {})) {
        if (!valori.includes(riga[colonna])) throw new Error(`${tabella}: ${colonna} non è tra i valori ammessi.`);
      }
    }
    if (tabella === 'deleghe') {
      for (const d of righe) {
        if (!d.delegato_testa_id && !d.delegato_esterno) throw new Error('deleghe: manca il delegato.');
        if (d.delegato_testa_id && d.delegato_testa_id === d.delegante_testa_id) throw new Error('deleghe: una testa non può delegare sé stessa.');
      }
    }
  }

  // Le scritture lavorano su una copia e la sostituiscono solo se i vincoli reggono: o tutto o niente.
  function scrivi(tabella, modifica) {
    const bozza = copia(righeDi(tabella));
    const risultato = modifica(bozza);
    controllaUnicita(tabella, bozza);
    tabelle.set(tabella, bozza);
    return risultato;
  }

  function avvisa(tabella) {
    for (const a of ascoltatori) {
      if (a.tabelle.has(tabella)) queueMicrotask(() => ascoltatori.has(a) && a.callback(tabella));
    }
  }

  const nuovaRiga = (tabella, riga) => ({
    ...(SENZA_ID.has(tabella) ? {} : { id: crypto.randomUUID() }),
    ...(PREDEFINITI[tabella]?.() ?? {}),
    ...copia(riga),
  });

  const conChiave = (chiave) => {
    if (!chiave || !Object.keys(chiave).length) throw new Error('Serve una chiave: senza, l\'operazione toccherebbe tutte le righe.');
  };

  function eliminaRighe(tabella, filtri) {
    const tolte = righeDi(tabella).filter((r) => corrisponde(r, filtri));
    if (!tolte.length) return 0;
    tabelle.set(tabella, righeDi(tabella).filter((r) => !corrisponde(r, filtri)));
    for (const [figlia, colonna] of CASCATA[tabella] ?? []) {
      eliminaRighe(figlia, { [colonna]: tolte.map((r) => r.id) });
    }
    for (const [collegata, colonna] of SVUOTA[tabella] ?? []) {
      const orfane = righeDi(collegata).filter((r) => tolte.some((t) => t.id === r[colonna]));
      for (const r of orfane) r[colonna] = null;
      if (orfane.length) avvisa(collegata);
    }
    avvisa(tabella);
    return tolte.length;
  }

  return {
    async leggi(tabella, filtri = {}) {
      return copia(righeDi(tabella).filter((r) => corrisponde(r, filtri)));
    },

    async inserisci(tabella, righe) {
      const nuove = scrivi(tabella, (bozza) => {
        const aggiunte = righe.map((r) => nuovaRiga(tabella, r));
        bozza.push(...aggiunte);
        return aggiunte;
      });
      if (nuove.length) avvisa(tabella);
      return copia(nuove);
    },

    async aggiorna(tabella, chiave, valori) {
      conChiave(chiave);
      const aggiornate = scrivi(tabella, (bozza) => bozza.filter((r) => corrisponde(r, chiave)).map((r) => Object.assign(r, copia(valori))));
      if (aggiornate.length) avvisa(tabella);
      return copia(aggiornate);
    },

    async salva(tabella, righe, colonneChiave) {
      if (!colonneChiave?.length) throw new Error('Servono le colonne chiave per sapere quali righe esistono già.');
      const salvate = scrivi(tabella, (bozza) => righe.map((riga) => {
        const esistente = bozza.find((r) => colonneChiave.every((c) => r[c] === riga[c]));
        if (esistente) return Object.assign(esistente, copia(riga));
        const nuova = nuovaRiga(tabella, riga);
        bozza.push(nuova);
        return nuova;
      }));
      if (salvate.length) avvisa(tabella);
      return copia(salvate);
    },

    async elimina(tabella, chiave) {
      conChiave(chiave);
      return eliminaRighe(tabella, chiave);
    },

    async caricaFile(bucket, percorso, contenuto) {
      file.set(`${bucket}/${percorso}`, contenuto);
      return percorso;
    },

    async urlFile(bucket, percorso) {
      const contenuto = file.get(`${bucket}/${percorso}`);
      if (!contenuto) throw new Error(`File non trovato: ${percorso}`);
      return URL.createObjectURL(contenuto);
    },

    async eliminaFile(bucket, percorso) {
      file.delete(`${bucket}/${percorso}`);
    },

    ascolta(elenco, callback) {
      const ascoltatore = { tabelle: new Set(elenco), callback };
      ascoltatori.add(ascoltatore);
      return () => ascoltatori.delete(ascoltatore);
    },
  };
}
