-- Una seduta andata deserta o rinviata resta in archivio ma non conta (nessuna delibera, nessun to-do).
alter table public.assemblee add column esito_seduta text check (esito_seduta in ('deserta', 'rinviata'));
-- Un punto che somiglia a uno di un'assemblea precedente ma che chi rivede giudica nuovo (o normale ogni anno).
alter table public.punti_odg add column non_ricorrente boolean not null default false;
