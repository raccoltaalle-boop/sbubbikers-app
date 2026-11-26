-- =====================================================================
--  Ruolo SUPERADMIN (protetto) e registro degli accessi all'app.
--  Eseguire una volta nel SQL Editor.
-- =====================================================================

-- 1) nuovo ruolo
alter table public.soci drop constraint if exists soci_ruolo_check;
alter table public.soci add constraint soci_ruolo_check check (ruolo in ('socio','admin','superadmin'));

-- il superadmin ha anche tutti i poteri dell'admin
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dispositivi d join public.soci s on s.id = d.socio_id
    where d.user_id = auth.uid() and s.attivo and s.ruolo in ('admin','superadmin'))
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dispositivi d join public.soci s on s.id = d.socio_id
    where d.user_id = auth.uid() and s.attivo and s.ruolo = 'superadmin')
$$;
grant execute on function public.is_superadmin() to authenticated;

-- 2) protezione: solo il superadmin tocca il ruolo superadmin; nessuno disattiva il superadmin
create or replace function public.protegge_superadmin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor / service role: consentito
  if (old.ruolo = 'superadmin' or new.ruolo = 'superadmin') and new.ruolo is distinct from old.ruolo
     and not public.is_superadmin() then
    raise exception 'Solo il superadmin può assegnare o togliere il ruolo superadmin';
  end if;
  if old.ruolo = 'superadmin' and new.attivo = false and old.attivo = true then
    raise exception 'Il superadmin non può essere disattivato dall''app';
  end if;
  return new;
end $$;
drop trigger if exists soci_protegge_superadmin on public.soci;
create trigger soci_protegge_superadmin before update on public.soci
  for each row execute function public.protegge_superadmin();

create or replace function public.admin_reset_invito(p_socio uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod text;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  if exists (select 1 from public.soci where id = p_socio and ruolo = 'superadmin') and not public.is_superadmin() then
    raise exception 'Il codice del superadmin può rigenerarlo solo lui';
  end if;
  delete from public.dispositivi where socio_id = p_socio and user_id <> auth.uid();
  v_cod := public.nuovo_codice();
  insert into public.inviti (socio_id, codice) values (p_socio, v_cod)
  on conflict (socio_id) do update set codice = excluded.codice, created_at = now();
  return v_cod;
end $$;

-- 3) registro accessi (data, ora, tipo di dispositivo) — conservato 6 mesi
create table if not exists public.accessi (
  id          bigserial primary key,
  socio_id    uuid not null references public.soci(id) on delete cascade,
  user_id     uuid,
  dispositivo text,
  at          timestamptz not null default now()
);
create index if not exists accessi_socio_at_idx on public.accessi (socio_id, at desc);
alter table public.accessi enable row level security;
drop policy if exists accessi_sel on public.accessi;
create policy accessi_sel on public.accessi for select using (public.is_superadmin());
revoke all on public.accessi from anon, authenticated;
grant select on public.accessi to authenticated;   -- filtrato da RLS (solo superadmin)

-- chiamata dall'app all'apertura: al massimo una riga ogni 30 minuti per dispositivo
create or replace function public.registra_accesso()
returns void language plpgsql security definer set search_path = public as $$
declare v_socio uuid := public.socio_corrente(); v_disp text;
begin
  if v_socio is null then return; end if;
  if exists (select 1 from public.accessi where user_id = auth.uid() and at > now() - interval '30 minutes') then return; end if;
  select descrizione into v_disp from public.dispositivi where user_id = auth.uid();
  insert into public.accessi (socio_id, user_id, dispositivo) values (v_socio, auth.uid(), split_part(coalesce(v_disp, ''), ' · ', 1));
  delete from public.accessi where at < now() - interval '6 months';
end $$;
grant execute on function public.registra_accesso() to authenticated;

-- riepilogo per socio (solo superadmin)
create or replace function public.riepilogo_accessi()
returns table (socio_id uuid, nome text, cognome text, ruolo text, attivo boolean,
               n_dispositivi int, ultimo_accesso timestamptz, accessi_7g int, accessi_30g int)
language sql stable security definer set search_path = public as $$
  select s.id, s.nome, s.cognome, s.ruolo, s.attivo,
         (select count(*)::int from public.dispositivi d where d.socio_id = s.id),
         (select max(a.at) from public.accessi a where a.socio_id = s.id),
         (select count(*)::int from public.accessi a where a.socio_id = s.id and a.at > now() - interval '7 days'),
         (select count(*)::int from public.accessi a where a.socio_id = s.id and a.at > now() - interval '30 days')
  from public.soci s
  where public.is_superadmin()
  order by s.cognome, s.nome
$$;
grant execute on function public.riepilogo_accessi() to authenticated;
