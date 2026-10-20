-- Siti esterni del condominio (portale dell'amministratore, fornitori…): indirizzo e nome utente, mai la password.
-- La password resta nel gestore password del browser di chi accede.

create table public.siti_collegati (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  indirizzo text not null check (indirizzo ~* '^https?://'),
  utente text,
  note text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

alter table public.siti_collegati enable row level security;
create policy consiglieri_tutto on public.siti_collegati for all to authenticated
  using (public.is_consigliere()) with check (public.is_consigliere());
create trigger audit before insert or update on public.siti_collegati
  for each row execute function public.imposta_audit();
