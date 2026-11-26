-- =====================================================================
--  SBUBBIKERS APP — schema database (Supabase / Postgres)
--  Incollare TUTTO nel SQL Editor di Supabase ed eseguire UNA volta
--  su un progetto nuovo (rieseguirlo darebbe errore sulle policy già create).
-- =====================================================================

-- ---------- TABELLE ----------------------------------------------------

create table if not exists public.soci (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cognome     text not null,
  ruolo       text not null default 'socio' check (ruolo in ('socio','admin')),
  attivo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Codici invito: tabella separata, leggibile SOLO dagli admin
create table if not exists public.inviti (
  socio_id        uuid primary key references public.soci(id) on delete cascade,
  codice          text not null unique,
  max_dispositivi int  not null default 3,
  created_at      timestamptz not null default now()
);

-- Ogni dispositivo (telefono, PC...) = un utente anonimo Supabase collegato a un socio
create table if not exists public.dispositivi (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  socio_id    uuid not null references public.soci(id) on delete cascade,
  descrizione text,
  created_at  timestamptz not null default now()
);

create table if not exists public.tipi_bici (
  id      serial primary key,
  nome    text not null unique,
  emoji   text not null default '🚴',
  ordine  int  not null default 0
);

create table if not exists public.luoghi (
  id         serial primary key,
  nome       text not null unique,
  link_mappa text,
  ordine     int not null default 100,
  creato_da  uuid references public.soci(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.uscite (
  id             uuid primary key default gen_random_uuid(),
  socio_id       uuid not null references public.soci(id) on delete cascade,
  tipo_bici_id   int  not null references public.tipi_bici(id),
  luogo_id       int  not null references public.luoghi(id),
  data_ora       timestamptz not null,
  km             int  check (km is null or km between 1 and 1000),
  dislivello     int  check (dislivello is null or dislivello between 0 and 10000),
  andatura       text check (andatura is null or andatura in ('tranquilla','media','sostenuta')),
  note           text check (note is null or length(note) <= 500),
  link_percorso  text,
  annullata      boolean not null default false,
  tg_message_id  bigint,
  created_at     timestamptz not null default now()
);
create index if not exists uscite_data_idx on public.uscite (data_ora);

create table if not exists public.partecipanti (
  uscita_id  uuid not null references public.uscite(id) on delete cascade,
  socio_id   uuid not null references public.soci(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (uscita_id, socio_id)
);

create table if not exists public.avvisi (
  id                uuid primary key default gen_random_uuid(),
  titolo            text not null,
  testo             text not null,
  autore_id         uuid references public.soci(id) on delete set null,
  pubblica_telegram boolean not null default true,
  tg_message_id     bigint,
  created_at        timestamptz not null default now()
);

create table if not exists public.convenzioni (
  id             uuid primary key default gen_random_uuid(),
  negozio        text not null,
  categoria      text,
  sconto         text not null,
  descrizione    text,
  come_ottenerlo text,
  indirizzo      text,
  link           text,
  scadenza       date,
  attiva         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---------- DIVISE ------------------------------------------------------

create table if not exists public.capi (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  tipo        text not null default 'maglia' check (tipo in ('maglia','smanicato','giacca','salopette','calze','altro')),
  c1          text not null default '#14171c',   -- colore principale (per il disegno se manca la foto)
  c2          text not null default '#ff5a1f',   -- colore secondario
  prezzo      numeric(8,2) not null check (prezzo >= 0),
  descrizione text,
  modalita    text not null check (modalita in ('magazzino','ordine')),
  scadenza    timestamptz,                       -- chiusura ordine collettivo
  foto_url    text,
  attivo      boolean not null default true,
  ordine      int not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists public.capi_taglie (
  capo_id uuid not null references public.capi(id) on delete cascade,
  taglia  text not null,
  disp    int check (disp is null or disp >= 0),  -- pezzi in magazzino (null = su ordinazione)
  ordine  int not null default 0,
  primary key (capo_id, taglia)
);

create table if not exists public.prenotazioni (
  id         uuid primary key default gen_random_uuid(),
  capo_id    uuid not null references public.capi(id) on delete cascade,
  socio_id   uuid not null references public.soci(id) on delete cascade,
  taglia     text not null,
  qta        int  not null check (qta between 1 and 10),
  stato      text not null default 'attesa' check (stato in ('attesa','confermata','pronta','consegnata','annullata')),
  pagato     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists prenotazioni_socio_idx on public.prenotazioni (socio_id);

-- ---------- FUNZIONI DI SUPPORTO --------------------------------------

-- Socio collegato al dispositivo corrente (null se non abilitato)
create or replace function public.socio_corrente()
returns uuid language sql stable security definer set search_path = public as $$
  select d.socio_id
  from public.dispositivi d join public.soci s on s.id = d.socio_id
  where d.user_id = auth.uid() and s.attivo
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dispositivi d join public.soci s on s.id = d.socio_id
    where d.user_id = auth.uid() and s.attivo and s.ruolo = 'admin'
  )
$$;

-- Riscatto invito: collega il dispositivo (utente anonimo) al socio
create or replace function public.riscatta_invito(p_codice text, p_descrizione text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_inv  public.inviti;
  v_soc  public.soci;
  v_cnt  int;
begin
  if auth.uid() is null then
    raise exception 'Sessione mancante';
  end if;

  select * into v_inv from public.inviti where codice = upper(trim(p_codice));
  if not found then
    perform pg_sleep(1);  -- rallenta tentativi a caso
    raise exception 'Codice non valido';
  end if;

  select * into v_soc from public.soci where id = v_inv.socio_id;
  if not v_soc.attivo then
    raise exception 'Accesso disattivato, contatta un admin';
  end if;

  -- già collegato?
  if exists (select 1 from public.dispositivi where user_id = auth.uid() and socio_id = v_soc.id) then
    return json_build_object('nome', v_soc.nome, 'cognome', v_soc.cognome);
  end if;

  select count(*) into v_cnt from public.dispositivi where socio_id = v_soc.id;
  if v_cnt >= v_inv.max_dispositivi then
    raise exception 'Raggiunto il numero massimo di dispositivi (%). Chiedi a un admin di azzerarli.', v_inv.max_dispositivi;
  end if;

  insert into public.dispositivi (user_id, socio_id, descrizione)
  values (auth.uid(), v_soc.id, left(p_descrizione, 200))
  on conflict (user_id) do update set socio_id = excluded.socio_id;

  return json_build_object('nome', v_soc.nome, 'cognome', v_soc.cognome);
end $$;

-- Genera codice leggibile (niente 0/O/1/I)
create or replace function public.nuovo_codice()
returns text language plpgsql as $$
declare
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.inviti where codice = c);
  end loop;
  return c;
end $$;

-- ADMIN: crea socio + invito in un colpo solo
create or replace function public.admin_crea_socio(p_nome text, p_cognome text, p_admin boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  insert into public.soci (nome, cognome, ruolo)
  values (trim(p_nome), trim(p_cognome), case when p_admin then 'admin' else 'socio' end)
  returning id into v_id;
  v_cod := public.nuovo_codice();
  insert into public.inviti (socio_id, codice) values (v_id, v_cod);
  return json_build_object('id', v_id, 'codice', v_cod);
end $$;

-- ADMIN: nuovo codice + scollega tutti i dispositivi del socio
create or replace function public.admin_reset_invito(p_socio uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod text;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.dispositivi where socio_id = p_socio and user_id <> auth.uid();
  v_cod := public.nuovo_codice();
  insert into public.inviti (socio_id, codice) values (p_socio, v_cod)
  on conflict (socio_id) do update set codice = excluded.codice, created_at = now();
  return v_cod;
end $$;

-- Prenotazione divisa: controlla e scala il magazzino in modo atomico
create or replace function public.prenota_capo(p_capo uuid, p_taglia text, p_qta int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_socio uuid := public.socio_corrente(); v_capo public.capi; v_id uuid;
begin
  if v_socio is null then raise exception 'Accesso non valido'; end if;
  if p_qta is null or p_qta < 1 or p_qta > 10 then raise exception 'Quantità non valida'; end if;
  select * into v_capo from public.capi where id = p_capo and attivo;
  if not found then raise exception 'Capo non disponibile'; end if;
  if not exists (select 1 from public.capi_taglie where capo_id = p_capo and taglia = p_taglia) then
    raise exception 'Taglia non valida';
  end if;

  if v_capo.modalita = 'ordine' then
    if v_capo.scadenza is not null and v_capo.scadenza < now() then raise exception 'Ordine chiuso'; end if;
    insert into public.prenotazioni (capo_id, socio_id, taglia, qta, stato)
    values (p_capo, v_socio, p_taglia, p_qta, 'attesa') returning id into v_id;
  else
    update public.capi_taglie set disp = disp - p_qta
    where capo_id = p_capo and taglia = p_taglia and disp >= p_qta;
    if not found then raise exception 'Taglia %: pezzi non sufficienti', p_taglia; end if;
    insert into public.prenotazioni (capo_id, socio_id, taglia, qta, stato)
    values (p_capo, v_socio, p_taglia, p_qta, 'confermata') returning id into v_id;
  end if;
  return v_id;
end $$;

-- Annullamento: il socio finché non è pronta, l'admin sempre. Rimette i pezzi in magazzino.
create or replace function public.annulla_prenotazione(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p public.prenotazioni; v_mod text;
begin
  select * into v_p from public.prenotazioni where id = p_id for update;
  if not found then raise exception 'Prenotazione inesistente'; end if;
  if v_p.stato = 'annullata' then return; end if;
  if not public.is_admin() then
    if v_p.socio_id is distinct from public.socio_corrente() then raise exception 'Permesso negato'; end if;
    if v_p.stato not in ('attesa','confermata') then raise exception 'Non più annullabile: contatta un admin'; end if;
  end if;
  select modalita into v_mod from public.capi where id = v_p.capo_id;
  if v_mod = 'magazzino' and v_p.stato <> 'consegnata' then
    update public.capi_taglie set disp = coalesce(disp, 0) + v_p.qta where capo_id = v_p.capo_id and taglia = v_p.taglia;
  end if;
  update public.prenotazioni set stato = 'annullata' where id = p_id;
end $$;

-- ---------- PERMESSI (Row Level Security) -----------------------------

alter table public.soci         enable row level security;
alter table public.inviti       enable row level security;
alter table public.dispositivi  enable row level security;
alter table public.tipi_bici    enable row level security;
alter table public.luoghi       enable row level security;
alter table public.uscite       enable row level security;
alter table public.partecipanti enable row level security;
alter table public.avvisi       enable row level security;
alter table public.convenzioni  enable row level security;
alter table public.capi         enable row level security;
alter table public.capi_taglie  enable row level security;
alter table public.prenotazioni enable row level security;

-- Divise: catalogo visibile ai soci, gestito dagli admin
create policy capi_sel on public.capi for select using (public.socio_corrente() is not null);
create policy capi_adm on public.capi for all using (public.is_admin()) with check (public.is_admin());
create policy taglie_sel on public.capi_taglie for select using (public.socio_corrente() is not null);
create policy taglie_adm on public.capi_taglie for all using (public.is_admin()) with check (public.is_admin());
-- Prenotazioni: ognuno vede le proprie, l'admin tutte; si creano/annullano solo via funzioni
create policy pren_sel on public.prenotazioni for select using (socio_id = public.socio_corrente() or public.is_admin());
create policy pren_upd on public.prenotazioni for update using (public.is_admin()) with check (public.is_admin());

-- Soci: tutti i soci abilitati vedono nomi; solo admin modifica
create policy soci_sel on public.soci for select using (public.socio_corrente() is not null);
create policy soci_adm on public.soci for update using (public.is_admin()) with check (public.is_admin());
create policy soci_del on public.soci for delete using (public.is_admin());

-- Inviti: solo admin
create policy inviti_adm on public.inviti for select using (public.is_admin());

-- Dispositivi: ognuno vede i propri, admin tutti
create policy disp_sel on public.dispositivi for select using (user_id = auth.uid() or public.is_admin());
create policy disp_del on public.dispositivi for delete using (user_id = auth.uid() or public.is_admin());

-- Tipi bici: lettura soci, scrittura admin
create policy tipi_sel on public.tipi_bici for select using (public.socio_corrente() is not null);
create policy tipi_adm on public.tipi_bici for all using (public.is_admin()) with check (public.is_admin());

-- Luoghi: lettura soci; inserimento da qualsiasi socio; modifica/cancellazione admin
create policy luoghi_sel on public.luoghi for select using (public.socio_corrente() is not null);
create policy luoghi_ins on public.luoghi for insert with check (creato_da = public.socio_corrente());
create policy luoghi_upd on public.luoghi for update using (public.is_admin()) with check (public.is_admin());
create policy luoghi_del on public.luoghi for delete using (public.is_admin());

-- Uscite: lettura soci; inserimento proprio; modifica/annulla autore o admin
create policy uscite_sel on public.uscite for select using (public.socio_corrente() is not null);
create policy uscite_ins on public.uscite for insert with check (socio_id = public.socio_corrente());
create policy uscite_upd on public.uscite for update
  using (socio_id = public.socio_corrente() or public.is_admin())
  with check (socio_id = public.socio_corrente() or public.is_admin());
create policy uscite_del on public.uscite for delete using (socio_id = public.socio_corrente() or public.is_admin());

-- Partecipanti: lettura soci; ognuno aggiunge/toglie solo se stesso
create policy part_sel on public.partecipanti for select using (public.socio_corrente() is not null);
create policy part_ins on public.partecipanti for insert with check (socio_id = public.socio_corrente());
create policy part_del on public.partecipanti for delete using (socio_id = public.socio_corrente());

-- Avvisi e convenzioni: lettura soci, scrittura admin
create policy avvisi_sel on public.avvisi for select using (public.socio_corrente() is not null);
create policy avvisi_adm on public.avvisi for all using (public.is_admin()) with check (public.is_admin());
create policy conv_sel on public.convenzioni for select using (public.socio_corrente() is not null);
create policy conv_adm on public.convenzioni for all using (public.is_admin()) with check (public.is_admin());

-- ---------- GRANT (necessari sui progetti Supabase recenti) -------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- tg_message_id lo scrive solo il bot (service role): l'app aggiorna solo questi campi
revoke update on public.uscite, public.avvisi from authenticated;
grant update (tipo_bici_id, luogo_id, data_ora, km, dislivello, andatura, note, link_percorso, annullata)
  on public.uscite to authenticated;
grant update (titolo, testo, pubblica_telegram) on public.avvisi to authenticated;
revoke all on public.inviti from authenticated;
grant select on public.inviti to authenticated;          -- filtrato da RLS (solo admin)
revoke insert, update on public.dispositivi from authenticated; -- solo via riscatta_invito
grant execute on function public.riscatta_invito(text, text)   to authenticated;
grant execute on function public.admin_crea_socio(text, text, boolean) to authenticated;
grant execute on function public.admin_reset_invito(uuid)      to authenticated;
grant execute on function public.socio_corrente() to authenticated;
grant execute on function public.is_admin()       to authenticated;
revoke execute on function public.nuovo_codice() from public, anon, authenticated;
revoke insert, delete on public.prenotazioni from authenticated;   -- solo via prenota_capo / annulla_prenotazione
revoke update on public.prenotazioni from authenticated;
grant update (stato, pagato) on public.prenotazioni to authenticated;  -- filtrato da RLS (solo admin)
grant execute on function public.prenota_capo(uuid, text, int)    to authenticated;
grant execute on function public.annulla_prenotazione(uuid)       to authenticated;

-- ---------- FOTO DELLE DIVISE (Supabase Storage) ------------------------
-- Cartella pubblica "divise": tutti vedono le foto, solo gli admin caricano.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('divise', 'divise', true) on conflict (id) do nothing;
    execute $p$create policy divise_foto_ins on storage.objects for insert to authenticated
      with check (bucket_id = 'divise' and public.is_admin())$p$;
    execute $p$create policy divise_foto_upd on storage.objects for update to authenticated
      using (bucket_id = 'divise' and public.is_admin())$p$;
    execute $p$create policy divise_foto_del on storage.objects for delete to authenticated
      using (bucket_id = 'divise' and public.is_admin())$p$;
  end if;
end $$;

-- Funzione pubblica per il controllo "tieni sveglio" del workflow GitHub (non legge dati)
create or replace function public.ping() returns int language sql stable as $$ select 1 $$;
grant execute on function public.ping() to anon, authenticated;

-- ---------- DATI INIZIALI (modificabili) --------------------------------

insert into public.tipi_bici (nome, emoji, ordine) values
  ('Strada', '🚴', 1),
  ('Gravel', '🪨', 2),
  ('MTB / E-bike', '🚵', 3)
on conflict (nome) do nothing;

-- ESEMPI: sostituire con i vostri luoghi abituali
insert into public.luoghi (nome, ordine) values
  ('Piazzale Kennedy – Rimini', 1),
  ('Arco d''Augusto – Rimini', 2),
  ('Stazione di Santarcangelo', 3),
  ('Ponte di Tiberio – Rimini', 4)
on conflict (nome) do nothing;

-- ---------- PRIMO ADMIN ------------------------------------------------
-- Esegui UNA volta, cambiando nome e cognome. Il codice d'invito apparirà nel risultato.
--
-- with s as (
--   insert into public.soci (nome, cognome, ruolo) values ('Alex', 'Cognome', 'admin') returning id
-- )
-- insert into public.inviti (socio_id, codice)
-- select id, public.nuovo_codice() from s
-- returning codice;
