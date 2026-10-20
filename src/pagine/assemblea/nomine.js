// Nomina dei consiglieri: dopo una votazione di nomina chiusa e approvata si registrano i mandati.
// Che cosa creare, aggiornare o chiudere lo decide pianoMandati (src/assemblea/nomine.js); qui c'è l'interfaccia.
import { candidatiNominati, pianoMandati } from '../../assemblea/nomine.js';
import { esc, data } from '../../ui/html.js';
import { conferma } from './comuni.js';

const piano = (ctx, consiglieri) => pianoMandati({
  candidati: candidatiNominati(ctx.punti).nominati, consiglieri, assembleaId: ctx.assemblea.id, data: ctx.assemblea.data,
});

// Le righe del riepilogo, come testo semplice.
function riepilogo(ctx, p) {
  const nome = (soggettoId) => ctx.stato.modello.soggetti.get(soggettoId)?.denominazione ?? 'soggetto sconosciuto';
  return [
    ...p.crea.map((c) => `Nuovo mandato: ${nome(c.soggetto_id)}${c.parte_rappresentata ? ` (${c.parte_rappresentata})` : ''}, dal ${data(c.inizio_mandato)}`),
    ...p.aggiorna.map((c) => `Riconfermato: ${nome(c.soggetto_id)}${c.valori.parte_rappresentata ? ` (${c.valori.parte_rappresentata})` : ''}`),
    ...p.chiudi.map((c) => `Mandato chiuso il ${data(c.valori.fine_mandato)}: ${nome(c.soggetto_id)} (non riconfermato)`),
    ...(p.daVerificare.length ? [`Da sistemare a mano: ${p.daVerificare.length === 1 ? 'un mandato in corso non è collegato' : `${p.daVerificare.length} mandati in corso non sono collegati`} a un soggetto e non viene toccato`] : []),
  ];
}

// Riquadro mostrato nella scheda Votazioni sotto l'esito di un punto di nomina.
export function riquadroNomina(ctx, punto) {
  if (punto.tipo !== 'nomina_consiglieri' || !punto.votato_il) return '';
  if (!punto.esito?.approvato) return '<p class="nota">Nomina respinta: nessun mandato da registrare per questo punto.</p>';
  const { inAttesa } = candidatiNominati(ctx.punti);
  if (inAttesa.length) {
    return `<p class="avviso">Nomina approvata. Per registrare i mandati vanno prima chiuse le votazioni degli altri punti di nomina (${inAttesa.length} ancora ${inAttesa.length === 1 ? 'aperta' : 'aperte'}): solo allora si sa chi non è stato riconfermato.</p>`;
  }
  const p = piano(ctx, ctx.stato.dati.consiglieri);
  if (p.vuoto) {
    return `<p class="avviso fatto">Mandati registrati: il consiglio è aggiornato. <a href="#/consiglio">Vedi il consiglio</a>
      ${p.daVerificare.length ? `<br><span class="nota">${esc(riepilogo(ctx, p).at(-1))}.</span>` : ''}</p>`;
  }
  return `
    <div class="avviso">
      <strong>Nomina approvata: i mandati sono da registrare.</strong>
      <ul>${riepilogo(ctx, p).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="azioni"><button type="button" data-azione="registra-mandati">Registra mandati</button>
        <span class="nota">La registrazione non è automatica: va confermata. Si può fare anche ad assemblea chiusa.</span></div>
    </div>`;
}

export async function registraMandati(ctx) {
  const { deposito, stato } = ctx;
  let p;
  try {
    // l'elenco dei consiglieri si rilegge: un altro dispositivo potrebbe aver già registrato i mandati
    stato.dati.consiglieri = await deposito.leggi('consiglieri');
    p = piano(ctx, stato.dati.consiglieri);
  } catch (errore) {
    ctx.esegui(() => { throw errore; });
    return;
  }
  if (p.vuoto) { ctx.ricarica(); return; }
  if (!(await conferma(`Registrare i mandati dei consiglieri?\n\n${riepilogo(ctx, p).map((r) => `• ${r}`).join('\n')}\n\nChi ha il mandato chiuso perde l'accesso al portale dal giorno successivo.`, 'Registra mandati'))) return;
  ctx.esegui(async () => {
    try {
      // a ogni tentativo il piano si ricalcola sui dati del momento: riprovando non si creano doppioni
      const adesso = piano(ctx, await deposito.leggi('consiglieri'));
      if (adesso.crea.length) await deposito.inserisci('consiglieri', adesso.crea);
      for (const m of [...adesso.aggiorna, ...adesso.chiudi]) await deposito.aggiorna('consiglieri', { id: m.id }, m.valori);
    } finally {
      stato.dati.consiglieri = await deposito.leggi('consiglieri');
    }
  });
}
