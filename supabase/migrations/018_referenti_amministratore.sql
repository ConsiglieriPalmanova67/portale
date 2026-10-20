-- Collaboratori e referenti dello studio dell'amministratore (contabilità, tecnico, segreteria…) con i loro contatti.
-- Ognuno appartiene a un incarico dell'amministratore: se l'incarico si cancella, i suoi referenti vanno con lui.

create table public.referenti_amministratore (
  id uuid primary key default gen_random_uuid(),
  amministratore_id uuid not null references public.amministratori (id) on delete cascade,
  nome text not null,
  mansione text,
  email text,
  telefono text,
  cellulare text,
  note text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

alter table public.referenti_amministratore enable row level security;
create policy consiglieri_tutto on public.referenti_amministratore for all to authenticated
  using (public.is_consigliere()) with check (public.is_consigliere());
create trigger audit before insert or update on public.referenti_amministratore
  for each row execute function public.imposta_audit();
