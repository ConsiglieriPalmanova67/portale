import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convocantePredefinito, htmlVerbale } from '../../src/pagine/assemblea/verbale.js';

test('convocantePredefinito: l\'amministratore in carica alla data, altrimenti l\'ultimo nominato; senza articolo', () => {
  const amministratori = [
    { id: 'a1', denominazione: 'Studio Vecchio', dal: '2018-01-01', al: '2024-12-31' },
    { id: 'a2', denominazione: '  Studio Nuovo srl ', dal: '2025-01-01', al: null },
  ];
  assert.equal(convocantePredefinito(amministratori, '2024-04-18'), 'Studio Vecchio, amministratore del condominio');
  assert.equal(convocantePredefinito(amministratori, '2026-10-20'), 'Studio Nuovo srl, amministratore del condominio');
  // nessuno in carica a quella data: l'ultimo nominato
  assert.equal(convocantePredefinito(amministratori, '2010-05-01'), 'Studio Nuovo srl, amministratore del condominio');
  // nessun amministratore (come nei dati di prova) o senza nome: campo vuoto, il testo lo lascia da completare
  for (const vuoti of [undefined, null, [], [{ denominazione: '  ', dal: '2020-01-01' }]]) assert.equal(convocantePredefinito(vuoti, '2026-10-20'), '');
});

test('htmlVerbale: un paragrafo per blocco, testo protetto, righe da verificare in evidenza', () => {
  const testo = [
    'CONDOMINIO PALMANOVA 67',
    'VERBALE DELL\'ASSEMBLEA\nin seconda convocazione del 20/10/2026',
    '1. CONVOCAZIONE\nSi dà atto che <b>l\'assemblea</b> è stata convocata da ______',
    'PUNTO 1 – Approvazione del rendiconto\nEsito: APPROVATA.\n[DA VERIFICARE: i millesimi dei favorevoli…]',
    '1. Avviso di convocazione.',
  ].join('\n\n');
  const html = htmlVerbale(testo);
  assert.equal((html.match(/<p/g) ?? []).length, 5);
  assert.match(html, /^<p class="vb-intestazione">CONDOMINIO PALMANOVA 67<\/p><p class="vb-intestazione">VERBALE DELL&#39;ASSEMBLEA<br>in seconda/);
  assert.match(html, /<p><strong>1\. CONVOCAZIONE<\/strong><br>Si dà atto che &lt;b&gt;l&#39;assemblea&lt;\/b&gt; è stata convocata da ______<\/p>/);
  assert.match(html, /<strong>PUNTO 1 – Approvazione del rendiconto<\/strong><br>Esito: APPROVATA\.<br><span class="da-verificare">\[DA VERIFICARE: i millesimi dei favorevoli…\]<\/span>/);
  // una riga numerata che non è un titolo (elenco degli allegati, ordine del giorno) resta normale
  assert.match(html, /<p>1\. Avviso di convocazione\.<\/p>$/);
  assert.equal(htmlVerbale(''), '');
  assert.equal(htmlVerbale(undefined), '');
});
