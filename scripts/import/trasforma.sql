-- Dalle righe di appoggio (appoggio.righe, caricate con prepara_carico.js) alle tabelle definitive.
-- Da eseguire una sola volta su un database con le tabelle public vuote.

insert into public.unita (codice)
select riga from appoggio.righe where tabella = 'unita' order by n;

insert into public.soggetti (denominazione, note)
select split_part(riga, '|', 2), nullif(split_part(riga, '|', 3), '')
from appoggio.righe where tabella = 'soggetti' order by n;

create table appoggio.sog as
select split_part(r.riga, '|', 1) as codice, s.id
from appoggio.righe r join public.soggetti s on s.denominazione = split_part(r.riga, '|', 2)
where r.tabella = 'soggetti';

insert into public.titolarita (unita_id, soggetto_id, ruolo, dal, al)
select u.id, sg.id, split_part(r.riga, '|', 3),
       nullif(split_part(r.riga, '|', 4), '')::date, nullif(split_part(r.riga, '|', 5), '')::date
from appoggio.righe r
join public.unita u on u.codice = split_part(r.riga, '|', 1)
join appoggio.sog sg on sg.codice = split_part(r.riga, '|', 2)
where r.tabella = 'titolarita' order by r.n;

insert into public.tabelle_millesimali (nome, ambito, totale_dichiarato)
select split_part(riga, '|', 2), split_part(riga, '|', 3), split_part(riga, '|', 4)::numeric
from appoggio.righe where tabella = 'tabelle' order by n;

create table appoggio.tab as
select split_part(r.riga, '|', 1) as chiave, t.id
from appoggio.righe r join public.tabelle_millesimali t on t.nome = split_part(r.riga, '|', 2)
where r.tabella = 'tabelle';

insert into public.millesimi (unita_id, tabella_id, valore)
select u.id, t.id, split_part(r.riga, '|', 3)::numeric
from appoggio.righe r
join public.unita u on u.codice = split_part(r.riga, '|', 1)
join appoggio.tab t on t.chiave = split_part(r.riga, '|', 2)
where r.tabella = 'millesimi';

insert into public.esercizi (anno, tipo, inizio, fine) values
  (2024, 'consuntivo', '2024-01-01', '2024-12-31'),
  (2025, 'preventivo', '2025-01-01', '2025-12-31');

insert into public.conti (gruppo, sottoconto, tabella_id)
select split_part(r.riga, '|', 2), split_part(r.riga, '|', 3), t.id
from appoggio.righe r left join appoggio.tab t on t.chiave = split_part(r.riga, '|', 4)
where r.tabella = 'conti' order by r.n;

create table appoggio.con as
select split_part(r.riga, '|', 1) as indice, c.id
from appoggio.righe r
join public.conti c on c.gruppo = split_part(r.riga, '|', 2) and c.sottoconto = split_part(r.riga, '|', 3)
where r.tabella = 'conti';

insert into public.fornitori (denominazione)
select riga from appoggio.righe where tabella = 'fornitori' order by n;

-- spese: 1 c/p, 2 conto, 3 protocollo, 4 fattura, 5 descrizione, 6 fornitore, 7 data fattura, 8 data pagamento, 9 importo
insert into public.spese (esercizio_id, conto_id, protocollo, descrizione, fornitore_id, numero_fattura, data_fattura, data_pagamento, importo)
select e.id, c.id, nullif(r.f[3], ''), r.f[5], fo.id, nullif(r.f[4], ''),
       nullif(r.f[7], '')::date, nullif(r.f[8], '')::date, r.f[9]::numeric
from (select n, string_to_array(riga, '|') as f from appoggio.righe where tabella = 'spese') r
join public.esercizi e on e.tipo = case r.f[1] when 'c' then 'consuntivo' else 'preventivo' end
join appoggio.con c on c.indice = r.f[2]
left join public.fornitori fo on fo.denominazione = r.f[6]
order by r.n;

-- posizioni: 1 unità, 2 soggetto, 3 ruolo, 4-7 consuntivo 2024 (gestione, saldo prec., rate versate, saldo finale),
--            8-10 preventivo 2025 (gestione, saldo prec., totale), 11-14 rate 2025
create table appoggio.pos as
select r.n, u.id as unita_id, sg.id as soggetto_id, r.f
from (select n, string_to_array(riga, '|') as f from appoggio.righe where tabella = 'posizioni') r
join public.unita u on u.codice = r.f[1]
join appoggio.sog sg on sg.codice = r.f[2];

insert into public.posizioni (unita_id, esercizio_id, soggetto_id, ruolo, totale_gestione, saldo_precedente, rate_versate, saldo_finale)
select p.unita_id, e.id, p.soggetto_id, p.f[3],
       nullif(p.f[4], '')::numeric, nullif(p.f[5], '')::numeric, nullif(p.f[6], '')::numeric, nullif(p.f[7], '')::numeric
from appoggio.pos p join public.esercizi e on e.anno = 2024 order by p.n;

insert into public.posizioni (unita_id, esercizio_id, soggetto_id, ruolo, totale_gestione, saldo_precedente, rate_versate, saldo_finale)
select p.unita_id, e.id, p.soggetto_id, p.f[3],
       nullif(p.f[8], '')::numeric, nullif(p.f[9], '')::numeric, null, nullif(p.f[10], '')::numeric
from appoggio.pos p join public.esercizi e on e.anno = 2025 order by p.n;

insert into public.rate (posizione_id, numero, scadenza, importo)
select po.id, x.numero, x.scadenza, nullif(p.f[10 + x.numero], '')::numeric
from appoggio.pos p
join public.esercizi e on e.anno = 2025
join public.posizioni po on po.unita_id = p.unita_id and po.soggetto_id = p.soggetto_id and po.ruolo = p.f[3] and po.esercizio_id = e.id
cross join (values (1, date '2025-01-20'), (2, date '2025-04-22'), (3, date '2025-07-10'), (4, date '2025-10-10')) as x(numero, scadenza);
