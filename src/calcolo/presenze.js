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
