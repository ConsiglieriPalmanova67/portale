-- Estrazione dei dati dai PDF: un'estrazione per documento letto, con i suoi blocchi di pagine.
-- Nulla di ciò che sta qui è un dato definitivo: lo diventa solo con l'importazione, dopo la revisione.
create table public.estrazioni (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documenti (id) on delete cascade,
  tipo text not null default 'fascicolo_rendiconto' check (tipo in ('fascicolo_rendiconto')),
  anno integer not null,
  stato text not null default 'indice' check (stato in ('indice', 'lettura', 'revisione', 'importata', 'annullata')),
  modello text,
  pagine integer,
  -- mappa delle sezioni: [{ tipo, pagina_da, pagina_a, titolo, parte }]
  mappa jsonb,
  -- modifiche fatte a mano in revisione: { celle: { "sezione:pagina|percorso": valore }, ruoli: {}, accettati: {} }
  correzioni jsonb not null default '{}'::jsonb,
  token_ingresso bigint not null default 0,
  token_uscita bigint not null default 0,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);
create index estrazioni_documento_idx on public.estrazioni (documento_id);

create table public.estrazioni_blocchi (
  id uuid primary key default gen_random_uuid(),
  estrazione_id uuid not null references public.estrazioni (id) on delete cascade,
  sezione text not null check (sezione in ('spese', 'riparto', 'preventivo', 'raffronto', 'patrimoniale', 'partite')),
  -- per il riparto: 1, 2, 3… (parti consecutive con colonne diverse)
  parte integer,
  pagina_da integer not null,
  pagina_a integer not null,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'in_corso', 'fatto', 'errore')),
  -- la risposta del lettore per queste pagine, così com'è arrivata
  dati jsonb,
  errore text,
  tentativi integer not null default 0,
  token_ingresso bigint not null default 0,
  token_uscita bigint not null default 0,
  unique (estrazione_id, sezione, pagina_da),
  check (pagina_da >= 1 and pagina_a >= pagina_da)
);

-- Stesse regole delle altre tabelle: solo consiglieri con mandato in corso.
do $$
declare t text;
begin
  foreach t in array array['estrazioni', 'estrazioni_blocchi'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy consiglieri_tutto on public.%I for all to authenticated '
      'using (public.is_consigliere()) with check (public.is_consigliere())', t);
  end loop;
end $$;

create trigger audit before insert or update on public.estrazioni
  for each row execute function public.imposta_audit();
