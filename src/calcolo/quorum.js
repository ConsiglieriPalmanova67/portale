// Confronti in interi (peso = millesimi × 1000) moltiplicando in croce,
// così le soglie 1/3 e 2/3 non passano per la virgola mobile.
export function quorumCostitutivo(testePesate, presenti, convocazione) {
  const inSala = testePesate.filter((t) => presenti.has(t.chiave));
  const testeTotali = testePesate.length;
  const testePresenti = inSala.length;
  const pesoTotale = testePesate.reduce((s, t) => s + t.peso, 0);
  const pesoPresente = inSala.reduce((s, t) => s + t.peso, 0);

  let raggiunto;
  if (convocazione === 'prima') {
    raggiunto = 2 * testePresenti > testeTotali && 3 * pesoPresente >= 2 * pesoTotale;
  } else if (convocazione === 'seconda') {
    raggiunto = 3 * testePresenti >= testeTotali && 3 * pesoPresente >= pesoTotale;
  } else {
    throw new Error(`convocazione non valida: ${convocazione}`);
  }

  return { testeTotali, testePresenti, pesoTotale, pesoPresente, raggiunto };
}
