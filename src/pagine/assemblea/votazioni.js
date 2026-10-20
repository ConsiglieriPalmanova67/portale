// Scheda Votazioni: un punto alla volta. Ogni testa presente ha un voto esplicito (favorevole, contrario,
// astenuto); l'esito si ricalcola a ogni modifica e alla chiusura si fotografano i presenti.
import { MAGGIORANZE } from '../../calcolo/maggioranze.js';
import { controllaPunto } from '../../calcolo/regole-voto.js';
import { daInteri } from '../../calcolo/numeri.js';
import { esc, millesimi, ora, normalizza } from '../../ui/html.js';
import { TIPI_PUNTO, VOTI, nonAperta, conferma, scegli, soloPresenti, ricordaVista, statoDelPunto, orariAssente, spiegaRegola } from './comuni.js';
import { riquadroNomina, registraMandati } from './nomine.js';
import { notePunto, collegaNotePunto } from './verbale.js';

const peso = (interi) => millesimi(daInteri(interi));
const teste = (n) => `${n} ${n === 1 ? 'testa' : 'teste'}`;
// i tasti che danno lo stesso voto a tutti i presenti al punto
const TUTTI = { favorevole: 'Tutti favorevoli', contrario: 'Tutti contrari', astenuto: 'Tutti astenuti' };

// Che cosa serve perché il punto passi, in parole.
function regola(punto, stato) {
  const { esito } = stato;
  const { quota, soloPresenti } = MAGGIORANZE[punto.maggioranza];
  if (soloPresenti) return `Serve il voto favorevole di tutte le ${esito.presenti.teste} teste presenti: un contrario, un astenuto o un voto mancante bastano a respingere.`;
  if (!quota) return `Serve il voto favorevole di tutte le ${stato.votanti.length + stato.assenti.length} teste della tabella, assenti compresi (presenti: ${esito.presenti.teste}).`;
  const [num, den] = quota;
  return `Servono più della metà dei presenti (almeno ${Math.floor(esito.presenti.teste / 2) + 1} teste su ${esito.presenti.teste}) e almeno ${peso(Math.ceil((num * esito.pesoTotale) / den))} millesimi favorevoli su ${peso(esito.pesoTotale)}.`;
}

export function riquadriEsito(esito, mancanti) {
  const voce = (nome, c, classe = '') => `
    <div class="riquadro ${classe}"><span class="nota">${nome}</span><span class="valore">${c.teste}</span><span class="nota">${c.teste === 1 ? 'testa' : 'teste'} · ${peso(c.peso)} mill.</span></div>`;
  return `
    <div class="riquadri esito">
      ${voce('Favorevoli', esito.favorevoli, 'voto-favorevole')}
      ${voce('Contrari', esito.contrari, 'voto-contrario')}
      ${voce('Astenuti', esito.astenuti, 'voto-astenuto')}
      ${mancanti ? voce('Voto mancante', esito.nonEspressi, 'voto-mancante') : ''}
      ${voce('Presenti al punto', esito.presenti)}
    </div>`;
}

function elencoPunti(ctx, scelto) {
  return `
    <ol class="punti-voto">${ctx.punti.map((p, i) => {
      const esito = p.votato_il ? (p.esito?.approvato ? '<span class="etichetta stato-presente">approvato</span>' : '<span class="etichetta stato-respinto">respinto</span>')
        : ctx.voti.some((v) => v.punto_id === p.id) ? '<span class="etichetta stato-avviso">in votazione</span>' : '<span class="etichetta">da votare</span>';
      return `<li><button type="button" class="secondario" data-seleziona="${esc(p.id)}" ${p.id === scelto?.id ? 'aria-current="true"' : ''}>
        <span>${i + 1}. ${esc(p.testo)}</span> ${esito}</button></li>`;
    }).join('')}</ol>`;
}

function rigaVotante(ctx, v, chiuso, righeSeduta) {
  const id = esc(v.testa.id);
  const r = righeSeduta.get(v.testa.id);
  const delega = r?.stato === 'delega' && r.delegato ? `<br><span class="nota">per delega: vota ${esc(r.delegato.nome)}</span>` : '';
  const voto = chiuso || ctx.solaLettura
    ? (v.voto ? `<span class="etichetta voto-${esc(v.voto)}">${esc(VOTI[v.voto])}</span>` : '<span class="etichetta voto-mancante">voto mancante</span>')
    : `<div class="voti" role="group" aria-label="Voto di ${esc(v.testa.etichetta)}">${Object.entries(VOTI).map(([valore, nome]) =>
      `<button type="button" class="voto voto-${valore}" data-voto="${valore}" data-testa="${id}" aria-pressed="${v.voto === valore}">${nome}</button>`).join('')}</div>
      ${v.voto ? '' : '<span class="etichetta voto-mancante">voto mancante</span>'}`;
  return `
    <tr class="${v.voto ? '' : 'riga-mancante'}">
      <td><strong>${esc(v.testa.etichetta)}</strong><br><span class="nota">${esc(ctx.unitaDi(v.testa))}</span>${delega}</td>
      <td class="num">${peso(v.peso)}</td>
      <td class="cella-voto">${voto}</td>
    </tr>`;
}

function rigaAssente(ctx, a) {
  const orari = orariAssente(ctx, a.testa.id);
  return `
    <tr class="riga-assente">
      <td><strong>${esc(a.testa.etichetta)}</strong><br><span class="nota">${esc(ctx.unitaDi(a.testa))}</span></td>
      <td class="num">${peso(a.peso)}</td>
      <td><span class="etichetta">Assente al punto</span>${orari ? `<br><span class="nota">${esc(orari)}</span>` : ''}</td>
    </tr>`;
}

const tabella = (righe, vuoto) => `
  <div class="scorri"><table class="tab-voti">
    <thead><tr><th>Testa</th><th class="num">Millesimi</th><th>Voto</th></tr></thead>
    <tbody>${righe.join('') || `<tr><td colspan="3" class="nota">${vuoto}</td></tr>`}</tbody>
  </table></div>`;

function pannello(ctx, punto, stato) {
  const { modello } = ctx.stato;
  const numero = ctx.punti.findIndex((p) => p.id === punto.id) + 1;
  const nomeTabella = modello.tabelle.find((t) => t.id === punto.tabella_id)?.nome;
  const chiuso = Boolean(punto.votato_il);
  const testa = `
    <h2>${numero}. ${esc(punto.testo)}</h2>
    <p>
      ${punto.tipo === 'nomina_consiglieri' ? `<span class="etichetta stato-in_corso">${esc(TIPI_PUNTO[punto.tipo])}</span>` : ''}
      <span class="etichetta">${nomeTabella ? esc(nomeTabella) : 'tabella da scegliere'}</span>
      <span class="etichetta">${esc(MAGGIORANZE[punto.maggioranza]?.etichetta ?? 'maggioranza da scegliere')}</span>
      ${chiuso ? `<span class="etichetta stato-chiusa">votazione chiusa alle ${ora(punto.votato_il)}</span>` : ''}
    </p>
    ${(() => { const { regola, problemi } = controllaPunto(punto, { tabellaProprietaId: modello.tabellaProprieta?.id }); return regola ? `<p class="regola-voto ${problemi.length ? 'avviso' : ''}">${spiegaRegola(regola)}${problemi.length ? `<br><strong>Attenzione:</strong> il punto non rispetta la regola (${esc(problemi.join('; '))}). <a href="#/assemblee/${encodeURIComponent(ctx.id)}/odg">Correggi nell'ordine del giorno</a>` : ''}</p>` : ''; })()}
    ${punto.tipo === 'nomina_consiglieri' ? `<p class="nota">Candidati: ${(punto.candidati ?? []).map((c) =>
      `${esc(modello.soggetti.get(c.soggetto_id)?.denominazione ?? '?')}${c.parte_rappresentata ? ` (${esc(c.parte_rappresentata)})` : ''}`).join(', ') || 'nessuno indicato'}.</p>` : ''}
    ${notePunto(ctx, punto)}`;

  if (!stato.esito || !nomeTabella) {
    return `${testa}
      <p class="avviso">Per votare questo punto vanno scelte la tabella millesimale e la maggioranza richiesta.
        <a href="#/assemblee/${encodeURIComponent(ctx.id)}/odg">Vai all'ordine del giorno</a></p>`;
  }

  const { esito, mancanti } = stato;
  const verdetto = chiuso
    ? `<p class="verdetto ${esito.approvato ? 'si' : 'no'}">${esito.approvato ? 'Approvato' : 'Respinto'}</p>`
    : `<p class="verdetto provvisorio ${esito.approvato ? 'si' : 'no'}">Con i voti di adesso: ${esito.approvato ? 'approvato' : 'non approvato'}${mancanti ? ` — ${mancanti} ${mancanti === 1 ? 'voto mancante' : 'voti mancanti'}` : ''}</p>`;
  const azioni = ctx.solaLettura ? ''
    : chiuso ? '<div class="azioni"><button type="button" class="secondario" data-azione="riapri">Riapri votazione</button></div>'
      : `<div class="azioni tutti">
          <span class="nota">Lo stesso voto a tutti i presenti al punto, deleghe comprese; poi si corregge a mano chi vota diversamente:</span>
          ${Object.entries(TUTTI).map(([valore, nome]) => `<button type="button" class="voto voto-${valore}" data-tutti="${valore}" ${stato.votanti.length ? '' : 'disabled'}>${nome}</button>`).join('')}
          <button type="button" class="secondario pericolo" data-azione="cancella" ${ctx.voti.some((v) => v.punto_id === punto.id) ? '' : 'disabled'}>Cancella tutti i voti</button>
          <button type="button" data-azione="chiudi">Chiudi votazione</button>
        </div>`;
  return `${testa}
    ${riquadriEsito(esito, mancanti)}
    ${verdetto}
    <p class="nota">${esc(regola(punto, stato))}</p>
    ${riquadroNomina(ctx, punto)}
    ${azioni}
    <div class="filtri">
      <input type="search" id="cerca-voti" placeholder="Cerca per nome o unità" aria-label="Cerca per nome o unità" value="${esc(ctx.memoria.votazioni.cerca)}">
      <label class="interruttore"><input type="checkbox" id="solo-presenti-voti" ${soloPresenti() ? 'checked' : ''}> Solo presenti</label>
      <span class="nota">${teste(stato.votanti.length)} al voto${chiuso ? ' (presenti alla chiusura)' : ''}, ${stato.assenti.length} assenti al punto</span>
    </div>
    <div id="elenco-voti"></div>`;
}

// Prima di scrivere si rilegge il punto: un altro dispositivo potrebbe aver chiuso la votazione o l'assemblea.
async function ancoraAperto(ctx, puntoId) {
  const [[punto], [assemblea]] = await Promise.all([
    ctx.deposito.leggi('punti_odg', { id: puntoId }), ctx.deposito.leggi('assemblee', { id: ctx.id }),
  ]);
  if (!punto) throw new Error('il punto non esiste più.');
  if (assemblea?.stato === 'chiusa') throw new Error('l\'assemblea è stata chiusa: i voti non si possono più modificare.');
  if (punto.votato_il) throw new Error('la votazione di questo punto è già stata chiusa: per modificarla va riaperta.');
}

export function schedaVotazioni(ctx, contenitore) {
  if (ctx.assemblea.stato === 'bozza') {
    contenitore.innerHTML = nonAperta('i voti');
    return;
  }
  const memoria = ctx.memoria.votazioni;
  memoria.cerca ??= '';
  memoria.assentiAperti ??= false;
  if (!ctx.punti.length) {
    contenitore.innerHTML = `<p class="avviso">Nessun punto all'ordine del giorno. <a href="#/assemblee/${encodeURIComponent(ctx.id)}/odg">Aggiungi i punti</a></p>`;
    return;
  }
  // punto scelto: quello ricordato, altrimenti il primo ancora da chiudere
  const punto = ctx.punti.find((p) => p.id === memoria.punto) ?? ctx.punti.find((p) => !p.votato_il) ?? ctx.punti[0];
  memoria.punto = punto.id;
  const stato = statoDelPunto(ctx, punto);
  const chiuso = Boolean(punto.votato_il);

  contenitore.innerHTML = `${elencoPunti(ctx, punto)}<section class="punto-voto">${pannello(ctx, punto, stato)}</section>`;
  // le note sul punto si salvano da sole nella bozza del verbale, senza ridisegnare la scheda
  collegaNotePunto(ctx, contenitore);

  const elenco = contenitore.querySelector('#elenco-voti');
  const righeSeduta = new Map(ctx.seduta.righe.map((r) => [r.testa.id, r]));
  const disegnaElenco = () => {
    if (!elenco) return;
    const testo = normalizza(memoria.cerca.trim());
    const trova = (x) => !testo || normalizza(`${x.testa.etichetta} ${ctx.unitaDi(x.testa)}`).includes(testo);
    const votanti = stato.votanti.filter(trova).map((v) => rigaVotante(ctx, v, chiuso, righeSeduta));
    const assenti = stato.assenti.filter(trova).map((a) => rigaAssente(ctx, a));
    if (!soloPresenti()) {
      elenco.innerHTML = tabella([...votanti, ...assenti], 'Nessuna testa corrisponde alla ricerca.');
      return;
    }
    elenco.innerHTML = `
      ${tabella(votanti, testo ? 'Nessun presente corrisponde alla ricerca.' : 'Nessuna testa presente ha millesimi in questa tabella.')}
      <details class="gruppo assenti" id="assenti-voti" ${memoria.assentiAperti || (testo && assenti.length) ? 'open' : ''}>
        <summary><span>Assenti (${assenti.length})</span></summary>
        ${tabella(assenti, 'Nessun assente.')}
      </details>`;
    elenco.querySelector('#assenti-voti').addEventListener('toggle', (evento) => {
      if (!normalizza(memoria.cerca.trim())) memoria.assentiAperti = evento.target.open;
    });
  };
  disegnaElenco();

  contenitore.querySelector('#cerca-voti')?.addEventListener('input', (evento) => {
    memoria.cerca = evento.target.value;
    disegnaElenco();
  });
  contenitore.querySelector('#solo-presenti-voti')?.addEventListener('change', (evento) => {
    ricordaVista(evento.target.checked);
    disegnaElenco();
  });

  const { deposito } = ctx;
  const registra = (righe) => ctx.esegui(async () => {
    await ancoraAperto(ctx, punto.id);
    await deposito.salva('voti', righe, ['punto_id', 'testa_id']);
  });

  contenitore.onclick = async (evento) => {
    const bersaglio = evento.target.closest('button');
    if (!bersaglio) return;
    const { seleziona, voto, testa, tutti, azione } = bersaglio.dataset;
    if (seleziona) {
      memoria.punto = seleziona;
      schedaVotazioni(ctx, contenitore);
      return;
    }
    if (azione === 'registra-mandati') { registraMandati(ctx); return; }
    if (ctx.solaLettura) return;
    if (voto && testa && !chiuso) registra([{ punto_id: punto.id, testa_id: testa, voto }]);
    if (tutti && !chiuso) {
      // stesso voto a tutti i presenti (deleghe comprese). Se qualcuno ha già un voto diverso (per esempio i contrari
      // segnati prima) si sceglie se darlo solo a chi non ha ancora votato o sovrascrivere tutti.
      let chi = stato.votanti;
      const diversi = chi.filter((v) => v.voto && v.voto !== tutti).length;
      if (diversi) {
        const senza = chi.filter((v) => !v.voto);
        const giaVotato = `${diversi === 1 ? 'Una testa presente ha' : `${diversi} teste presenti hanno`} già un voto diverso da "${VOTI[tutti]}".`;
        const scelta = await scegli(senza.length
          ? `${giaVotato} Dare "${VOTI[tutti]}" solo a chi non ha ancora votato (${teste(senza.length)}), oppure a tutte le ${chi.length} teste presenti sovrascrivendo i voti già registrati?`
          : `${giaVotato} Registrare "${VOTI[tutti]}" per tutte le ${chi.length} teste presenti, sovrascrivendo ${diversi === 1 ? 'quel voto' : 'quei voti'}?`,
        [{ valore: 'tutti', etichetta: `${TUTTI[tutti]}: sovrascrivi` }, ...(senza.length ? [{ valore: 'mancanti', etichetta: 'Solo a chi non ha votato' }] : [])]);
        if (!scelta) return;
        if (scelta === 'mancanti') chi = senza;
      }
      registra(chi.map((v) => ({ punto_id: punto.id, testa_id: v.testa.id, voto: tutti })));
    }
    if (azione === 'cancella' && !chiuso) {
      if (!(await conferma('Sei sicuro di voler cancellare tutti i voti?', 'Cancella tutti i voti'))) return;
      ctx.esegui(async () => {
        await ancoraAperto(ctx, punto.id);
        await deposito.elimina('voti', { punto_id: punto.id });
      });
    }
    if (azione === 'chiudi' && !chiuso) {
      const { esito, mancanti } = stato;
      const avviso = mancanti ? ` Attenzione: ${mancanti === 1 ? 'una testa presente non ha' : `${mancanti} teste presenti non hanno`} un voto registrato e non conta tra i favorevoli.` : '';
      if (!(await conferma(`Chiudere la votazione del punto ${ctx.punti.findIndex((p) => p.id === punto.id) + 1}? Esito: ${esito.approvato ? 'approvato' : 'respinto'} (${esito.favorevoli.teste} favorevoli, ${esito.contrari.teste} contrari, ${esito.astenuti.teste} astenuti).${avviso} Chi arriva dopo risulterà assente a questo punto.`, 'Chiudi votazione'))) return;
      ctx.esegui(async () => {
        await ancoraAperto(ctx, punto.id);
        // la fotografia si prende sui dati appena riletti, non su quelli a schermo
        await ctx.rileggi();
        const fresco = statoDelPunto(ctx, { ...punto, votato_il: null });
        await deposito.aggiorna('punti_odg', { id: punto.id }, {
          votato_il: new Date().toISOString(), presenti_al_voto: [...ctx.seduta.presenti], esito: fresco.esito,
        });
      });
    }
    if (azione === 'riapri' && chiuso) {
      if (!(await conferma('Riaprire la votazione? I voti registrati restano, ma l\'ora di chiusura, la fotografia dei presenti e l\'esito vengono azzerati: varranno i presenti del momento in cui la si richiude.', 'Riapri votazione'))) return;
      ctx.esegui(() => deposito.aggiorna('punti_odg', { id: punto.id }, { votato_il: null, presenti_al_voto: null, esito: null }));
    }
  };
}
