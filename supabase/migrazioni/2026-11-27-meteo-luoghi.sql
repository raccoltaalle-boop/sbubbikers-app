-- =====================================================================
--  Meteo sulle uscite: coordinate dei luoghi di partenza.
--  Eseguire una volta nel SQL Editor.
-- =====================================================================
alter table public.luoghi add column if not exists lat double precision;
alter table public.luoghi add column if not exists lon double precision;
alter table public.luoghi drop constraint if exists luoghi_coord_check;
alter table public.luoghi add constraint luoghi_coord_check check (
  (lat is null and lon is null) or (lat between -90 and 90 and lon between -180 and 180));

-- Imposta le coordinate di un luogo.
-- Un socio qualsiasi può solo riempirle se mancano (le trova l'app in automatico);
-- un admin può sempre correggerle o cancellarle (p_lat/p_lon null).
create or replace function public.imposta_coordinate_luogo(p_id int, p_lat double precision, p_lon double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.socio_corrente() is null then raise exception 'Accesso non valido'; end if;
  if (p_lat is null) <> (p_lon is null) then raise exception 'Coordinate non valide'; end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lon not between -180 and 180) then
    raise exception 'Coordinate non valide';
  end if;
  if public.is_admin() then
    update public.luoghi set lat = p_lat, lon = p_lon where id = p_id;
  elsif p_lat is not null then
    update public.luoghi set lat = p_lat, lon = p_lon where id = p_id and lat is null;
  end if;
end $$;
revoke execute on function public.imposta_coordinate_luogo(int, double precision, double precision) from public, anon;
grant execute on function public.imposta_coordinate_luogo(int, double precision, double precision) to authenticated;
