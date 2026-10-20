-- Anagrafica
create table public.unita (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  tipo text check (tipo in ('appartamento', 'box', 'cantina', 'negozio', 'altro')),
  piano text,
  interno text,
  note text
);

create table public.soggetti (
  id uuid primary key default gen_random_uuid(),
  denominazione text not null,
  email text,
  telefono text,
  note text
);

create table public.titolarita (
  id uuid primary key default gen_random_uuid(),
  unita_id uuid not null references public.unita (id) on delete cascade,
  soggetto_id uuid not null references public.soggetti (id),
  ruolo text not null check (ruolo in ('proprietario', 'conduttore', 'assegnatario')),
  dal date,
  al date,
  check (dal is null or al is null or dal <= al)
);
create index titolarita_unita_idx on public.titolarita (unita_id);
create index titolarita_soggetto_idx on public.titolarita (soggetto_id);

-- Millesimi
create table public.tabelle_millesimali (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ambito text not null default 'condominio',
  totale_dichiarato numeric(10, 3)
);

create table public.millesimi (
  unita_id uuid not null references public.unita (id) on delete cascade,
  tabella_id uuid not null references public.tabelle_millesimali (id) on delete cascade,
  valore numeric(10, 3) not null check (valore >= 0),
  primary key (unita_id, tabella_id)
);

-- Contabilità (sola consultazione)
create table public.esercizi (
  id uuid primary key default gen_random_uuid(),
  anno integer not null,
  tipo text not null check (tipo in ('consuntivo', 'preventivo')),
  inizio date,
  fine date,
  unique (anno, tipo)
);

create table public.conti (
  id uuid primary key default gen_random_uuid(),
  gruppo text not null,
  sottoconto text not null,
  tabella_id uuid references public.tabelle_millesimali (id),
  unique (gruppo, sottoconto)
);

create table public.fornitori (
  id uuid primary key default gen_random_uuid(),
  denominazione text not null unique
);

create table public.spese (
  id uuid primary key default gen_random_uuid(),
  esercizio_id uuid not null references public.esercizi (id) on delete cascade,
  conto_id uuid not null references public.conti (id),
  protocollo text,
  descrizione text not null,
  fornitore_id uuid references public.fornitori (id),
  numero_fattura text,
  data_fattura date,
  data_pagamento date,
  importo numeric(12, 2) not null
);
create index spese_esercizio_conto_idx on public.spese (esercizio_id, conto_id);

create table public.posizioni (
  id uuid primary key default gen_random_uuid(),
  unita_id uuid not null references public.unita (id) on delete cascade,
  esercizio_id uuid not null references public.esercizi (id) on delete cascade,
  soggetto_id uuid not null references public.soggetti (id),
  totale_gestione numeric(12, 2),
  saldo_precedente numeric(12, 2),
  rate_versate numeric(12, 2),
  saldo_finale numeric(12, 2),
  unique (unita_id, esercizio_id, soggetto_id)
);

create table public.rate (
  posizione_id uuid not null references public.posizioni (id) on delete cascade,
  numero integer not null,
  scadenza date,
  importo numeric(12, 2) not null,
  primary key (posizione_id, numero)
);
