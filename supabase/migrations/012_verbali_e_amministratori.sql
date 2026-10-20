-- Lettura dei verbali (stesse tabelle dell'estrattore dei fascicoli) e registro degli amministratori.

alter table public.estrazioni drop constraint estrazioni_tipo_check;
alter table public.estrazioni add constraint estrazioni_tipo_check check (tipo in ('fascicolo_rendiconto', 'verbale'));
alter table public.estrazioni_blocchi drop constraint estrazioni_blocchi_sezione_check;
alter table public.estrazioni_blocchi add constraint estrazioni_blocchi_sezione_check
  check (sezione in ('spese', 'riparto', 'preventivo', 'raffronto', 'patrimoniale', 'partite', 'verbale'));

-- Gli incarichi dell'amministratore, nominato o confermato in assemblea: uno per periodo, lo storico resta.
create table public.amministratori (
  id uuid primary key default gen_random_uuid(),
  denominazione text not null,
  dal date,
  al date,
  compenso text,
  assemblea_id uuid references public.assemblee (id) on delete set null,
  note text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  check (al is null or dal is null or al >= dal)
);

alter table public.amministratori enable row level security;
create policy consiglieri_tutto on public.amministratori for all to authenticated
  using (public.is_consigliere()) with check (public.is_consigliere());
create trigger audit before insert or update on public.amministratori
  for each row execute function public.imposta_audit();
