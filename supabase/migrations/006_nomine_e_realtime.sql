-- La nomina dei consiglieri è un tipo di punto all'ordine del giorno.
alter table public.punti_odg add column tipo text not null default 'delibera'
  check (tipo in ('delibera', 'nomina_consiglieri'));
-- Candidati di un punto di nomina: [{ "soggetto_id": "...", "parte_rappresentata": "Torre 1" }]
alter table public.punti_odg add column candidati jsonb not null default '[]'::jsonb;

alter table public.consiglieri add column assemblea_nomina_id uuid references public.assemblee (id) on delete set null;

-- Durante la seduta anche lo stato dell'assemblea e le teste si aggiornano in tempo reale.
alter publication supabase_realtime add table public.assemblee, public.teste_assemblea;
