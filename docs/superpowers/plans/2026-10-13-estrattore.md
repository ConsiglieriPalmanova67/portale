# Estrattore di dati dai PDF — fase 1: fascicolo di rendiconto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dal PDF di un fascicolo di rendiconto caricato in Documenti (di norma una scansione), ricavare i dati, verificarli con controlli di quadratura, farli rivedere all'utente e caricarli nel database solo dopo conferma.

**Architecture:** Il browser divide il PDF in blocchi di poche pagine e li manda a una Edge Function Supabase, che li passa a Claude (API Anthropic) con istruzioni e schema di risposta specifici per il tipo di sezione; la chiave API vive solo nei secret di Supabase. I risultati si salvano nel database come estrazione in corso; funzioni pure nel browser li assemblano, li controllano e preparano il piano di scrittura. Nulla entra nelle tabelle definitive senza conferma.

**Tech Stack:** HTML + JavaScript a moduli senza framework (come il resto del portale); `pdf-lib` e `pdf.js` da CDN con versione esatta; Supabase Edge Function (Deno/TypeScript); API Messages di Anthropic con documenti PDF in ingresso e risposta strutturata.

**Regole:** valgono tutte le "Regole valide per tutti i task" di `docs/superpowers/plans/2026-10-12-assemblea.md`. In più: prima di scrivere qualsiasi codice che chiama l'API di Anthropic va caricata la skill `claude-api` (identificativi dei modelli, formato dei documenti PDF, risposta strutturata, limiti, conteggio dei token): non andare a memoria.

## Perché a blocchi

Un fascicolo ha 60-70 pagine fitte (circa 270 voci di spesa e 200 unità per tre prospetti di riparto): una sola risposta sarebbe troppo lunga e una Edge Function ha un tempo massimo di esecuzione. Blocchi di poche pagine restano entro i limiti, si possono rileggere uno per uno e permettono di mostrare l'avanzamento.

## Flusso

1. **Avvio** dalla pagina Documenti, su un documento PDF: "Estrai i dati" → scelta del tipo (per ora solo "Fascicolo di rendiconto") e dell'anno dell'esercizio.
2. **Indice**: una chiamata sull'intero PDF chiede la mappa delle sezioni: per ogni sezione tipo e intervallo di pagine. Tipi: `spese` (rendiconto voce per voce), `riparto` (prospetti per unità; più parti consecutive con colonne diverse), `preventivo`, `raffronto`, `patrimoniale`, `partite` (debiti e crediti verso terzi), `altro` (lettere, estratti, pagine bianche: non si leggono). L'utente vede la mappa e può correggerla prima di proseguire.
3. **Lettura**: ogni sezione è divisa in blocchi (dimensione per tipo, vedi sotto). Per ogni blocco il browser estrae quelle pagine dal PDF e chiama la funzione. Al massimo 3 chiamate insieme. Ogni blocco ha stato `in_attesa`, `in_corso`, `fatto`, `errore` e si può rileggere.
4. **Controlli**: quando tutti i blocchi sono fatti, il browser assembla e controlla (vedi "Controlli").
5. **Revisione**: schermata con esito dei controlli e dati per sezione; le celle segnalate sono evidenziate e modificabili; accanto si vede la pagina del PDF. Ogni correzione fa ripartire i controlli.
6. **Importazione**: solo se non restano errori bloccanti (oppure l'utente li accetta uno per uno), e dopo conferma con riepilogo di cosa verrà scritto.

## Dati (migrazione `010_estrazioni.sql`)

- `estrazioni`: `documento_id` (→ documenti, on delete cascade), `tipo` (`fascicolo_rendiconto`), `anno`, `stato` (`indice`, `lettura`, `revisione`, `importata`, `annullata`), `modello`, `pagine`, `mappa` jsonb, `correzioni` jsonb (modifiche fatte a mano in revisione, per cella), `token_ingresso`, `token_uscita`, colonne di audit.
- `estrazioni_blocchi`: `estrazione_id` (cascade), `sezione`, `parte` (per il riparto: 1, 2, 3…), `pagina_da`, `pagina_a`, `stato`, `dati` jsonb, `errore`, `tentativi`, `token_ingresso`, `token_uscita`; unico per (`estrazione_id`, `sezione`, `pagina_da`).
- RLS come le altre tabelle (solo consiglieri). Trigger di audit su `estrazioni`.

## Edge Function `estrai`

- `POST` con l'intestazione `Authorization` dell'utente. La funzione crea un client Supabase con quel token e chiama `is_consigliere()`: se non è vero risponde 403. Senza secret `ANTHROPIC_API_KEY` risponde con un errore chiaro ("chiave API non configurata").
- Corpo: `{ azione: 'indice' | 'blocco', pdf: <base64>, sezione?, parte?, contesto? }`. Per `blocco` il PDF contiene solo le pagine del blocco (più l'eventuale pagina di contesto, dichiarata in `contesto`).
- Chiama l'API Messages con il PDF come documento, le istruzioni della sezione e la risposta strutturata secondo lo schema della sezione. Restituisce `{ dati, token_ingresso, token_uscita, modello }`. Non scrive nel database: è il browser a salvare (con le regole di accesso dell'utente).
- Modello: il più capace con visione (leggere cifre fitte è il punto critico); letto da una costante in testa al file, facile da cambiare.
- Istruzioni e schemi stanno in un modulo a parte (`sezioni.ts`): una voce per tipo di sezione. Devono dire, come minimo: trascrivere esattamente senza correggere né completare; importi con il segno come stampati; campi vuoti lasciati vuoti; millesimi come stampati; segnalare in `incerte` le celle di lettura dubbia; per le voci a cavallo di pagina la regola "la voce appartiene alla pagina dove compare il protocollo".

### Schemi di risposta per sezione

- `indice`: `{ sezioni: [{ tipo, pagina_da, pagina_a, titolo, parte? }], esercizio?, note? }`
- `spese` (blocchi da 3 pagine, con la pagina precedente come contesto per sapere gruppo e sottoconto aperti): `{ voci: [{ pagina, gruppo, sottoconto, protocollo, fattura, descrizione, fornitore, data_fattura, data_pagamento, importo }], totali: [{ pagina, tipo: 'parziale_sottoconto'|'totale_gruppo'|'altro', gruppo, sottoconto, importo }], incerte: [...] }`
- `riparto` (blocchi da 2 pagine): `{ colonne: [{ chiave, titolo, millesimi: bool }], righe: [{ pagina, codice, intestatario, etichetta, valori: { <chiave>: { importo, millesimi? } } }], arrotondamenti?, totale?, incerte }`. `etichetta` è la colonna accanto al nome (titolo Pr/Co/As nei fascicoli fino al 2024, tipo di unità dal 2025).
- `preventivo`: `{ esercizio, gruppi: [{ gruppo, totale, voci: [{ voce, importo }] }], totale, riquadro: [{ etichetta, importo }] }`
- `raffronto`: `{ colonne: [titoli], righe: [{ livello: 'gruppo'|'voce'|'totale', gruppo, voce, valori: [n, n, n] }] }`
- `patrimoniale`: `{ data, attivita: [{ voce, importo }], passivita: [{ voce, importo }], totale_attivita, totale_passivita }`
- `partite` (blocchi da 2 pagine): `{ righe: [{ pagina, sezione: 'credito'|'debito', controparte, protocollo, descrizione, importo }], totali: [{ sezione, importo }] }`

## Controlli (`src/estrazione/controlli.js`, funzioni pure con test)

Ogni controllo produce `{ livello: 'errore' | 'avviso' | 'ok', codice, messaggio, dove: { sezione, pagina?, riga?, campo? } }`. Somme in centesimi interi e millesimi × 1000.

- **Spese**: somma delle voci di ogni sottoconto = parziale stampato; somma per gruppo = totale di gruppo; somma dei gruppi = totale del rendiconto; nessuna voce duplicata tra blocchi (stessa pagina e protocollo e importo); ogni sottoconto ha il suo parziale.
- **Riparto**: stessa sequenza di codici in tutte le parti; per ogni colonna somma delle righe (+ arrotondamenti) = riga del totale, per importi e millesimi; dentro ogni tabella rapporto importo/millesimi costante (tolleranza di arrotondamento; si aggregano le righe con lo stesso codice); per ogni riga somma delle tabelle = "Totale gestione"; `saldo finale = totale gestione + saldo precedente + rate versate` quando quelle colonne esistono.
- **Tra sezioni**: totale di ogni gruppo delle spese = totale della colonna corrispondente del riparto; totale spese = totale gestione del riparto; debiti e crediti verso terzi = voci omonime della situazione patrimoniale; attività = passività; preventivo: voci = totali di gruppo = totale.
- **Con il database**: millesimi di ogni unità e tabella uguali a quelli in anagrafica (differenze = avviso, da confermare una per una); saldo precedente di ogni unità = saldo finale dell'esercizio prima, se presente; intestatario diverso dal proprietario corrente = avviso "possibile cambio di proprietà" (l'importazione non cambia mai le titolarità: lo fa l'utente dal dettaglio dell'unità); unità presenti nel riparto e assenti in anagrafica o viceversa = errore.

## Importazione (`src/estrazione/importa.js`)

Funzione pura `pianoImportazione({ estrazione, dati })` → elenco ordinato di scritture; poi esecuzione a passi ripetibili (ogni passo verifica cosa c'è già). Scrive: esercizio consuntivo dell'anno (ed esercizio preventivo dell'anno dopo, se c'è il preventivo), conti nuovi (tabella millesimale dedotta dagli altri conti dello stesso gruppo), fornitori nuovi, spese, posizioni per unità intestate al proprietario corrente, tipo delle unità se stampato, situazione patrimoniale, partite verso terzi. Se l'esercizio ha già dati: l'importazione si ferma e chiede se sostituirli (conferma esplicita, elimina prima quelli vecchi).

## Modalità prova

In `?prova` non si chiama nessuna funzione: un lettore finto restituisce risultati predefiniti (un fascicolo di fantasia di una decina di pagine, coerente con i dati finti dell'anagrafica, con un paio di errori voluti per vedere i controlli all'opera), con un piccolo ritardo per mostrare l'avanzamento. Serve a provare e verificare tutta l'interfaccia senza chiave API e senza costi.

## Collaudo sui dati veri (dopo la configurazione della chiave)

I fascicoli 2024 e 2025 sono già nel database, trascritti e verificati al centesimo. Il collaudo consiste nell'estrarli di nuovo con questa funzione e confrontare cifra per cifra: va previsto un confronto "estrazione contro database" che elenchi le differenze (utile anche in futuro per rileggere un documento già caricato).

## Task

- [ ] **A. Logica pura con test** (`src/estrazione/`): suddivisione in blocchi dalla mappa; assemblaggio dei blocchi (compresa l'unione delle parti del riparto); controlli; piano di importazione; confronto estrazione/database.
- [ ] **B. Deposito e dati di prova**: tabelle `estrazioni` ed `estrazioni_blocchi` nel deposito in memoria; lettore finto; migrazione `010_estrazioni.sql` (solo il file: la applica chi coordina).
- [ ] **C. Edge Function** `supabase/functions/estrai/` (`index.ts`, `sezioni.ts`): solo i file, senza pubblicarla; `lettore.js` nel browser che divide il PDF con `pdf-lib` e chiama la funzione.
- [ ] **D. Interfaccia**: avvio da Documenti, mappa correggibile, avanzamento con rilettura dei blocchi, revisione con controlli, celle modificabili e pagina del PDF accanto, conferma e importazione, costo in token dell'estrazione.
- [ ] **E. Verifica** in modalità prova dell'intero percorso, `npm test` verde, commit.
