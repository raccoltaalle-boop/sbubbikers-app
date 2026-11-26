-- =====================================================================
--  Collega il database al bot Telegram (eseguire UNA volta nel SQL Editor,
--  DOPO aver pubblicato la Edge Function "telegram").
--
--  Nessun segreto da copiare: la password condivisa tra database e bot
--  viene generata qui e custodita nel Vault di Supabase. La funzione la
--  legge da sola tramite public.webhook_secret() (riservata al service role).
--  L'unico segreto da inserire a mano è TELEGRAM_BOT_TOKEN nei Secrets
--  delle Edge Functions.
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 1) segreto condiviso, generato dal database
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'sbb_webhook_secret',
                           'Segreto tra database e bot Telegram SBUBBIKERS')
where not exists (select 1 from vault.secrets where name = 'sbb_webhook_secret');

create or replace function public.webhook_secret()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sbb_webhook_secret'
$$;
revoke execute on function public.webhook_secret() from public, anon, authenticated;
grant execute on function public.webhook_secret() to service_role;

-- 2) invio di un messaggio alla funzione "telegram"
create or replace function public.tg_invia(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://eibxsbvxnjrvbdtijuns.supabase.co/functions/v1/telegram',
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', public.webhook_secret()),
    timeout_milliseconds := 5000);
end $$;
revoke execute on function public.tg_invia(jsonb) from public, anon, authenticated;

-- 3) trigger: ogni modifica a uscite / partecipanti / avvisi avvisa il bot
create or replace function public.tg_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.tg_invia(jsonb_build_object(
    'type', tg_op, 'table', tg_table_name, 'schema', tg_table_schema,
    'record',     case when tg_op <> 'DELETE' then to_jsonb(new) end,
    'old_record', case when tg_op <> 'INSERT' then to_jsonb(old) end));
  return null;
end $$;
revoke execute on function public.tg_trigger() from public, anon, authenticated;

create or replace trigger tg_uscite after insert or update or delete on public.uscite
  for each row execute function public.tg_trigger();
create or replace trigger tg_partecipanti after insert or delete on public.partecipanti
  for each row execute function public.tg_trigger();
create or replace trigger tg_avvisi after insert or delete on public.avvisi
  for each row execute function public.tg_trigger();

-- 4) riepiloghi automatici (orari UTC: +1 h d'inverno, +2 h d'estate)
select cron.schedule('sbb-promemoria', '0 18 * * *', $$ select public.tg_invia('{"azione":"promemoria"}') $$);  -- ogni sera
select cron.schedule('sbb-weekend',    '0 17 * * 4', $$ select public.tg_invia('{"azione":"weekend"}') $$);     -- giovedì

-- Prova: deve arrivare "✅ Bot SBUBBIKERS collegato!" sul canale
-- select public.tg_invia('{"azione":"test"}');
-- Per disattivare un riepilogo: select cron.unschedule('sbb-promemoria');
