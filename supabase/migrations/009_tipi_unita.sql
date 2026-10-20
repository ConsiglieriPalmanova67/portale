-- Il riparto 2025 riporta il tipo di ogni unità: oltre a quelli previsti ci sono posti auto, terrazzi, giardini, uffici e depositi.
alter table public.unita drop constraint unita_tipo_check;
alter table public.unita add constraint unita_tipo_check
  check (tipo in ('appartamento', 'box', 'posto auto', 'cantina', 'negozio', 'ufficio', 'terrazzo', 'giardino', 'deposito', 'altro'));
