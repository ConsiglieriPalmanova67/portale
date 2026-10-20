// Archivio dei documenti: percorso dei file ed elenco unico di ciò che è consultabile. Funzioni pure, senza rete né DOM.
import { normalizza } from '../ui/html.js';

export const ARCHIVIO_DOCUMENTI = 'documenti';
// Convocazioni e verbali restano dove li mettono le pagine Assemblee e Verbali.
const ARCHIVIO_VERBALI = 'verbali';

export const TIPI_DOCUMENTO = {
  rendiconto: 'Rendiconto consuntivo', preventivo: 'Rendiconto preventivo', riparto: 'Riparto', verbale: 'Verbale', convocazione: 'Convocazione',
  regolamento: 'Regolamento', comunicazione: 'Comunicazione', altro: 'Altro',
};

// Le sezioni della pagina Documenti (#/documenti/<categoria>): ognuna mostra solo i suoi tipi.
export const CATEGORIE_DOCUMENTO = {
  assemblee: { nome: 'Assemblee', tipi: ['convocazione', 'verbale'] },
  rendiconti: { nome: 'Rendiconti', tipi: ['preventivo', 'rendiconto', 'riparto'] },
  regolamento: { nome: 'Regolamento', tipi: ['regolamento'] },
  comunicazioni: { nome: 'Comunicazioni', tipi: ['comunicazione'] },
};

// Oltre questa dimensione l'archivio può rifiutare il file: si avvisa prima di caricarlo.
export const LIMITE_FILE = 45 * 1024 * 1024;

// Per ora l'archivio accetta solo PDF: è il formato da cui si estraggono i dati.
export const ePdf = (file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '');

export const percorsoDocumento = (id, anno, estensione) => `${anno || 'senza-anno'}/${id}.${estensione}`;

const annoDi = (giorno) => (giorno ? Number(String(giorno).slice(0, 4)) : null);

// Elenco unico: i documenti caricati nell'archivio, più le convocazioni delle assemblee e i verbali con un file,
// che restano gestiti dalle loro pagine (qui sono in sola lettura).
// → [{ chiave, origine: 'documento'|'convocazione'|'verbale', titolo, tipo, anno, data, assemblea, bucket, percorso,
//      nomeFile, note, documento (la riga di `documenti`, solo per origine 'documento') }]
export function archivioUnico({ documenti, assemblee, verbali, titoloAssemblea }) {
  const assembleaPerId = new Map(assemblee.map((a) => [a.id, a]));
  return [
    ...documenti.map((d) => ({
      chiave: `documento:${d.id}`, origine: 'documento', titolo: d.titolo, tipo: d.tipo, anno: d.anno ?? null, data: d.data_documento ?? null,
      assemblea: assembleaPerId.get(d.assemblea_id) ?? null, bucket: ARCHIVIO_DOCUMENTI, percorso: d.file_path, nomeFile: d.nome_file ?? null, note: d.note ?? null, documento: d,
    })),
    ...assemblee.filter((a) => a.convocazione_path).map((a) => ({
      chiave: `convocazione:${a.id}`, origine: 'convocazione', titolo: `Convocazione — ${titoloAssemblea(a)}`, tipo: 'convocazione', anno: annoDi(a.data),
      data: a.data_lettera ?? a.data, assemblea: a, bucket: ARCHIVIO_VERBALI, percorso: a.convocazione_path, nomeFile: null, note: null, documento: null,
    })),
    ...verbali.filter((v) => v.file_path).map((v) => {
      const a = assembleaPerId.get(v.assemblea_id) ?? null;
      return {
        chiave: `verbale:${v.id}`, origine: 'verbale', titolo: a ? `Verbale — ${titoloAssemblea(a)}` : 'Verbale', tipo: 'verbale', anno: annoDi(a?.data),
        data: a?.data ?? null, assemblea: a, bucket: ARCHIVIO_VERBALI, percorso: v.file_path, nomeFile: null, note: v.stato === 'definitivo' ? 'Definitivo' : 'Bozza', documento: null,
      };
    }),
  ];
}

// filtri: categoria (chiave di CATEGORIE_DOCUMENTO), tipo (chiave di TIPI_DOCUMENTO) e testo (cercato nel titolo);
// quelli vuoti non filtrano.
export function filtraArchivio(voci, { categoria = '', tipo = '', testo = '' }) {
  const cercato = normalizza(testo.trim());
  const tipi = Object.hasOwn(CATEGORIE_DOCUMENTO, categoria) ? CATEGORIE_DOCUMENTO[categoria].tipi : null;
  return voci.filter((v) => (!tipi || tipi.includes(v.tipo)) && (!tipo || v.tipo === tipo) && (!cercato || normalizza(v.titolo).includes(cercato)));
}

// → [{ anno (numero oppure null), voci }] dall'anno più recente; i documenti senza anno in fondo.
export function raggruppaPerAnno(voci) {
  const gruppi = new Map();
  for (const v of voci) {
    if (!gruppi.has(v.anno)) gruppi.set(v.anno, []);
    gruppi.get(v.anno).push(v);
  }
  const recente = (a, b) => (b.data ?? '').localeCompare(a.data ?? '') || a.titolo.localeCompare(b.titolo, 'it', { numeric: true });
  return [...gruppi]
    .sort(([a], [b]) => (a === null) - (b === null) || b - a)
    .map(([anno, elenco]) => ({ anno, voci: elenco.sort(recente) }));
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
// Una data scritta nel titolo ("Convocazione 27 Aprile 2023", "Assemblea 17.03.2025", "Verbale 13/07/2026") → ISO, o null.
export function dataNelTitolo(titolo) {
  const t = normalizza(titolo);
  let m = t.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && MESI.includes(m[2])) return `${m[3]}-${String(MESI.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

const giorni = (da, a) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86400000);

// L'assemblea di una convocazione o di un verbale: quella collegata; altrimenti quella con la data scritta nel titolo
// o con la data del documento; per una convocazione anche l'unica assemblea che si tiene entro 60 giorni dalla lettera.
export function assembleaDi(voce, assemblee) {
  if (voce.assemblea) return voce.assemblea;
  const date = [dataNelTitolo(voce.titolo), voce.data].filter(Boolean);
  const stessa = assemblee.find((a) => date.includes(a.data));
  if (stessa) return stessa;
  if (voce.tipo !== 'convocazione' || !voce.data) return null;
  const vicine = assemblee.filter((a) => { const g = giorni(voce.data, a.data); return g >= 0 && g <= 60; });
  return vicine.length === 1 ? vicine[0] : null;
}

// Il quadro di ogni anno, fatto solo dei documenti caricati in archivio: il bilancio (preventivo; consuntivo e riparto),
// convocazioni e verbali raggruppati per assemblea (quella collegata o riconosciuta dalla data; se non c'è ancora,
// per la data scritta nel documento), gli altri documenti.
// → [{ anno, preventivo, consuntivo, assemblee: [{ chiave, assemblea (o null), data, convocazioni, verbali }], altri }]
export function quadroPerAnno({ voci, assemblee }) {
  const anni = new Map();
  const anno = (n) => {
    if (!anni.has(n)) anni.set(n, { anno: n, preventivo: [], consuntivo: [], gruppi: new Map(), altri: [] });
    return anni.get(n);
  };
  for (const v of voci.filter((x) => x.origine === 'documento')) {
    if (v.tipo === 'preventivo') anno(v.anno).preventivo.push(v);
    else if (v.tipo === 'rendiconto' || v.tipo === 'riparto') anno(v.anno).consuntivo.push(v);
    else if (v.tipo === 'convocazione' || v.tipo === 'verbale') {
      const assemblea = assembleaDi(v, assemblee);
      const giorno = assemblea?.data ?? dataNelTitolo(v.titolo) ?? null;
      const chiave = assemblea ? `assemblea:${assemblea.id}` : giorno ? `data:${giorno}` : v.chiave;
      const g = anno(annoDi(giorno) ?? v.anno ?? annoDi(v.data));
      if (!g.gruppi.has(chiave)) g.gruppi.set(chiave, { chiave, assemblea, data: giorno, convocazioni: [], verbali: [] });
      g.gruppi.get(chiave)[v.tipo === 'convocazione' ? 'convocazioni' : 'verbali'].push(v);
    } else anno(v.anno ?? annoDi(v.data)).altri.push(v);
  }
  return [...anni.values()]
    .sort((a, b) => (a.anno === null) - (b.anno === null) || b.anno - a.anno)
    .map(({ gruppi, ...g }) => ({ ...g, assemblee: [...gruppi.values()].sort((x, y) => (x.data ?? '9999').localeCompare(y.data ?? '9999')) }));
}
