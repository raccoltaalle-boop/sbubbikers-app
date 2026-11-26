-- Storico delle prenotazioni annullate: chi e quando. L'admin le può eliminare definitivamente.
alter table public.prenotazioni add column if not exists annullata_at timestamptz;
alter table public.prenotazioni add column if not exists annullata_da uuid references public.soci(id) on delete set null;

create or replace function public.annulla_prenotazione(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p public.prenotazioni;
begin
  select * into v_p from public.prenotazioni where id = p_id for update;
  if not found then raise exception 'Prenotazione inesistente'; end if;
  if v_p.stato = 'annullata' then return; end if;
  if not public.is_admin() then
    if v_p.socio_id is distinct from public.socio_corrente() then raise exception 'Permesso negato'; end if;
    if v_p.stato = 'consegnata' then raise exception 'Capo già consegnato: contatta un admin'; end if;
  end if;
  if v_p.scalato and v_p.stato <> 'consegnata' then
    update public.capi_taglie set disp = coalesce(disp, 0) + v_p.qta where capo_id = v_p.capo_id and taglia = v_p.taglia;
  end if;
  update public.prenotazioni
     set stato = 'annullata', annullata_at = now(), annullata_da = public.socio_corrente()
   where id = p_id;
end $$;

-- Eliminazione definitiva: solo admin e solo prenotazioni già annullate
grant delete on public.prenotazioni to authenticated;
drop policy if exists pren_del on public.prenotazioni;
create policy pren_del on public.prenotazioni for delete using (public.is_admin() and stato = 'annullata');
