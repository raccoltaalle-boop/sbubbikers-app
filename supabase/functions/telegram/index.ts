// =====================================================================
//  SBUBBIKERS — bot Telegram (Supabase Edge Function "telegram")
//
//  Riceve:
//   • i Database Webhook su uscite / partecipanti / avvisi
//     → pubblica, aggiorna o cancella i post sul canale
//   • le chiamate programmate {"azione":"promemoria"} e {"azione":"weekend"}
//     → riepiloghi automatici
//
//  Variabili (Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN   token da @BotFather
//   TELEGRAM_CHAT_ID     id del canale, es. -1001234567890 (o @nomecanale se pubblico)
//   TELEGRAM_THREAD_ID   (facoltativo) id del topic, se si pubblica in un gruppo con topic
//   (il segreto tra database e bot NON va inserito: lo legge dal Vault con public.webhook_secret())
//   APP_URL              es. https://app.sbubbikers.com
//  SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già disponibili in automatico.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const CHAT = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
const THREAD = Deno.env.get("TELEGRAM_THREAD_ID");
let SECRET = Deno.env.get("WEBHOOK_SECRET") ?? ""; // facoltativo: di norma letto dal Vault
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.sbubbikers.com").replace(/\/$/, "");
const TZ = "Europe/Rome";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const USCITA_SELECT =
  "id,socio_id,data_ora,km,dislivello,andatura,note,link_percorso,annullata,tg_message_id," +
  "tipo:tipi_bici(nome,emoji),luogo:luoghi(nome,link_mappa)," +
  "autore:soci!uscite_socio_id_fkey(nome,cognome)," +
  "partecipanti(socio_id,created_at,socio:soci(nome,cognome))";

const ANDATURE: Record<string, string> = { tranquilla: "🐢 tranquilla", media: "🚲 media", sostenuta: "🔥 sostenuta" };

// ---------- utilità ---------------------------------------------------
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const nomeBreve = (p: any) => (p ? `${p.nome} ${(p.cognome ?? "")[0] ?? ""}.` : "?");
const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("it-IT", { timeZone: TZ, ...o }).format(d);
const giornoRoma = (d: Date) => fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" }); // es. 29/11/2026

async function tg(metodo: string, body: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok && !String(j.description).includes("message is not modified")) console.error(metodo, j);
  return j;
}
const destinazione = () => ({ chat_id: CHAT, ...(THREAD ? { message_thread_id: Number(THREAD) } : {}) });

// ---------- USCITE ------------------------------------------------------
async function caricaUscita(id: string) {
  const { data, error } = await sb.from("uscite").select(USCITA_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as any;
}

function testoUscita(u: any) {
  const d = new Date(u.data_ora);
  const quando = `${maiuscola(fmt(d, { weekday: "long", day: "numeric", month: "long" }))} ore ${fmt(d, { hour: "2-digit", minute: "2-digit" })}`;
  const titolo = `${esc(u.tipo?.emoji)} <b>${esc(String(u.tipo?.nome).toUpperCase())} – ${esc(quando)}</b>`;
  const mappa = u.luogo?.link_mappa || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.luogo?.nome ?? "")}`;
  const dati = [
    u.km ? `📏 ~${u.km} km` : null,
    u.dislivello ? `⛰️ ~${u.dislivello} m D+` : null,
    u.andatura ? ANDATURE[u.andatura] : null,
  ].filter(Boolean).join(" · ");

  // autore sempre primo, poi gli altri in ordine di adesione
  const altri = (u.partecipanti ?? [])
    .filter((p: any) => p.socio_id !== u.socio_id)
    .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
    .map((p: any) => p.socio);
  const persone = [u.autore, ...altri];

  const righe = [
    u.annullata ? `❌ <b>USCITA ANNULLATA</b>\n<s>${titolo}</s>` : titolo,
    "",
    `📍 Partenza: <a href="${esc(mappa)}">${esc(u.luogo?.nome)}</a>`,
    dati || null,
    u.note ? `📝 ${esc(u.note)}` : null,
    u.link_percorso && /^https?:\/\//.test(u.link_percorso) ? `🗺️ <a href="${esc(u.link_percorso)}">Vedi il percorso</a>` : null,
    "",
    `👤 Proposta da ${esc(nomeBreve(u.autore))}`,
    `👥 <b>${persone.length}</b> ${persone.length === 1 ? "partecipante" : "partecipanti"}: ${persone.map((p) => esc(nomeBreve(p))).join(", ")}`,
    "",
    "#uscita",
  ];
  return righe.filter((r) => r !== null).join("\n");
}

const tastiUscita = (u: any) =>
  u.annullata ? { inline_keyboard: [] } : { inline_keyboard: [[{ text: "🚴 Partecipo / Dettagli", url: `${APP_URL}/?u=${u.id}` }]] };

async function pubblicaUscita(id: string) {
  const u = await caricaUscita(id);
  if (!u || u.tg_message_id) return;
  const r = await tg("sendMessage", {
    ...destinazione(), text: testoUscita(u), parse_mode: "HTML",
    link_preview_options: { is_disabled: true }, reply_markup: tastiUscita(u),
  });
  if (r.ok) await sb.from("uscite").update({ tg_message_id: r.result.message_id }).eq("id", id);
}

async function aggiornaUscita(id: string) {
  const u = await caricaUscita(id);
  if (!u?.tg_message_id) return; // post non ancora pubblicato o uscita eliminata
  await tg("editMessageText", {
    chat_id: CHAT, message_id: u.tg_message_id, text: testoUscita(u), parse_mode: "HTML",
    link_preview_options: { is_disabled: true }, reply_markup: tastiUscita(u),
  });
}

// true se è cambiato qualcosa di visibile (non solo tg_message_id scritto dal bot)
function cambiato(nuovo: any, vecchio: any) {
  return Object.keys(nuovo).some((k) => k !== "tg_message_id" && JSON.stringify(nuovo[k]) !== JSON.stringify(vecchio?.[k]));
}

// ---------- AVVISI -------------------------------------------------------
async function pubblicaAvviso(a: any) {
  const { data: autore } = await sb.from("soci").select("nome,cognome").eq("id", a.autore_id).maybeSingle();
  const testo = [
    `📣 <b>${esc(a.titolo)}</b>`, "", esc(a.testo), "",
    autore ? `— ${esc(autore.nome)} ${esc(autore.cognome)}` : null, "#avviso",
  ].filter((r) => r !== null).join("\n");
  const r = await tg("sendMessage", {
    ...destinazione(), text: testo, parse_mode: "HTML", link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: "Apri l'app", url: `${APP_URL}/?tab=avvisi` }]] },
  });
  if (r.ok) await sb.from("avvisi").update({ tg_message_id: r.result.message_id }).eq("id", a.id);
}

// ---------- RIEPILOGHI PROGRAMMATI ----------------------------------------
async function usciteNeiGiorni(giorni: string[]) {
  const ora = new Date();
  const fra = new Date(ora.getTime() + 5 * 24 * 3600 * 1000);
  const { data } = await sb.from("uscite").select(USCITA_SELECT)
    .eq("annullata", false).gte("data_ora", ora.toISOString()).lte("data_ora", fra.toISOString()).order("data_ora");
  return (data ?? []).filter((u: any) => giorni.includes(giornoRoma(new Date(u.data_ora))));
}

function rigaBreve(u: any, conGiorno: boolean) {
  const d = new Date(u.data_ora);
  const quando = conGiorno ? `${maiuscola(fmt(d, { weekday: "short" }))} ${fmt(d, { hour: "2-digit", minute: "2-digit" })}` : fmt(d, { hour: "2-digit", minute: "2-digit" });
  const n = 1 + (u.partecipanti ?? []).filter((p: any) => p.socio_id !== u.socio_id).length;
  const km = u.km ? ` · ${u.km} km` : "";
  return `${esc(u.tipo?.emoji)} <b>${esc(quando)}</b> ${esc(u.tipo?.nome)}${km} – 📍 ${esc(u.luogo?.nome)} · 👥 ${n}`;
}

async function inviaRiepilogo(titolo: string, uscite: any[], conGiorno: boolean) {
  if (!uscite.length) return { inviato: false };
  const testo = [titolo, "", ...uscite.map((u) => rigaBreve(u, conGiorno)), "", "Aggiungiti dall'app 👇"].join("\n");
  await tg("sendMessage", {
    ...destinazione(), text: testo, parse_mode: "HTML", link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: "🚴 Apri le uscite", url: APP_URL }]] },
  });
  return { inviato: true, n: uscite.length };
}

async function promemoria() {
  const domani = new Date(Date.now() + 24 * 3600 * 1000);
  return inviaRiepilogo("🌙 <b>Domani si pedala!</b>", await usciteNeiGiorni([giornoRoma(domani)]), false);
}

async function weekend() {
  // chiamato il giovedì: sabato e domenica
  const sab = new Date(Date.now() + 2 * 24 * 3600 * 1000), dom = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  return inviaRiepilogo("📅 <b>Il weekend in bici</b>", await usciteNeiGiorni([giornoRoma(sab), giornoRoma(dom)]), true);
}

// ---------- ENTRY POINT ----------------------------------------------------
async function segreto() {
  if (!SECRET) {
    const { data, error } = await sb.rpc("webhook_secret");
    if (error) console.error("webhook_secret", error);
    SECRET = typeof data === "string" ? data : "";
  }
  return SECRET;
}

Deno.serve(async (req) => {
  const s = await segreto();
  if (!s || req.headers.get("x-webhook-secret") !== s) return new Response("forbidden", { status: 401 });
  const p = await req.json().catch(() => ({}));

  try {
    if (p.azione === "promemoria") return Response.json(await promemoria());
    if (p.azione === "weekend") return Response.json(await weekend());
    if (p.azione === "chat") {
      // elenca canali e gruppi dove il bot è stato aggiunto (per trovare TELEGRAM_CHAT_ID)
      const r = await tg("getUpdates", { allowed_updates: ["my_chat_member", "channel_post", "message"] });
      const chat = new Map();
      for (const u of r.result ?? []) {
        const c = u.my_chat_member?.chat ?? u.channel_post?.chat ?? u.message?.chat;
        if (c && c.type !== "private") chat.set(c.id, { id: c.id, titolo: c.title, tipo: c.type });
      }
      return Response.json({ chat: [...chat.values()] });
    }
    if (p.azione === "test") return Response.json(await tg("sendMessage", { ...destinazione(), text: "✅ Bot SBUBBIKERS collegato!" }));

    const { type, table, record, old_record } = p;
    if (table === "uscite") {
      if (type === "INSERT") await pubblicaUscita(record.id);
      else if (type === "UPDATE" && cambiato(record, old_record)) await aggiornaUscita(record.id);
      else if (type === "DELETE" && old_record?.tg_message_id) await tg("deleteMessage", { chat_id: CHAT, message_id: old_record.tg_message_id });
    } else if (table === "partecipanti") {
      await aggiornaUscita((record ?? old_record).uscita_id);
    } else if (table === "avvisi") {
      if (type === "INSERT" && record.pubblica_telegram) await pubblicaAvviso(record);
      else if (type === "DELETE" && old_record?.tg_message_id) await tg("deleteMessage", { chat_id: CHAT, message_id: old_record.tg_message_id });
    }
  } catch (e) {
    console.error(e);
    return new Response("errore", { status: 500 });
  }
  return new Response("ok");
});
