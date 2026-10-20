-- Accede solo chi è consigliere con mandato aperto.
create or replace function public.is_consigliere()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.consiglieri
    where utente_id = auth.uid()
      and (fine_mandato is null or fine_mandato >= current_date)
  );
$$;

revoke execute on function public.is_consigliere() from public;
grant execute on function public.is_consigliere() to authenticated;

-- RLS su tutte le tabelle dello schema public.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy consiglieri_tutto on public.%I for all to authenticated '
      'using (public.is_consigliere()) with check (public.is_consigliere())', t);
  end loop;
end $$;

-- Audit: autore e data su inserimento e modifica.
create or replace function public.imposta_audit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.creato_da := auth.uid();
    new.creato_il := now();
  end if;
  new.modificato_da := auth.uid();
  new.modificato_il := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'modificato_il'
  loop
    execute format(
      'create trigger audit before insert or update on public.%I '
      'for each row execute function public.imposta_audit()', t);
  end loop;
end $$;

-- Archivio file privato: scansioni delle deleghe e verbali.
insert into storage.buckets (id, name, public)
values ('deleghe', 'deleghe', false), ('verbali', 'verbali', false);

create policy consiglieri_file on storage.objects
  for all to authenticated
  using (bucket_id in ('deleghe', 'verbali') and public.is_consigliere())
  with check (bucket_id in ('deleghe', 'verbali') and public.is_consigliere());

-- Aggiornamento in tempo reale durante la seduta.
alter publication supabase_realtime add table public.presenze, public.deleghe, public.voti, public.punti_odg;
