-- La votazione come scritta nel verbale (per le assemblee non votate nel portale).
alter table public.punti_odg add column voti_testo text;
update public.punti_odg p set voti_testo = nullif(trim(l.voti), '')
from (
  select (e.mappa->>'assemblea_id')::uuid assemblea_id, (x->>'ordine')::int ordine, x->>'voti' voti
  from public.estrazioni e join public.estrazioni_blocchi b on b.estrazione_id = e.id and b.sezione = 'verbale',
    jsonb_array_elements(b.dati->'punti') x
  where e.tipo = 'verbale' and e.stato = 'importata'
) l
where p.assemblea_id = l.assemblea_id and p.ordine = l.ordine and p.votato_il is null;
