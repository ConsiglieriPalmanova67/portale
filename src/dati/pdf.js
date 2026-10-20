// Estrazione del testo da un PDF nel browser, con pdf.js caricato dalla rete solo quando serve.
// Il testo esce a righe, dall'alto in basso e da sinistra a destra, pronto per leggiConvocazione().

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168';

let libreria = null;
// Serve anche a chi deve disegnare le pagine (revisione delle estrazioni).
export async function pdfjs() {
  if (!libreria) {
    try {
      libreria = await import(`${PDFJS}/pdf.min.mjs`);
    } catch {
      throw new Error('Non è stato possibile caricare il lettore dei PDF: controlla la connessione e riprova.');
    }
    libreria.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  }
  return libreria;
}

// Dai frammenti di testo di una pagina ({ str, transform: [a, b, c, d, x, y], width, height }, come li dà pdf.js)
// alle righe: i frammenti alla stessa altezza formano una riga, ordinati da sinistra a destra;
// uno stacco verticale più ampio dell'interlinea diventa una riga vuota.
export function righeDaFrammenti(frammenti) {
  const pezzi = (frammenti ?? [])
    .filter((f) => typeof f?.str === 'string' && f.str.trim() && Array.isArray(f.transform))
    .map((f) => ({ testo: f.str, x: f.transform[4], y: f.transform[5], larghezza: f.width || 0, altezza: f.height || Math.abs(f.transform[3]) || 10 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const gruppi = [];
  for (const pezzo of pezzi) {
    const ultimo = gruppi.at(-1);
    if (ultimo && Math.abs(ultimo.y - pezzo.y) <= Math.min(ultimo.altezza, pezzo.altezza) / 2) ultimo.pezzi.push(pezzo);
    else gruppi.push({ y: pezzo.y, altezza: pezzo.altezza, pezzi: [pezzo] });
  }

  const righe = [];
  let precedente = null;
  for (const gruppo of gruppi) {
    if (precedente && precedente.y - gruppo.y > Math.max(precedente.altezza, gruppo.altezza) * 1.8) righe.push('');
    let testo = '';
    let fine = null;
    for (const pezzo of gruppo.pezzi.sort((a, b) => a.x - b.x)) {
      // due frammenti staccati sono parole diverse; se si toccano è la stessa parola spezzata
      if (fine !== null && pezzo.x - fine > pezzo.altezza * 0.15) testo += ' ';
      testo += pezzo.testo;
      fine = pezzo.x + pezzo.larghezza;
    }
    righe.push(testo.replace(/\s+/g, ' ').trim());
    precedente = gruppo;
  }
  return righe;
}

// `file` è un File o un Blob. Restituisce il testo di tutte le pagine.
export async function testoDaPdf(file) {
  const { getDocument } = await pdfjs();
  let documento;
  try {
    documento = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (errore) {
    throw new Error(errore?.name === 'PasswordException'
      ? 'Questo PDF è protetto da una password: inserisci i dati a mano.'
      : 'Il file scelto non è un PDF leggibile.');
  }
  try {
    const pagine = [];
    for (let numero = 1; numero <= documento.numPages; numero += 1) {
      const pagina = await documento.getPage(numero);
      const { items } = await pagina.getTextContent();
      pagine.push(righeDaFrammenti(items).join('\n'));
    }
    const testo = pagine.join('\n\n');
    if (!testo.trim()) throw new Error('Questo PDF è una scansione senza testo: inserisci i dati a mano.');
    return testo;
  } finally {
    documento.destroy();
  }
}
