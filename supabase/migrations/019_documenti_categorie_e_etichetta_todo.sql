-- Menu per macrotemi. Documenti: due tipi nuovi per le sezioni «Regolamento» e «Comunicazioni».
alter table public.documenti drop constraint if exists documenti_tipo_check;
alter table public.documenti add constraint documenti_tipo_check
  check (tipo in ('rendiconto', 'preventivo', 'riparto', 'verbale', 'convocazione', 'regolamento', 'comunicazione', 'altro'));

-- Punti aperti (to-do): etichetta «segnalazione» o «deliberato». Vuota = la si ricava dal collegamento:
-- un to-do collegato a un'assemblea è «deliberato», gli altri sono segnalazioni.
alter table public.todo add column if not exists etichetta text check (etichetta in ('segnalazione', 'deliberato'));
