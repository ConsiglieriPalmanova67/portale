// Costruisce un PDF minimo (solo testo, una pagina A4 orizzontale per elenco di righe) senza librerie:
// serve alla modalità prova, per avere un documento vero da mostrare accanto ai dati del fascicolo di fantasia.

// Le stringhe di un PDF sono tra parentesi, in Latin-1: si proteggono parentesi e barre, il resto fuori alfabeto diventa "?".
const stringa = (testo) => [...String(testo)].map((c) => {
  const codice = c.codePointAt(0);
  if (c === '(' || c === ')' || c === '\\') return `\\${c}`;
  if (codice < 32 || codice > 255) return '?';
  return codice > 126 ? `\\${codice.toString(8).padStart(3, '0')}` : c;
}).join('');

// pagine: [[riga, riga, …], …] → Uint8Array con il PDF
export function pdfDiTesto(pagine) {
  const oggetti = [];
  const aggiungi = (corpo) => oggetti.push(corpo) && oggetti.length;
  const catalogo = aggiungi('');
  const albero = aggiungi('');
  const carattere = aggiungi('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const figli = pagine.map((righe, n) => {
    const corpo = righe.length > 34 ? 8 : 10;
    const testo = [`BT /F1 ${corpo} Tf ${corpo + 4} TL 36 560 Td`, ...righe.map((r) => `(${stringa(r)}) Tj T*`), 'ET',
      `BT /F1 8 Tf 760 20 Td (Pag. ${n + 1}) Tj ET`].join('\n');
    const contenuto = aggiungi(`<< /Length ${testo.length} >>\nstream\n${testo}\nendstream`);
    return aggiungi(`<< /Type /Page /Parent ${albero} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${carattere} 0 R >> >> /Contents ${contenuto} 0 R >>`);
  });
  oggetti[catalogo - 1] = `<< /Type /Catalog /Pages ${albero} 0 R >>`;
  oggetti[albero - 1] = `<< /Type /Pages /Count ${figli.length} /Kids [${figli.map((f) => `${f} 0 R`).join(' ')}] >>`;

  let documento = '%PDF-1.4\n';
  const posizioni = oggetti.map((corpo, i) => {
    const inizio = documento.length;
    documento += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
    return inizio;
  });
  const indice = documento.length;
  documento += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n${posizioni.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  documento += `trailer\n<< /Size ${oggetti.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${indice}\n%%EOF\n`;
  // tutto il documento è ASCII (i caratteri accentati sono scritti in ottale): un carattere, un byte
  return Uint8Array.from(documento, (c) => c.charCodeAt(0));
}
