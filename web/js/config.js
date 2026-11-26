// =====================================================================
//  CONFIGURAZIONE — l'unico file da modificare dopo l'installazione.
//  Se SUPABASE_URL è vuoto l'app parte in MODALITÀ DEMO (dati finti).
//  La chiave "anon" di Supabase è pubblica per natura: i permessi veri
//  sono nel database (Row Level Security). NON mettere qui altre chiavi.
// =====================================================================
window.SBB_CONFIG = {
  SUPABASE_URL: "",          // es. "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "",     // Project Settings → API → anon public key
  APP_URL: "https://app.sbubbikers.com",
  TELEGRAM_CHANNEL_URL: "",  // es. "https://t.me/sbubbikers_info" (link d'invito del canale)
  NOME_SQUADRA: "SBUBBIKERS",
};
