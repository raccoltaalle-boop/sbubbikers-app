// =====================================================================
//  CONFIGURAZIONE — l'unico file da modificare dopo l'installazione.
//  Se SUPABASE_URL è vuoto l'app parte in MODALITÀ DEMO (dati finti).
//  La chiave "anon" di Supabase è pubblica per natura: i permessi veri
//  sono nel database (Row Level Security). NON mettere qui altre chiavi.
// =====================================================================
window.SBB_CONFIG = {
  SUPABASE_URL: "https://eibxsbvxnjrvbdtijuns.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_DZ5h8TqMLnDomY7JYQgYng_yGS5hWaQ", // chiave pubblicabile (sicura nel browser)
  APP_URL: "https://app.sbubbikers.com",
  TELEGRAM_CHANNEL_URL: "",  // es. "https://t.me/sbubbikers_info" (link d'invito del canale)
  NOME_SQUADRA: "Sbubbikers",
};
