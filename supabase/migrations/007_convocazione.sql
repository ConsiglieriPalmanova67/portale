-- Dati della convocazione. `data`, `ora` e `luogo` descrivono la seduta che si tiene davvero
-- (di norma la seconda convocazione); i campi `prima_*` conservano la prima convocazione.
alter table public.assemblee add column ora time;
alter table public.assemblee add column prima_data date;
alter table public.assemblee add column prima_ora time;
alter table public.assemblee add column prima_luogo text;
alter table public.assemblee add column data_lettera date;
-- PDF della convocazione nel bucket privato `verbali` (percorso convocazioni/<id assemblea>.pdf)
alter table public.assemblee add column convocazione_path text;
