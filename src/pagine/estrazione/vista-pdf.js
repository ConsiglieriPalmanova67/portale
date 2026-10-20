// La pagina del PDF accanto ai dati, nella revisione: disegnata con pdf.js su un canvas a partire dal file
// del documento in archivio. Si può sfogliare, ruotare (le scansioni dei riparti sono spesso girate di 90°) e ingrandire.
import { pdfjs } from '../../dati/pdf.js';
import { esc } from '../../ui/html.js';

// `caricaFile()` → Promise del Blob con il PDF. → { mostra(pagina), chiudi() }
export function creaVistaPdf(contenitore, caricaFile) {
  contenitore.innerHTML = `
    <div class="vista-pdf-barra">
      <button type="button" class="secondario" data-pdf="prima" aria-label="Pagina precedente">‹</button>
      <span>Pagina <input type="number" min="1" step="1" class="corto" data-pdf="numero" aria-label="Pagina del PDF"> di <span data-pdf="totale">…</span></span>
      <button type="button" class="secondario" data-pdf="dopo" aria-label="Pagina successiva">›</button>
      <button type="button" class="secondario" data-pdf="ruota" title="Ruota la pagina di 90 gradi">Ruota ↻</button>
      <button type="button" class="secondario" data-pdf="meno" aria-label="Rimpicciolisci">−</button>
      <button type="button" class="secondario" data-pdf="piu" aria-label="Ingrandisci">+</button>
    </div>
    <p class="nota" data-pdf="stato">Scegli una riga per vedere la sua pagina.</p>
    <div class="vista-pdf-foglio"><canvas></canvas></div>`;
  const $ = (nome) => contenitore.querySelector(`[data-pdf="${nome}"]`);
  const tela = contenitore.querySelector('canvas');
  const foglio = contenitore.querySelector('.vista-pdf-foglio');
  const vista = { documento: null, pagina: 0, rotazione: 0, zoom: 1, disegno: null, chiusa: false, turno: 0 };
  let apertura = null;

  const apri = () => (apertura ??= (async () => {
    const { getDocument } = await pdfjs();
    const file = await caricaFile();
    vista.documento = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    $('totale').textContent = vista.documento.numPages;
    $('numero').max = vista.documento.numPages;
    return vista.documento;
  })().catch((errore) => {
    apertura = null;
    throw errore;
  }));

  async function disegna() {
    const turno = (vista.turno += 1);
    try {
      $('stato').textContent = 'Apertura della pagina…';
      const documento = await apri();
      if (vista.chiusa || turno !== vista.turno) return;
      vista.pagina = Math.min(Math.max(1, vista.pagina), documento.numPages);
      $('numero').value = vista.pagina;
      const pagina = await documento.getPage(vista.pagina);
      // alla rotazione scritta nel PDF si aggiunge quella chiesta a mano
      const diBase = pagina.getViewport({ scale: 1, rotation: (pagina.rotate + vista.rotazione) % 360 });
      const larghezza = Math.max(280, foglio.clientWidth - 2) * vista.zoom;
      const nitidezza = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pagina.getViewport({ scale: (larghezza / diBase.width) * nitidezza, rotation: (pagina.rotate + vista.rotazione) % 360 });
      vista.disegno?.cancel();
      // si disegna su una tela a parte e poi si copia: due disegni non si accavallano sulla stessa tela
      const bozza = document.createElement('canvas');
      bozza.width = Math.round(viewport.width);
      bozza.height = Math.round(viewport.height);
      vista.disegno = pagina.render({ canvasContext: bozza.getContext('2d'), viewport });
      await vista.disegno.promise;
      if (vista.chiusa || turno !== vista.turno) return;
      tela.width = bozza.width;
      tela.height = bozza.height;
      tela.style.width = `${Math.round(viewport.width / nitidezza)}px`;
      tela.getContext('2d').drawImage(bozza, 0, 0);
      $('stato').textContent = '';
    } catch (errore) {
      if (errore?.name === 'RenderingCancelledException' || vista.chiusa || turno !== vista.turno) return;
      $('stato').innerHTML = `La pagina non si apre: ${esc(errore.message ?? errore)}. <button type="button" class="secondario" data-pdf="riprova">Riprova</button>`;
    }
  }

  contenitore.onclick = (evento) => {
    const gesto = evento.target.dataset.pdf;
    if (gesto === 'prima') vista.pagina -= 1;
    else if (gesto === 'dopo') vista.pagina += 1;
    else if (gesto === 'ruota') vista.rotazione = (vista.rotazione + 90) % 360;
    else if (gesto === 'piu') vista.zoom = Math.min(3, vista.zoom * 1.25);
    else if (gesto === 'meno') vista.zoom = Math.max(0.5, vista.zoom / 1.25);
    else if (gesto !== 'riprova') return;
    vista.pagina = Math.max(1, vista.pagina);
    disegna();
  };
  $('numero').addEventListener('change', (evento) => {
    vista.pagina = Number(evento.target.value) || 1;
    disegna();
  });

  return {
    mostra(pagina) {
      if (!pagina || pagina === vista.pagina) return;
      vista.pagina = pagina;
      disegna();
    },
    chiudi() {
      vista.chiusa = true;
      vista.disegno?.cancel();
      vista.documento?.destroy();
    },
  };
}
