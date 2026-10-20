-- To-do come attività da seguire: titolo, descrizione, responsabile (testo libero: un consigliere, l'amministratore,
-- un condomino…), apertura, chiusura stimata (scadenza) ed effettiva, criticità.
alter table public.todo
  add column titolo text, add column responsabile text, add column data_apertura date, add column data_chiusura date, add column criticita text;
alter table public.todo alter column descrizione drop not null;

-- i to-do esistenti: la vecchia descrizione diventa il titolo; dalle note (scritte dalla lettura dei verbali,
-- «Responsabile: X · Importo: Y») il responsabile va nella sua colonna e il resto nella descrizione
update public.todo t set
  titolo = t.descrizione,
  responsabile = coalesce(
    nullif(substring(t.note from 'Responsabile: ([^·]*)'), ''),
    (select coalesce(c.nominativo, s.denominazione) from public.consiglieri c left join public.soggetti s on s.id = c.soggetto_id where c.id = t.responsabile_id)),
  descrizione = nullif(trim(both ' ·' from regexp_replace(coalesce(t.note, ''), 'Responsabile: [^·]*', '')), ''),
  data_apertura = coalesce((select a.data from public.assemblee a where a.id = t.assemblea_id), t.creato_il::date),
  data_chiusura = case when t.stato = 'chiuso' then coalesce(t.modificato_il, t.creato_il)::date end;
update public.todo set responsabile = trim(responsabile) where responsabile is not null;
