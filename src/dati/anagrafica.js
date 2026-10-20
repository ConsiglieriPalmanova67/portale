// Modifiche all'anagrafica come funzioni pure: decidono cosa scrivere, non scrivono.

const giornoPrima = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const dataValida = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`));

// Cambio di proprietà di un'unità dalla data indicata (primo giorno dei nuovi proprietari).
// Chi esce viene chiuso al giorno prima, chi entra parte da quella data, chi resta non viene toccato.
// → { chiudi: [{ id, al }], crea: [{ unita_id, soggetto_id, ruolo, dal, al }], errori: [testo] }
export function pianoCambioProprieta({ titolarita, unitaId, nuovi, data }) {
  const errori = [];
  const attuali = titolarita.filter((t) => t.unita_id === unitaId && t.ruolo === 'proprietario' && !t.al);
  const entranti = [...new Set(nuovi ?? [])];

  if (!dataValida(data)) errori.push('Indica la data del cambio di proprietà.');
  if (!entranti.length) errori.push('Indica almeno un nuovo proprietario.');
  if (errori.length) return { chiudi: [], crea: [], errori };

  const restano = new Set(attuali.filter((t) => entranti.includes(t.soggetto_id)).map((t) => t.soggetto_id));
  const escono = attuali.filter((t) => !restano.has(t.soggetto_id));
  const entrano = entranti.filter((id) => !restano.has(id));
  if (!escono.length && !entrano.length) errori.push('I nuovi proprietari coincidono con quelli attuali: non c\'è nulla da cambiare.');

  const troppoPresto = escono.find((t) => t.dal && t.dal >= data);
  if (troppoPresto) errori.push(`La data del cambio deve essere successiva all'inizio dell'attuale proprietà (${troppoPresto.dal.split('-').reverse().join('/')}).`);
  if (errori.length) return { chiudi: [], crea: [], errori };

  return {
    chiudi: escono.map((t) => ({ id: t.id, al: giornoPrima(data) })),
    crea: entrano.map((soggetto_id) => ({ unita_id: unitaId, soggetto_id, ruolo: 'proprietario', dal: data, al: null })),
    errori: [],
  };
}

// Dopo la correzione di un nominativo, le teste già congelate di una seduta in corso vanno rinominate.
// → [{ id, etichetta }] solo per le teste la cui etichetta cambia davvero.
export function etichetteDaAggiornare(teste, soggetti) {
  const nome = new Map(soggetti.map((s) => [s.id, s.denominazione]));
  return teste
    .map((t) => ({ id: t.id, vecchia: t.etichetta, etichetta: t.soggetti.map((id) => nome.get(id) ?? '?').join(' + ') }))
    .filter((t) => t.etichetta !== t.vecchia)
    .map(({ id, etichetta }) => ({ id, etichetta }));
}
