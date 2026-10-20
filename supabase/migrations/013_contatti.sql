-- Contatti di condomini, consiglieri e amministratore. Il consigliere è una persona: quando la sua unità è intestata
-- a più persone (soggetto "ROSSI MARIO - BIANCHI ANNA") il suo nome sta in `nominativo`, il soggetto resta la titolarità.
alter table public.soggetti add column cellulare text;
alter table public.consiglieri
  add column nominativo text, add column email text, add column telefono text, add column cellulare text;
alter table public.amministratori
  add column email text, add column telefono text, add column cellulare text, add column partita_iva text, add column iban text;
