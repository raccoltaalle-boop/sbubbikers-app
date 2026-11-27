-- =====================================================================
--  Fonti delle gare: pagine web con i calendari che interessano.
--  Visibili e modificabili solo dal superadmin. Eseguire una volta nel SQL Editor.
-- =====================================================================
create table if not exists public.fonti_gare (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null check (length(nome) between 1 and 80),
  url              text not null check (url ~* '^https?://' and length(url) <= 500),
  categoria        text not null default 'varie' check (categoria in ('strada','mtb','gravel','varie')),
  note             text check (note is null or length(note) <= 500),
  ultimo_controllo timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.fonti_gare enable row level security;
drop policy if exists fonti_super on public.fonti_gare;
create policy fonti_super on public.fonti_gare for all
  using (public.is_superadmin()) with check (public.is_superadmin());
revoke all on public.fonti_gare from anon;
grant select, insert, update, delete on public.fonti_gare to authenticated;

insert into public.fonti_gare (nome, url, categoria, note)
select 'Pianeta Mountain Bike', 'https://www.pianetamountainbike.it/calendario-gare-mtb', 'mtb', 'Calendario nazionale MTB, filtrabile per regione'
where not exists (select 1 from public.fonti_gare);
