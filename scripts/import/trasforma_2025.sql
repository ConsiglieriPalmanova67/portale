-- Fascicolo 2025: dalle righe di appoggio (prepara_carico_2025.js) alle tabelle definitive.
-- Da eseguire una sola volta, con l'anagrafica del 2024 già caricata.

insert into public.esercizi (anno, tipo, inizio, fine) values
  (2025, 'consuntivo', '2025-01-01', '2025-12-31'),
  (2026, 'preventivo', '2026-01-01', '2026-12-31');

-- Conti nuovi: la tabella millesimale è quella degli altri conti dello stesso gruppo.
insert into public.conti (gruppo, sottoconto, tabella_id)
select x.gruppo, x.sottoconto,
       coalesce((select c.tabella_id from public.conti c where c.gruppo = x.gruppo and c.tabella_id is not null limit 1),
                (select t.id from public.tabelle_millesimali t where x.gruppo ilike '%CONDOMINIO C' and t.nome = 'Condominio C'))
from (select split_part(riga, '|', 2) as gruppo, split_part(riga, '|', 3) as sottoconto, n from appoggio.righe where tabella = 'conti25') x
where not exists (select 1 from public.conti c where c.gruppo = x.gruppo and c.sottoconto = x.sottoconto)
order by x.n;

create table appoggio.con25 as
select split_part(r.riga, '|', 1) as indice, c.id
from appoggio.righe r
join public.conti c on c.gruppo = split_part(r.riga, '|', 2) and c.sottoconto = split_part(r.riga, '|', 3)
where r.tabella = 'conti25';

insert into public.fornitori (denominazione)
select distinct split_part(riga, '|', 6) from appoggio.righe
where tabella = 'spese25' and split_part(riga, '|', 6) <> ''
  and not exists (select 1 from public.fornitori f where f.denominazione = split_part(riga, '|', 6));

-- spese: 1 c/p, 2 conto, 3 protocollo, 4 fattura, 5 descrizione, 6 fornitore, 7 data fattura, 8 data pagamento, 9 importo
insert into public.spese (esercizio_id, conto_id, protocollo, descrizione, fornitore_id, numero_fattura, data_fattura, data_pagamento, importo)
select e.id, c.id, nullif(r.f[3], ''), r.f[5], fo.id, nullif(r.f[4], ''),
       nullif(r.f[7], '')::date, nullif(r.f[8], '')::date, r.f[9]::numeric
from (select n, string_to_array(riga, '|') as f from appoggio.righe where tabella = 'spese25') r
join public.esercizi e on (r.f[1] = 'c' and e.anno = 2025 and e.tipo = 'consuntivo') or (r.f[1] = 'p' and e.anno = 2026 and e.tipo = 'preventivo')
join appoggio.con25 c on c.indice = r.f[2]
left join public.fornitori fo on fo.denominazione = r.f[6]
order by r.n;

-- posizioni: 1 unità, 2 tipo, 3 intestatario stampato, 4 totale gestione, 5 saldo precedente, 6 rate versate, 7 saldo finale
create table appoggio.pos25 as
select r.n, u.id as unita_id, u.codice, r.f
from (select n, string_to_array(riga, '|') as f from appoggio.righe where tabella = 'posizioni25') r
join public.unita u on u.codice = r.f[1];

update public.unita u set tipo = p.f[2] from appoggio.pos25 p where p.unita_id = u.id;

-- Cambi di intestazione rispetto al 2024. Il fascicolo non riporta la data del passaggio:
-- si usa il 1° gennaio 2025 (data stimata, correggibile dal dettaglio dell'unità).
insert into public.soggetti (denominazione, note) values
  ('DI MARZIO / TERLINDO', null),
  ('DI MARZIO', 'nome troncato nel riparto 2025: verificare se coincide con DI MARZIO / TERLINDO'),
  ('EREDI PALMIERI', 'successione di PALMIERI BRUNA');

create table appoggio.cambi25 as
select u.id as unita_id, s.id as soggetto_id
from (values ('A4', 'DI MARZIO / TERLINDO'), ('A90', 'DE POLI ANDREA'), ('A125', 'POZZI ALESSANDRO'), ('A135', 'DI MARZIO'), ('A155', 'EREDI PALMIERI')) as v(codice, denominazione)
join public.unita u on u.codice = v.codice
join public.soggetti s on s.denominazione = v.denominazione;

update public.titolarita t set al = '2024-12-31'
from appoggio.cambi25 c
where t.unita_id = c.unita_id and t.ruolo = 'proprietario' and t.al is null;

insert into public.titolarita (unita_id, soggetto_id, ruolo, dal)
select unita_id, soggetto_id, 'proprietario', '2025-01-01' from appoggio.cambi25;

-- Nel riparto 2025 c'è una riga per unità, intestata al proprietario corrente.
insert into public.posizioni (unita_id, esercizio_id, soggetto_id, ruolo, totale_gestione, saldo_precedente, rate_versate, saldo_finale)
select p.unita_id, e.id, t.soggetto_id, 'proprietario', p.f[4]::numeric, p.f[5]::numeric, p.f[6]::numeric, p.f[7]::numeric
from appoggio.pos25 p
join public.esercizi e on e.anno = 2025 and e.tipo = 'consuntivo'
join public.titolarita t on t.unita_id = p.unita_id and t.ruolo = 'proprietario' and t.al is null
order by p.n;

insert into public.stato_patrimoniale (esercizio_id, lato, ordine, voce, importo)
select e.id, split_part(riga, '|', 1), split_part(riga, '|', 2)::integer, split_part(riga, '|', 3), split_part(riga, '|', 4)::numeric
from appoggio.righe r join public.esercizi e on e.anno = 2025 and e.tipo = 'consuntivo'
where r.tabella = 'patrimoniale25';

insert into public.partite_terzi (esercizio_id, tipo, controparte, protocollo, descrizione, importo)
select e.id, f[1], nullif(f[2], ''), nullif(f[3], ''), f[4], f[5]::numeric
from (select n, string_to_array(riga, '|') as f from appoggio.righe where tabella = 'partite25') r
join public.esercizi e on e.anno = 2025 and e.tipo = 'consuntivo'
order by r.n;
