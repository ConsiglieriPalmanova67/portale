# Profili di accesso — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** consiglieri e condomini entrano nello stesso portale; i consiglieri decidono dalla pagina Accessi, sezione per
sezione, se il profilo Condomino ha Nessuno, Lettura o Scrittura, e il database applica quelle scelte.

**Architecture:** un catalogo unico delle sezioni (`src/accessi/sezioni.js`) dice quali tabelle legge e scrive ogni
sezione; la migrazione 020 lo ricopia nel database (tabella `sezioni_tabelle`) e le regole RLS lo consultano tramite
funzioni `security definer`. Il portale chiede all'ingresso profilo e permessi (`mio_accesso()`), filtra il menu e
nasconde i comandi di modifica. L'iscrizione dei condomini passa da una Edge Function `accessi` con la service role.

**Tech Stack:** HTML + JavaScript a moduli senza framework, `node:test`; Supabase (Postgres RLS, Storage, Auth,
Edge Function Deno/TypeScript, `npm:@supabase/supabase-js@2.45.4`, `npm:nodemailer@6.9.16`).

**Spec:** `docs/superpowers/specs/2026-10-19-profili-accesso-design.md`

## Global Constraints

- Pagine statiche HTML + JS senza framework; file sotto le 500 righe; testi in italiano semplice.
- Nessun dato reale nel repository; commit in italiano senza `Co-Authored-By`.
- Le migrazioni le esegue l'utente dall'SQL Editor; anche la pubblicazione della Edge Function la fa l'utente.
- Per i consiglieri il portale deve funzionare a ogni passo, anche prima che l'utente esegua le migrazioni nuove
  (ogni lettura di tabelle/funzioni nuove ha un ripiego quando non esistono ancora).
- Profili: `consigliere` (sempre Scrittura su tutto, non modificabile) e `condomino` (configurabile, parte da
  `nessuno` ovunque). Livelli: `nessuno`, `lettura`, `scrittura`.
- `consiglieri`, `account_condomini`, `permessi`, `sezioni_tabelle`, `richieste_accesso` si scrivono solo dai
  consiglieri; `siti_collegati`, `estrazioni`, `estrazioni_blocchi`, `registrazioni`, `bozze_verbale` e l'archivio
  `deleghe` sono solo dei consiglieri.
- Ai non consiglieri solo i `verbali` con stato `definitivo`; le righe di `documenti` si filtrano per tipo.
- Sezioni che non si allargano: una pagina mostra i dati di un'altra sezione solo se il database li restituisce.
- Registrazione libera di Supabase chiusa: gli account li crea solo la funzione `accessi` (invito).
- Test: `npm test` (= `node --test`), oggi 211 test verdi; non devono diminuire.

## Review Focus

1. **Consigliere chiuso fuori** se `mio_accesso()` non esiste ancora o va in errore → deve valere il ripiego su
   `is_consigliere()` (Task 4, test `mioAccesso: senza la funzione nuova un consigliere resta consigliere`).
2. **Email scritte in modo diverso** (maiuscole, spazi, più indirizzi nello stesso campo «a@x.it, b@y.it») → il
   confronto dell'iscrizione deve riconoscerle (Task 9, test `corrisponde: maiuscole, spazi e più indirizzi`).
3. **Documenti › Tutti** per un condomino con una sola sezione di documenti → vede solo quei tipi, e il file di un
   tipo non permesso non si apre (Task 5, test `conPermessi: documenti per tipo e file`).
4. **Indirizzo scritto a mano** di una pagina non permessa (`#/contabilita`) → «Non hai accesso a questa pagina»,
   niente dati (Task 4, test `paginaPermessa: indirizzi diretti e pagine riservate`).
5. **Recapiti prima e dopo la migrazione 021**: senza la tabella nuova si usano i campi di `soggetti`; con la tabella,
   i recapiti vuoti non creano righe vuote (Task 3, test `unisciRecapiti` e `dividiValoriSoggetto`).

---

### Task 1: Catalogo delle sezioni e calcolo dei permessi

**Files:**
- Create: `src/accessi/sezioni.js`
- Test: `tests/accessi/sezioni.test.js`

**Interfaces:**
- Produces:
  - `PROFILI = { consigliere: 'Consigliere', condomino: 'Condomino' }`
  - `LIVELLI = { nessuno: 'Nessuno', lettura: 'Lettura', scrittura: 'Scrittura' }`
  - `SEZIONI: Array<{ chiave, nome, apre: string, personali: boolean, legge: string[], scrive: string[], tipi?: string[] }>`
    — le 13 sezioni della tabella dello spec, nello stesso ordine; `tipi` solo per le `documenti_*`;
    `personali: true` per `condomini`, `contabilita`, `assemblee`, `consiglio`.
  - `SCRITTURA_SOLO_CONSIGLIERI: string[]` e `LETTURA_SOLO_CONSIGLIERI: string[]` (vedi Global Constraints).
  - `permessiDi(profilo: string|null, righe: Array<{profilo, sezione, livello}>) → { [sezione]: livello }`
  - `puo(accesso: {profilo, permessi}, sezione: string, livello: 'lettura'|'scrittura') → boolean`
    (`scrittura` implica `lettura`; il consigliere può sempre; `sezione === 'riservata'` solo il consigliere;
    `sezione === 'documenti'` vale se almeno una `documenti_*` lo consente)
  - `tabellaPermessa(accesso, tabella: string, modo: 'legge'|'scrive') → boolean`
  - `sezioneDelTipo(tipo: string) → string` (chiave `documenti_*`, `documenti_altri` per tipi sconosciuti)
  - `sezioneDellaPagina(pagina: string, parametro?: string) → string|null` — `unita`/`millesimi` → `unita`;
    `teste`/`condomini` → `condomini`; `documenti` con categoria → `documenti_<categoria>`, senza → `documenti`
    (gruppo: vale se almeno una `documenti_*` è leggibile); `assemblee`/`deleghe` → `assemblee`; `todo` →
    `punti_aperti`; `accessi`, `estrazione`, `lettura-verbale` → `riservata`; pagina sconosciuta → `null`.

- [ ] **Step 1: Write the failing tests**

```js
test('permessiDi: il consigliere ha scrittura ovunque, il condomino parte da nessuno', () => {
  const c = permessiDi('consigliere', []);
  assert.ok(SEZIONI.every((s) => c[s.chiave] === 'scrittura'));
  const n = permessiDi('condomino', [{ profilo: 'condomino', sezione: 'verbali', livello: 'lettura' }]);
  assert.equal(n.verbali, 'lettura');
  assert.equal(n.contabilita, 'nessuno');
  assert.ok(Object.values(permessiDi(null, [])).every((l) => l === 'nessuno'));
});
test('puo: scrittura implica lettura; riservata solo ai consiglieri', () => {
  const a = { profilo: 'condomino', permessi: permessiDi('condomino', [{ profilo: 'condomino', sezione: 'punti_aperti', livello: 'scrittura' }]) };
  assert.equal(puo(a, 'punti_aperti', 'lettura'), true);
  assert.equal(puo(a, 'verbali', 'lettura'), false);
  assert.equal(puo(a, 'riservata', 'lettura'), false);
  assert.equal(puo({ profilo: 'consigliere', permessi: permessiDi('consigliere', []) }, 'riservata', 'scrittura'), true);
});
test('tabellaPermessa: le tabelle dei privilegi non si scrivono mai da un condomino', () => {
  const tutto = { profilo: 'condomino', permessi: Object.fromEntries(SEZIONI.map((s) => [s.chiave, 'scrittura'])) };
  for (const t of SCRITTURA_SOLO_CONSIGLIERI) assert.equal(tabellaPermessa(tutto, t, 'scrive'), false, t);
  assert.equal(tabellaPermessa(tutto, 'consiglieri', 'legge'), true);
  assert.equal(tabellaPermessa(tutto, 'siti_collegati', 'legge'), false);
  for (const s of SEZIONI) for (const t of s.scrive) assert.ok(!SCRITTURA_SOLO_CONSIGLIERI.includes(t), `${s.chiave} scrive ${t}`);
});
test('sezioneDellaPagina e sezioneDelTipo', () => {
  assert.equal(sezioneDellaPagina('millesimi'), 'unita');
  assert.equal(sezioneDellaPagina('documenti', 'regolamento'), 'documenti_regolamento');
  assert.equal(sezioneDellaPagina('deleghe'), 'assemblee');
  assert.equal(sezioneDellaPagina('accessi'), 'riservata');
  assert.equal(sezioneDellaPagina('inesistente'), null);
  assert.equal(sezioneDelTipo('riparto'), 'documenti_rendiconti');
  assert.equal(sezioneDelTipo('boh'), 'documenti_altri');
});
```

- [ ] **Step 2: Run** `node --test tests/accessi/sezioni.test.js` — Expected: FAIL (modulo inesistente).
- [ ] **Step 3: Implement `src/accessi/sezioni.js`** con le interfacce sopra; funzioni pure, nessun import dal DOM.
  Le tabelle di `legge`/`scrive` sono quelle dello spec, con `soggetti_recapiti` in `condomini` e senza `consiglieri`
  tra le scritture di `consiglio` e `assemblee`. `tipi` delle `documenti_*` da `CATEGORIE_DOCUMENTO` (`src/dati/documenti.js`)
  più `documenti_altri: ['altro']`.
- [ ] **Step 4: Run** `npm test` — Expected: tutti verdi.
- [ ] **Step 5: Commit** `feat(accessi): catalogo delle sezioni e calcolo dei permessi`

### Task 2: Migrazione 020 — profili, permessi e regole

**Files:**
- Create: `supabase/migrations/020_profili_accesso.sql`, `supabase/verifiche/020_controllo.sql`
- Test: `tests/accessi/migrazione.test.js`

**Interfaces:**
- Consumes: `SEZIONI`, `SCRITTURA_SOLO_CONSIGLIERI` (Task 1).
- Produces (database):
  - tabelle `account_condomini(id, email text unique not null check (email = lower(trim(email))), nome text, soggetto_id
    uuid references soggetti on delete set null, attivo boolean not null default true, + audit)`,
    `permessi(profilo text, sezione text, livello text check in ('nessuno','lettura','scrittura'), primary key (profilo, sezione), + audit)`,
    `sezioni_tabelle(sezione text, tabella text, modo text check in ('legge','scrive'), primary key (sezione, tabella, modo))`,
    `richieste_accesso(id, unita_id uuid references unita, nome text not null, email text not null, telefono text,
    stato text not null default 'in_attesa' check in ('in_attesa','approvata','rifiutata'), + audit)`;
  - funzioni `security definer`, `set search_path = public`, `stable`: `profilo_corrente() → text`,
    `puo_sezione(sezione text, livello text) → boolean`, `puo_tabella(tabella text, modo text) → boolean`,
    `mio_accesso() → jsonb` (`{ "profilo": …, "permessi": [{sezione, livello}] }`); execute solo a `authenticated`.

- [ ] **Step 1: Write the failing test** — legge il file SQL come testo e controlla che rispecchi il catalogo:

```js
test('migrazione 020: sezioni_tabelle uguale al catalogo SEZIONI', () => {
  const sql = readFileSync('supabase/migrations/020_profili_accesso.sql', 'utf8');
  const righe = [...sql.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*'(legge|scrive)'\)/g)].map((m) => m.slice(1).join(' ')).sort();
  const attese = SEZIONI.flatMap((s) => [...s.legge.map((t) => `${s.chiave} ${t} legge`), ...s.scrive.map((t) => `${s.chiave} ${t} scrive`)]).sort();
  assert.deepEqual(righe, attese);
});
test('migrazione 020: nessuna regola di scrittura per i non consiglieri sulle tabelle dei privilegi', () => {
  const sql = readFileSync('supabase/migrations/020_profili_accesso.sql', 'utf8');
  // consiglieri_tutto (la regola dei consiglieri) ci deve essere; nessun'altra regola di scrittura
  for (const t of SCRITTURA_SOLO_CONSIGLIERI) assert.doesNotMatch(sql, new RegExp(`create policy (?!consiglieri_tutto\\b)\\w+ on public\\.${t}\\s+for (insert|update|delete|all)`, 'i'), t);
});
test('migrazione 020: il condomino parte da nessuno su ogni sezione', () => {
  const sql = readFileSync('supabase/migrations/020_profili_accesso.sql', 'utf8');
  for (const s of SEZIONI) assert.match(sql, new RegExp(`\\('condomino',\\s*'${s.chiave}',\\s*'nessuno'\\)`));
});
```

- [ ] **Step 2: Run** `node --test tests/accessi/migrazione.test.js` — Expected: FAIL (file inesistente).
- [ ] **Step 3: Write `020_profili_accesso.sql`.** Il cuore (le funzioni che decidono) va scritto così:

```sql
create or replace function public.profilo_corrente() returns text language sql stable security definer set search_path = public as $$
  select case
    when public.is_consigliere() then 'consigliere'
    when exists (select 1 from public.account_condomini a
                 where a.attivo and a.email = lower(trim(auth.jwt() ->> 'email'))) then 'condomino'
  end;
$$;
create or replace function public.puo_sezione(p_sezione text, p_livello text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_consigliere() or exists (
    select 1 from public.permessi p
    where p.profilo = public.profilo_corrente() and p.sezione = p_sezione
      and (p.livello = 'scrittura' or (p_livello = 'lettura' and p.livello = 'lettura')));
$$;
create or replace function public.puo_tabella(p_tabella text, p_modo text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_consigliere() or exists (
    select 1 from public.sezioni_tabelle st
    where st.tabella = p_tabella and st.modo = p_modo
      and public.puo_sezione(st.sezione, case p_modo when 'scrive' then 'scrittura' else 'lettura' end));
$$;
```

  Poi, nell'ordine: le tabelle nuove con RLS e `consiglieri_tutto`, audit come in 003; i valori di
  `sezioni_tabelle` (uno per riga, nel formato `('sezione', 'tabella', 'modo')` letto dal test); i permessi iniziali
  `('condomino', '<sezione>', 'nessuno')`; per ogni tabella in `sezioni_tabelle` diversa da `documenti`, `verbali` e
  `consiglieri` le regole `profili_legge` (select using `puo_tabella('<t>','legge')`) e `profili_scrive_ins/upd/del`
  (with check / using `puo_tabella('<t>','scrive')`) generate con un ciclo `do $$ … $$` come in 003;
  `consiglieri`: solo `profili_legge`; `documenti`: select using `puo_sezione(<sezione del tipo>, 'lettura')` e
  scritture con `'scrittura'` (la sezione del tipo con un `case` su `tipo`, uguale a `sezioneDelTipo`); `verbali`:
  select using `stato = 'definitivo' and puo_tabella('verbali','legge')`, scritture con `puo_tabella('verbali','scrive')`;
  Storage `documenti`: select/insert/update/delete se esiste la riga di `documenti` con `file_path = name` e la sezione
  del suo tipo è leggibile/scrivibile; Storage `verbali`: lettura con `puo_sezione` lettura su `assemblee`, `verbali` o
  `documenti_assemblee`, scrittura con scrittura su `assemblee` o `verbali`; `mio_accesso()`;
  `revoke execute … from public; grant execute … to authenticated` per le quattro funzioni.
- [ ] **Step 4: Write `supabase/verifiche/020_controllo.sql`**: elenca le policy per tabella
  (`pg_policies`), i permessi e le funzioni create; nessuna scrittura.
- [ ] **Step 5: Run** `npm test` — Expected: verdi.
- [ ] **Step 6: Commit** `feat(accessi): migrazione 020 — profili, permessi per sezione e regole del database`

### Task 3: Recapiti in una tabella a parte

**Files:**
- Create: `supabase/migrations/021_recapiti_separati.sql`, `src/dati/recapiti.js`
- Modify: `src/dati/client.js` (`caricaDati`), `src/pagine/condomino.js`, `src/pagine/teste.js`, `src/pagine/unita-modifica.js` (scritture dei recapiti), `src/dati/dati-prova.js` (recapiti di prova in `soggetti_recapiti`)
- Test: `tests/dati/recapiti.test.js`

**Interfaces:**
- Produces:
  - `CAMPI_RECAPITO = ['email', 'telefono', 'cellulare', 'note']`
  - `unisciRecapiti(soggetti, recapiti: Array|null) → soggetti` — con `recapiti === null` (tabella non ancora
    creata) restituisce i soggetti come sono; altrimenti ogni soggetto prende i campi dalla sua riga (o `null`).
  - `dividiValoriSoggetto(valori) → { soggetto, recapito }` — `recapito` contiene solo i `CAMPI_RECAPITO` presenti.
  - `salvaSoggetto(deposito, id, valori, recapitiSeparati: boolean) → Promise` — con `true` aggiorna `soggetti`
    (se restano campi) e fa `salva('soggetti_recapiti', [{ soggetto_id: id, ...recapito }], ['soggetto_id'])`;
    con `false` aggiorna solo `soggetti` come oggi.
  - `caricaDati()` restituisce anche `recapitiSeparati: boolean` e i soggetti già uniti ai recapiti.

- [ ] **Step 1: Write the failing tests** — `unisciRecapiti` (con `null`, con righe, soggetto senza riga →
  campi `null`); `dividiValoriSoggetto({ denominazione: 'X', email: 'a@x.it', note: '' })` →
  `{ soggetto: { denominazione: 'X' }, recapito: { email: 'a@x.it', note: '' } }`; `salvaSoggetto` con un deposito
  di prova: con `false` scrive su `soggetti`, con `true` su `soggetti_recapiti` e non su `soggetti` se restano solo recapiti.
- [ ] **Step 2: Run** `node --test tests/dati/recapiti.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/dati/recapiti.js`; in `caricaDati` leggere `soggetti_recapiti` con `catch → null`
  e unire; nelle tre pagine sostituire `deposito.aggiorna('soggetti', …)` / `inserisci` dei recapiti con
  `salvaSoggetto(deposito, id, valori, stato.dati.recapitiSeparati)` (per `inserisci` di un soggetto nuovo: prima la
  riga di `soggetti`, poi i recapiti con l'id ottenuto).
- [ ] **Step 4: Write `021_recapiti_separati.sql`**: tabella `soggetti_recapiti(soggetto_id uuid primary key
  references soggetti on delete cascade, email, telefono, cellulare, note, + audit)` con RLS, `consiglieri_tutto`,
  `profili_legge`/`profili_scrive_*` via `puo_tabella('soggetti_recapiti', …)`, trigger audit; copia
  `insert … select id, email, telefono, cellulare, note from soggetti where coalesce(email, telefono, cellulare, note) is not null`;
  poi `alter table soggetti drop column email, drop column telefono, drop column cellulare, drop column note`.
  In testa un commento: «eseguire dopo la 020 e solo dopo aver pubblicato il portale con il Task 3».
- [ ] **Step 5: Run** `npm test` e prova a mano `?prova`: scheda condomino, modifica recapiti, ricarica → valori mantenuti.
- [ ] **Step 6: Commit** `feat(recapiti): recapiti e note dei condomini in una tabella a parte (migrazione 021)`

### Task 4: Ingresso con profilo, menu e pagine permesse

**Files:**
- Create: `src/pagine/menu.js`
- Modify: `src/dati/client.js` (`mioAccesso`), `src/dati/deposito.js` (`profiloProva`), `src/dati/dati-prova.js` (`permessiProva`), `src/pagine/app.js` (ingresso, menu, blocco pagine)
- Test: `tests/accessi/menu.test.js`, `tests/accessi/client.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `MENU` spostato da `app.js` a `src/pagine/menu.js` (stessa forma), con `['accessi', 'Accessi']` aggiunto alle sezioni di Consiglio.
  - `menuPer(accesso) → MENU filtrato`: una voce di sezione resta se `puo(accesso, sezioneDellaPagina(pagina, parametro), 'lettura')`
    (per `documenti` senza categoria: se almeno una `documenti_*` è leggibile); un macrotema senza sezioni sparisce.
  - `paginaPermessa(accesso, pagina, parametro) → boolean` (pagina sconosciuta → si tratta come `unita`).
  - `mioAccesso() → Promise<{ profilo: 'consigliere'|'condomino'|null, permessi }>` in `client.js`: in prova
    `profiloProva` (`?prova` → consigliere, `?prova=condomino` → condomino con `permessiProva()`); sul database
    `rpc('mio_accesso')`; se la funzione non esiste (errore PostgREST `PGRST202`) ripiega su `sonoConsigliere()`.
  - `permessiProva() → righe` in `dati-prova.js`: lettura su `delibere`, `verbali`, `documenti_regolamento`,
    `punti_aperti`; scrittura su `documenti_comunicazioni`; nessuno altrove.
  - `stato.accesso` in `app.js` e `stato.puoScrivere(sezione) → boolean`, usati dai Task 6 e 7.

- [ ] **Step 1: Write the failing tests** — `menuPer` con i permessi di prova: restano Documenti (Tutti, Regolamento,
  Comunicazioni), Assemblea (Delibere, Verbali), Punti aperti; spariscono Anagrafica, Contabilità, Consiglio.
  `menuPer` per il consigliere = `MENU` intero con Accessi. `paginaPermessa: indirizzi diretti e pagine riservate`:
  `('contabilita')` false, `('accessi')` false, `('documenti', 'regolamento')` true, `('documenti', 'rendiconti')` false
  per il condomino di prova. `mioAccesso: senza la funzione nuova un consigliere resta consigliere`: con un client finto
  che risponde `PGRST202` a `mio_accesso` e `true` a `is_consigliere` → `{ profilo: 'consigliere' }`
  (per renderlo provabile, `mioAccesso` usa una funzione interna `accessoDa(rpc)` esportata per i test).
- [ ] **Step 2: Run** `node --test tests/accessi/menu.test.js tests/accessi/client.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement**; in `app.js` `entra()` usa `mioAccesso()`: profilo `null` → esci e messaggio «Il tuo
  account non è abilitato: chiedi al consiglio»; `disegnaMenu` usa `menuPer(stato.accesso)`; `naviga` mostra
  `<p class="avviso">Non hai accesso a questa pagina.</p>` se `!paginaPermessa(...)`. Senza permesso su nessuna pagina
  l'indirizzo vuoto porta alla prima sezione permessa.
- [ ] **Step 4: Run** `npm test`; prova a mano `?prova` (tutto come prima) e `?prova=condomino` (menu ridotto,
  `#/contabilita` scritto a mano → avviso).
- [ ] **Step 5: Commit** `feat(accessi): ingresso con profilo, menu e pagine secondo i permessi`

### Task 5: Permessi anche nel deposito di prova

**Files:**
- Create: `src/accessi/deposito-permessi.js`
- Modify: `src/dati/deposito.js` (in prova con profilo condomino il deposito passa da `conPermessi`)
- Test: `tests/accessi/deposito-permessi.test.js`

**Interfaces:**
- Consumes: `tabellaPermessa`, `sezioneDelTipo`, `puo` (Task 1).
- Produces: `conPermessi(deposito, accesso) → deposito` con la stessa interfaccia di `deposito.js`: `leggi` restituisce
  `[]` per tabelle non leggibili, filtra `documenti` per tipo e `verbali` (solo `definitivo` per i non consiglieri);
  `inserisci/aggiorna/salva/elimina` su tabelle non scrivibili lanciano `Error('Non hai il permesso di modificare questi dati.')`;
  `urlFile/caricaFile/eliminaFile` seguono le regole dello spec per i bucket `documenti`, `verbali`, `deleghe`.

- [ ] **Step 1: Write the failing tests** — `conPermessi: documenti per tipo e file` (con lettura solo su
  `documenti_regolamento`: `leggi('documenti')` → solo il regolamento; `urlFile('documenti', <percorso del rendiconto>)`
  → errore; `urlFile('deleghe', …)` → errore); scrittura su `consiglieri` con permessi tutti a scrittura → errore;
  `leggi('verbali')` → solo i definitivi; consigliere → deposito invariato.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; in `deposito.js` applicare `conPermessi` solo se `profiloProva === 'condomino'`.
- [ ] **Step 4: Run** `npm test` — Expected: verdi.
- [ ] **Step 5: Commit** `feat(accessi): il deposito di prova applica i permessi del profilo`

### Task 6: Sola lettura nelle pagine dell'assemblea, delibere, verbali e punti aperti

**Files:**
- Modify: `src/pagine/assemblea/dettaglio.js` (`solaLettura: chiusa || !stato.puoScrivere('assemblee')`),
  `src/pagine/assemblea/testata.js` (tasti di stato e importazione), `src/pagine/assemblea/elenco.js` (riquadro
  laterale), `src/pagine/assemblea/nomine.js` («Registra mandati» solo se profilo consigliere),
  `src/pagine/delibere.js`, `src/pagine/verbali.js`, `src/pagine/todo.js` (celle come testo, niente Nuovo/Elimina)

**Interfaces:**
- Consumes: `stato.puoScrivere(sezione)`, `stato.accesso.profilo` (Task 4).

- [ ] **Step 1: Implement** pagina per pagina: dove `!stato.puoScrivere(<sezione>)` i moduli e i tasti di modifica non
  si disegnano e i gestori ignorano le azioni di scrittura. In `delibere.js` il «+ To-do» richiede scrittura su
  `punti_aperti`; i to-do collegati compaiono solo se il deposito li restituisce.
- [ ] **Step 2: Run** `npm test` — Expected: verdi.
- [ ] **Step 3: Verifica a mano** con `?prova=condomino`: Delibere, Verbali e Punti aperti in sola lettura, nessun
  tasto di modifica; con `?prova` tutto come prima (aprire una seduta, votare, aggiungere un to-do).
- [ ] **Step 4: Commit** `feat(accessi): sola lettura in assemblee, delibere, verbali e punti aperti`

### Task 7: Sola lettura in anagrafica, documenti e consiglio

**Files:**
- Modify: `src/pagine/unita.js`, `src/pagine/unita-modifica.js` (senza permesso: avviso al posto del modulo),
  `src/pagine/teste.js`, `src/pagine/condomino.js`, `src/pagine/documenti.js` (modulo di caricamento se c'è scrittura
  su almeno una `documenti_*`, con i soli tipi scrivibili; Modifica/Elimina per tipo; estrazione, «Crea l'assemblea»,
  «Crea i to-do» e siti collegati solo per i consiglieri), `src/pagine/consiglio.js` (moduli con scrittura su
  `consiglio`; consiglieri nuovi e modifiche dei mandati solo per i consiglieri)

**Interfaces:**
- Consumes: come Task 6, più `sezioneDelTipo` (Task 1).

- [ ] **Step 1: Implement** come nel Task 6.
- [ ] **Step 2: Run** `npm test` — Expected: verdi.
- [ ] **Step 3: Verifica a mano** con `?prova=condomino`: Documenti mostra Regolamento in lettura e Comunicazioni con
  il caricamento (solo tipo comunicazione); `#/unita` → avviso; con `?prova` tutto come prima.
- [ ] **Step 4: Commit** `feat(accessi): sola lettura in anagrafica, documenti e consiglio`

### Task 8: Pagina Accessi

**Files:**
- Create: `src/pagine/accessi.js`
- Modify: `src/pagine/app.js` (`PAGINE.accessi`), `src/stili.css`
- Test: `tests/accessi/accessi.test.js` (solo la logica pura: `righeMatrice`)

**Interfaces:**
- Consumes: Task 1, Task 4; `chiamaAccessi` (Task 9) per «Manda invito», «Approva», «Rifiuta».
- Produces: `accessi(stato, contenitore)`; `righeMatrice(permessiRighe) → [{ sezione, nome, apre, personali, livelli: { consigliere: 'scrittura', condomino } }]`.

- [ ] **Step 1: Write the failing test** — `righeMatrice([])` → 13 righe, condomino `nessuno`, consigliere `scrittura`;
  con una riga salvata il livello cambia solo per quella sezione.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** la pagina (solo consiglieri: `sezioneDellaPagina('accessi') === 'riservata'`): (1) matrice con
  tendina per la colonna Condomino, salvataggio `salva('permessi', [{ profilo: 'condomino', sezione, livello }], ['profilo', 'sezione'])`
  al cambio, avviso accanto alle sezioni `personali` e la frase «Scrittura vuol dire poter modificare tutto ciò che c'è
  in quella sezione»; (2) richieste `in_attesa` con, accanto all'unità, gli intestatari registrati (dal modello) e i tasti
  Approva (sceglie il soggetto, facoltativo «salva l'email nei recapiti») / Rifiuta; (3) account: aggiungi (email,
  nome, soggetto) con invito, attivo sì/no, modifica. Senza le tabelle della 020: avviso «Va eseguita la migrazione 020».
- [ ] **Step 4: Run** `npm test`; verifica a mano con `?prova`: cambiare un permesso, aggiungere un account.
- [ ] **Step 5: Commit** `feat(accessi): pagina Accessi (permessi, richieste, account)`

### Task 9: Edge Function `accessi` (iscrizione pubblica e inviti)

**Files:**
- Create: `supabase/functions/accessi/regole.ts` (logica pura, importabile da Node: solo annotazioni di tipo, niente
  `enum` né proprietà nei parametri del costruttore), `supabase/functions/accessi/index.ts`
- Modify: `src/dati/client.js` (`chiamaAccessi`)
- Test: `tests/accessi/iscrizione.test.js` (importa `../../supabase/functions/accessi/regole.ts`)

**Interfaces:**
- Produces:
  - in `regole.ts`: `emailDi(campo: string|null) → string[]` (divide su `,` `;` spazi, minuscolo, senza doppioni);
    `controllaIscrizione(corpo) → { unita_id, nome, email, telefono }` o lancia `{ stato: 400, messaggio }`
    (nome 2–120 caratteri, email valida ≤ 254, telefono ≤ 30, `privacy === true`);
    `corrisponde(email, intestatari: Array<{ soggetto_id, email }>) → soggetto_id | null`;
    `MESSAGGIO_ISCRIZIONE = 'Se i dati corrispondono riceverai un\'email per scegliere la password; altrimenti la richiesta passa al consiglio.'`
  - API `POST /functions/v1/accessi`, CORS come `estrai`:
    `{ azione: 'unita' }` → `[{ id, codice, tipo }]` (pubblica);
    `{ azione: 'iscrizione', unita_id, nome, email, telefono?, privacy }` → `{ messaggio: MESSAGGIO_ISCRIZIONE }` (pubblica);
    `{ azione: 'invita', email, nome?, soggetto_id? }`, `{ azione: 'approva', richiesta_id, soggetto_id? }`,
    `{ azione: 'rifiuta', richiesta_id }` → solo consiglieri (controllo come `controllaAccesso` di `estrai`).
  - `chiamaAccessi(corpo) → Promise<risposta>` in `client.js` (manda `apikey` e, se c'è una sessione, `Authorization`);
    in prova risponde con dati finti.

- [ ] **Step 1: Write the failing tests** — `corrisponde: maiuscole, spazi e più indirizzi`
  (`corrisponde(' Mario@X.it ', [{ soggetto_id: 's1', email: 'a@y.it, mario@x.it' }])` → `'s1'`; email assente → `null`);
  `controllaIscrizione` rifiuta nome vuoto, email non valida, `privacy` mancante, campi troppo lunghi; `emailDi(null)` → `[]`.
- [ ] **Step 2: Run** `node --test tests/accessi/iscrizione.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement `regole.ts`**, poi `index.ts`: client con `SUPABASE_SERVICE_ROLE_KEY`;
  iscrizione → limiti (più di 20 richieste nell'ultima ora in tutto → 429 «Troppe richieste, riprova più tardi»;
  una richiesta `in_attesa` con la stessa email → nessuna riga nuova), intestatari dell'unità da `titolarita` +
  recapiti (`soggetti_recapiti`, o i campi di `soggetti` se la tabella non c'è), se `corrisponde` → riga in
  `account_condomini` (upsert su email) e `auth.admin.inviteUserByEmail(email, { redirectTo: PORTALE_URL })`
  (utente già esistente: nessun errore verso il modulo), altrimenti riga in `richieste_accesso` e avviso email ai
  consiglieri con `nodemailer` su SMTP porta 465 (`SMTP_HOST`, `SMTP_UTENTE`, `SMTP_PASSWORD`, `AVVISI_A`; se mancano
  si salta l'avviso). Risposta sempre `MESSAGGIO_ISCRIZIONE`. `approva` → account + invito + stato `approvata`.
- [ ] **Step 4: Run** `npm test` — Expected: verdi.
- [ ] **Step 5: Commit** `feat(accessi): Edge Function accessi — iscrizione dei condomini e inviti`

### Task 10: Iscrizione e invito nel portale

**Files:**
- Create: `src/pagine/iscrizione.js`
- Modify: `index.html` (link «Sei un condomino? Chiedi l'accesso» e modulo `#modulo-iscrizione` nella vista di
  accesso), `src/pagine/app.js`, `src/dati/deposito-supabase.js` (`arrivoDaRecupero` vale anche per `type=invite`), `src/stili.css`

**Interfaces:**
- Consumes: `chiamaAccessi` (Task 9).
- Produces: `apriIscrizione(contenitore)`: tendina delle unità (codice e tipo, nessun nome), nome, email,
  telefono facoltativo, casella dell'informativa (testo segnaposto «Informativa privacy: da concordare con
  l'amministratore»), invio → mostra `MESSAGGIO_ISCRIZIONE`.

- [ ] **Step 1: Implement**; arrivando dal link d'invito si apre «Scegli la password» come per il recupero.
- [ ] **Step 2: Run** `npm test`; verifica a mano con `?prova` dalla pagina di accesso (modulo, tendina, messaggio).
- [ ] **Step 3: Commit** `feat(accessi): modulo di iscrizione dei condomini e arrivo dall'invito`

### Task 11: Guida di configurazione e prove sul database vero

**Files:**
- Create: `docs/accessi-configurazione.md`
- Modify: `docs/da-fare.md` (voce 6: stato)

- [ ] **Step 1: Write the guide** in italiano semplice, nell'ordine: (1) Gmail del consiglio: verifica in due
  passaggi e password per le app; (2) Supabase › Authentication › SMTP Settings (host `smtp.gmail.com`, porta 465,
  utente e password per le app, mittente); (3) registrazione libera chiusa e Redirect URLs esatti; (4) migrazioni 020
  e poi 021 dall'SQL Editor, con `supabase/verifiche/020_controllo.sql`; (5) pubblicazione della funzione `accessi`
  e segreti (`SMTP_*`, `AVVISI_A`, `PORTALE_URL`); (6) prove con un account condomino di prova: con tutto «Nessuno» non
  vede niente; con Lettura su Verbali vede solo i verbali definitivi; non apre i file dei rendiconti; non scrive
  nulla; iscrizione con email registrata (arriva l'invito) e con email sconosciuta (arriva l'avviso ai consiglieri).
- [ ] **Step 2: Commit** `docs: guida di configurazione e prove dei profili di accesso`
