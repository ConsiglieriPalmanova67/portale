# Portale Condominio Palmanova 67 — Fase 1: base dati e strumento assemblea

Data: 2026-10-10
Stato: specifica da approvare

## 1. Obiettivo

Dare al consiglio di condominio uno strumento di lavoro che:

1. conservi in un unico database unità, soggetti, millesimi, voci di costo, consiglieri, assemblee, verbali e to-do;
2. gestisca dal vivo un'assemblea: presenze, deleghe, quorum, votazioni;
3. produca il report da allegare al verbale.

È la prima fase di un futuro portale del condominio. Le fasi successive si appoggiano alla stessa base dati.

### Fuori dal perimetro della fase 1

- Accesso dei condomini (bacheca, documenti, segnalazioni).
- Registrazione audio, trascrizione e bozza automatica del verbale (fase 2; la base dati nasce già con le tabelle `registrazioni` e `bozze_verbale` vuote).
- Anagrafica completa di fornitori e dipendenti (contatti, contratti, scadenze, documenti): implementazione futura. In fase 1 `fornitori` contiene solo la denominazione ricavata dall'import, e i dipendenti compaiono solo come voci di spesa (stipendi, contributi); la tabella `fornitori` è il punto da cui l'anagrafica verrà estesa.
- Modalità offline.
- Gestione contabile attiva (incassi, solleciti): la contabilità è solo consultazione dei dati importati.

## 2. Utenti e accesso

- Utenti: solo i consiglieri, ognuno con account personale (email + password, Supabase Auth).
- Nessuna registrazione libera: gli account si creano su invito.
- Tutti i consiglieri abilitati leggono e scrivono. Ogni modifica registra autore e data.
- La mail comune `consiglieripalmanova67@gmail.com` è intestataria di progetto Supabase e repository GitHub, non un account d'uso quotidiano.

## 3. Architettura

- **Frontend**: pagine statiche HTML + JavaScript senza framework, pubblicate su GitHub Pages. File sotto le 500 righe.
- **Backend**: progetto Supabase dedicato (Postgres, Auth, Storage, Realtime).
- **Modulo di calcolo** (`src/calcolo/`): funzioni pure, senza accesso a rete o DOM, per teste, quorum, limiti deleghe, maggioranze. È l'unica parte con regole di legge e va testata da sola.
- **Accesso dati** (`src/dati/`): unico punto che parla con Supabase; le pagine non chiamano Supabase direttamente.
- **Pagine** (`src/pagine/`): interfaccia; usano accesso dati e modulo di calcolo.

Il repository è pubblico (requisito di GitHub Pages gratuito). **Nessun dato reale entra nel repository**: file di import, scansioni ed esportazioni restano in `G:\Il mio Drive\Condominio` e sono esclusi da `.gitignore`.

## 4. Base dati

### Anagrafica

| Tabella | Contenuto |
|---|---|
| `unita` | codice (A1…), tipo (appartamento, box, cantina, negozio, altro), piano, interno, note. Tipo e piano non sono nel PDF: restano nulli finché non compilati. |
| `soggetti` | persona o società: denominazione, email, telefono, note. |
| `titolarita` | soggetto ↔ unità, ruolo (`proprietario`, `conduttore`, `assegnatario`), data inizio, data fine. Le righe "ex Pr" del riparto diventano titolarità chiuse. |

Solo le titolarità `proprietario` aperte contano per teste, millesimi e voto. `conduttore` (Co) e `assegnatario` (As) sono informativi.

### Millesimi

| Tabella | Contenuto |
|---|---|
| `tabelle_millesimali` | nome, ambito (intero condominio oppure parte: Condominio B, Torre 1/2/3, Scala A, Scala C), totale dichiarato. |
| `millesimi` | unità × tabella → valore. |

Tabelle note dal riparto 2024: Spese generali, Proprietà, Riscaldamento, Riscaldamento solo consumi, Ascensore Scala A, Ascensore Scala C, Spese generali Condominio B, Spese generali Torre 1, Torre 2, Torre 3, TV-citofoni Torre 1, TV-citofoni Torre 3. L'elenco definitivo si fissa durante l'import.

L'appartenenza di un'unità a una scala o torre è derivata: millesimi > 0 nella tabella di quella parte. Non si inserisce a mano.

### Contabilità (sola consultazione)

| Tabella | Contenuto |
|---|---|
| `esercizi` | anno, tipo (`consuntivo`, `preventivo`), periodo. |
| `conti` | gruppo (es. Spese proprietà), sottoconto (es. Assicurazione), tabella millesimale di riparto. |
| `fornitori` | denominazione. |
| `spese` | esercizio, conto, protocollo, descrizione, fornitore, numero fattura, data fattura, data pagamento, importo. |
| `posizioni` | unità × esercizio × intestatario: totale gestione, saldo esercizio precedente, rate versate, saldo finale. |
| `rate` | posizione × numero rata: scadenza, importo. |

### Consiglio

| Tabella | Contenuto |
|---|---|
| `consiglieri` | soggetto, carica, parte rappresentata, inizio e fine mandato, utente collegato (`auth.users`). |

### Assemblee

| Tabella | Contenuto |
|---|---|
| `assemblee` | data, tipo (`ordinaria`, `straordinaria`), convocazione (`prima`, `seconda`), luogo, ora apertura, ora appello, ora chiusura, stato (`bozza`, `in_corso`, `chiusa`). |
| `punti_odg` | assemblea, ordine, testo, tabella millesimale, tipo maggioranza, esito, note. |
| `teste_assemblea` | teste congelate all'apertura della seduta: chiave, etichetta, soggetti, unità. |
| `presenze` | assemblea × testa: stato (`assente`, `presente`), ora ingresso, ora uscita. La presenza per delega non è uno stato: si ricava dalla tabella `deleghe`. |
| `deleghe` | assemblea, testa delegante, delegato (soggetto oppure nome libero per esterni), nota, percorso scansione (facoltativo), ora di registrazione, inserita da. |
| `voti` | punto × testa: `favorevole`, `contrario`, `astenuto`; una riga per ogni testa che ha votato. La fotografia dei presenti al momento del voto e l'esito si salvano sul punto (`presenti_al_voto`, `esito`). |
| `verbali` | assemblea, file, testo, stato. |
| `todo` | descrizione, assemblea e punto di origine (facoltativi), responsabile, scadenza, stato (`aperto`, `in_corso`, `chiuso`), note. |
| `registrazioni`, `bozze_verbale` | create vuote per la fase 2. |

## 5. Regole di calcolo

### Testa

Una testa è l'insieme dei proprietari correnti di un'unità. Unità con lo stesso identico insieme di proprietari formano una sola testa, con i millesimi sommati. Le teste si calcolano dalle titolarità alla data dell'assemblea e si congelano all'apertura della seduta.

### Quorum costitutivo

Sulla tabella Proprietà, rispetto a tutte le teste:

- prima convocazione: maggioranza delle teste e almeno 2/3 dei millesimi;
- seconda convocazione: almeno 1/3 delle teste e almeno 1/3 dei millesimi.

### Deleghe

- Una testa presente per delega conta come presente; i suoi voti li esprime il delegato, anche in modo diverso dal proprio.
- Avviso (non blocco) se un delegato rappresenta più di 1/5 delle teste o più di 1/5 dei millesimi.
- Avviso se il delegato è l'amministratore.
- La delega si inserisce a mano; la scansione (foto o PDF) si allega subito o dopo. L'archivio evidenzia le deleghe senza scansione.

### Votazioni

- Ogni punto ha una tabella millesimale e un tipo di maggioranza scelto da un elenco modificabile: maggioranza dei presenti + 1/3 dei millesimi; maggioranza dei presenti + 500 millesimi; maggioranza dei presenti + 2/3 dei millesimi; unanimità.
- Se la tabella riguarda una parte del condominio, votano e contano solo le teste con millesimi > 0 in quella tabella.
- I voti possibili sono tre: `favorevole`, `contrario`, `astenuto`.
- Per ogni testa presente viene registrato un voto esplicito in `voti`: Favorevole, Contrario o Astenuto.
- Inserimento rapido:
  - **flag totale**: tre tasti (Favorevole, Contrario, Astenuto) che registrano quel voto per tutte le teste presenti, sovrascrivendo i voti già inseriti per il punto;
  - **spunta per singola testa**: su ogni riga i tre voti sono selezionabili singolarmente, per registrare o correggere il voto di quella testa.
- **Cancella tutti i voti**: tasto che elimina tutti i voti registrati per il punto, previa conferma in un popup con il testo "Sei sicuro di voler cancellare tutti i voti?". Senza conferma non si cancella nulla.
- Una testa presente senza voto registrato (per esempio arrivata dopo l'uso del flag totale) è evidenziata come "voto mancante" e non conta come favorevole.
- Orari registrati dal sistema: ora dell'appello (`assemblee.ora_appello`), ora di registrazione di ogni presenza (`presenze.ora_ingresso`, ed eventuale `ora_uscita`), ora di registrazione di ogni delega (`deleghe.ora_registrazione`), ora di chiusura di ogni votazione (`punti_odg.votato_il`). Gli orari li mette il sistema al momento dell'azione; un consigliere può correggerli a mano e la correzione resta tracciata.
- Alla chiusura della votazione il punto fotografa i presenti in quel momento (`presenti_al_voto`): ingressi e uscite successivi non lo alterano.
- Chi viene registrato presente dopo la chiusura di una votazione risulta **assente a quella votazione**: non può votarla, non entra nei suoi conteggi di teste e millesimi, e nel report compare tra gli assenti del punto con l'ora di arrivo. Vale lo stesso per chi è uscito prima della votazione, con l'ora di uscita.
- Esito mostrato per teste e per millesimi, con approvato o respinto.

### Nomina dei consiglieri in assemblea

I consiglieri si nominano in assemblea, quindi la nomina è un tipo di punto all'ordine del giorno (`punti_odg.tipo` = `delibera` oppure `nomina_consiglieri`).

- Per un punto di nomina si indicano i candidati, scelti tra i soggetti in anagrafica, ciascuno con la parte che rappresenta (scala, torre o intero condominio).
- Si vota come per ogni altro punto. Si può votare la lista intera con un'unica votazione oppure un candidato alla volta.
- A votazione approvata e assemblea chiusa, il sistema propone di registrare i mandati: crea le righe in `consiglieri` con inizio mandato alla data dell'assemblea e riferimento all'assemblea di nomina (`consiglieri.assemblea_nomina_id`), e chiude con la stessa data i mandati di chi non è stato riconfermato. La registrazione va confermata da un consigliere in carica: non è automatica.
- Il mandato e l'accesso al sistema sono cose distinte: un consigliere nominato compare subito nell'elenco del consiglio, ma entra nel portale solo dopo che gli è stato creato l'utente e collegato al suo mandato.
- Un consigliere il cui mandato viene chiuso perde l'accesso dal giorno successivo, senza altre operazioni.

Le maggioranze preimpostate seguono il codice civile; il regolamento del condominio può prevederne altre, per questo l'elenco è modificabile. Lo strumento non sostituisce il verbale firmato.

## 6. Schermate

1. **Accesso**: login.
2. **Anagrafica**: unità, soggetti, titolarità, millesimi per tabella; ricerca e filtro per parte.
3. **Contabilità**: spese per esercizio e conto; posizioni per unità; piano rate.
4. **Consiglio**: consiglieri e mandati.
5. **Assemblee**: elenco; dettaglio con schede Ordine del giorno, Presenze, Deleghe, Votazioni, Report. Barra fissa con teste e millesimi presenti e stato del quorum.
6. **Archivio deleghe**: per assemblea e per condomino.
7. **Verbali**: archivio con file allegati.
8. **To-do**: elenco filtrabile per stato, responsabile, assemblea di origine.

Nelle schede Presenze e Votazioni un interruttore "Solo presenti" sceglie tra due viste:

- **Tutti** (predefinita durante l'appello): elenco completo delle teste;
- **Solo presenti** (dopo l'appello): in alto le teste presenti, di persona o per delega; gli assenti passano in secondo piano, raccolti in fondo in una sezione richiudibile "Assenti (n)", chiusa in partenza.

Gli assenti restano raggiungibili: aprendo la sezione o cercando per nome o unità si può segnare presente chi arriva in ritardo, e la testa sale subito tra i presenti. La scelta della vista è per dispositivo e non modifica i dati. Nella scheda Votazioni votano comunque solo i presenti.

Durante la seduta le schede Presenze, Deleghe e Votazioni si aggiornano in tempo reale tra i dispositivi (Supabase Realtime).

## 7. Report da allegare al verbale

PDF generato dalla stampa del browser, con foglio di stile dedicato:

- intestazione: condominio, data, luogo, tipo, convocazione, ore di apertura, appello e chiusura;
- foglio presenze: teste presenti con unità e millesimi, di persona o per delega con nome del delegato, ora di registrazione ed eventuale ora di uscita; assenti; totali e verifica del quorum all'appello;
- elenco deleghe;
- per ogni punto: ora della votazione, testo, tabella, maggioranza richiesta, teste e millesimi presenti in quel momento, nominativi di favorevoli, contrari e astenuti con teste e millesimi, assenti alla votazione (con ora di arrivo o di uscita per chi era presente in altri momenti della seduta), esito.

Il report non contiene dati contabili dei singoli. Esiste anche un foglio presenze in bianco, stampabile prima della seduta come riserva.

## 8. Sicurezza

- Row Level Security attiva su tutte le tabelle: accesso solo a utenti presenti in `consiglieri` con mandato aperto.
- Registrazione pubblica disattivata in Supabase Auth.
- Bucket Storage privati (`deleghe`, `verbali`) con le stesse regole; file serviti con URL firmati a scadenza.
- Colonne `creato_da`, `creato_il`, `modificato_da`, `modificato_il` sulle tabelle di assemblea.
- La chiave pubblica Supabase sta nel frontend; nessuna chiave di servizio nel repository.

## 9. Import iniziale

Fonte: `Consuntivo 2024 +Preventivo 2025.pdf` (scansione, 58 pagine).

1. Trascrizione in file CSV intermedi nella cartella Drive: unità, soggetti, titolarità, millesimi, conti, spese, posizioni, rate.
2. Controlli di quadratura:
   - somma dei millesimi di ogni tabella contro il totale dichiarato;
   - somma delle spese per sottoconto contro i parziali del rendiconto;
   - totale spese contro il totale gestione (−344.340,12 €);
   - somma delle posizioni contro i totali del riparto;
   - somma delle rate per unità contro il totale del preventivo.
3. Elenco delle righe che non quadrano o illeggibili, da correggere a mano.
4. Caricamento nel database solo dopo conferma, con uno script che si può rilanciare senza duplicare.

Gli omonimi nel riparto (stesso cognome su più unità) non si uniscono in automatico: l'elenco dei possibili doppioni viene proposto per conferma, perché da questo dipende il conteggio delle teste.

## 10. Errori e casi limite

- Connessione persa in seduta: l'operazione fallita resta visibile con richiesta di riprovare; nessun salvataggio silenzioso mancato.
- Due consiglieri modificano la stessa presenza: vince l'ultima scrittura, l'altro dispositivo si aggiorna.
- Delega a un delegato assente: avviso, la testa delegante non conta come presente.
- Testa presente che ha anche rilasciato delega: avviso di conflitto.
- Assemblea chiusa: presenze e voti in sola lettura; riapertura esplicita e tracciata.
- Cambio di proprietà dopo un'assemblea: le assemblee chiuse mantengono le teste congelate.

## 11. Verifiche

Test automatici (`tests/`) sul modulo di calcolo:

- comproprietari di un'unità = una testa;
- stesso proprietario su più unità = una testa con millesimi sommati;
- conduttori e assegnatari esclusi;
- quorum di prima e seconda convocazione ai valori di soglia;
- delegato oltre 1/5 di teste o millesimi;
- punto su tabella parziale (solo una torre);
- uscita di un presente tra due votazioni;
- ogni tipo di maggioranza ai valori di soglia.

Test sull'import: i controlli di quadratura della sezione 9.

Prima dell'uso dal vivo: prova generale con un'assemblea finta sui dati reali, da due dispositivi.

## 12. Prerequisiti a carico del consiglio

- Account GitHub e account Supabase creati con la mail comune.
- Elenco dei consiglieri con email personale e parte rappresentata.
- Conferma dei possibili doppioni tra i soggetti importati.
