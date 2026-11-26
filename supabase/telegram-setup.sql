-- =====================================================================
--  Collega il database al bot Telegram.
--  PRIMA: Database → Extensions → abilita "pg_net" e "pg_cron".
--  Poi sostituisci OVUNQUE:
--     TUO-PROGETTO   → il "Reference ID" del progetto (Settings → General)
--     TUO-SEGRETO    → lo stesso WEBHOOK_SECRET messo nei secrets della funzione
--  ed esegui tutto nel SQL Editor.
-- =====================================================================

-- ---------- Trigger: ogni modifica avvisa il bot ----------
create or replace trigger tg_uscite
  after insert or update or delete on public.uscite
  for each row execute function supabase_functions.http_request(
    'https://TUO-PROGETTO.supabase.co/functions/v1/telegram', 'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"TUO-SEGRETO"}', '{}', '5000');

create or replace trigger tg_partecipanti
  after insert or delete on public.partecipanti
  for each row execute function supabase_functions.http_request(
    'https://TUO-PROGETTO.supabase.co/functions/v1/telegram', 'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"TUO-SEGRETO"}', '{}', '5000');

create or replace trigger tg_avvisi
  after insert or delete on public.avvisi
  for each row execute function supabase_functions.http_request(
    'https://TUO-PROGETTO.supabase.co/functions/v1/telegram', 'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"TUO-SEGRETO"}', '{}', '5000');

-- ---------- Riepiloghi automatici (orari in UTC: +1 h d'inverno, +2 h d'estate) ----------
-- Ogni sera alle 19 (inverno): "Domani si pedala!" — solo se ci sono uscite
select cron.schedule('sbb-promemoria', '0 18 * * *', $$
  select net.http_post(
    url := 'https://TUO-PROGETTO.supabase.co/functions/v1/telegram',
    headers := '{"Content-Type":"application/json","x-webhook-secret":"TUO-SEGRETO"}'::jsonb,
    body := '{"azione":"promemoria"}'::jsonb)
$$);

-- Giovedì alle 18 (inverno): "Il weekend in bici" — solo se ci sono uscite sab/dom
select cron.schedule('sbb-weekend', '0 17 * * 4', $$
  select net.http_post(
    url := 'https://TUO-PROGETTO.supabase.co/functions/v1/telegram',
    headers := '{"Content-Type":"application/json","x-webhook-secret":"TUO-SEGRETO"}'::jsonb,
    body := '{"azione":"weekend"}'::jsonb)
$$);

-- Per disattivare un riepilogo:  select cron.unschedule('sbb-promemoria');
-- Prova del collegamento (deve arrivare "✅ Bot SBUBBIKERS collegato!" sul canale):
-- select net.http_post(url := 'https://TUO-PROGETTO.supabase.co/functions/v1/telegram',
--   headers := '{"Content-Type":"application/json","x-webhook-secret":"TUO-SEGRETO"}'::jsonb,
--   body := '{"azione":"test"}'::jsonb);
