-- Lo stesso soggetto può comparire due volte sulla stessa unità con titoli diversi
-- (per esempio proprietario e assegnatario): la posizione è distinta anche dal ruolo.
alter table public.posizioni add column ruolo text not null default 'proprietario'
  check (ruolo in ('proprietario', 'conduttore', 'assegnatario'));
alter table public.posizioni drop constraint posizioni_unita_id_esercizio_id_soggetto_id_key;
alter table public.posizioni add constraint posizioni_unita_esercizio_soggetto_ruolo_key
  unique (unita_id, esercizio_id, soggetto_id, ruolo);
