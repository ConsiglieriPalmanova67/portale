# Fondamenta (piano 1 di 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire il modulo di calcolo assembleare (teste, presenti, quorum, limiti deleghe, maggioranze) con test automatici, e lo schema Supabase con regole di accesso.

**Architecture:** Il modulo di calcolo è un insieme di funzioni pure in `src/calcolo/`, senza rete né DOM, che lavorano su oggetti semplici. Lo schema è in tre file SQL in `supabase/migrations/`, da applicare in ordine a un progetto Supabase nuovo. Interfaccia, import e accesso dati sono nei piani 2-4.

**Tech Stack:** Node 20+ (test runner integrato `node --test`, moduli ES), nessuna dipendenza npm. Postgres/Supabase (Auth, Storage, Realtime).

**Spec:** `docs/superpowers/specs/2026-10-10-assemblea-condominio-design.md`

**Regole di repository:**
- Nessun dato reale nel repository (è pubblico). Nei test usare solo nomi di fantasia.
- File sotto le 500 righe.
- I commit non hanno la riga `Co-Authored-By`.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `package.json` | tipo modulo ES e script di test |
| `src/calcolo/numeri.js` | conversione millesimi ↔ interi (millesimi × 1000) per confronti esatti |
| `src/calcolo/teste.js` | `calcolaTeste`, `pesaTeste` |
| `src/calcolo/presenze.js` | `calcolaPresenti` (presenti di persona + per delega, avvisi) |
| `src/calcolo/quorum.js` | `quorumCostitutivo` |
| `src/calcolo/deleghe.js` | `controllaDeleghe` (limite 1/5, amministratore) |
| `src/calcolo/maggioranze.js` | `MAGGIORANZE`, `esitoVoto` |
| `tests/calcolo/*.test.js` | un file di test per ogni modulo |
| `supabase/migrations/001_anagrafica_contabilita.sql` | unità, soggetti, titolarità, millesimi, contabilità |
| `supabase/migrations/002_consiglio_assemblee.sql` | consiglieri, assemblee, teste, presenze, deleghe, voti, verbali, to-do, tabelle fase 2 |
| `supabase/migrations/003_sicurezza.sql` | RLS, audit, bucket Storage, Realtime |

### Convenzioni dei dati nel modulo di calcolo

- Una **testa** è `{ chiave, soggetti, unita }`; `chiave` è l'identità usata ovunque (presenze, deleghe, voti).
- Una **testa pesata** è una testa con `peso`: millesimi nella tabella scelta, come intero (millesimi × 1000).
- **Presenze**: `[{ testa, stato }]` con `stato` `'presente'` o `'assente'`.
- **Deleghe**: `[{ delegante, delegato_testa, delegato_esterno, amministratore }]`; `delegato_testa` è una chiave di testa oppure `null`; `delegato_esterno` è un nome libero oppure `null`.
- **Voti**: `[{ testa, voto }]` con `voto` `'favorevole'`, `'contrario'` o `'astenuto'`.
- Le date sono stringhe ISO `'AAAA-MM-GG'`, confrontabili come testo.

---

### Task 1: Scaffold e test runner

**Files:**
- Create: `package.json`
- Create: `src/calcolo/numeri.js`
- Test: `tests/calcolo/numeri.test.js`

- [ ] **Step 1: Creare `package.json`**

```json
{
  "name": "condominio-palmanova-67",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Scrivere il test che fallisce**

`tests/calcolo/numeri.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inInteri, daInteri } from '../../src/calcolo/numeri.js';

test('inInteri converte i millesimi in interi senza errori di virgola', () => {
  assert.equal(inInteri(0.1) + inInteri(0.2), inInteri(0.3));
  assert.equal(inInteri('229,144'.replace(',', '.')), 229144);
  assert.equal(inInteri(0), 0);
});

test('daInteri riporta ai millesimi', () => {
  assert.equal(daInteri(229144), 229.144);
});
```

- [ ] **Step 3: Verificare che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module ... src/calcolo/numeri.js`

- [ ] **Step 4: Implementare**

`src/calcolo/numeri.js`:

```js
// I millesimi hanno fino a 3 decimali: si lavora in interi (millesimi × 1000)
// per confrontare soglie senza errori di virgola mobile.
export const inInteri = (valore) => Math.round(Number(valore) * 1000);

export const daInteri = (intero) => intero / 1000;
```

- [ ] **Step 5: Verificare che passi**

Run: `npm test`
Expected: PASS, 2 test

- [ ] **Step 6: Commit**

```bash
git add package.json src/calcolo/numeri.js tests/calcolo/numeri.test.js
git commit -m "chore: scaffold e conversione millesimi in interi"
```

---

### Task 2: Calcolo delle teste

**Files:**
- Create: `src/calcolo/teste.js`
- Test: `tests/calcolo/teste.test.js`

- [ ] **Step 1: Scrivere i test che falliscono**

`tests/calcolo/teste.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaTeste } from '../../src/calcolo/teste.js';

const pr = (unita_id, soggetto_id, extra = {}) =>
  ({ unita_id, soggetto_id, ruolo: 'proprietario', dal: null, al: null, ...extra });

test('comproprietari di una unità formano una sola testa', () => {
  const teste = calcolaTeste([pr('U1', 'rossi'), pr('U1', 'bianchi')], '2026-01-01');
  assert.equal(teste.length, 1);
  assert.deepEqual(teste[0], { chiave: 'bianchi+rossi', soggetti: ['bianchi', 'rossi'], unita: ['U1'] });
});

test('stesso proprietario su più unità è una sola testa', () => {
  const teste = calcolaTeste([pr('U1', 'rossi'), pr('U2', 'rossi')], '2026-01-01');
  assert.equal(teste.length, 1);
  assert.deepEqual(teste[0].unita, ['U1', 'U2']);
});

test('insiemi di proprietari diversi sono teste diverse', () => {
  const teste = calcolaTeste(
    [pr('U1', 'rossi'), pr('U2', 'rossi'), pr('U2', 'bianchi')],
    '2026-01-01',
  );
  assert.deepEqual(teste.map((t) => t.chiave), ['bianchi+rossi', 'rossi']);
});

test('conduttori e assegnatari non formano teste', () => {
  const teste = calcolaTeste(
    [
      pr('U1', 'rossi'),
      { unita_id: 'U1', soggetto_id: 'verdi', ruolo: 'conduttore', dal: null, al: null },
      { unita_id: 'U2', soggetto_id: 'neri', ruolo: 'assegnatario', dal: null, al: null },
    ],
    '2026-01-01',
  );
  assert.deepEqual(teste.map((t) => t.chiave), ['rossi']);
});

test('conta solo le titolarità valide alla data', () => {
  const titolarita = [
    pr('U1', 'vecchio', { al: '2025-06-30' }),
    pr('U1', 'nuovo', { dal: '2025-07-01' }),
  ];
  assert.deepEqual(calcolaTeste(titolarita, '2025-06-30').map((t) => t.chiave), ['vecchio']);
  assert.deepEqual(calcolaTeste(titolarita, '2025-07-01').map((t) => t.chiave), ['nuovo']);
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module ... src/calcolo/teste.js`

- [ ] **Step 3: Implementare**

`src/calcolo/teste.js`:

```js
// Una testa è l'insieme dei proprietari correnti di un'unità.
// Unità con lo stesso identico insieme di proprietari formano una sola testa.
export function calcolaTeste(titolarita, data) {
  const proprietariPerUnita = new Map();
  for (const t of titolarita) {
    if (t.ruolo !== 'proprietario') continue;
    if (t.dal && t.dal > data) continue;
    if (t.al && t.al < data) continue;
    if (!proprietariPerUnita.has(t.unita_id)) proprietariPerUnita.set(t.unita_id, new Set());
    proprietariPerUnita.get(t.unita_id).add(t.soggetto_id);
  }

  const teste = new Map();
  for (const [unitaId, proprietari] of proprietariPerUnita) {
    const soggetti = [...proprietari].sort();
    const chiave = soggetti.join('+');
    if (!teste.has(chiave)) teste.set(chiave, { chiave, soggetti, unita: [] });
    teste.get(chiave).unita.push(unitaId);
  }

  return [...teste.values()]
    .map((t) => ({ ...t, unita: [...t.unita].sort() }))
    .sort((a, b) => (a.chiave < b.chiave ? -1 : 1));
}
```

- [ ] **Step 4: Verificare che passino**

Run: `npm test`
Expected: PASS, 7 test in totale

- [ ] **Step 5: Commit**

```bash
git add src/calcolo/teste.js tests/calcolo/teste.test.js
git commit -m "feat(calcolo): teste dai proprietari correnti delle unità"
```

---

### Task 3: Peso delle teste per tabella millesimale

**Files:**
- Modify: `src/calcolo/teste.js`
- Modify: `tests/calcolo/teste.test.js`

- [ ] **Step 1: Aggiungere i test che falliscono**

In fondo a `tests/calcolo/teste.test.js`, e aggiornare l'import in testa al file a `import { calcolaTeste, pesaTeste } from '../../src/calcolo/teste.js';`:

```js
const teste = [
  { chiave: 'rossi', soggetti: ['rossi'], unita: ['U1', 'U2'] },
  { chiave: 'bianchi', soggetti: ['bianchi'], unita: ['U3'] },
];
const millesimi = [
  { unita_id: 'U1', tabella_id: 'proprieta', valore: 10.5 },
  { unita_id: 'U2', tabella_id: 'proprieta', valore: 1.25 },
  { unita_id: 'U3', tabella_id: 'proprieta', valore: 20 },
  { unita_id: 'U1', tabella_id: 'torre1', valore: 50 },
];

test('pesaTeste somma i millesimi delle unità della testa', () => {
  const pesate = pesaTeste(teste, millesimi, 'proprieta');
  assert.deepEqual(pesate.map((t) => [t.chiave, t.peso]), [['rossi', 11750], ['bianchi', 20000]]);
});

test('pesaTeste esclude le teste senza millesimi nella tabella', () => {
  const pesate = pesaTeste(teste, millesimi, 'torre1');
  assert.deepEqual(pesate.map((t) => [t.chiave, t.peso]), [['rossi', 50000]]);
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test`
Expected: FAIL, `pesaTeste is not a function` (o errore di export mancante)

- [ ] **Step 3: Implementare**

In testa a `src/calcolo/teste.js`:

```js
import { inInteri } from './numeri.js';
```

In fondo a `src/calcolo/teste.js`:

```js
// Restituisce le teste che hanno millesimi nella tabella, con `peso` in interi.
// Una delibera che riguarda una sola parte del condominio usa la sua tabella:
// le teste senza millesimi lì non partecipano.
export function pesaTeste(teste, millesimi, tabellaId) {
  const pesoPerUnita = new Map();
  for (const m of millesimi) {
    if (m.tabella_id === tabellaId) pesoPerUnita.set(m.unita_id, inInteri(m.valore));
  }
  return teste
    .map((t) => ({ ...t, peso: t.unita.reduce((s, u) => s + (pesoPerUnita.get(u) ?? 0), 0) }))
    .filter((t) => t.peso > 0);
}
```

- [ ] **Step 4: Verificare che passino**

Run: `npm test`
Expected: PASS, 9 test in totale

- [ ] **Step 5: Commit**

```bash
git add src/calcolo/teste.js tests/calcolo/teste.test.js
git commit -m "feat(calcolo): peso delle teste per tabella millesimale"
```

---

### Task 4: Presenti di persona e per delega

**Files:**
- Create: `src/calcolo/presenze.js`
- Test: `tests/calcolo/presenze.test.js`

- [ ] **Step 1: Scrivere i test che falliscono**

`tests/calcolo/presenze.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaPresenti } from '../../src/calcolo/presenze.js';

const delega = (delegante, delegato_testa = null, delegato_esterno = null) =>
  ({ delegante, delegato_testa, delegato_esterno, amministratore: false });

test('chi è presente di persona è presente', () => {
  const { presenti, avvisi } = calcolaPresenti(
    [{ testa: 'a', stato: 'presente' }, { testa: 'b', stato: 'assente' }],
    [],
  );
  assert.deepEqual([...presenti], ['a']);
  assert.deepEqual(avvisi, []);
});

test('delega a un condomino presente rende presente il delegante', () => {
  const { presenti } = calcolaPresenti([{ testa: 'a', stato: 'presente' }], [delega('b', 'a')]);
  assert.deepEqual([...presenti].sort(), ['a', 'b']);
});

test('delega a un esterno rende presente il delegante', () => {
  const { presenti } = calcolaPresenti([], [delega('b', null, 'Avv. Esempio')]);
  assert.deepEqual([...presenti], ['b']);
});

test('delega a un condomino assente: avviso e delegante non presente', () => {
  const { presenti, avvisi } = calcolaPresenti([{ testa: 'a', stato: 'assente' }], [delega('b', 'a')]);
  assert.deepEqual([...presenti], []);
  assert.deepEqual(avvisi, [{ tipo: 'delegato_assente', testa: 'b', delegato: 'a' }]);
});

test('presente di persona che ha anche rilasciato delega: avviso di conflitto', () => {
  const { presenti, avvisi } = calcolaPresenti(
    [{ testa: 'a', stato: 'presente' }, { testa: 'b', stato: 'presente' }],
    [delega('b', 'a')],
  );
  assert.deepEqual([...presenti].sort(), ['a', 'b']);
  assert.deepEqual(avvisi, [{ tipo: 'conflitto', testa: 'b' }]);
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module ... src/calcolo/presenze.js`

- [ ] **Step 3: Implementare**

`src/calcolo/presenze.js`:

```js
// Presenti = chi è in sala di persona + chi ha delegato qualcuno che c'è.
// Un delegato esterno è presente per definizione: la delega si registra al suo arrivo.
export function calcolaPresenti(presenze, deleghe) {
  const stato = new Map(presenze.map((p) => [p.testa, p.stato]));
  const presenti = new Set();
  const avvisi = [];

  for (const [testa, s] of stato) {
    if (s === 'presente') presenti.add(testa);
  }

  for (const d of deleghe) {
    if (stato.get(d.delegante) === 'presente') {
      avvisi.push({ tipo: 'conflitto', testa: d.delegante });
      continue;
    }
    if (d.delegato_testa && stato.get(d.delegato_testa) !== 'presente') {
      avvisi.push({ tipo: 'delegato_assente', testa: d.delegante, delegato: d.delegato_testa });
      continue;
    }
    presenti.add(d.delegante);
  }

  return { presenti, avvisi };
}
```

- [ ] **Step 4: Verificare che passino**

Run: `npm test`
Expected: PASS, 14 test in totale

- [ ] **Step 5: Commit**

```bash
git add src/calcolo/presenze.js tests/calcolo/presenze.test.js
git commit -m "feat(calcolo): presenti di persona e per delega con avvisi"
```

---

### Task 5: Quorum costitutivo

**Files:**
- Create: `src/calcolo/quorum.js`
- Test: `tests/calcolo/quorum.test.js`

Regole (art. 1136 c.c.): prima convocazione, maggioranza delle teste e almeno 2/3 dei millesimi; seconda convocazione, almeno 1/3 delle teste e almeno 1/3 dei millesimi.

- [ ] **Step 1: Scrivere i test che falliscono**

`tests/calcolo/quorum.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quorumCostitutivo } from '../../src/calcolo/quorum.js';

const t = (chiave, millesimi) => ({ chiave, soggetti: [chiave], unita: [], peso: millesimi * 1000 });
// tre teste, 1000 millesimi
const teste = [t('a', 333), t('b', 333), t('c', 334)];

test('riporta i conteggi', () => {
  const q = quorumCostitutivo(teste, new Set(['a', 'c']), 'seconda');
  assert.deepEqual(
    { testeTotali: q.testeTotali, testePresenti: q.testePresenti, pesoTotale: q.pesoTotale, pesoPresente: q.pesoPresente },
    { testeTotali: 3, testePresenti: 2, pesoTotale: 1000000, pesoPresente: 667000 },
  );
});

test('seconda convocazione: serve almeno 1/3 dei millesimi', () => {
  assert.equal(quorumCostitutivo(teste, new Set(['a']), 'seconda').raggiunto, false); // 333 < 333,33
  assert.equal(quorumCostitutivo(teste, new Set(['c']), 'seconda').raggiunto, true); // 334
});

test('seconda convocazione: serve almeno 1/3 delle teste', () => {
  const quattro = [t('a', 700), t('b', 100), t('c', 100), t('d', 100)];
  assert.equal(quorumCostitutivo(quattro, new Set(['a']), 'seconda').raggiunto, false); // 1 su 4
  assert.equal(quorumCostitutivo(quattro, new Set(['a', 'b']), 'seconda').raggiunto, true);
});

test('prima convocazione: maggioranza delle teste e 2/3 dei millesimi', () => {
  assert.equal(quorumCostitutivo(teste, new Set(['a', 'b']), 'prima').raggiunto, false); // 666 < 666,67
  assert.equal(quorumCostitutivo(teste, new Set(['a', 'c']), 'prima').raggiunto, true); // 667
  const due = [t('a', 900), t('b', 100)];
  assert.equal(quorumCostitutivo(due, new Set(['a']), 'prima').raggiunto, false); // 1 su 2 non è maggioranza
});

test('ignora presenti che non sono teste della tabella', () => {
  assert.equal(quorumCostitutivo(teste, new Set(['a', 'estraneo']), 'seconda').testePresenti, 1);
});

test('convocazione sconosciuta: errore', () => {
  assert.throws(() => quorumCostitutivo(teste, new Set(), 'terza'), /convocazione/);
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module ... src/calcolo/quorum.js`

- [ ] **Step 3: Implementare**

`src/calcolo/quorum.js`:

```js
// Confronti in interi (peso = millesimi × 1000) moltiplicando in croce,
// così le soglie 1/3 e 2/3 non passano per la virgola mobile.
export function quorumCostitutivo(testePesate, presenti, convocazione) {
  const inSala = testePesate.filter((t) => presenti.has(t.chiave));
  const testeTotali = testePesate.length;
  const testePresenti = inSala.length;
  const pesoTotale = testePesate.reduce((s, t) => s + t.peso, 0);
  const pesoPresente = inSala.reduce((s, t) => s + t.peso, 0);

  let raggiunto;
  if (convocazione === 'prima') {
    raggiunto = 2 * testePresenti > testeTotali && 3 * pesoPresente >= 2 * pesoTotale;
  } else if (convocazione === 'seconda') {
    raggiunto = 3 * testePresenti >= testeTotali && 3 * pesoPresente >= pesoTotale;
  } else {
    throw new Error(`convocazione non valida: ${convocazione}`);
  }

  return { testeTotali, testePresenti, pesoTotale, pesoPresente, raggiunto };
}
```

- [ ] **Step 4: Verificare che passino**

Run: `npm test`
Expected: PASS, 20 test in totale

- [ ] **Step 5: Commit**

```bash
git add src/calcolo/quorum.js tests/calcolo/quorum.test.js
git commit -m "feat(calcolo): quorum costitutivo di prima e seconda convocazione"
```

---

### Task 6: Controlli sulle deleghe

**Files:**
- Create: `src/calcolo/deleghe.js`
- Test: `tests/calcolo/deleghe.test.js`

Regole (art. 67 disp. att. c.c.): sopra i 20 condomini un delegato non può rappresentare più di 1/5 dei condomini né più di 1/5 del valore; all'amministratore non si possono conferire deleghe. Il sistema avvisa e non blocca.

- [ ] **Step 1: Scrivere i test che falliscono**

`tests/calcolo/deleghe.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaDeleghe } from '../../src/calcolo/deleghe.js';

const t = (chiave, millesimi) => ({ chiave, soggetti: [chiave], unita: [], peso: millesimi * 1000 });
const delega = (delegante, delegato_testa = null, delegato_esterno = null, amministratore = false) =>
  ({ delegante, delegato_testa, delegato_esterno, amministratore });

// 25 teste da 40 millesimi: 1/5 = 5 teste, 200 millesimi
const venticinque = Array.from({ length: 25 }, (_, i) => t(`t${i}`, 40));

test('entro un quinto: nessun avviso', () => {
  const deleghe = [1, 2, 3, 4, 5].map((i) => delega(`t${i}`, 't0'));
  assert.deepEqual(controllaDeleghe(venticinque, deleghe), []);
});

test('oltre un quinto delle teste e dei millesimi: due avvisi', () => {
  const deleghe = [1, 2, 3, 4, 5, 6].map((i) => delega(`t${i}`, 't0'));
  assert.deepEqual(controllaDeleghe(venticinque, deleghe), [
    { tipo: 'oltre_quinto_teste', delegato: 't0', teste: 6 },
    { tipo: 'oltre_quinto_millesimi', delegato: 't0', peso: 240000 },
  ]);
});

test('oltre un quinto dei soli millesimi', () => {
  const teste = [t('grande', 300), ...Array.from({ length: 24 }, (_, i) => t(`p${i}`, 700 / 24))];
  const avvisi = controllaDeleghe(teste, [delega('grande', 'p0')]);
  assert.deepEqual(avvisi.map((a) => a.tipo), ['oltre_quinto_millesimi']);
});

test('le deleghe allo stesso esterno si sommano ignorando maiuscole e spazi', () => {
  const deleghe = [
    ...[1, 2, 3].map((i) => delega(`t${i}`, null, 'Mario Esempio')),
    ...[4, 5, 6].map((i) => delega(`t${i}`, null, ' mario esempio ')),
  ];
  const avvisi = controllaDeleghe(venticinque, deleghe);
  assert.equal(avvisi[0].tipo, 'oltre_quinto_teste');
  assert.equal(avvisi[0].delegato, 'esterno:mario esempio');
});

test('fino a 20 condomini il limite del quinto non si applica', () => {
  const venti = Array.from({ length: 20 }, (_, i) => t(`t${i}`, 50));
  const deleghe = [1, 2, 3, 4, 5, 6, 7].map((i) => delega(`t${i}`, 't0'));
  assert.deepEqual(controllaDeleghe(venti, deleghe), []);
});

test('delega all\'amministratore: avviso', () => {
  const avvisi = controllaDeleghe(venticinque, [delega('t1', null, 'Amministratore', true)]);
  assert.deepEqual(avvisi, [{ tipo: 'amministratore', testa: 't1' }]);
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module ... src/calcolo/deleghe.js`

- [ ] **Step 3: Implementare**

`src/calcolo/deleghe.js`:

```js
const SOGLIA_CONDOMINI = 20;

const chiaveDelegato = (d) =>
  d.delegato_testa ?? `esterno:${(d.delegato_esterno ?? '').trim().toLowerCase()}`;

// Restituisce avvisi, non blocca: in seduta decide il consiglio come procedere.
export function controllaDeleghe(testePesate, deleghe) {
  const pesoPerTesta = new Map(testePesate.map((t) => [t.chiave, t.peso]));
  const testeTotali = testePesate.length;
  const pesoTotale = testePesate.reduce((s, t) => s + t.peso, 0);
  const avvisi = [];

  const perDelegato = new Map();
  for (const d of deleghe) {
    if (d.amministratore) avvisi.push({ tipo: 'amministratore', testa: d.delegante });
    if (!pesoPerTesta.has(d.delegante)) continue;
    const chiave = chiaveDelegato(d);
    const somma = perDelegato.get(chiave) ?? { teste: 0, peso: 0 };
    somma.teste += 1;
    somma.peso += pesoPerTesta.get(d.delegante);
    perDelegato.set(chiave, somma);
  }

  if (testeTotali > SOGLIA_CONDOMINI) {
    for (const [delegato, somma] of perDelegato) {
      if (5 * somma.teste > testeTotali) {
        avvisi.push({ tipo: 'oltre_quinto_teste', delegato, teste: somma.teste });
      }
      if (5 * somma.peso > pesoTotale) {
        avvisi.push({ tipo: 'oltre_quinto_millesimi', delegato, peso: somma.peso });
      }
    }
  }

  return avvisi;
}
```

- [ ] **Step 4: Verificare che passino**

Run: `npm test`
Expected: PASS, 26 test in totale

- [ ] **Step 5: Commit**

```bash
git add src/calcolo/deleghe.js tests/calcolo/deleghe.test.js
git commit -m "feat(calcolo): avvisi sui limiti delle deleghe"
```

---

### Task 7: Esito delle votazioni

**Files:**
- Create: `src/calcolo/maggioranze.js`
- Test: `tests/calcolo/maggioranze.test.js`

I voti sono tre: favorevole, contrario, astenuto. Ogni testa che vota ha il suo voto registrato in modo esplicito; il flag totale e il tasto "Cancella tutti i voti" sono azioni dell'interfaccia (piano 4) che scrivono o eliminano queste righe. Un presente senza voto registrato è non espresso.

Ogni maggioranza richiede la maggioranza delle teste presenti più una quota dei millesimi totali della tabella. L'unanimità richiede il voto favorevole di tutte le teste della tabella, presenti o no.

- [ ] **Step 1: Scrivere i test che falliscono**

`tests/calcolo/maggioranze.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAGGIORANZE, esitoVoto } from '../../src/calcolo/maggioranze.js';

const t = (chiave, millesimi) => ({ chiave, soggetti: [chiave], unita: [], peso: millesimi * 1000 });
const v = (testa, voto) => ({ testa, voto });
// 5 teste, 1000 millesimi
const teste = [t('a', 334), t('b', 166), t('c', 200), t('d', 200), t('e', 100)];

test('elenco delle maggioranze disponibili', () => {
  assert.deepEqual(Object.keys(MAGGIORANZE), ['terzo', 'meta', 'due_terzi', 'unanimita']);
});

test('conteggi per teste e millesimi', () => {
  const esito = esitoVoto(
    teste,
    new Set(['a', 'b', 'c']),
    [v('a', 'favorevole'), v('b', 'contrario'), v('c', 'astenuto')],
    'terzo',
  );
  assert.deepEqual(esito.favorevoli, { teste: 1, peso: 334000 });
  assert.deepEqual(esito.contrari, { teste: 1, peso: 166000 });
  assert.deepEqual(esito.astenuti, { teste: 1, peso: 200000 });
  assert.deepEqual(esito.presenti, { teste: 3, peso: 700000 });
  assert.equal(esito.pesoTotale, 1000000);
});

test('terzo: maggioranza dei presenti e almeno 1/3 dei millesimi', () => {
  const presenti = new Set(['a', 'b', 'c']);
  const due = [v('a', 'favorevole'), v('b', 'favorevole'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, presenti, due, 'terzo').approvato, true); // 2 su 3, 500
  const uno = [v('a', 'favorevole'), v('b', 'contrario'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, presenti, uno, 'terzo').approvato, false); // 1 su 3
  const pochi = [v('b', 'favorevole'), v('e', 'favorevole'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, new Set(['b', 'e', 'c']), pochi, 'terzo').approvato, false); // 266 < 333,33
});

test('meta: servono almeno 500 millesimi', () => {
  const presenti = new Set(['a', 'b', 'c']);
  const voti = [v('a', 'favorevole'), v('b', 'favorevole'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, presenti, voti, 'meta').approvato, true); // 500 esatti
  const meno = [v('a', 'favorevole'), v('e', 'favorevole'), v('c', 'contrario')];
  assert.equal(esitoVoto(teste, new Set(['a', 'e', 'c']), meno, 'meta').approvato, false); // 434
});

test('due_terzi: servono almeno 2/3 dei millesimi', () => {
  const tutti = new Set(['a', 'b', 'c', 'd', 'e']);
  const voti = [v('a', 'favorevole'), v('b', 'favorevole'), v('c', 'favorevole'), v('d', 'contrario'), v('e', 'contrario')];
  assert.equal(esitoVoto(teste, tutti, voti, 'due_terzi').approvato, true); // 700
  const meno = [v('a', 'favorevole'), v('c', 'favorevole'), v('e', 'favorevole'), v('b', 'contrario'), v('d', 'contrario')];
  assert.equal(esitoVoto(teste, tutti, meno, 'due_terzi').approvato, false); // 634
});

test('unanimita: tutte le teste della tabella favorevoli, assenti compresi', () => {
  const favorevoli = (chiavi) => chiavi.map((c) => v(c, 'favorevole'));
  const tutti = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(esitoVoto(teste, new Set(tutti), favorevoli(tutti), 'unanimita').approvato, true);
  const quattro = ['a', 'b', 'c', 'd'];
  assert.equal(esitoVoto(teste, new Set(quattro), favorevoli(quattro), 'unanimita').approvato, false);
});

test('il voto di chi non è presente non conta', () => {
  const esito = esitoVoto(teste, new Set(['a']), [v('a', 'favorevole'), v('b', 'favorevole')], 'terzo');
  assert.deepEqual(esito.favorevoli, { teste: 1, peso: 334000 });
});

test('presente senza voto espresso: conteggiato a parte, non favorevole', () => {
  const esito = esitoVoto(teste, new Set(['a', 'b']), [v('a', 'favorevole')], 'terzo');
  assert.deepEqual(esito.nonEspressi, { teste: 1, peso: 166000 });
  assert.equal(esito.approvato, false); // 1 su 2 non è maggioranza
});

test('maggioranza sconosciuta: errore', () => {
  assert.throws(() => esitoVoto(teste, new Set(), [], 'boh'), /maggioranza/);
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module ... src/calcolo/maggioranze.js`

- [ ] **Step 3: Implementare**

`src/calcolo/maggioranze.js`:

```js
// quota = frazione minima dei millesimi totali della tabella, come [numeratore, denominatore].
export const MAGGIORANZE = {
  terzo: { etichetta: 'Maggioranza dei presenti e 1/3 dei millesimi', quota: [1, 3] },
  meta: { etichetta: 'Maggioranza dei presenti e 500 millesimi', quota: [1, 2] },
  due_terzi: { etichetta: 'Maggioranza dei presenti e 2/3 dei millesimi', quota: [2, 3] },
  unanimita: { etichetta: 'Unanimità', quota: null },
};

const vuoto = () => ({ teste: 0, peso: 0 });

// `testePesate` sono già le teste della tabella del punto (vedi pesaTeste):
// chi non ha millesimi in quella tabella non vota.
// `voti` ha una riga per ogni testa che ha votato; un presente senza riga è "non espresso".
export function esitoVoto(testePesate, presenti, voti, tipo) {
  const regola = MAGGIORANZE[tipo];
  if (!regola) throw new Error(`maggioranza non valida: ${tipo}`);

  const votoPerTesta = new Map(voti.map((x) => [x.testa, x.voto]));
  const conteggi = {
    favorevoli: vuoto(), contrari: vuoto(), astenuti: vuoto(), nonEspressi: vuoto(), presenti: vuoto(),
  };
  const campo = { favorevole: 'favorevoli', contrario: 'contrari', astenuto: 'astenuti' };

  for (const t of testePesate) {
    if (!presenti.has(t.chiave)) continue;
    const dove = campo[votoPerTesta.get(t.chiave)] ?? 'nonEspressi';
    for (const c of [conteggi[dove], conteggi.presenti]) {
      c.teste += 1;
      c.peso += t.peso;
    }
  }

  const pesoTotale = testePesate.reduce((s, t) => s + t.peso, 0);
  const { favorevoli } = conteggi;
  let approvato;
  if (regola.quota === null) {
    approvato = testePesate.length > 0 && favorevoli.teste === testePesate.length;
  } else {
    const [num, den] = regola.quota;
    approvato = 2 * favorevoli.teste > conteggi.presenti.teste && den * favorevoli.peso >= num * pesoTotale;
  }

  return { ...conteggi, pesoTotale, approvato };
}
```

- [ ] **Step 4: Verificare che passino**

Run: `npm test`
Expected: PASS, 35 test in totale

- [ ] **Step 5: Commit**

```bash
git add src/calcolo/maggioranze.js tests/calcolo/maggioranze.test.js
git commit -m "feat(calcolo): esito delle votazioni per tipo di maggioranza"
```

---

### Task 8: Schema — anagrafica, millesimi, contabilità

**Files:**
- Create: `supabase/migrations/001_anagrafica_contabilita.sql`

Nessun test automatico in questo task: lo schema si verifica applicandolo (Task 11).

- [ ] **Step 1: Scrivere la migrazione**

`supabase/migrations/001_anagrafica_contabilita.sql`:

```sql
-- Anagrafica
create table public.unita (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  tipo text check (tipo in ('appartamento', 'box', 'cantina', 'negozio', 'altro')),
  piano text,
  interno text,
  note text
);

create table public.soggetti (
  id uuid primary key default gen_random_uuid(),
  denominazione text not null,
  email text,
  telefono text,
  note text
);

create table public.titolarita (
  id uuid primary key default gen_random_uuid(),
  unita_id uuid not null references public.unita (id) on delete cascade,
  soggetto_id uuid not null references public.soggetti (id),
  ruolo text not null check (ruolo in ('proprietario', 'conduttore', 'assegnatario')),
  dal date,
  al date,
  check (dal is null or al is null or dal <= al)
);
create index titolarita_unita_idx on public.titolarita (unita_id);
create index titolarita_soggetto_idx on public.titolarita (soggetto_id);

-- Millesimi
create table public.tabelle_millesimali (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ambito text not null default 'condominio',
  totale_dichiarato numeric(10, 3)
);

create table public.millesimi (
  unita_id uuid not null references public.unita (id) on delete cascade,
  tabella_id uuid not null references public.tabelle_millesimali (id) on delete cascade,
  valore numeric(10, 3) not null check (valore >= 0),
  primary key (unita_id, tabella_id)
);

-- Contabilità (sola consultazione)
create table public.esercizi (
  id uuid primary key default gen_random_uuid(),
  anno integer not null,
  tipo text not null check (tipo in ('consuntivo', 'preventivo')),
  inizio date,
  fine date,
  unique (anno, tipo)
);

create table public.conti (
  id uuid primary key default gen_random_uuid(),
  gruppo text not null,
  sottoconto text not null,
  tabella_id uuid references public.tabelle_millesimali (id),
  unique (gruppo, sottoconto)
);

create table public.fornitori (
  id uuid primary key default gen_random_uuid(),
  denominazione text not null unique
);

create table public.spese (
  id uuid primary key default gen_random_uuid(),
  esercizio_id uuid not null references public.esercizi (id) on delete cascade,
  conto_id uuid not null references public.conti (id),
  protocollo text,
  descrizione text not null,
  fornitore_id uuid references public.fornitori (id),
  numero_fattura text,
  data_fattura date,
  data_pagamento date,
  importo numeric(12, 2) not null
);
create index spese_esercizio_conto_idx on public.spese (esercizio_id, conto_id);

create table public.posizioni (
  id uuid primary key default gen_random_uuid(),
  unita_id uuid not null references public.unita (id) on delete cascade,
  esercizio_id uuid not null references public.esercizi (id) on delete cascade,
  soggetto_id uuid not null references public.soggetti (id),
  totale_gestione numeric(12, 2),
  saldo_precedente numeric(12, 2),
  rate_versate numeric(12, 2),
  saldo_finale numeric(12, 2),
  unique (unita_id, esercizio_id, soggetto_id)
);

create table public.rate (
  posizione_id uuid not null references public.posizioni (id) on delete cascade,
  numero integer not null,
  scadenza date,
  importo numeric(12, 2) not null,
  primary key (posizione_id, numero)
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/001_anagrafica_contabilita.sql
git commit -m "feat(db): schema anagrafica, millesimi e contabilità"
```

---

### Task 9: Schema — consiglio e assemblee

**Files:**
- Create: `supabase/migrations/002_consiglio_assemblee.sql`

- [ ] **Step 1: Scrivere la migrazione**

`supabase/migrations/002_consiglio_assemblee.sql`:

```sql
create table public.consiglieri (
  id uuid primary key default gen_random_uuid(),
  soggetto_id uuid references public.soggetti (id),
  utente_id uuid unique references auth.users (id) on delete set null,
  carica text,
  parte_rappresentata text,
  inizio_mandato date,
  fine_mandato date
);

create table public.assemblee (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo text not null check (tipo in ('ordinaria', 'straordinaria')),
  convocazione text not null default 'seconda' check (convocazione in ('prima', 'seconda')),
  luogo text,
  ora_apertura timestamptz,
  ora_appello timestamptz,
  ora_chiusura timestamptz,
  stato text not null default 'bozza' check (stato in ('bozza', 'in_corso', 'chiusa')),
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

-- Teste congelate all'apertura della seduta: non cambiano se dopo cambia un proprietario.
create table public.teste_assemblea (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  chiave text not null,
  etichetta text not null,
  soggetti uuid[] not null,
  unita uuid[] not null,
  unique (assemblea_id, chiave)
);

create table public.punti_odg (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  ordine integer not null,
  testo text not null,
  tabella_id uuid references public.tabelle_millesimali (id),
  maggioranza text check (maggioranza in ('terzo', 'meta', 'due_terzi', 'unanimita')),
  -- chiusura della votazione: fotografa i presenti; chi arriva dopo è assente a questo punto
  votato_il timestamptz,
  presenti_al_voto jsonb,
  esito jsonb,
  note text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  unique (assemblea_id, ordine)
);

create table public.presenze (
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  testa_id uuid not null references public.teste_assemblea (id) on delete cascade,
  stato text not null default 'assente' check (stato in ('assente', 'presente')),
  ora_ingresso timestamptz,
  ora_uscita timestamptz,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  primary key (assemblea_id, testa_id)
);

create table public.deleghe (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  delegante_testa_id uuid not null references public.teste_assemblea (id) on delete cascade,
  delegato_testa_id uuid references public.teste_assemblea (id),
  delegato_esterno text,
  amministratore boolean not null default false,
  nota text,
  scansione_path text,
  -- da quando la delega conta: chi è delegato dopo una votazione risulta assente a quella
  ora_registrazione timestamptz not null default now(),
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  unique (assemblea_id, delegante_testa_id),
  check (delegato_testa_id is not null or delegato_esterno is not null),
  check (delegato_testa_id is distinct from delegante_testa_id)
);

create table public.voti (
  punto_id uuid not null references public.punti_odg (id) on delete cascade,
  testa_id uuid not null references public.teste_assemblea (id) on delete cascade,
  voto text not null check (voto in ('favorevole', 'contrario', 'astenuto')),
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  primary key (punto_id, testa_id)
);

create table public.verbali (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  file_path text,
  testo text,
  stato text not null default 'bozza' check (stato in ('bozza', 'definitivo')),
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

create table public.todo (
  id uuid primary key default gen_random_uuid(),
  descrizione text not null,
  assemblea_id uuid references public.assemblee (id) on delete set null,
  punto_id uuid references public.punti_odg (id) on delete set null,
  responsabile_id uuid references public.consiglieri (id) on delete set null,
  scadenza date,
  stato text not null default 'aperto' check (stato in ('aperto', 'in_corso', 'chiuso')),
  note text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

-- Fase 2 (audio → bozza di verbale): create vuote per non dover migrare dopo.
create table public.registrazioni (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  file_path text not null,
  durata_secondi integer,
  trascrizione text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

create table public.bozze_verbale (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  testo text not null,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/002_consiglio_assemblee.sql
git commit -m "feat(db): schema consiglio, assemblee, deleghe, voti, to-do"
```

---

### Task 10: Schema — sicurezza, audit, Storage, Realtime

**Files:**
- Create: `supabase/migrations/003_sicurezza.sql`

- [ ] **Step 1: Scrivere la migrazione**

`supabase/migrations/003_sicurezza.sql`:

```sql
-- Accede solo chi è consigliere con mandato aperto.
create or replace function public.is_consigliere()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.consiglieri
    where utente_id = auth.uid()
      and (fine_mandato is null or fine_mandato >= current_date)
  );
$$;

revoke execute on function public.is_consigliere() from public;
grant execute on function public.is_consigliere() to authenticated;

-- RLS su tutte le tabelle dello schema public.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy consiglieri_tutto on public.%I for all to authenticated '
      'using (public.is_consigliere()) with check (public.is_consigliere())', t);
  end loop;
end $$;

-- Audit: autore e data su inserimento e modifica.
create or replace function public.imposta_audit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.creato_da := auth.uid();
    new.creato_il := now();
  end if;
  new.modificato_da := auth.uid();
  new.modificato_il := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'modificato_il'
  loop
    execute format(
      'create trigger audit before insert or update on public.%I '
      'for each row execute function public.imposta_audit()', t);
  end loop;
end $$;

-- Archivio file privato: scansioni delle deleghe e verbali.
insert into storage.buckets (id, name, public)
values ('deleghe', 'deleghe', false), ('verbali', 'verbali', false);

create policy consiglieri_file on storage.objects
  for all to authenticated
  using (bucket_id in ('deleghe', 'verbali') and public.is_consigliere())
  with check (bucket_id in ('deleghe', 'verbali') and public.is_consigliere());

-- Aggiornamento in tempo reale durante la seduta.
alter publication supabase_realtime add table public.presenze, public.deleghe, public.voti, public.punti_odg;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/003_sicurezza.sql
git commit -m "feat(db): RLS per consiglieri, audit, storage privato, realtime"
```

---

### Task 11: Applicare lo schema e verificarlo

**Prerequisito a carico del consiglio:** account Supabase creato con `consiglieripalmanova67@gmail.com` e un progetto nuovo (regione Europa). Senza questo, il task resta in sospeso; i task 1-10 non ne dipendono.

**Files:** nessuno.

- [ ] **Step 1: Applicare le tre migrazioni in ordine**

Nel SQL Editor del progetto Supabase, incollare ed eseguire nell'ordine il contenuto di `001_anagrafica_contabilita.sql`, `002_consiglio_assemblee.sql`, `003_sicurezza.sql`.
Expected: ogni esecuzione termina con "Success. No rows returned".

- [ ] **Step 2: Verificare che ogni tabella abbia RLS e una policy**

```sql
select t.tablename, t.rowsecurity, count(p.policyname) as policy
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.tablename;
```

Expected: 22 righe, tutte con `rowsecurity = true` e `policy = 1`.

- [ ] **Step 3: Verificare che un utente non consigliere non veda nulla**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000000"}';
select count(*) from public.unita;
insert into public.unita (codice) values ('PROVA');
rollback;
```

Expected: il `select` restituisce 0; l'`insert` fallisce con `new row violates row-level security policy for table "unita"`.

- [ ] **Step 4: Disattivare la registrazione libera**

In Authentication → Sign In / Providers → Email: disattivare "Allow new users to sign up".
Expected: l'opzione risulta spenta dopo il salvataggio.

- [ ] **Step 5: Creare il primo consigliere**

In Authentication → Users → Add user → "Send invitation", invitare la propria email personale. Poi nel SQL Editor, sostituendo l'email:

```sql
insert into public.consiglieri (utente_id, carica, inizio_mandato)
select id, 'consigliere', current_date from auth.users where email = 'EMAIL_PERSONALE_DEL_CONSIGLIERE';
```

Expected: `INSERT 0 1`.

- [ ] **Step 6: Verificare i bucket**

```sql
select id, public from storage.buckets where id in ('deleghe', 'verbali');
```

Expected: 2 righe, entrambe con `public = false`.

---

## Verifica finale del piano

- [ ] `npm test` passa con 35 test.
- [ ] `git status` è pulito e `git log --oneline` mostra un commit per task.
- [ ] Nessun file supera le 500 righe.
- [ ] Nel repository non compare alcun nome reale di condomino.
