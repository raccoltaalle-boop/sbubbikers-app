-- =====================================================================
--  Calendario gare curato dagli admin, con adesioni dei soci
--  ("Ci vado" / "Mi interessa"). Eseguire una volta nel SQL Editor.
-- =====================================================================

create table if not exists public.gare (
  id         uuid primary key default gen_random_uuid(),
  data       date not null,
  nome       text not null check (length(nome) <= 120),
  categoria  text not null check (categoria in ('strada','mtb','gravel')),
  tipo       text check (tipo is null or length(tipo) <= 40),      -- es. Ciclocross, XC, Marathon, Granfondo
  localita   text check (localita is null or length(localita) <= 80),
  provincia  text check (provincia is null or length(provincia) <= 4),
  regione    text check (regione is null or length(regione) <= 40),
  circuito   text check (circuito is null or length(circuito) <= 80),
  link       text check (link is null or link ~* '^https?://'),   -- pagina della fonte
  note       text check (note is null or length(note) <= 500),
  creato_da  uuid references public.soci(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists gare_data_idx on public.gare (data);

create table if not exists public.gare_adesioni (
  gara_id    uuid not null references public.gare(id) on delete cascade,
  socio_id   uuid not null references public.soci(id) on delete cascade,
  stato      text not null check (stato in ('vado','interessa')),
  created_at timestamptz not null default now(),
  primary key (gara_id, socio_id)
);

alter table public.gare          enable row level security;
alter table public.gare_adesioni enable row level security;

drop policy if exists gare_sel on public.gare;
drop policy if exists gare_adm on public.gare;
create policy gare_sel on public.gare for select using (public.socio_corrente() is not null);
create policy gare_adm on public.gare for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ades_sel on public.gare_adesioni;
drop policy if exists ades_ins on public.gare_adesioni;
drop policy if exists ades_upd on public.gare_adesioni;
drop policy if exists ades_del on public.gare_adesioni;
create policy ades_sel on public.gare_adesioni for select using (public.socio_corrente() is not null);
create policy ades_ins on public.gare_adesioni for insert with check (socio_id = public.socio_corrente());
create policy ades_upd on public.gare_adesioni for update using (socio_id = public.socio_corrente()) with check (socio_id = public.socio_corrente());
create policy ades_del on public.gare_adesioni for delete using (socio_id = public.socio_corrente());

grant select, insert, update, delete on public.gare, public.gare_adesioni to authenticated;
