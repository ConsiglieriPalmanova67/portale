-- Supabase concede EXECUTE ad anon con i privilegi predefiniti: il revoke da public non basta.
revoke execute on function public.is_consigliere() from anon;

-- Percorso di ricerca fisso anche per la funzione di audit.
alter function public.imposta_audit() set search_path = public;
