// =====================================================================
//  SBUBBIKERS — import assistito delle gare (Supabase Edge Function "gare-import")
//
//  Chiamata dall'app (solo superadmin) con { fonte_id, regione? }.
//  Legge la pagina della fonte, estrae le gare (data, nome, tipo, località, provincia, link)
//  e le restituisce: NON scrive nulla. È il superadmin a scegliere nell'app cosa importare.
//  Siti supportati: pianetamountainbike.it (calendario gare MTB / gravel).
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UA = "SBUBBIKERS-app/1.0 (calendario interno della squadra; https://app.sbubbikers.com)";

const risposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export type Gara = { data: string; nome: string; tipo: string | null; categoria: "mtb" | "gravel" | "strada";
  localita: string | null; provincia: string | null; link: string };

// ---------- pianetamountainbike.it -----------------------------------
const MESI: Record<string, string> = { GEN: "01", FEB: "02", MAR: "03", APR: "04", MAG: "05", GIU: "06",
  LUG: "07", AGO: "08", SET: "09", OTT: "10", NOV: "11", DIC: "12" };
const TIPI_PMB: Record<string, string> = { XC: "XC", GF: "Granfondo MTB", EN: "Enduro", CX: "Ciclocross",
  XCP: "Gara a tappe", XCE: "XC eliminator", GRV: "Gravel" };
const SEZIONI_PMB: Record<string, string> = { ciclocross: "Ciclocross", granfondo: "Granfondo MTB", "cross-country": "XC",
  endurance: "Enduro", gravel: "Gravel", "gare-a-tappe": "Gara a tappe" };
const REGIONI_PMB: Record<string, string> = { "Emilia-Romagna": "Emilia Romagna", "Friuli-Venezia Giulia": "Friuli",
  "Trentino-Alto Adige": "Trentino - Alto Adige" };

const testo = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, " ").trim();

export function leggiPianetaMtb(html: string, base: string): Gara[] {
  const out: Gara[] = [];
  // solo i blocchi "visible-xs": una tabella per giorno (la versione desktop ripete gli stessi dati)
  const blocchi = html.split(/<div class="visible-xs">/).slice(1);
  for (const b of blocchi) {
    const tab = b.split("</table>")[0];
    const th = tab.match(/<th>\s*([^<]+?)\s*<\/th>/);
    const dm = th?.[1].match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/);
    if (!dm || !MESI[dm[2]]) continue;
    const data = `${dm[3]}-${MESI[dm[2]]}-${dm[1].padStart(2, "0")}`;
    for (const td of tab.split(/<td[^>]*>/).slice(1)) {
      const a = td.match(/<a\s+href="([^"]+)"(?:\s+title="([^"]*)")?/);
      if (!a) continue;
      const nome = testo(a[2] || td.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] || "");
      const dopo = td.split("</a>").slice(1).join(" ");
      const m = dopo.match(/<b>\s*([A-Z]{2,4})\s*<\/b>\s*-\s*([^|<]*?)\s*\|\s*([A-Z]{2})\b/);
      const codice = m?.[1] ?? null;
      if (!nome) continue;
      const sezione = a[1].match(/calendario-gare-mtb\/([^/]+)\//)?.[1] ?? "";
      out.push({
        data, nome: nome.slice(0, 120),
        tipo: (codice && TIPI_PMB[codice]) || SEZIONI_PMB[sezione] || null,
        categoria: codice === "GRV" || sezione === "gravel" ? "gravel" : "mtb",
        localita: m?.[2] ? testo(m[2]).slice(0, 80) : null,
        provincia: m?.[3] ?? null,
        link: new URL(a[1], base).href,
      });
    }
  }
  return out;
}

async function scarica(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
  if (!r.ok) throw new Error(`La pagina risponde ${r.status}`);
  return await r.text();
}

async function importaPianetaMtb(fonte: string, regione: string | null) {
  const u0 = new URL(fonte);
  const anno = new Date().getFullYear();
  const oggi = new Date().toISOString().slice(0, 10);
  const tutte: Gara[] = [];
  for (const a of [anno, anno + 1]) {            // al massimo 2 pagine per richiesta
    const u = new URL(u0.origin + u0.pathname);
    u.searchParams.set("anno", String(a)); u.searchParams.set("mese", "-1");
    if (regione) u.searchParams.set("regione", REGIONI_PMB[regione] ?? regione);
    tutte.push(...leggiPianetaMtb(await scarica(u.href), u0.origin));
  }
  const viste = new Set<string>();
  return tutte.filter((g) => g.data >= oggi && !viste.has(g.link) && viste.add(g.link));
}

const LETTORI: Record<string, (url: string, regione: string | null) => Promise<Gara[]>> = {
  "pianetamountainbike.it": importaPianetaMtb,
};
export const supportata = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, "") in LETTORI; } catch { return false; }
};

// ---------- handler ---------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return risposta({ error: "Metodo non consentito" }, 405);
  try {
    // chi chiama? Si usa il suo stesso accesso: le regole del database (RLS) fanno il resto
    const auth = req.headers.get("Authorization") ?? "";
    const apikey = req.headers.get("apikey") ?? "";
    if (!auth || !apikey) return risposta({ error: "Accesso non valido" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, apikey, {
      auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data: superadmin, error: eSa } = await sb.rpc("is_superadmin");
    if (eSa) return risposta({ error: "Accesso non valido" }, 401);
    if (superadmin !== true) return risposta({ error: "Solo superadmin" }, 403);

    const { fonte_id, regione } = await req.json();
    const { data: fonte } = await sb.from("fonti_gare").select("url").eq("id", fonte_id).maybeSingle();
    if (!fonte) return risposta({ error: "Fonte non trovata" }, 404);
    const host = new URL(fonte.url).hostname.replace(/^www\./, "");
    const lettore = LETTORI[host];
    if (!lettore) return risposta({ error: `Import automatico non ancora disponibile per ${host}` }, 400);

    const gare = await lettore(fonte.url, typeof regione === "string" && regione ? regione : null);
    await sb.from("fonti_gare").update({ ultimo_controllo: new Date().toISOString() }).eq("id", fonte_id);
    return risposta({ gare });
  } catch (e) {
    return risposta({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
