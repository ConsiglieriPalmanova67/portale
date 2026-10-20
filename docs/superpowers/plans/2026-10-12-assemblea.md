# Assemblea dal vivo (piano 4 di 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gestire un'assemblea dal portale: ordine del giorno, apertura e appello, presenze, deleghe con archivio scansioni, votazioni, nomina dei consiglieri, report per il verbale, verbali e to-do.

**Architecture:** Le pagine non parlano più con Supabase direttamente ma con un "deposito" (interfaccia unica di lettura/scrittura) che ha due implementazioni: Supabase e memoria. La seconda alimenta una modalità prova (`?prova` nell'indirizzo) con dati finti, senza accesso, usata per verificare l'interfaccia nel browser senza toccare i dati reali. Tutti i conteggi passano da funzioni pure in `src/assemblea/seduta.js`, che riusano `src/calcolo/`.

**Tech Stack:** HTML + JavaScript a moduli senza framework né dipendenze npm; `node --test`; Supabase (Postgres, Auth, Storage, Realtime) via `@supabase/supabase-js@2.45.4` da CDN.

**Spec:** `docs/superpowers/specs/2026-10-10-assemblea-condominio-design.md` (leggerla per intero: sezioni 4, 5, 6, 7, 10).

## Regole valide per tutti i task

- Leggere prima il codice esistente (`src/pagine/app.js`, `src/dati/client.js`, `src/dati/modello.js`, `src/ui/html.js`, `src/calcolo/*`, `src/stili.css`) e seguirne stile, nomi in italiano e densità dei commenti.
- Ogni valore proveniente dai dati passa da `esc()` prima di entrare nell'HTML.
- File sotto le 500 righe; un file, una responsabilità.
- Nessun dato reale nel repository (è pubblico): nei test e nei dati di prova solo nomi di fantasia.
- **Non accedere al portale reale e non scrivere sul progetto Supabase reale.** La verifica nel browser si fa solo in modalità prova: `http://localhost:5173/?prova` (server: `node scripts/server.js`, di norma già avviato).
- Lo schema del database è già applicato (`supabase/migrations/001`–`006`): non modificarlo. Se serve una colonna in più, fermarsi e segnalarlo nel resoconto.
- Test: `npm test` deve restare verde. Le funzioni pure nascono con i loro test (prima il test che fallisce).
- Commit piccoli e frequenti, messaggi in italiano nello stile di `git log`, **senza** riga `Co-Authored-By`.
- Un hook della macchina crea a volte file vuoti con nomi strani nella radice del repository: prima di ogni commit eliminarli (`for f in *; do [ -f "$f" ] && [ ! -s "$f" ] && rm -f -- "$f"; done`) e non aggiungerli mai a git. Usare `git add` con percorsi espliciti.

## Tabelle coinvolte (già esistenti)

`assemblee` (data, tipo, convocazione, luogo, ora_apertura, ora_appello, ora_chiusura, stato bozza|in_corso|chiusa), `teste_assemblea` (assemblea_id, chiave, etichetta, soggetti uuid[], unita uuid[]), `punti_odg` (assemblea_id, ordine, testo, tipo delibera|nomina_consiglieri, candidati jsonb, tabella_id, maggioranza terzo|meta|due_terzi|unanimita, votato_il, presenti_al_voto jsonb, esito jsonb, note), `presenze` (assemblea_id, testa_id, stato assente|presente, ora_ingresso, ora_uscita), `deleghe` (assemblea_id, delegante_testa_id, delegato_testa_id, delegato_esterno, amministratore, nota, scansione_path, ora_registrazione), `voti` (punto_id, testa_id, voto), `verbali` (assemblea_id, file_path, testo, stato bozza|definitivo), `todo` (descrizione, assemblea_id, punto_id, responsabile_id → consiglieri, scadenza, stato aperto|in_corso|chiuso, note), `consiglieri` (soggetto_id, utente_id, carica, parte_rappresentata, inizio_mandato, fine_mandato, assemblea_nomina_id). Bucket Storage privati: `deleghe`, `verbali`.

## Interfaccia del deposito

`src/dati/deposito.js` documenta l'interfaccia e sceglie l'implementazione; `deposito-supabase.js` e `deposito-prova.js` la realizzano.

```js
leggi(tabella, filtri = {})            // → righe[]; filtri di uguaglianza { colonna: valore }; legge a pagine da 1000
inserisci(tabella, righe)              // → righe inserite (con id)
aggiorna(tabella, chiave, valori)      // chiave = { colonna: valore, ... } → righe aggiornate
salva(tabella, righe, colonneChiave)   // inserisce o aggiorna (upsert) → righe
elimina(tabella, chiave)               // → numero di righe eliminate
caricaFile(bucket, percorso, file)     // → percorso salvato
urlFile(bucket, percorso)              // → URL temporaneo per aprire il file
ascolta(tabelle, callback)             // callback() a ogni modifica; restituisce una funzione per smettere
```

Ogni errore diventa un `Error` con messaggio leggibile; le pagine lo mostrano e offrono di riprovare, senza mai ignorarlo.

## Funzioni pure: `src/assemblea/seduta.js`

Le chiavi delle funzioni in `src/calcolo/` sono le `chiave` delle teste; il database usa gli `id` di `teste_assemblea`. Questo modulo fa la traduzione.

```js
congelaTeste(modello)                  // → [{ chiave, etichetta, soggetti: [id], unita: [id] }] da modello.teste
statoSeduta({ assemblea, teste, presenze, deleghe, millesimi, tabellaProprietaId, adesso })
  // → { righe: [{ testa, peso, stato: 'presente'|'delega'|'assente', delegato, oraIngresso, oraUscita }],
  //     presenti: Set(testa.id), quorum: {...quorumCostitutivo}, avvisi: [...] (conflitti, delegato assente, limiti del quinto, amministratore) }
statoPunto({ punto, teste, millesimi, presenti, voti })
  // per un punto aperto `presenti` è quello attuale; per un punto chiuso si usa punto.presenti_al_voto
  // → { votanti: [{ testa, peso, voto|null }], assenti: [{ testa, peso }], esito: {...esitoVoto}, mancanti: n }
```

Regole da rispettare (dalla spec): il peso di una testa in una tabella è la somma dei millesimi delle sue unità; un punto su una tabella parziale riguarda solo le teste con millesimi lì; chi è registrato presente dopo la chiusura di una votazione è assente a quella votazione; un presente senza voto è "voto mancante" e non conta come favorevole.

---

## Task A — Deposito, modalità prova, logica di seduta, presenze e deleghe

**Files:** creare `src/dati/deposito.js`, `src/dati/deposito-supabase.js`, `src/dati/deposito-prova.js`, `src/dati/dati-prova.js`, `src/assemblea/seduta.js`, `tests/assemblea/seduta.test.js`, `tests/dati/deposito-prova.test.js`, `src/pagine/assemblea/elenco.js`, `dettaglio.js`, `odg.js`, `presenze.js`, `deleghe.js`; modificare `src/dati/client.js`, `src/pagine/app.js`, `index.html`, `src/stili.css`.

- [ ] Deposito con le due implementazioni; `client.js` usa il deposito per `caricaDati`; test dell'implementazione in memoria (filtri, upsert, elimina, ascolta).
- [ ] Modalità prova: con `?prova` niente accesso, deposito in memoria con dati finti (una quindicina di unità, comproprietari, un proprietario con più unità, un conduttore, almeno due tabelle parziali, più di 20 teste per poter provare il limite del quinto), fascia fissa ben visibile "MODALITÀ PROVA — dati finti, nulla viene salvato".
- [ ] `seduta.js` con test (TDD) per `congelaTeste`, `statoSeduta`, `statoPunto`, compresi: comproprietari, delega a presente, delega ad assente, conflitto presente+delega, limite del quinto, tabella parziale, arrivo dopo una votazione chiusa.
- [ ] Voce "Assemblee" nel menu; elenco assemblee e creazione (data, tipo, convocazione, luogo).
- [ ] Dettaglio assemblea con schede Ordine del giorno, Presenze, Deleghe, Votazioni, Report (le ultime due possono essere segnaposto per il Task B) e barra fissa con teste e millesimi presenti e stato del quorum.
- [ ] Ordine del giorno: aggiungere, modificare, riordinare, eliminare punti; per ogni punto tipo, tabella millesimale, maggioranza; per i punti di nomina l'elenco dei candidati (soggetto + parte rappresentata).
- [ ] "Apri seduta": congela le teste alla data dell'assemblea, crea le presenze (tutte assenti), imposta `ora_apertura` e stato `in_corso`. "Registra appello": imposta `ora_appello`.
- [ ] Presenze: ricerca per nome o unità, segnare presente/assente e uscita con orario messo dal sistema e correggibile a mano; interruttore "Solo presenti" (scelta ricordata sul dispositivo) con gli assenti in una sezione richiudibile "Assenti (n)" chiusa in partenza.
- [ ] Deleghe: inserimento a mano (delegante, delegato tra le teste oppure esterno con nome libero, spunta amministratore, nota), scansione facoltativa (foto o PDF) caricata subito o dopo, archivio per assemblea con evidenza di quelle senza scansione, avvisi dei controlli.
- [ ] Verifica nel browser in modalità prova di tutto il percorso; `npm test` verde; commit.

## Task B — Votazioni, nomine, report, chiusura, verbali, to-do, tempo reale

**Files:** creare `src/pagine/assemblea/votazioni.js`, `nomine.js`, `report.js`, `src/pagine/verbali.js`, `src/pagine/todo.js`, eventuali test; modificare `dettaglio.js`, `app.js`, `index.html`, `src/stili.css`.

- [ ] Votazioni: per ogni punto elenco delle teste votanti (solo presenti con millesimi nella tabella del punto); flag totale con tre tasti Favorevole / Contrario / Astenuto che registra quel voto per tutti i presenti sovrascrivendo; spunta per singola testa con i tre voti; tasto "Cancella tutti i voti" con conferma il cui testo è esattamente "Sei sicuro di voler cancellare tutti i voti?"; teste senza voto evidenziate come "voto mancante"; esito in tempo reale per teste e millesimi.
- [ ] "Chiudi votazione": salva `votato_il`, `presenti_al_voto` (id delle teste presenti) ed `esito`; da chiusa è in sola lettura; "Riapri votazione" con conferma. Interruttore "Solo presenti" anche qui.
- [ ] Nomina consiglieri: a punto di nomina approvato e chiuso, pulsante "Registra mandati" con riepilogo e conferma: crea i mandati (inizio = data assemblea, `assemblea_nomina_id`), chiude con la stessa data quelli non riconfermati.
- [ ] Report stampabile (foglio di stile di stampa): intestazione con orari, foglio presenze con ora di registrazione e uscita, elenco deleghe, per ogni punto ora del voto, presenti in quel momento, nominativi per voto con teste e millesimi, assenti al punto con ora di arrivo o uscita, esito. Nessun dato contabile. In più il foglio presenze in bianco.
- [ ] "Chiudi assemblea": `ora_chiusura`, stato `chiusa`, tutto in sola lettura; "Riapri" con conferma.
- [ ] Verbali: per assemblea, file allegato e testo, stato bozza/definitivo. To-do: creazione da un punto o libera, responsabile, scadenza, stato; elenco filtrabile per stato, responsabile, assemblea.
- [ ] Tempo reale: le schede della seduta si aggiornano con `ascolta` quando un altro dispositivo modifica presenze, deleghe, voti, punti.
- [ ] Casi della sezione 10 della spec (connessione persa, doppia modifica, assemblea chiusa).
- [ ] Verifica nel browser in modalità prova di un'assemblea completa dall'apertura al report; `npm test` verde; commit.
