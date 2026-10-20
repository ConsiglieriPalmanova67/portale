// quota = frazione minima dei millesimi totali della tabella, come [numeratore, denominatore].
export const MAGGIORANZE = {
  terzo: { etichetta: 'Maggioranza dei presenti e 1/3 dei millesimi', quota: [1, 3] },
  meta: { etichetta: 'Maggioranza dei presenti e 500 millesimi', quota: [1, 2] },
  due_terzi: { etichetta: 'Maggioranza dei presenti e 2/3 dei millesimi', quota: [2, 3] },
  unanimita: { etichetta: 'Unanimità di tutti i condomini', quota: null },
  unanimita_presenti: { etichetta: 'Unanimità dei presenti', quota: null, soloPresenti: true },
};

const vuoto = () => ({ teste: 0, peso: 0 });

// `testePesate` sono già le teste della tabella del punto (vedi pesaTeste):
// chi non ha millesimi in quella tabella non vota.
// `voti` ha una riga per ogni testa che ha votato; un presente senza riga è "non espresso".
export function esitoVoto(testePesate, presenti, voti, tipo) {
  const regola = MAGGIORANZE[tipo];
  if (!regola) throw new Error(`maggioranza non valida: ${tipo}`);

  const votoPerTesta = new Map(voti.map((x) => [x.testa, x.voto]));
  const conteggi = {
    favorevoli: vuoto(), contrari: vuoto(), astenuti: vuoto(), nonEspressi: vuoto(), presenti: vuoto(),
  };
  const campo = { favorevole: 'favorevoli', contrario: 'contrari', astenuto: 'astenuti' };

  for (const t of testePesate) {
    if (!presenti.has(t.chiave)) continue;
    const dove = campo[votoPerTesta.get(t.chiave)] ?? 'nonEspressi';
    for (const c of [conteggi[dove], conteggi.presenti]) {
      c.teste += 1;
      c.peso += t.peso;
    }
  }

  const pesoTotale = testePesate.reduce((s, t) => s + t.peso, 0);
  const { favorevoli } = conteggi;
  let approvato;
  if (regola.quota === null) {
    // di tutti: ogni testa della tabella favorevole, assenti compresi; dei presenti: nessun contrario, astenuto o non espresso
    const attese = regola.soloPresenti ? conteggi.presenti.teste : testePesate.length;
    approvato = attese > 0 && favorevoli.teste === attese;
  } else {
    const [num, den] = regola.quota;
    approvato = 2 * favorevoli.teste > conteggi.presenti.teste && den * favorevoli.peso >= num * pesoTotale;
  }

  return { ...conteggi, pesoTotale, approvato };
}
