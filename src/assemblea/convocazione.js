// Lettura di una lettera di convocazione a partire dal testo estratto dal PDF.
// Funzione pura: non va mai in errore; quello che non riconosce resta null (o lista vuota)
// e finisce negli avvisi, così chi importa sa che cosa controllare a mano.
// Le lettere accentate possono arrivare rovinate dall'estrazione: nessuna regola ci fa affidamento.

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DATA_NUMERI = String.raw`(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})`;
const DATA_PAROLE = String.raw`(\d{1,2})[^\s\d]?\s+(${MESI.join('|')})\s+(\d{4})`;
const DATA = `(?:${DATA_NUMERI}|${DATA_PAROLE})`;

const ROVINATA = '�';
const dueCifre = (n) => String(n).padStart(2, '0');
const pulisci = (testo) => String(testo ?? '').replace(/\s+/g, ' ').trim();
const vuota = () => ({ data: null, ora: null, luogo: null });

// Da una corrispondenza di DATA alla data ISO; null se il giorno non esiste (31 febbraio, mese 13).
function dataIso(m) {
  if (!m) return null;
  const [giorno, mese, anno] = m[1] !== undefined
    ? [Number(m[1]), Number(m[2]), Number(m[3])]
    : [Number(m[4]), MESI.indexOf(m[5].toLowerCase()) + 1, Number(m[6])];
  const prova = new Date(Date.UTC(anno, mese - 1, giorno));
  if (prova.getUTCFullYear() !== anno || prova.getUTCMonth() !== mese - 1 || prova.getUTCDate() !== giorno) return null;
  return `${anno}-${dueCifre(mese)}-${dueCifre(giorno)}`;
}

// "Città, li 23/09/2026" oppure "Città, 23 settembre 2026": si cerca prima dell'ordine del giorno.
function dataLettera(righe) {
  const conLi = new RegExp(String.raw`,\s*l\S{0,2}\s+${DATA}`, 'i');
  const daSola = new RegExp(String.raw`^(?:[^\d,]{2,40},|data:?)\s*(?:l\S{0,2}\s+)?${DATA}\.?$`, 'i');
  for (const regola of [conLi, daSola]) {
    for (const riga of righe) {
      const iso = dataIso(riga.match(regola));
      if (iso) return iso;
    }
  }
  return null;
}

// Il luogo è quello che segue data e ora, tolte le formule di passaggio ("e, mancando il numero legale, in…",
// "per discutere e deliberare sul seguente…").
function luogoDa(testo) {
  const luogo = pulisci(testo)
    .replace(/^[\s,;:.\-]+/, '')
    .replace(/[,;]?\s+(?:ed?[\s,]+)?(?:mancando|in mancanza|qualora|occorrendo|in caso|eventualmente|ove\s)[\s\S]*$/i, '')
    .replace(/\s+per\s+(?:discutere|deliberare|trattare|esaminare|la trattazione|l.esame)[\s\S]*$/i, '')
    .replace(/\s+(?:con|sul|col)\s+(?:il\s+)?seguente[\s\S]*$/i, '')
    .replace(/(?:[\s,;]+(?:ed?|in))+$/i, '')
    .replace(/^presso\s+/i, '')
    .replace(/[\s,;:.\-]+$/, '');
  return luogo || null;
}

// Data, ora e luogo dentro il pezzo di frase che descrive una convocazione.
function leggiTratto(tratto, nome, avvisi) {
  const esito = vuota();
  const mData = tratto.match(new RegExp(DATA, 'i'));
  const mOra = tratto.match(/\bore\s+(\d{1,2})(?:\s*[:.,]\s*(\d{2}))?(?!\d)/i);
  esito.data = dataIso(mData);
  if (mOra && Number(mOra[1]) < 24 && Number(mOra[2] ?? 0) < 60) esito.ora = `${dueCifre(Number(mOra[1]))}:${mOra[2] ?? '00'}`;
  const fine = Math.max(mData ? mData.index + mData[0].length : -1, mOra ? mOra.index + mOra[0].length : -1);
  if (fine >= 0) esito.luogo = luogoDa(tratto.slice(fine));
  if (!esito.luogo) {
    const presso = tratto.match(/\bpresso\s+(.+?)(?=\s+(?:il giorno|alle ore|ore\s+\d)|$)/i);
    if (presso) esito.luogo = luogoDa(presso[1]);
  }
  if (!esito.data) avvisi.push(`${nome}: data non riconosciuta.`);
  if (!esito.ora) avvisi.push(`${nome}: ora non riconosciuta.`);
  if (!esito.luogo) avvisi.push(`${nome}: luogo non riconosciuto.`);
  return esito;
}

function leggiConvocazioni(corpo, avvisi) {
  const prima = corpo.search(/\b(?:prima|1\S{0,2})\s+convocazione/i);
  const seconda = corpo.search(/\b(?:seconda|2\S{0,2})\s+convocazione/i);
  if (prima >= 0 && seconda > prima) {
    return {
      prima: leggiTratto(corpo.slice(prima, seconda).replace(/^\S+\s+convocazione/i, ''), 'Prima convocazione', avvisi),
      seconda: leggiTratto(corpo.slice(seconda).replace(/^\S+\s+convocazione/i, ''), 'Seconda convocazione', avvisi),
    };
  }
  if (seconda >= 0) {
    avvisi.push('La lettera indica una sola convocazione (la seconda): la prima resta vuota.');
    return { prima: vuota(), seconda: leggiTratto(corpo.slice(seconda).replace(/^\S+\s+convocazione/i, ''), 'Seconda convocazione', avvisi) };
  }
  if (prima >= 0) {
    avvisi.push('La lettera indica una sola convocazione (la prima): la seconda resta vuota.');
    return { prima: leggiTratto(corpo.slice(prima).replace(/^\S+\s+convocazione/i, ''), 'Prima convocazione', avvisi), seconda: vuota() };
  }
  const inizio = corpo.search(/\bconvocat[aio]\b/i);
  if (inizio >= 0) {
    avvisi.push('La lettera indica una sola convocazione senza dire se è la prima o la seconda: è stata letta come prima. Controlla.');
    return { prima: leggiTratto(corpo.slice(inizio), 'Convocazione', avvisi), seconda: vuota() };
  }
  avvisi.push('Nessuna convocazione riconosciuta: data, ora e luogo vanno inseriti a mano.');
  return { prima: vuota(), seconda: vuota() };
}

// Righe che chiudono l'elenco dei punti: saluti, firma, raccomandazioni, modulo di delega.
const DOPO_I_PUNTI = /^(?:si\s+(?:invita|prega|ricorda|raccomanda|comunica|avvisa|rammenta)|l\W{0,2}\s*amministra|distinti|cordial|in attesa|n\.\s?b\.|nota bene|delega\b|il\s+sottoscritt|firma\b)/i;
const NOMINA_CONSIGLIERI = /(?:nomin|elezion|rinnov|conferm)\w*\b.*\bconsiglier|consiglier\w*\b.*\b(?:nomin|elezion|rinnov)/i;

// I punti numerati dopo "ORDINE DEL GIORNO". Un punto spezzato su più righe viene ricomposto:
// la riga di continuazione comincia con la minuscola, oppure segue subito senza righe vuote.
function leggiPunti(righe, avvisi) {
  const punti = [];
  let ultimo = 0;
  let dopoVuota = false;
  for (const riga of righe) {
    if (!riga) { dopoVuota = true; continue; }
    if (DOPO_I_PUNTI.test(riga)) break;
    const numerata = riga.match(/^(\d{1,2})\s*[.)]\s*(\S.*)$/);
    if (numerata && Number(numerata[1]) > ultimo) {
      if (ultimo && Number(numerata[1]) !== ultimo + 1) avvisi.push(`Ordine del giorno: dopo il punto ${ultimo} la numerazione salta al ${Number(numerata[1])}. Controlla che non manchi nulla.`);
      ultimo = Number(numerata[1]);
      punti.push({ ordine: punti.length + 1, testo: numerata[2] });
    } else if (punti.length) {
      // una riga che ricomincia con la maiuscola dopo uno stacco non fa più parte dell'elenco
      if (dopoVuota && !/^[^A-Za-z]*[a-z]/.test(riga)) break;
      punti.at(-1).testo += ` ${riga}`;
    }
    dopoVuota = false;
  }
  return punti.map((p) => ({ ordine: p.ordine, testo: pulisci(p.testo), tipo: NOMINA_CONSIGLIERI.test(p.testo) ? 'nomina_consiglieri' : 'delibera' }));
}

const TITOLO_ODG = /(?:ordine\s+del\s+giorno|o\.\s?d\.\s?g\.?)\s*[:.]?$/i;

function leggi(testo) {
  const avvisi = [];
  let righe = String(testo ?? '').split(/\r?\n/).map(pulisci);
  // il modulo di delega in fondo riporta nome e millesimi del destinatario: si scarta per intero
  const delega = righe.findIndex((r) => /^delega\b.*\bassemblea|^il\s+sottoscritt/i.test(r));
  if (delega >= 0) righe = righe.slice(0, delega);

  const odg = righe.findIndex((r) => TITOLO_ODG.test(r));
  // quello che precede l'elenco dei punti (la riga del titolo può chiudere una frase: se ne tiene l'inizio)
  const prima = odg >= 0 ? [...righe.slice(0, odg), righe[odg].replace(TITOLO_ODG, '')] : righe;
  const corpo = prima.join(' ');

  const mTipo = corpo.match(/assemblea\s+(?:condominiale\s+)?((?:stra)?ordinaria)\b/i) ?? corpo.match(/\b((?:stra)?ordinaria)\b/i);
  const tipo = mTipo ? mTipo[1].toLowerCase() : null;
  if (!tipo) avvisi.push('Tipo di assemblea non riconosciuto: scegli tra ordinaria e straordinaria.');

  const data_lettera = dataLettera(prima);
  if (!data_lettera) avvisi.push('Data della lettera non riconosciuta.');

  const convocazioni = leggiConvocazioni(corpo, avvisi);

  const punti = odg >= 0 ? leggiPunti(righe.slice(odg + 1), avvisi) : [];
  if (odg < 0) avvisi.push('Intestazione "Ordine del giorno" non trovata: i punti vanno inseriti a mano.');
  else if (!punti.length) avvisi.push('Nessun punto numerato riconosciuto dopo "Ordine del giorno": i punti vanno inseriti a mano.');

  const risultato = { tipo, data_lettera, ...convocazioni, punti, avvisi };
  if (JSON.stringify(risultato).includes(ROVINATA)) avvisi.push('Alcune lettere accentate sono arrivate rovinate dal PDF: correggi i testi prima di confermare.');
  return risultato;
}

export function leggiConvocazione(testo) {
  try {
    return leggi(testo);
  } catch (errore) {
    return { tipo: null, data_lettera: null, prima: vuota(), seconda: vuota(), punti: [], avvisi: [`Il testo della convocazione non è stato letto (${errore.message}): inserisci i dati a mano.`] };
  }
}
