// Istruzioni e schemi di risposta per la lettura di un fascicolo di rendiconto condominiale: una voce per tipo di sezione.
// Gli schemi rispettano i limiti della risposta strutturata dell'API: ogni oggetto ha tutti i campi obbligatori e
// nessun campo in più; un valore assente è una stringa vuota. Importi, millesimi e date sono testo, come stampati:
// li interpreta il portale (src/estrazione/numeri.js), così nulla viene "sistemato" durante la lettura.

type Schema = Record<string, unknown>;
const testo = { type: "string" };
const intero = { type: "integer" };
const oggetto = (campi: Record<string, Schema>): Schema => ({ type: "object", properties: campi, required: Object.keys(campi), additionalProperties: false });
const elenco = (voce: Schema): Schema => ({ type: "array", items: voce });
const scelta = (...valori: string[]): Schema => ({ type: "string", enum: valori });

// Le celle di lettura dubbia: il portale le mette in evidenza nella revisione.
const incerte = elenco(oggetto({ pagina: intero, riga: testo, campo: testo, nota: testo }));

export const ISTRUZIONI_GENERALI = `Sei un trascrittore di documenti contabili. Ricevi alcune pagine, di solito scansionate, di un documento di un condominio italiano (un fascicolo di rendiconto oppure un verbale di assemblea) e ne trascrivi i dati in forma strutturata. Il risultato viene poi verificato con controlli di quadratura e rivisto da una persona: per questo conta che ogni valore sia esattamente quello stampato.

Regole valide per ogni sezione:
- Trascrivi esattamente ciò che è stampato. Non correggere, non completare, non dedurre, non ricalcolare: se una somma stampata ti sembra sbagliata, trascrivila com'è.
- Le pagine possono essere ruotate di 90 gradi nella scansione: leggi sempre il testo nel suo orientamento naturale.
- Importi: testo, come stampati, con il loro segno (per esempio "-1.250,00", "2.310,45", "0,00"). Non cambiare il segno e non togliere i separatori.
- Millesimi: testo, come stampati, senza le parentesi (per esempio "0,412", "1.000,000", "0").
- Date: come stampate (per esempio "15/03/2025").
- Un campo vuoto nel documento resta una stringa vuota. Non inventare valori e non copiarli dalla riga sopra.
- Nomi, descrizioni e codici vanno copiati carattere per carattere, compresi asterischi, barre, trattini e abbreviazioni; se un testo è troncato nel documento, resta troncato.
- Numero di pagina: usa sempre il numero della pagina nel fascicolo, secondo la corrispondenza indicata nel messaggio (non il numero "Pag." stampato in fondo al foglio).
- Se una cifra o una parola è poco leggibile (scansione sbiadita, macchia, cifre che si confondono come 3/8, 1/7, 5/6, 0/6), trascrivi la lettura più probabile e aggiungi una voce in "incerte" con pagina, riga (il codice dell'unità o il protocollo), campo e una nota breve. Se non c'è nulla di dubbio "incerte" è un elenco vuoto.
- Non saltare righe e non riassumere: ogni riga del documento diventa una voce.`;

type Sezione = { istruzioni: string; schema: Schema; maxToken: number };

export const SEZIONI: Record<string, Sezione> = {
  indice: {
    maxToken: 8000,
    istruzioni: `Queste sono pagine dell'intero fascicolo. Non trascrivere i dati: individua le sezioni e per ognuna indica tipo e intervallo di pagine. Ogni pagina deve appartenere a una e una sola sezione; le sezioni vanno in ordine di pagina.

Tipi di sezione:
- "spese": il rendiconto consuntivo voce per voce (titolo "RENDICONTO CONSUNTIVO": gruppi e sottoconti di spesa, per ogni voce protocollo, fattura, descrizione, fornitore, date e importo, con le colonne Importo, Parziale sottoconto, Totale). Di norma molte pagine consecutive.
- "riparto": il riparto CONSUNTIVO per unità (titolo "RIPARTO CONSUNTIVO": una riga per unità immobiliare con codice e nome, e colonne di importi con i millesimi tra parentesi). Il riparto è fatto di più parti consecutive: ogni parte ripete l'elenco delle unità con colonne diverse (prima le tabelle 1, 2, 3…, poi altre tabelle con "Totale gestione" e "Saldi di fine es. prec.", infine "Rate versate" e "Saldo finale"). Ogni parte è una sezione distinta: numera le parti 1, 2, 3… nel campo "parte" e scrivi in "prima_colonna" il titolo della prima colonna di importi di quella parte. Una parte comincia dove cambiano le intestazioni delle colonne e l'elenco delle unità riparte dalla prima.
- "preventivo": il preventivo dell'esercizio successivo per gruppi e voci (titolo "PREVENTIVO", colonne Importi e Totali).
- "raffronto": il raffronto tra preventivo e consuntivo per gruppi e voci (tre colonne di importi).
- "patrimoniale": conto economico e situazione patrimoniale (attività e passività).
- "partite": il dettaglio dei debiti e dei crediti verso terzi.
- "altro": tutto il resto, che non va letto: lettere, convocazioni, estratti conto, elenchi dei versamenti, riparto PREVENTIVO (quello con le rate da pagare), offerte, pagine bianche.

Per le sezioni che non sono del riparto "parte" è 0 e "prima_colonna" è vuota. In "titolo" scrivi il titolo stampato della sezione. In "esercizio" scrivi l'anno dell'esercizio del rendiconto (per esempio "2025") se è stampato, altrimenti lascialo vuoto. In "note" segnala in breve ciò che può servire a chi controlla la mappa (pagine ruotate, pagine illeggibili, sezioni dubbie), altrimenti lascialo vuoto.`,
    schema: oggetto({
      sezioni: elenco(oggetto({
        tipo: scelta("spese", "riparto", "preventivo", "raffronto", "patrimoniale", "partite", "altro"),
        pagina_da: intero, pagina_a: intero, titolo: testo, parte: intero, prima_colonna: testo,
      })),
      esercizio: testo, note: testo,
    }),
  },

  spese: {
    maxToken: 32000,
    istruzioni: `Queste pagine sono del RENDICONTO CONSUNTIVO: l'elenco delle spese voce per voce.

Come è fatta la pagina. A sinistra il testo, a destra tre colonne di importi: "Importo", "Parziale sottoconto", "Totale".
- Il GRUPPO è un titolo in grassetto a filo del margine sinistro (per esempio "SPESE GENERALI").
- Il SOTTOCONTO è un titolo in grassetto rientrato sotto il gruppo (per esempio "ASSICURAZIONE").
- Ogni VOCE comincia con una riga "· protocollo: G12 fattura: Fatt. 14" (nelle spese personali la riga comincia con l'unità e il nome a cui la spesa è addebitata: "· A21 ROSSI MARIO - protocollo: P9 fattura: Fatt. 315") e prosegue con le righe "descrizione: …", "fornitore: …", "data fattura: …", "data pagamento: …", chiusa da una riga di asterischi. L'importo della voce è nella colonna "Importo", all'altezza della riga del protocollo.
- Il PARZIALE del sottoconto è in grassetto nella colonna "Parziale sottoconto", all'altezza dell'ultima voce del sottoconto. Il TOTALE del gruppo è in grassetto nella colonna "Totale", alla fine del gruppo.

Cosa trascrivere.
- "voci": una voce per ogni protocollo, con pagina, gruppo e sottoconto a cui appartiene, intestato_a (ciò che nella riga del protocollo precede "protocollo:", senza il puntino iniziale e senza il trattino finale, per esempio "A21 ROSSI MARIO"; stringa vuota se la riga comincia con "protocollo:"), protocollo (solo il codice, per esempio "G12"), fattura (ciò che segue "fattura:", anche vuoto), descrizione (tutta, anche se va a capo su più righe, unita con uno spazio), fornitore, data_fattura, data_pagamento, importo.
- "totali": ogni importo delle colonne "Parziale sottoconto" e "Totale": tipo "parziale_sottoconto" (con gruppo e sottoconto), "totale_gruppo" (con il gruppo; sottoconto vuoto), "totale_generale" per il totale complessivo del rendiconto alla fine dell'ultima pagina, "altro" per ogni altra riga di riepilogo in fondo (per esempio "Totale gestione", "Saldi di fine es. precedente", "Rate versate", "Saldo finale"). In "etichetta" scrivi la dicitura stampata accanto all'importo, se c'è. "pagina" è la pagina dove l'importo è stampato.

Voci e sottoconti a cavallo di pagina.
- Una voce appartiene alla pagina dove compare la riga del suo protocollo, anche se la descrizione continua nella pagina dopo: trascrivila una sola volta, intera, con quella pagina.
- Se una pagina comincia con il seguito di una voce iniziata nella pagina prima (righe di descrizione o fornitore senza la riga del protocollo), quel testo appartiene alla voce della pagina prima: non creare una voce nuova.
- Se l'ultima voce dell'ultima pagina è interrotta dalla fine del foglio, trascrivi ciò che si vede e lascia vuoti i campi che non compaiono: il resto verrà letto con le pagine successive.
- "seguito": serve solo quando c'è una pagina di CONTESTO e la prima pagina da trascrivere comincia con il resto di una voce cominciata nella pagina di contesto. In quel caso scrivi in "protocollo" il protocollo di quella voce (lo leggi nella pagina di contesto) e nei campi descrizione, fornitore, data_fattura, data_pagamento solo il testo stampato nella pagina da trascrivere (per la descrizione: solo le parole che proseguono, non quelle già stampate nella pagina di contesto). In ogni altro caso tutti i campi di "seguito" sono stringhe vuote.
- Se una pagina comincia senza titoli, gruppo e sottoconto sono quelli ancora aperti alla fine della pagina precedente.
- Lo stesso protocollo può comparire in più voci (una fattura divisa su più sottoconti): sono voci distinte, trascrivile tutte.`,
    schema: oggetto({
      voci: elenco(oggetto({
        pagina: intero, gruppo: testo, sottoconto: testo, intestato_a: testo, protocollo: testo, fattura: testo, descrizione: testo, fornitore: testo,
        data_fattura: testo, data_pagamento: testo, importo: testo,
      })),
      seguito: oggetto({ protocollo: testo, descrizione: testo, fornitore: testo, data_fattura: testo, data_pagamento: testo }),
      totali: elenco(oggetto({
        pagina: intero, tipo: scelta("parziale_sottoconto", "totale_gruppo", "totale_generale", "altro"), gruppo: testo, sottoconto: testo, etichetta: testo, importo: testo,
      })),
      incerte,
    }),
  },

  riparto: {
    maxToken: 32000,
    istruzioni: `Queste pagine sono del RIPARTO CONSUNTIVO: una tabella con una riga per unità immobiliare.

Come è fatta la pagina. Il foglio è orizzontale (nella scansione può essere ruotato di 90 gradi).
- La prima colonna contiene, sulla stessa riga: il CODICE dell'unità (per esempio "A1", "A109.1"; qualche codice può essere stampato in modo irregolare, per esempio "44" senza la A oppure "A109 .2"), l'INTESTATARIO (il nome, che può essere troncato e avere asterischi, barre o trattini) e, a destra del nome, una breve ETICHETTA: nei fascicoli fino al 2024 il titolo ("Pr", "Co", "As", a volte con un numero di giorni), dal 2025 il tipo di unità ("Box", "Negozio", "Appartame", "POSTO AU"…).
- Le colonne successive sono di due tipi. Le TABELLE MILLESIMALI hanno come titolo un numero e un nome (per esempio "1 - SPESE GENERALI") e in ogni cella l'importo seguito dai millesimi tra parentesi, per esempio "-48,30 (0,412)". Le COLONNE SEMPLICI ("Movimenti personali", "Totale gestione", "Saldi di fine Es. prec.", "Rate versate", "Saldo finale"…) hanno solo l'importo.
- Titoli intermedi come "SCALA A" o "TORRE 1" separano gruppi di unità: non sono righe, ignorali.
- Alla fine dell'ultima pagina di ogni parte ci sono la riga "Arrotondamenti" e la riga "TOTALE COMPLESSIVO".

Cosa trascrivere.
- "colonne": le colonne di importi nell'ordine in cui sono stampate, da sinistra a destra, con il titolo completo (se è su due righe, uniscile con uno spazio) e "millesimi": true se le celle della colonna hanno i millesimi tra parentesi. Le pagine di questo blocco hanno tutte le stesse colonne: elencale una volta sola.
- "righe": una riga per ogni riga di unità, nell'ordine stampato, con pagina, codice (come stampato, senza il nome), intestatario, etichetta e "celle": una cella per ogni colonna, con "colonna" = posizione della colonna nell'elenco "colonne" (1 per la prima), "importo" e "millesimi" (stringa vuota per le colonne semplici). Non saltare le celle a zero: "0,00" e "0" vanno trascritti.
- Se lo stesso codice compare in più righe (per esempio proprietario e conduttore della stessa unità) sono righe distinte: trascrivile tutte.
- "arrotondamenti": le celle della riga "Arrotondamenti" (solo quelle che hanno un importo). "totale": le celle della riga "TOTALE COMPLESSIVO", con importo e millesimi. Se queste righe non sono nelle pagine del blocco, lascia i due elenchi vuoti. Non metterle tra le "righe".

Attenzione alle righe: sono fitte e simili tra loro. Leggi ogni riga seguendo la sua linea orizzontale fino in fondo, senza scivolare su quella sopra o sotto; i valori di unità vicine sono spesso uguali ma non sempre.`,
    schema: oggetto({
      colonne: elenco(oggetto({ titolo: testo, millesimi: { type: "boolean" } })),
      righe: elenco(oggetto({
        pagina: intero, codice: testo, intestatario: testo, etichetta: testo,
        celle: elenco(oggetto({ colonna: intero, importo: testo, millesimi: testo })),
      })),
      arrotondamenti: elenco(oggetto({ colonna: intero, importo: testo })),
      totale: elenco(oggetto({ colonna: intero, importo: testo, millesimi: testo })),
      incerte,
    }),
  },

  preventivo: {
    maxToken: 16000,
    istruzioni: `Queste pagine sono del PREVENTIVO dell'esercizio successivo: gruppi di spesa (titoli in grassetto a filo del margine) e, sotto ognuno, le voci rientrate con l'importo nella colonna "Importi"; il totale del gruppo è in grassetto nella colonna "Totali", all'altezza dell'ultima voce del gruppo.

Cosa trascrivere.
- "esercizio": la dicitura dell'esercizio stampata in alto (per esempio 'Esercizio ordinario "2026"').
- "gruppi": nell'ordine stampato, ogni gruppo con il nome completo (comprese eventuali precisazioni tra parentesi), il totale stampato nella colonna "Totali" e le sue voci (nome e importo). Se il gruppo continua nella pagina successiva è sempre lo stesso gruppo: non duplicarlo. Se il totale di un gruppo non è in queste pagine lascialo vuoto.
- "totale": il totale generale del preventivo, se è stampato in queste pagine; altrimenti vuoto.
- "riquadro": le righe di riepilogo in fondo (per esempio "Totale gestione", "Saldi di fine es. precedente", "Saldo finale"), ognuna con etichetta e importo; se non ci sono, elenco vuoto.`,
    schema: oggetto({
      esercizio: testo,
      gruppi: elenco(oggetto({ gruppo: testo, totale: testo, voci: elenco(oggetto({ voce: testo, importo: testo })) })),
      totale: testo,
      riquadro: elenco(oggetto({ etichetta: testo, importo: testo })),
      incerte,
    }),
  },

  raffronto: {
    maxToken: 16000,
    istruzioni: `Queste pagine sono del RAFFRONTO tra preventivo e consuntivo: una riga per gruppo di spesa (in grassetto) e, sotto, una riga per voce, con tre colonne di importi (di norma preventivo, consuntivo, differenza).

Cosa trascrivere.
- "colonne": i titoli delle tre colonne di importi, da sinistra a destra, come stampati.
- "righe": nell'ordine stampato, con "livello" = "gruppo" per le righe dei gruppi, "voce" per le voci (in "gruppo" il gruppo a cui appartiene, in "voce" il nome), "totale" per la riga del totale generale. "valori": i tre importi della riga, nell'ordine delle colonne; una cella vuota è una stringa vuota.`,
    schema: oggetto({
      colonne: elenco(testo),
      righe: elenco(oggetto({ livello: scelta("gruppo", "voce", "totale"), gruppo: testo, voce: testo, valori: elenco(testo) })),
      incerte,
    }),
  },

  patrimoniale: {
    maxToken: 8000,
    istruzioni: `Questa pagina contiene il CONTO ECONOMICO e la SITUAZIONE PATRIMONIALE. Trascrivi solo la situazione patrimoniale (il riquadro con ATTIVITA' a sinistra e PASSIVITA' a destra); ignora il conto economico (entrate e uscite).

Cosa trascrivere.
- "data": la data della situazione (per esempio "31/12/2025").
- "attivita" e "passivita": le voci di ogni lato, dall'alto in basso, con il loro importo. Alcune righe sono titoli senza importo (per esempio "Disponibilità" o "Fondi") seguiti da voci rientrate: per le voci rientrate scrivi il titolo in "gruppo" e il nome in "voce"; non creare una voce per il titolo. Per le voci non rientrate "gruppo" è vuoto. Una voce il cui nome va a capo su due righe è una voce sola. Attenzione a non attribuire a un lato gli importi dell'altro: ogni importo è allineato a destra della sua metà del riquadro.
- "totale_attivita" e "totale_passivita": i totali stampati in fondo.`,
    schema: oggetto({
      data: testo,
      attivita: elenco(oggetto({ gruppo: testo, voce: testo, importo: testo })),
      passivita: elenco(oggetto({ gruppo: testo, voce: testo, importo: testo })),
      totale_attivita: testo, totale_passivita: testo,
      incerte,
    }),
  },

  partite: {
    maxToken: 16000,
    istruzioni: `Queste pagine sono del DETTAGLIO DEBITI E CREDITI verso terzi: due elenchi, "Crediti v/terzi" e "Debiti v/terzi", ognuno con il titolo su una fascia grigia e il totale alla fine.

Ogni riga ha tre parti: la CONTROPARTE (a sinistra, può essere vuota), la DESCRIZIONE che comincia con il protocollo tra parentesi, per esempio "(G45) RIMBORSO…" (il testo è spesso troncato dal bordo della cella: lascialo troncato), e l'IMPORTO.

Cosa trascrivere.
- "righe": una per riga, con pagina, sezione (il titolo dell'elenco a cui appartiene, per esempio "Crediti v/terzi"), controparte, protocollo (il codice tra parentesi, senza le parentesi), descrizione (senza il protocollo) e importo. Un elenco può continuare nelle pagine successive senza ripetere il titolo: la sezione resta quella aperta. Se la prima pagina comincia senza titolo, deduci la sezione dalla pagina di contesto se c'è; altrimenti di norma è "Debiti v/terzi" (l'elenco più lungo) e segnalalo in "incerte".
- "totali": le righe "Totale" di ogni elenco, con la sezione e l'importo, solo se stampate in queste pagine.`,
    schema: oggetto({
      righe: elenco(oggetto({ pagina: intero, sezione: testo, controparte: testo, protocollo: testo, descrizione: testo, importo: testo })),
      totali: elenco(oggetto({ sezione: testo, importo: testo })),
      incerte,
    }),
  },

  verbale: {
    maxToken: 16000,
    istruzioni: `Queste pagine sono il VERBALE di un'assemblea di condominio: chi era presente, come si è svolta e che cosa è stato deciso su ogni punto all'ordine del giorno.

Cosa riportare.
- "data", "ora_inizio", "ora_fine", "luogo": come scritti nel verbale (date e ore come stampate). "tipo": "ordinaria" o "straordinaria" se è scritto, altrimenti vuoto. "convocazione": "prima" o "seconda" se è scritto, altrimenti vuoto.
- "presidente" e "segretario": i nomi, se indicati.
- "costituita": "si" se il verbale dice che l'assemblea è validamente costituita, "no" se è andata deserta o non costituita, "non_indicato" se non lo dice. "presenti": la frase che riassume i presenti (per esempio "35 condomini per 620,500 millesimi"), come scritta.
- "punti": uno per ogni punto all'ordine del giorno, nell'ordine del verbale, con:
  - "ordine": il numero del punto (1 per il primo);
  - "titolo": il titolo del punto come scritto;
  - "esito": "approvato", "respinto", "non_deliberato" (nessuna decisione, anche per mancanza di quorum), "rinviato", "informativa" (punto solo di comunicazione, senza voto) oppure "non_indicato";
  - "voti": la frase con i voti, come scritta (per esempio "favorevoli 30 condomini per 540,2 millesimi, contrari 2…"); vuota se non c'è;
  - "sintesi": che cosa è stato deciso, in una-tre frasi tue, chiare e fedeli al testo (importi, fornitori, scadenze compresi); vuota se non è stato deciso nulla;
  - "cose_da_fare": le azioni concrete che la decisione richiede (per esempio "richiedere tre preventivi per l'impermeabilizzazione del giardino", "affidare i lavori alla ditta X entro marzo"), ognuna con descrizione breve all'infinito, responsabile (chi deve farla se è scritto: amministratore, consiglio, un condomino…), scadenza (come scritta) e importo (come scritto); elenco vuoto se il punto non richiede azioni o non è stato approvato;
  - "nomine": le persone nominate o confermate in quel punto, con ruolo ("consigliere", "amministratore", "revisore", "altro"), nome come scritto, compenso e durata come scritti (vuoti se non ci sono), e una nota breve se serve (per esempio "riconferma"); elenco vuoto se il punto non nomina nessuno.
- "note": in breve ciò che può servire a chi controlla (pagine illeggibili, punti fuori dall'ordine del giorno, allegati citati), altrimenti vuoto.

Per nomi, importi e date vale la regola generale: copiali come scritti. La sintesi e le cose da fare sono invece parole tue: devono riportare solo ciò che il verbale dice, senza aggiungere nulla.`,
    schema: oggetto({
      data: testo, tipo: testo, convocazione: testo, ora_inizio: testo, ora_fine: testo, luogo: testo, presidente: testo, segretario: testo,
      costituita: scelta("si", "no", "non_indicato"), presenti: testo,
      punti: elenco(oggetto({
        ordine: intero, titolo: testo,
        esito: scelta("approvato", "respinto", "non_deliberato", "rinviato", "informativa", "non_indicato"),
        voti: testo, sintesi: testo,
        cose_da_fare: elenco(oggetto({ descrizione: testo, responsabile: testo, scadenza: testo, importo: testo })),
        nomine: elenco(oggetto({ ruolo: scelta("consigliere", "amministratore", "revisore", "altro"), nome: testo, compenso: testo, durata: testo, note: testo })),
      })),
      note: testo,
      incerte,
    }),
  },
};
