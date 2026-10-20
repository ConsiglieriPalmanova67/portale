-- Nuovo tipo di maggioranza: unanimità dei presenti (accanto all'unanimità di tutti i condomini).
alter table public.punti_odg drop constraint punti_odg_maggioranza_check;
alter table public.punti_odg add constraint punti_odg_maggioranza_check
  check (maggioranza in ('terzo', 'meta', 'due_terzi', 'unanimita', 'unanimita_presenti'));
