const SOGLIA_CONDOMINI = 20;

const chiaveDelegato = (d) =>
  d.delegato_testa ?? `esterno:${(d.delegato_esterno ?? '').trim().toLowerCase()}`;

// Restituisce avvisi, non blocca: in seduta decide il consiglio come procedere.
export function controllaDeleghe(testePesate, deleghe) {
  const pesoPerTesta = new Map(testePesate.map((t) => [t.chiave, t.peso]));
  const testeTotali = testePesate.length;
  const pesoTotale = testePesate.reduce((s, t) => s + t.peso, 0);
  const avvisi = [];

  const perDelegato = new Map();
  for (const d of deleghe) {
    if (d.amministratore) avvisi.push({ tipo: 'amministratore', testa: d.delegante });
    if (!pesoPerTesta.has(d.delegante)) continue;
    const chiave = chiaveDelegato(d);
    const somma = perDelegato.get(chiave) ?? { teste: 0, peso: 0 };
    somma.teste += 1;
    somma.peso += pesoPerTesta.get(d.delegante);
    perDelegato.set(chiave, somma);
  }

  if (testeTotali > SOGLIA_CONDOMINI) {
    for (const [delegato, somma] of perDelegato) {
      if (5 * somma.teste > testeTotali) {
        avvisi.push({ tipo: 'oltre_quinto_teste', delegato, teste: somma.teste });
      }
      if (5 * somma.peso > pesoTotale) {
        avvisi.push({ tipo: 'oltre_quinto_millesimi', delegato, peso: somma.peso });
      }
    }
  }

  return avvisi;
}
