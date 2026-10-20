// Nomina dei consiglieri: quali mandati creare, aggiornare o chiudere. Funzioni pure, senza rete né DOM.

// Candidati eletti nell'assemblea: quelli dei punti di nomina con votazione chiusa e approvata.
// Si può votare la lista intera o un candidato alla volta: per questo si guardano tutti i punti insieme.
// `inAttesa` sono i punti di nomina ancora aperti: finché ce ne sono non si sa chi non è stato riconfermato.
export function candidatiNominati(punti) {
  const nomine = punti.filter((p) => p.tipo === 'nomina_consiglieri');
  const nominati = new Map();
  for (const p of nomine) {
    if (!p.votato_il || !p.esito?.approvato) continue;
    for (const c of p.candidati ?? []) {
      if (c.soggetto_id && !nominati.has(c.soggetto_id)) nominati.set(c.soggetto_id, c);
    }
  }
  return { nominati: [...nominati.values()], inAttesa: nomine.filter((p) => !p.votato_il) };
}

// Un mandato è in corso se non ha una fine oppure finisce dopo la data dell'assemblea:
// quelli chiusi proprio in quella data sono già stati sistemati da una registrazione precedente.
const inCorso = (mandato, data) => !mandato.fine_mandato || mandato.fine_mandato > data;

// → { crea: [riga di consiglieri], aggiorna: [{ id, soggetto_id, valori }], chiudi: [{ id, soggetto_id, valori }],
//     daVerificare: [mandati in corso senza soggetto], vuoto }
// Applicare il piano e ricalcolarlo dà un piano vuoto: la registrazione si può ripetere senza doppioni.
export function pianoMandati({ candidati, consiglieri, assembleaId, data }) {
  const aperti = consiglieri.filter((c) => inCorso(c, data));
  const apertoPerSoggetto = new Map(aperti.filter((c) => c.soggetto_id).map((c) => [c.soggetto_id, c]));
  const eletti = new Map(candidati.filter((c) => c.soggetto_id).map((c) => [c.soggetto_id, c]));

  const crea = [];
  const aggiorna = [];
  for (const c of eletti.values()) {
    const parte = c.parte_rappresentata ?? null;
    const mandato = apertoPerSoggetto.get(c.soggetto_id);
    if (!mandato) {
      crea.push({ soggetto_id: c.soggetto_id, carica: 'Consigliere', parte_rappresentata: parte, inizio_mandato: data, fine_mandato: null, assemblea_nomina_id: assembleaId });
    } else if ((mandato.parte_rappresentata ?? null) !== parte || mandato.assemblea_nomina_id !== assembleaId) {
      aggiorna.push({ id: mandato.id, soggetto_id: c.soggetto_id, valori: { parte_rappresentata: parte, assemblea_nomina_id: assembleaId } });
    }
  }
  const chiudi = aperti
    .filter((m) => m.soggetto_id && !eletti.has(m.soggetto_id))
    .map((m) => ({ id: m.id, soggetto_id: m.soggetto_id, valori: { fine_mandato: data } }));
  // senza soggetto non si può sapere se è stato riconfermato: non lo si chiude alla cieca
  const daVerificare = aperti.filter((m) => !m.soggetto_id);

  return { crea, aggiorna, chiudi, daVerificare, vuoto: !crea.length && !aggiorna.length && !chiudi.length };
}
