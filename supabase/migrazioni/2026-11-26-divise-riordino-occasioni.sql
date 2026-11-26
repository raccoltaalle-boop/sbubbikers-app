-- =====================================================================
--  Divise: taglie esaurite prenotabili come "richiesta di riordino"
--  e capi in "Occasioni". Eseguire una volta nel SQL Editor.
-- =====================================================================

alter table public.capi add column if not exists occasione boolean not null default false;
-- true = la prenotazione ha scalato pezzi dal magazzino (da restituire se annullata)
alter table public.prenotazioni add column if not exists scalato boolean not null default false;
update public.prenotazioni p set scalato = true
  from public.capi c where c.id = p.capo_id and c.modalita = 'magazzino' and p.stato <> 'attesa';

create or replace function public.prenota_capo(p_capo uuid, p_taglia text, p_qta int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_socio uuid := public.socio_corrente(); v_capo public.capi; v_disp int; v_id uuid;
begin
  if v_socio is null then raise exception 'Accesso non valido'; end if;
  if p_qta is null or p_qta < 1 or p_qta > 10 then raise exception 'Quantità non valida'; end if;
  select * into v_capo from public.capi where id = p_capo and attivo;
  if not found then raise exception 'Capo non disponibile'; end if;
  select disp into v_disp from public.capi_taglie where capo_id = p_capo and taglia = p_taglia for update;
  if not found then raise exception 'Taglia non valida'; end if;

  if v_capo.modalita = 'ordine' then
    if v_capo.scadenza is not null and v_capo.scadenza < now() then raise exception 'Ordine chiuso'; end if;
    insert into public.prenotazioni (capo_id, socio_id, taglia, qta, stato)
    values (p_capo, v_socio, p_taglia, p_qta, 'attesa') returning id into v_id;
  elsif coalesce(v_disp, 0) >= p_qta then
    -- pezzi disponibili: si scalano subito
    update public.capi_taglie set disp = disp - p_qta where capo_id = p_capo and taglia = p_taglia;
    insert into public.prenotazioni (capo_id, socio_id, taglia, qta, stato, scalato)
    values (p_capo, v_socio, p_taglia, p_qta, 'confermata', true) returning id into v_id;
  elsif coalesce(v_disp, 0) = 0 then
    -- taglia esaurita: richiesta per il prossimo riordino, nessun pezzo scalato
    insert into public.prenotazioni (capo_id, socio_id, taglia, qta, stato, scalato)
    values (p_capo, v_socio, p_taglia, p_qta, 'attesa', false) returning id into v_id;
  else
    raise exception 'Taglia %: disponibili solo % pezzi', p_taglia, v_disp;
  end if;
  return v_id;
end $$;

create or replace function public.annulla_prenotazione(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p public.prenotazioni;
begin
  select * into v_p from public.prenotazioni where id = p_id for update;
  if not found then raise exception 'Prenotazione inesistente'; end if;
  if v_p.stato = 'annullata' then return; end if;
  if not public.is_admin() then
    if v_p.socio_id is distinct from public.socio_corrente() then raise exception 'Permesso negato'; end if;
    if v_p.stato not in ('attesa','confermata') then raise exception 'Non più annullabile: contatta un admin'; end if;
  end if;
  if v_p.scalato and v_p.stato <> 'consegnata' then
    update public.capi_taglie set disp = coalesce(disp, 0) + v_p.qta where capo_id = v_p.capo_id and taglia = v_p.taglia;
  end if;
  update public.prenotazioni set stato = 'annullata' where id = p_id;
end $$;
