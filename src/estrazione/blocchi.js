// Dalla mappa delle sezioni di un fascicolo ai blocchi di poche pagine da far leggere uno per uno.
// Funzioni pure, senza rete né DOM.
import { piatto } from './numeri.js';

export const TIPI_SEZIONE = {
  spese: 'Rendiconto (spese voce per voce)', riparto: 'Riparto consuntivo per unità', preventivo: 'Preventivo', raffronto: 'Raffronto preventivo/consuntivo',
  patrimoniale: 'Situazione patrimoniale', partite: 'Debiti e crediti verso terzi', altro: 'Altro (non si legge)',
};
// Quante pagine per blocco: poche dove le pagine sono fitte, così ogni risposta resta corta e si può rileggere da sola.
export const PAGINE_PER_BLOCCO = { spese: 3, riparto: 2, partite: 2, preventivo: 3, raffronto: 3, patrimoniale: 2 };
// Spese e partite si leggono con la pagina precedente come contesto: dice quali titoli (gruppo e sottoconto,
// crediti o debiti) sono aperti a inizio pagina.
const CON_CONTESTO = new Set(['spese', 'partite']);

export const chiaveBlocco = (b) => `${b.sezione}:${b.pagina_da}`;
const perPagina = (a, b) => a.pagina_da - b.pagina_da || (a.parte ?? 0) - (b.parte ?? 0);

// Mette in ordine la mappa e ne normalizza i campi (numeri interi, parte solo per il riparto).
export function ordinaMappa(sezioni) {
  return (sezioni ?? []).map((s) => ({
    tipo: TIPI_SEZIONE[s.tipo] ? s.tipo : 'altro', pagina_da: Math.trunc(Number(s.pagina_da)), pagina_a: Math.trunc(Number(s.pagina_a)),
    titolo: String(s.titolo ?? '').trim(), parte: s.tipo === 'riparto' ? Math.max(1, Math.trunc(Number(s.parte)) || 1) : null,
  })).sort(perPagina);
}

// Cosa non va in una mappa: → elenco di messaggi (vuoto = si può proseguire).
export function controllaMappa(sezioni, pagine) {
  const errori = [];
  const lette = ordinaMappa(sezioni).filter((s) => s.tipo !== 'altro');
  if (!lette.length) errori.push('Nella mappa non c\'è nessuna sezione da leggere.');
  for (const s of lette) {
    const nome = `${TIPI_SEZIONE[s.tipo]} (pagine ${s.pagina_da}-${s.pagina_a})`;
    if (!Number.isInteger(s.pagina_da) || !Number.isInteger(s.pagina_a) || s.pagina_da < 1 || s.pagina_a < s.pagina_da) errori.push(`${nome}: l'intervallo di pagine non è valido.`);
    else if (pagine && s.pagina_a > pagine) errori.push(`${nome}: il documento ha solo ${pagine} pagine.`);
  }
  lette.forEach((s, i) => {
    const prima = lette[i - 1];
    if (prima && s.pagina_da <= prima.pagina_a) errori.push(`Le pagine ${s.pagina_da}-${Math.min(s.pagina_a, prima.pagina_a)} compaiono in due sezioni.`);
  });
  const parti = lette.filter((s) => s.tipo === 'riparto').map((s) => s.parte);
  if (new Set(parti).size !== parti.length) errori.push('Due sezioni del riparto hanno lo stesso numero di parte.');
  for (const tipo of ['spese', 'preventivo', 'raffronto', 'patrimoniale', 'partite']) {
    const doppie = lette.filter((s) => s.tipo === tipo);
    // spesso le altre sono di un esercizio diverso (per esempio uno straordinario) rilegato nello stesso fascicolo
    if (doppie.length > 1) {
      errori.push(`${TIPI_SEZIONE[tipo]}: la sezione compare più di una volta (pagine ${doppie.map((s) => `${s.pagina_da}-${s.pagina_a}`).join(', ')}). `
        + 'Se un intervallo è di un altro esercizio (per esempio uno straordinario), segnalo come «Altro (non si legge)» insieme al suo riparto; '
        + 'se invece è la stessa sezione, unisci gli intervalli in uno solo.');
    }
  }
  return errori;
}

// → [{ sezione, parte, pagina_da, pagina_a, contesto }] in ordine di pagina. `contesto` è la pagina in più
// (quella prima del blocco, se appartiene alla stessa sezione) che si manda solo per orientarsi, oppure null.
export function blocchiDaMappa(sezioni) {
  const blocchi = [];
  for (const s of ordinaMappa(sezioni)) {
    const passo = PAGINE_PER_BLOCCO[s.tipo];
    if (!passo) continue;
    for (let da = s.pagina_da; da <= s.pagina_a; da += passo) {
      blocchi.push({
        sezione: s.tipo, parte: s.parte, pagina_da: da, pagina_a: Math.min(da + passo - 1, s.pagina_a),
        contesto: CON_CONTESTO.has(s.tipo) && da > s.pagina_da ? da - 1 : null,
      });
    }
  }
  return blocchi.sort(perPagina);
}

// Un documento pesante si fa indicizzare a pezzi: qui si riuniscono le mappe dei pezzi (pagine già assolute).
// Due sezioni dello stesso tipo a cavallo tra due pezzi diventano una; le parti del riparto si rinumerano
// in sequenza (per il riparto "stessa parte" = stessa prima colonna).
export function unisciIndici(pezzi) {
  const tutte = pezzi.flatMap((p) => p.sezioni ?? []).map((s) => ({ ...s })).sort(perPagina);
  const unite = [];
  for (const s of tutte) {
    const ultima = unite.at(-1);
    const attaccata = ultima && ultima.tipo === s.tipo && s.pagina_da <= ultima.pagina_a + 1
      && (s.tipo !== 'riparto' || piatto(s.prima_colonna) === piatto(ultima.prima_colonna));
    if (attaccata) ultima.pagina_a = Math.max(ultima.pagina_a, s.pagina_a);
    else unite.push(s);
  }
  let parte = 0;
  for (const s of unite) s.parte = s.tipo === 'riparto' ? (parte += 1) : null;
  return unite;
}

// I blocchi così come sono nell'estrazione (righe di estrazioni_blocchi), con la pagina di contesto ricavata
// dalla mappa. Di norma coincidono con blocchiDaMappa; differiscono quando un blocco è stato diviso.
export function blocchiDaRighe(sezioni, righe) {
  const mappa = ordinaMappa(sezioni);
  return righe.map((r) => {
    const sezione = mappa.find((s) => s.tipo === r.sezione && s.pagina_da <= r.pagina_da && r.pagina_a <= s.pagina_a);
    return {
      sezione: r.sezione, parte: r.parte ?? null, pagina_da: r.pagina_da, pagina_a: r.pagina_a,
      contesto: CON_CONTESTO.has(r.sezione) && sezione && r.pagina_da > sezione.pagina_da ? r.pagina_da - 1 : null,
    };
  }).sort(perPagina);
}

// Un blocco troppo pesante da leggere in una volta si divide in blocchi di una pagina.
export function dividiBlocco(b) {
  return Array.from({ length: b.pagina_a - b.pagina_da + 1 }, (_, i) => ({ sezione: b.sezione, parte: b.parte ?? null, pagina_da: b.pagina_da + i, pagina_a: b.pagina_da + i }));
}

// I blocchi di un'estrazione rispetto alla mappa: quali mancano e quali non servono più (mappa cambiata).
// Un blocco diviso a mano (le sue righe coprono esattamente le pagine del blocco voluto) resta com'è.
export function allineaBlocchi(sezioni, tutti) {
  const divisi = new Set();
  const voluti = blocchiDaMappa(sezioni).filter((v) => {
    const dentro = tutti.filter((b) => b.sezione === v.sezione && (b.parte ?? null) === (v.parte ?? null) && b.pagina_da >= v.pagina_da && b.pagina_a <= v.pagina_a).sort(perPagina);
    let attesa = v.pagina_da;
    for (const b of dentro) {
      if (b.pagina_da !== attesa) return true;
      attesa = b.pagina_a + 1;
    }
    if (dentro.length < 2 || attesa !== v.pagina_a + 1) return true;
    dentro.forEach((b) => divisi.add(b));
    return false;
  });
  const esistenti = tutti.filter((b) => !divisi.has(b));
  const chiavi = new Set(voluti.map(chiaveBlocco));
  const uguale = (a, b) => a.pagina_a === b.pagina_a && (a.parte ?? null) === (b.parte ?? null);
  const perChiave = new Map(esistenti.map((b) => [chiaveBlocco(b), b]));
  return {
    daCreare: voluti.filter((b) => !perChiave.has(chiaveBlocco(b))),
    // stesso inizio ma pagine o parte diverse: il risultato già letto non vale più
    daRifare: voluti.filter((b) => perChiave.has(chiaveBlocco(b)) && !uguale(b, perChiave.get(chiaveBlocco(b)))),
    daTogliere: esistenti.filter((b) => !chiavi.has(chiaveBlocco(b))),
  };
}
