-- Archivio dei documenti del condominio (rendiconti, preventivi, verbali, convocazioni...).
create table public.documenti (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  tipo text not null check (tipo in ('rendiconto', 'preventivo', 'riparto', 'verbale', 'convocazione', 'altro')),
  anno integer,
  data_documento date,
  assemblea_id uuid references public.assemblee (id) on delete set null,
  file_path text not null,
  nome_file text,
  note text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);
create index documenti_anno_idx on public.documenti (anno, tipo);

-- Situazione patrimoniale a fine esercizio, voce per voce.
create table public.stato_patrimoniale (
  id uuid primary key default gen_random_uuid(),
  esercizio_id uuid not null references public.esercizi (id) on delete cascade,
  lato text not null check (lato in ('attivita', 'passivita')),
  ordine integer not null,
  voce text not null,
  importo numeric(12, 2) not null,
  unique (esercizio_id, lato, ordine)
);

-- Crediti e debiti verso terzi (fornitori, erario...) aperti a fine esercizio.
create table public.partite_terzi (
  id uuid primary key default gen_random_uuid(),
  esercizio_id uuid not null references public.esercizi (id) on delete cascade,
  tipo text not null check (tipo in ('credito', 'debito')),
  controparte text,
  protocollo text,
  descrizione text not null,
  importo numeric(12, 2) not null
);
create index partite_terzi_esercizio_idx on public.partite_terzi (esercizio_id, tipo);

-- Stesse regole delle altre tabelle: solo consiglieri con mandato in corso.
do $$
declare t text;
begin
  foreach t in array array['documenti', 'stato_patrimoniale', 'partite_terzi'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy consiglieri_tutto on public.%I for all to authenticated '
      'using (public.is_consigliere()) with check (public.is_consigliere())', t);
  end loop;
end $$;

create trigger audit before insert or update on public.documenti
  for each row execute function public.imposta_audit();

insert into storage.buckets (id, name, public) values ('documenti', 'documenti', false);

create policy consiglieri_documenti on storage.objects
  for all to authenticated
  using (bucket_id = 'documenti' and public.is_consigliere())
  with check (bucket_id = 'documenti' and public.is_consigliere());
