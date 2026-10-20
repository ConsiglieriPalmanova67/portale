import { inInteri } from './numeri.js';

// Una testa è l'insieme dei proprietari correnti di un'unità.
// Unità con lo stesso identico insieme di proprietari formano una sola testa.
export function calcolaTeste(titolarita, data) {
  const proprietariPerUnita = new Map();
  for (const t of titolarita) {
    if (t.ruolo !== 'proprietario') continue;
    if (t.dal && t.dal > data) continue;
    if (t.al && t.al < data) continue;
    if (!proprietariPerUnita.has(t.unita_id)) proprietariPerUnita.set(t.unita_id, new Set());
    proprietariPerUnita.get(t.unita_id).add(t.soggetto_id);
  }

  const teste = new Map();
  for (const [unitaId, proprietari] of proprietariPerUnita) {
    const soggetti = [...proprietari].sort();
    const chiave = soggetti.join('+');
    if (!teste.has(chiave)) teste.set(chiave, { chiave, soggetti, unita: [] });
    teste.get(chiave).unita.push(unitaId);
  }

  return [...teste.values()]
    .map((t) => ({ ...t, unita: [...t.unita].sort() }))
    .sort((a, b) => (a.chiave < b.chiave ? -1 : 1));
}

// Restituisce le teste che hanno millesimi nella tabella, con `peso` in interi.
// Una delibera che riguarda una sola parte del condominio usa la sua tabella:
// le teste senza millesimi lì non partecipano.
export function pesaTeste(teste, millesimi, tabellaId) {
  const pesoPerUnita = new Map();
  for (const m of millesimi) {
    if (m.tabella_id === tabellaId) pesoPerUnita.set(m.unita_id, inInteri(m.valore));
  }
  return teste
    .map((t) => ({ ...t, peso: t.unita.reduce((s, u) => s + (pesoPerUnita.get(u) ?? 0), 0) }))
    .filter((t) => t.peso > 0);
}
