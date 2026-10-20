create table public.consiglieri (
  id uuid primary key default gen_random_uuid(),
  soggetto_id uuid references public.soggetti (id),
  utente_id uuid unique references auth.users (id) on delete set null,
  carica text,
  parte_rappresentata text,
  inizio_mandato date,
  fine_mandato date
);

create table public.assemblee (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo text not null check (tipo in ('ordinaria', 'straordinaria')),
  convocazione text not null default 'seconda' check (convocazione in ('prima', 'seconda')),
  luogo text,
  ora_apertura timestamptz,
  ora_appello timestamptz,
  ora_chiusura timestamptz,
  stato text not null default 'bozza' check (stato in ('bozza', 'in_corso', 'chiusa')),
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

-- Teste congelate all'apertura della seduta: non cambiano se dopo cambia un proprietario.
create table public.teste_assemblea (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  chiave text not null,
  etichetta text not null,
  soggetti uuid[] not null,
  unita uuid[] not null,
  unique (assemblea_id, chiave)
);

create table public.punti_odg (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  ordine integer not null,
  testo text not null,
  tabella_id uuid references public.tabelle_millesimali (id),
  maggioranza text check (maggioranza in ('terzo', 'meta', 'due_terzi', 'unanimita')),
  -- chiusura della votazione: fotografa i presenti; chi arriva dopo è assente a questo punto
  votato_il timestamptz,
  presenti_al_voto jsonb,
  esito jsonb,
  note text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  unique (assemblea_id, ordine)
);

create table public.presenze (
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  testa_id uuid not null references public.teste_assemblea (id) on delete cascade,
  stato text not null default 'assente' check (stato in ('assente', 'presente')),
  ora_ingresso timestamptz,
  ora_uscita timestamptz,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  primary key (assemblea_id, testa_id)
);

create table public.deleghe (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  delegante_testa_id uuid not null references public.teste_assemblea (id) on delete cascade,
  delegato_testa_id uuid references public.teste_assemblea (id),
  delegato_esterno text,
  amministratore boolean not null default false,
  nota text,
  scansione_path text,
  -- da quando la delega conta: chi è delegato dopo una votazione risulta assente a quella
  ora_registrazione timestamptz not null default now(),
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  unique (assemblea_id, delegante_testa_id),
  check (delegato_testa_id is not null or delegato_esterno is not null),
  check (delegato_testa_id is distinct from delegante_testa_id)
);

create table public.voti (
  punto_id uuid not null references public.punti_odg (id) on delete cascade,
  testa_id uuid not null references public.teste_assemblea (id) on delete cascade,
  voto text not null check (voto in ('favorevole', 'contrario', 'astenuto')),
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz,
  primary key (punto_id, testa_id)
);

create table public.verbali (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  file_path text,
  testo text,
  stato text not null default 'bozza' check (stato in ('bozza', 'definitivo')),
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

create table public.todo (
  id uuid primary key default gen_random_uuid(),
  descrizione text not null,
  assemblea_id uuid references public.assemblee (id) on delete set null,
  punto_id uuid references public.punti_odg (id) on delete set null,
  responsabile_id uuid references public.consiglieri (id) on delete set null,
  scadenza date,
  stato text not null default 'aperto' check (stato in ('aperto', 'in_corso', 'chiuso')),
  note text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

-- Fase 2 (audio → bozza di verbale): create vuote per non dover migrare dopo.
create table public.registrazioni (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  file_path text not null,
  durata_secondi integer,
  trascrizione text,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);

create table public.bozze_verbale (
  id uuid primary key default gen_random_uuid(),
  assemblea_id uuid not null references public.assemblee (id) on delete cascade,
  testo text not null,
  creato_da uuid, creato_il timestamptz, modificato_da uuid, modificato_il timestamptz
);
