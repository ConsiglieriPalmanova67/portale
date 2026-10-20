# Bozza del verbale dalla seduta — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nella pagina dell'assemblea una scheda «Verbale» compone la bozza del verbale seguendo il modello
(`docs/verbale-modello.md`) con i dati che il portale registra in seduta, più pochi campi scritti a mano; la bozza si
stampa, si copia e si salva nei Verbali. Serve all'assemblea reale di stasera (20/10/2026, 21:00).

**Architecture:** due moduli puri — `src/verbale/fatti.js` ricava dal contesto della seduta (`ctx` di
`src/pagine/assemblea/dettaglio.js`) e dai campi scritti a mano un oggetto «fatti» già formattato; `src/verbale/componi.js`
trasforma i fatti nel testo del verbale secondo le formule del modello. La scheda `src/pagine/assemblea/verbale.js`
mostra i campi e l'anteprima, salva i campi in `bozze_verbale` (una riga per assemblea, testo JSON) e il testo finale in
`verbali` come bozza. Nessuna migrazione: le tabelle esistono già (002) con le regole dei consiglieri.

**Tech Stack:** HTML + JavaScript a moduli senza framework, `node:test`.

**Spec:** `docs/verbale-modello.md` (sezioni 2 «Struttura del verbale» e 3 «Modello da compilare»: le formule da usare)
e la richiesta dell'utente in chat del 20/10/2026: «Bozza del verbale» con i dati di seduta (convocazione, appello,
presenti con millesimi, quorum, per ogni punto voti per nome con maggioranza e norma, esito, ora di chiusura) e campi
da riempire (presidente, segretario; per ogni punto sintesi della discussione, dichiarazioni a verbale, testo della
delibera); stampa, copia, salvataggio come bozza.

## Global Constraints

- Pagine statiche HTML + JS senza framework; file sotto le 500 righe; testi in italiano semplice; commit in italiano
  senza `Co-Authored-By`; nessun dato reale nei test (usare i dati di prova).
- La frase sulla convocazione resta la dichiarazione del modello (decisione dell'utente): «… convocata … con avviso del
  [data], inviato a tutti gli aventi diritto … il Presidente … ha verificato la regolare convocazione di tutti gli aventi
  diritto, come richiesto dall'art. 1136, sesto comma, c.c.». Nessun prospetto delle ricevute (sviluppo futuro).
- Le formule vengono dal modello (sezione 3); dove il modello usa segnaposto non disponibili nel portale (codice
  fiscale del condominio, ecc.) si omette la parte, non si scrive il segnaposto.
- Norma della maggioranza: se `controllaPunto` (`src/calcolo/regole-voto.js`) trova una regola per il punto, si usa il
  suo `riferimento`; altrimenti «art. 1136 c.c.» senza comma (per non scrivere un comma sbagliato).
- Punto «Varie ed eventuali» (testo che contiene «varie ed eventuali», senza distinguere maiuscole): mai delibere, solo
  comunicazioni (sezione 3.4/5.8 del modello).
- La bozza si compone anche ad assemblea chiusa (`ctx.solaLettura` non blocca i campi del verbale); prima
  dell'apertura della seduta la scheda dice che si compila dopo l'apertura, come il Report.
- Un verbale `definitivo` già presente non si sovrascrive mai.
- Per i consiglieri tutto il resto del portale resta com'è. `npm test`: oggi 211 verdi.

## Review Focus

1. **Persone uscite o arrivate durante la seduta**: chi è assente al voto di un punto non compare tra i votanti e i
   movimenti sono elencati con l'ora (test `fattiVerbale: ingressi, uscite e assenti al voto`).
2. **Punto non votato o senza tabella/maggioranza**: niente esito inventato, formula «non posto in votazione» (test in
   `componi.test.js`).
3. **Campi vuoti**: niente righe «Dichiarazioni a verbale:» vuote, niente «undefined»/«null» nel testo (test).
4. **Ricarica della pagina a metà compilazione**: i campi tornano da `bozze_verbale` (verifica a mano).
5. **Stampa**: si stampa solo il verbale, senza barre e campi (verifica a mano con l'anteprima di stampa).

---

### Task 1: Fatti e testo del verbale (moduli puri)

**Files:**
- Create: `src/verbale/fatti.js`, `src/verbale/componi.js`
- Test: `tests/verbale/fatti.test.js`, `tests/verbale/componi.test.js`

**Interfaces:**
- Produces:
  - `campiVuoti() → { presidente: '', segretario: '', convocante: '', allegati: '', punti: {} }` e
    `leggiCampi(testoJson) → campi` (tollerante: JSON non valido o mancante → `campiVuoti()`), in `fatti.js`.
  - `fattiVerbale(ctx, campi) → fatti` in `fatti.js`, dove `ctx` è il contesto della seduta (vedi commento in testa a
    `src/pagine/assemblea/dettaglio.js`) e `campi.punti[punto.id] = { sintesi, dichiarazioni, delibera }`. I fatti sono
    già formattati (date «20/10/2026», ore «21:05», millesimi come nel Report) e contengono: intestazione (condominio,
    tipo, convocazione), avviso (data della lettera, convocante), prima convocazione (data, ora, luogo) se seconda,
    seduta (data, luogo, ore di apertura, appello, chiusura), presidente e segretario, ordine del giorno, appello
    (aventi diritto: teste e millesimi totali della tabella di proprietà; presenti di persona e per delega con teste e
    millesimi; elenco nominativo con unità, millesimi, «di persona»/«per delega a …», ora), quorum raggiunto sì/no,
    movimenti durante la seduta (ingressi dopo l'appello, uscite, deleghe registrate dopo l'appello, con l'ora),
    punti (numero, testo, informativo sì/no, campi a mano, votazione o `null`: ora di chiusura del voto, tabella,
    presenti al voto, favorevoli/contrari/astenuti con teste, millesimi e nominativi con millesimi, voti mancanti,
    etichetta della maggioranza, norma, approvato), allegati (avviso, report del portale, deleghe con il loro numero,
    più le righe libere di `campi.allegati`). Riusa `statoSeduta` (`src/assemblea/seduta.js`, con `adesso` =
    ora dell'appello per l'appello), `statoDelPunto`/`orariAssente`/`titoloAssemblea` (`src/pagine/assemblea/comuni.js`),
    `MAGGIORANZE`, `controllaPunto` come fa `src/pagine/assemblea/report.js`.
  - `componiVerbale(fatti) → string` in `componi.js`: il testo del verbale in paragrafi separati da una riga vuota,
    nell'ordine della sezione 2 del modello: intestazione; convocazione e sua verifica; prima convocazione deserta
    (solo in seconda); apertura; presidente e segretario; appello con elenco; costituzione; un blocco per punto
    (testo del punto come nell'avviso, sintesi, dichiarazioni a verbale se ci sono, testo della delibera, votazione per
    appello nominale con teste e millesimi di favorevoli/contrari/astenuti e nominativi, maggioranza richiesta con la
    norma, esito «APPROVATA»/«RESPINTA»; per un punto informativo solo le comunicazioni; per un punto non votato
    «Il punto non viene posto in votazione.»); ingressi e uscite; chiusura con l'ora; «Letto, approvato e
    sottoscritto.»; firme (Presidente, Segretario, con riga per la firma); elenco degli allegati numerati.

- [ ] **Step 1: Write the failing tests.** `componi.test.js` con fatti scritti a mano: seconda convocazione → c'è il
  paragrafo della prima convocazione deserta, in prima no; la frase della convocazione con «art. 1136, sesto comma»;
  punto approvato/respinto con nominativi e millesimi; punto informativo («Varie ed eventuali») senza votazione né
  esito; punto non votato; campi vuoti → nessuna riga vuota di dichiarazioni, nessun `undefined`/`null`; firme e
  allegati numerati. `fatti.test.js` con un `ctx` costruito dai dati di prova (`src/dati/dati-prova.js`,
  `src/dati/dati-prova-assemblee.js`: l'assemblea chiusa `asm-2025` ha presenze, deleghe e voti) e un caso
  `fattiVerbale: ingressi, uscite e assenti al voto`; `leggiCampi` con JSON rotto.
- [ ] **Step 2: Run** `node --test tests/verbale/` — Expected: FAIL (moduli inesistenti).
- [ ] **Step 3: Implement** `fatti.js` e `componi.js`.
- [ ] **Step 4: Run** `npm test` — Expected: tutti verdi.
- [ ] **Step 5: Commit** `feat(verbale): fatti della seduta e testo del verbale secondo il modello`

### Task 2: Scheda «Verbale» nella pagina dell'assemblea

**Files:**
- Create: `src/pagine/assemblea/verbale.js`
- Modify: `src/pagine/assemblea/dettaglio.js` (riga in `SCHEDE`: `{ id: 'verbale', titolo: 'Verbale', disegna: schedaVerbale }`;
  in `SENZA_SEDUTA` un messaggio: senza seduta dal vivo la bozza non si compone), `src/stili.css`

**Interfaces:**
- Consumes: `fattiVerbale`, `componiVerbale`, `campiVuoti`, `leggiCampi` (Task 1).
- Produces: `schedaVerbale(ctx, contenitore)`.

- [ ] **Step 1: Implement** la scheda: in alto i campi (presidente e segretario con elenco dei presenti come suggerimento,
  convocante precompilato con l'amministratore in carica da `ctx.stato.dati.amministratori` se c'è, allegati in più);
  per ogni punto tre aree di testo (sintesi della discussione, dichiarazioni a verbale, testo della delibera; per un
  punto informativo solo «Comunicazioni»); sotto, l'anteprima del verbale (testo di `componiVerbale` con `esc`, un
  paragrafo per blocco). I campi si salvano da soli in `bozze_verbale` (una riga per `assemblea_id`, `testo` = JSON dei
  campi; si legge con `deposito.leggi('bozze_verbale', { assemblea_id })`, si aggiorna per `id` o si inserisce) poco
  dopo l'ultima modifica e all'uscita dal campo, senza ridisegnare la pagina mentre si scrive (l'anteprima sì). Tasti:
  «Stampa o salva in PDF» (stampa solo il verbale), «Copia il testo» (appunti), «Salva nei Verbali come bozza»
  (inserisce o aggiorna il verbale `bozza` dell'assemblea con il testo; se c'è un verbale `definitivo` lo dice e non lo
  tocca). Prima dell'apertura della seduta: avviso come nel Report. Errori con `ctx.mostraErrore`.
- [ ] **Step 2: Run** `npm test` — Expected: verdi.
- [ ] **Step 3: Verifica a mano** con il server su una porta libera diversa da 5173 (`node scripts/server.js 5181` dalla
  copia di lavoro) e `?prova`: assemblea del 20/05/2025 (chiusa) e assemblea di prova dopo aver aperto la seduta,
  segnato presenze e voti; scrivere i campi, ricaricare (i campi tornano), stampare (solo il verbale), copiare,
  salvare nei Verbali (compare nella pagina Verbali come bozza).
- [ ] **Step 4: Commit** `feat(verbale): scheda Verbale nella pagina dell'assemblea (bozza, stampa, copia, salvataggio)`

### Task 3: Note sul punto in Votazioni e «Nuovo punto» fisso a destra

Richiesta dell'utente (20/10/2026): «per la votazione degli ordini del giorno, bisogna inserire per ogni punto la
possibilità di inserire delle note per quello specifico punto. inoltre, il form per inserire un nuovo punto va messo a
destra e lasciato fisso (non scrollabile) e che non varia per le diverse sotto maschere della pagina (ordine del
giorno, presenze, deleghe, votazioni)».

**Files:**
- Create: `src/verbale/bozza.js` (lettura e salvataggio della bozza con unione per chiave)
- Modify: `src/pagine/assemblea/votazioni.js` (campo «Note sul punto»), `src/pagine/assemblea/verbale.js` (usa
  `src/verbale/bozza.js`; titolo della scheda), `src/pagine/assemblea/odg.js` (il modulo del nuovo punto esce dalla
  scheda e diventa un riquadro riusabile), `src/pagine/assemblea/dettaglio.js` (impaginazione a due colonne con il
  riquadro a destra nelle schede odg, presenze, deleghe, votazioni; la scheda del verbale si chiama «Bozza del
  verbale»), `src/pagine/app.js` (altezza della barra in alto in una variabile CSS), `src/stili.css`
- Test: `tests/verbale/bozza.test.js`

**Interfaces:**
- Consumes: `campiVuoti`, `leggiCampi` (Task 1); la scheda del Task 2.
- Produces:
  - `leggiBozza(deposito, assembleaId) → { id: string|null, campi }` e
    `aggiornaBozza(deposito, assembleaId, modifica: (campi) => void) → campi`: rilegge la riga di `bozze_verbale`
    dell'assemblea subito prima di scrivere, applica solo la modifica richiesta (per esempio un solo campo di un solo
    punto) e salva; così due schede o due dispositivi non si cancellano i campi a vicenda.
  - `riquadroNuovoPunto(ctx, contenitore)` in `odg.js`: il modulo «Nuovo punto» di oggi (stessi campi, stessi
    suggerimenti della regola di voto, stessa scrittura) disegnato in un contenitore qualsiasi.

**Decisioni (controller):**
- Le note del punto in Votazioni sono la «sintesi della discussione» del verbale: stesso campo
  (`campi.punti[punto.id].sintesi` in `bozze_verbale`), etichetta «Note sul punto (vanno nel verbale come sintesi della
  discussione)»; per un punto «Varie ed eventuali» l'etichetta è «Comunicazioni». Non si usa `punti_odg.note`, che
  nelle assemblee registrate senza seduta è il testo della delibera e compare nel registro Delibere.
- Il campo delle note si salva da solo (ritardato mentre si scrive, subito all'uscita dal campo) senza ridisegnare la
  scheda; resta modificabile anche a votazione chiusa e ad assemblea chiusa.
- Riquadro «Nuovo punto»: a destra, fermo mentre la pagina scorre (sticky sotto la barra in alto), identico nelle schede
  Ordine del giorno, Presenze, Deleghe e Votazioni; assente in Report e «Bozza del verbale» (pagine da stampare, a tutta
  larghezza), assente ad assemblea chiusa o senza seduta dal vivo (come oggi); sotto il contenuto sugli schermi stretti;
  mai stampato. Il modulo resta compilato quando si cambia scheda e si svuota dopo l'inserimento riuscito.
- In fondo alla scheda Ordine del giorno il modulo «Nuovo punto» non c'è più (è nel riquadro).
- `app.js` tiene aggiornata la variabile CSS `--altezza-barra` (altezza della barra in alto, che con la seconda riga
  del menu cambia); i riquadri fissi (`.doc-laterale` e quello nuovo) la usano per non finire sotto la barra.
- La scheda del verbale si chiama «Bozza del verbale» (la testata ha già un collegamento «Verbale»).

- [ ] **Step 1: Write the failing tests** in `tests/verbale/bozza.test.js` con il deposito di prova: `leggiBozza` senza
  riga → `{ id: null, campi: campiVuoti() }`; `aggiornaBozza` crea la riga; due `aggiornaBozza` successivi su punti
  diversi non si cancellano (il secondo rilegge); una modifica a `presidente` non tocca i punti.
- [ ] **Step 2: Run** `node --test "tests/verbale/*.test.js"` — Expected: FAIL.
- [ ] **Step 3: Implement** `bozza.js`, poi la scheda Verbale con `aggiornaBozza`, le note in Votazioni, il riquadro.
- [ ] **Step 4: Run** `npm test` — Expected: verdi.
- [ ] **Step 5: Verifica a mano** su una porta diversa da 5173 con `?prova`: note scritte in Votazioni che compaiono nella
  bozza del verbale; riquadro a destra fermo nelle quattro schede, assente in Report e Bozza del verbale; inserimento di
  un punto dal riquadro da ognuna delle quattro schede; nulla sotto la barra in alto.
- [ ] **Step 6: Commit** `feat(assemblea): note sul punto in Votazioni (sintesi del verbale) e «Nuovo punto» fisso a destra`
