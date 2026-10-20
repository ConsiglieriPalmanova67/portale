# Profili di accesso: consiglieri e condomini — progetto

Data: 19/10/2026. Stato: approvato in chat dall'utente («i permessi sono uguali per tutti per ora. ok, andiamo per punti»).

## Perché

Il portale sta per andare online su GitHub Pages (repository pubblico `ConsiglieriPalmanova67/portale`). Oggi entra
solo chi è consigliere con mandato in corso (`is_consigliere()`), e ogni tabella ha una sola regola: i consiglieri
fanno tutto. Il consiglio vuole aprire il portale anche ai condomini, in sola lettura su alcune parti. Quali parti
non è ancora deciso: per ora serve **il meccanismo**, cioè poter scegliere pagina per pagina chi legge e chi scrive,
e cambiarlo dal portale senza toccare il codice. Le scelte sui contenuti verranno dopo, provando.

## Obiettivi

1. Due profili: **Consigliere** e **Condomino**. I permessi valgono per profilo: tutti i condomini sono uguali
   (permessi per singola persona: non ora).
2. Una tabella dei permessi modificabile dal portale: una riga per sezione (le pagine del menu, vedi sotto), una
   colonna per profilo, in ogni cella **Nessuno / Lettura / Scrittura**.
3. Il Consigliere ha sempre Scrittura su tutto e la sua colonna non si modifica: nessuno può chiudere fuori il
   consiglio. Il Condomino parte da **Nessuno** su tutte le sezioni.
4. Un elenco degli account dei condomini (email, nome, collegamento facoltativo al soggetto dell'anagrafica, attivo
   sì/no), gestito dai consiglieri.
5. I permessi valgono **nel database** (regole RLS di Postgres e regole dell'archivio file), non solo nella pagina:
   chi ha l'indirizzo e la chiave pubblica di Supabase e prova a leggere una tabella a mano vede solo quello che il
   suo profilo permette.
6. Nel portale il condomino vede nel menu solo le sezioni con Lettura o Scrittura; dove ha solo Lettura i comandi di
   modifica non compaiono.
7. I recapiti dei condomini (email, telefono, cellulare, note) escono dalla tabella `soggetti` e vanno in una tabella
   a parte legata solo alla sezione «Condomini». Così dare la lettura di «Unità immobiliari» mostra i nomi dei
   proprietari ma non i loro recapiti.

## Non obiettivi (ora)

- Permessi per singola persona; altri profili (amministratore, revisore…). Il modello dati deve però permettere di
  aggiungere un profilo senza rifare tutto.
- Decidere cosa vedono i condomini: la tabella parte tutta su «Nessuno» e la riempie il consiglio.
- Scrittura «solo sulle proprie righe» (per esempio un condomino che modifica solo le sue segnalazioni): Scrittura
  significa la stessa scrittura dei consiglieri su quella sezione. Va detto chiaramente nella pagina.
- Il grafico delle votazioni e gli altri punti di `docs/da-fare.md`.

## Da evitare (sarebbe un fallimento anche se "funziona")

- Un condomino che legge dati di una sezione per cui ha «Nessuno», anche interrogando Supabase direttamente.
- Permessi applicati solo nascondendo pagine o tasti.
- Un consigliere che perde l'accesso per un errore nella tabella dei permessi.
- Rompere le pagine dei consiglieri: per loro tutto deve restare esattamente com'è oggi.
- Recapiti, note sui condomini, scansioni delle deleghe o credenziali dei siti collegati leggibili da un condomino
  per effetto collaterale di un'altra sezione.

## Sezioni (righe della tabella dei permessi)

Ogni sezione ha una chiave, un nome e l'elenco delle tabelle che **legge** e che **scrive**. Una tabella è
leggibile da un profilo se almeno una sezione che la legge ha per quel profilo Lettura o Scrittura; è scrivibile se
almeno una sezione che la scrive ha Scrittura. Il nome di ogni sezione nella pagina dei permessi è accompagnato da
una riga che dice quali dati apre (per esempio «Storico assemblee: sedute, presenze, deleghe e voti per nome»).

| Chiave | Nome | Legge | Scrive |
|---|---|---|---|
| `unita` | Unità immobiliari | unita, titolarita, tabelle_millesimali, millesimi, soggetti | unita, titolarita, soggetti, millesimi |
| `condomini` | Condomini | soggetti, soggetti_recapiti, titolarita | soggetti, soggetti_recapiti |
| `contabilita` | Contabilità (comprende saldi e rate di ogni unità: deciso dall'utente di lasciarli qui) | esercizi, conti, fornitori, spese, posizioni, rate, stato_patrimoniale, partite_terzi | le stesse |
| `documenti_assemblee` | Documenti › Assemblee | documenti (tipo convocazione, verbale) | documenti dello stesso tipo |
| `documenti_rendiconti` | Documenti › Rendiconti | documenti (preventivo, rendiconto, riparto) | idem |
| `documenti_regolamento` | Documenti › Regolamento | documenti (regolamento) | idem |
| `documenti_comunicazioni` | Documenti › Comunicazioni | documenti (comunicazione) | idem |
| `documenti_altri` | Documenti › Altri | documenti (altro) | idem |
| `consiglio` | Consiglio | consiglieri, amministratori, referenti_amministratore | amministratori, referenti_amministratore (mai consiglieri) |
| `assemblee` | Storico assemblee | assemblee, teste_assemblea, punti_odg, presenze, deleghe, voti, verbali | le stesse (le nomine dei consiglieri restano ai consiglieri) |
| `delibere` | Delibere | assemblee, punti_odg, todo | punti_odg |
| `verbali` | Verbali | assemblee, verbali | verbali |
| `punti_aperti` | Punti aperti | todo, assemblee, punti_odg | todo |

Le righe di `documenti` si filtrano **per riga** in base al tipo (la sezione del tipo). Le righe di `verbali` si
filtrano per stato: chi non è consigliere vede solo i verbali `definitivo` (e i loro file), mai le bozze.

**Le sezioni non si allargano.** Quando una pagina mostra anche dati di un'altra sezione (per esempio la scheda del
condomino con le sue presenze e i suoi voti in assemblea, i Verbali con i PDF dei Documenti, i Punti aperti con i nomi
dei consiglieri come responsabili), quei dati restano della loro sezione: il database li restituisce vuoti a chi non
ha quella sezione e la pagina non mostra quella parte. Le uniche tabelle condivise di proposito sono `assemblee` e
`punti_odg` per Delibere, Verbali e Punti aperti (date, titoli e testi dei punti, senza presenze né voti). Il
costruttore verifica la tabella contro il codice delle pagine (`deposito.leggi/inserisci/…` in `src/pagine/**` e
`src/estrazione/**`) e fa in modo che ogni pagina regga le tabelle vuote, senza aggiungere tabelle alle sezioni.

**Tabelle che danno privilegi.** `consiglieri` (da cui dipende `is_consigliere()`), gli account e i permessi si
scrivono solo dai consiglieri, qualunque cosa dica la tabella dei permessi: altrimenti un condomino con Scrittura
potrebbe nominarsi consigliere o chiudere i mandati degli altri.

**Riservate ai consiglieri, mai configurabili:** la tabella dei permessi e quella degli account; `siti_collegati`
(contiene nomi utente di siti esterni); `estrazioni` ed `estrazioni_blocchi` e la Edge Function `estrai` (usa un
modello a pagamento: resta con il controllo `is_consigliere()` che ha già); `registrazioni`, `bozze_verbale`;
l'archivio file `deleghe` (scansioni con firme e documenti).

## Archivio file (Supabase Storage)

- `documenti`: un file è leggibile se la riga di `documenti` con quel `file_path` è leggibile (cioè per tipo, come
  sopra); caricare o eliminare richiede Scrittura sulla sezione del tipo.
- `verbali` (convocazioni e verbali delle assemblee): leggibile con Lettura su `assemblee`, `verbali` o
  `documenti_assemblee`; scrittura con Scrittura su `assemblee` o `verbali`.
- `deleghe`: solo consiglieri.

## Come si riconosce il profilo

- **Consigliere**: come oggi, `is_consigliere()` (mandato in corso). Prevale su tutto il resto.
- **Condomino**: l'email dell'utente autenticato (`auth.jwt()->>'email'`, confrontata in minuscolo) compare tra gli
  account attivi con profilo `condomino`. L'account Supabase nasce solo su invito: la registrazione libera va chiusa
  nel pannello (è già tra le impostazioni da fare per la pubblicazione).
- **Nessun profilo**: autenticato ma non riconosciuto. Non legge nulla e il portale dice «Il tuo account non è
  abilitato: chiedi al consiglio».

## Iscrizione dei condomini (deciso con l'utente il 19/10/2026)

Dalla pagina di accesso un link «Sei un condomino? Chiedi l'accesso» apre un modulo pubblico (senza login):

1. **Unità immobiliare**: tendina con i codici delle unità e il tipo (appartamento, box, cantina…), **senza nomi**.
   Una lista pubblica dei nomi dei condomini è esclusa per privacy: la pagina è aperta a chiunque abbia il link.
   L'utente ha scelto l'unità al posto del nome scritto a mano proprio per evitare errori di battitura.
2. **Nome e cognome**, **email**, telefono facoltativo, presa visione di una breve informativa privacy (testo da
   concordare con l'amministratore: nel portale un segnaposto chiaro).
3. Un controllo **sul server** (Edge Function con la service role, mai nel browser) confronta l'email con i recapiti
   in anagrafica degli intestatari dell'unità scelta:
   - **corrisponde** → si crea l'account Condomino collegato a quel soggetto e Supabase manda l'email d'invito; il
     condomino sceglie la password dal link (stessa gestione del recupero password nel portale). La password non si
     chiede nel modulo: così l'account si attiva solo se l'email è davvero sua;
   - **non corrisponde** → si salva una **richiesta di accesso** (unità, nome, email, telefono, data, stato: in attesa,
     approvata, rifiutata) e parte un'email di avviso alla casella del consiglio. Nella pagina Accessi i consiglieri
     vedono le richieste con accanto gli intestatari registrati di quell'unità; «Approva» crea l'account Condomino e
     manda l'invito (e propone di salvare l'email nei recapiti del soggetto), «Rifiuta» chiude la richiesta.
4. Il modulo non rivela se un'email è registrata o no (stesso messaggio in entrambi i casi: «Se i dati corrispondono
   riceverai un'email; altrimenti la richiesta passa al consiglio»), e limita i tentativi (una richiesta in attesa per
   email, lunghezze massime, un tetto per ora).
5. La registrazione libera di Supabase resta **chiusa**: gli account li crea solo la funzione, con l'invito.

**Prerequisito (lo fa l'utente, guidato):** un servizio di posta proprio in Supabase (SMTP), per esempio la Gmail del
consiglio con una password per le app. Senza, inviti, recupero password e avvisi ai consiglieri non arrivano agli
indirizzi esterni al progetto. La funzione usa le stesse credenziali, salvate tra i segreti delle Edge Function, per
l'avviso ai consiglieri. Anche la pubblicazione della Edge Function la fa l'utente (come per `estrai`).

## Database (una o più migrazioni dalla 020, eseguite dall'utente nell'SQL Editor)

- Tabelle nuove: gli account dei condomini; i permessi (profilo, sezione, livello); l'elenco sezione → tabelle
  (legge/scrive) che le regole consultano; `soggetti_recapiti` (una riga per soggetto: email, telefono, cellulare,
  note) con i dati spostati da `soggetti` e le colonne tolte da `soggetti`. Tutte con le colonne di audit e il trigger
  `imposta_audit` come le altre.
- Funzioni `security definer` con `search_path` fissato (come `is_consigliere`): il profilo dell'utente, «può
  leggere la tabella X», «può scrivere la tabella X», «può leggere/scrivere la sezione S», e una funzione che il
  portale chiama all'ingresso e restituisce profilo e permessi dell'utente.
- Regole: la regola `consiglieri_tutto` di ogni tabella resta com'è; si aggiungono, solo sulle tabelle delle sezioni,
  regole per gli altri profili (SELECT con «può leggere», INSERT/UPDATE/DELETE con «può scrivere»), più le regole per
  riga su `documenti` e quelle dell'archivio file.
- Valori iniziali: per il profilo Condomino ogni sezione su «Nessuno».
- La migrazione deve poter essere eseguita sul database vero senza perdere dati (i recapiti si copiano prima di
  togliere le colonne) e va accompagnata da un controllo SQL da lanciare dopo, che mostri regole e permessi creati.

## Portale

- All'ingresso, al posto di `sonoConsigliere()`, si chiede profilo e permessi. Il menu (`MENU` in `app.js`) mostra
  solo le sezioni leggibili; un indirizzo di una sezione non permessa mostra «Non hai accesso a questa pagina».
  Il caricamento iniziale (`caricaDati`) deve funzionare anche quando alcune tabelle tornano vuote per i permessi.
- Sola lettura: nelle pagine di una sezione con sola Lettura i comandi di modifica non compaiono. Le pagine
  dell'assemblea hanno già `ctx.solaLettura` (assemblea chiusa): va riusato.
- Recapiti: il portale li legge da `soggetti_recapiti` e li unisce ai soggetti in memoria, così le pagine che usano
  `s.email`, `s.telefono`, `s.cellulare`, `s.note` (teste.js, condomino.js, unita.js, unita-modifica.js) restano
  come sono per la lettura; le scritture di questi campi vanno su `soggetti_recapiti`.
- Pagina nuova **Accessi**, nel macrotema Consiglio, visibile solo ai consiglieri:
  1. la tabella dei permessi (colonna Consigliere fissa su Scrittura; colonna Condomino con una tendina per cella,
     salvata appena si cambia), con accanto a ogni sezione i dati che apre e un avviso sulle sezioni con dati
     personali (Condomini, Contabilità, Storico assemblee, Consiglio);
  2. le richieste di accesso in attesa (vedi «Iscrizione dei condomini»), con Approva / Rifiuta;
  3. l'elenco degli account dei condomini (aggiungi con invito, modifica, disattiva).
- Modalità prova: oltre a `?prova` (consigliere), `?prova=condomino` mostra il portale con il profilo Condomino e i
  permessi di prova, così si può controllare la vista dei condomini senza dati veri. Il deposito di prova applica gli
  stessi permessi.

## Vincoli

- Pagine statiche HTML + JS senza framework, file sotto le 500 righe, testi in italiano semplice, come il resto.
- Nessun dato reale nel repository. Commit in italiano senza Co-Authored-By.
- Le migrazioni le esegue l'utente dall'SQL Editor (il connettore Supabase di questa macchina non vede il progetto).
- Test con `node:test` per tutta la logica pura (calcolo dei permessi effettivi, filtro del menu, unione dei
  recapiti). Le regole SQL non si possono provare in locale: servono una revisione attenta e una lista di prove da
  fare sul database vero con un account condomino di prova.

## Scelte fatte da Claude (non chieste all'utente, da controllare)

- Due profili, Consigliere fisso e Condomino configurabile; profilo riconosciuto dall'email dell'account.
- Recapiti e note dei condomini spostati in `soggetti_recapiti`, legati solo alla sezione Condomini.
- Documenti divisi in cinque sezioni per tipo; archivio `deleghe` sempre riservato.
- `consiglieri`, account e permessi scrivibili solo dai consiglieri (dalla revisione del progetto).
- Sezioni che non si allargano: i dati di un'altra sezione compaiono solo se anche quella è leggibile.
- Ai condomini solo i verbali definitivi, mai le bozze.
- Iscrizione: password scelta dal link nell'email e non nel modulo; richieste anche nella pagina Accessi oltre che
  per email; il modulo non rivela se un'email è registrata; tetto ai tentativi; registrazione libera chiusa.

## Lasciato al costruttore

Nomi di tabelle, funzioni e file; disposizione della pagina Accessi; come si nascondono i comandi di modifica pagina
per pagina; divisione in migrazioni; ordine dei lavori, purché per i consiglieri il portale funzioni a ogni passo.
