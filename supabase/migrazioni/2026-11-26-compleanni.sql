-- =====================================================================
--  Compleanni: data di nascita dei soci, visibile agli altri SOLO come
--  giorno e mese (mai l'anno). Eseguire una volta nel SQL Editor.
-- =====================================================================

alter table public.soci add column if not exists data_nascita date;

-- La colonna data_nascita non è leggibile direttamente dall'app:
-- i soci vedono solo le colonne elencate qui sotto.
revoke select on public.soci from authenticated;
grant select (id, nome, cognome, ruolo, attivo, created_at) on public.soci to authenticated;
revoke update on public.soci from authenticated;
grant update (nome, cognome, ruolo, attivo) on public.soci to authenticated;   -- filtrato da RLS (solo admin)

-- Compleanni dei prossimi N giorni (oggi compreso): solo nome, giorno e mese
create or replace function public.compleanni(p_giorni int default 7)
returns table (socio_id uuid, nome text, cognome text, giorno int, mese int, tra_giorni int)
language sql stable security definer set search_path = public as $$
  with oggi as (select (now() at time zone 'Europe/Rome')::date as d),
  prossimi as (
    select s.id, s.nome, s.cognome,
           extract(day from s.data_nascita)::int as g, extract(month from s.data_nascita)::int as m,
           -- prossima ricorrenza (il 29/2 negli anni non bisestili diventa 28/2)
           (select min(x) from (
              select make_date(extract(year from o.d)::int + k, extract(month from s.data_nascita)::int,
                     least(extract(day from s.data_nascita)::int,
                           extract(day from (make_date(extract(year from o.d)::int + k, extract(month from s.data_nascita)::int, 1)
                                             + interval '1 month - 1 day'))::int)) as x
              from generate_series(0, 1) k) t where x >= o.d) as prossimo,
           o.d as oggi
    from public.soci s, oggi o
    where s.attivo and s.data_nascita is not null
  )
  select id, nome, cognome, g, m, (prossimo - oggi)::int
  from prossimi
  where public.socio_corrente() is not null
    and prossimo - oggi between 0 and greatest(0, least(p_giorni, 60))
  order by prossimo, cognome
$$;
grant execute on function public.compleanni(int) to authenticated;
