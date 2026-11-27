// ===== Meteo delle uscite ===============================================
// Previsioni: Open-Meteo (gratuito, senza chiave) — https://open-meteo.com (CC BY 4.0)
// Coordinate dei luoghi: dal database; se mancano, ricavate dal link della mappa
// o cercate per nome (OpenStreetMap Nominatim), poi salvate per tutti.

const ZONA = { lat: 44.0594, lon: 12.5683 };          // Rimini: ripiego se il luogo non si trova
const VIEWBOX = "11.6,44.6,13.0,43.5";                // Romagna e dintorni, per cercare prima qui
const GIORNI = 16;
const TTL_PREV = 60 * 60 * 1000;                      // previsioni tenute 1 ora
const KEY = "sbb-meteo-v1";

const mem = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const salva = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* spazio pieno: pazienza */ } };
mem.coord ??= {}; mem.prev ??= {};
const inCorso = new Map();
const unaVolta = (k, fn) => { if (!inCorso.has(k)) inCorso.set(k, fn().finally(() => inCorso.delete(k))); return inCorso.get(k); };

// ---------- coordinate ------------------------------------------------
export function coordDaTesto(t) {
  if (!t) return null;
  const s = decodeURIComponent(String(t));
  const pats = [/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /^\s*(-?\d{1,2}[.,]\d+)\s*[,; ]\s*(-?\d{1,3}[.,]\d+)\s*$/];
  for (const p of pats) {
    const m = s.match(p);
    if (m) {
      const lat = Number(m[1].replace(",", ".")), lon = Number(m[2].replace(",", "."));
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
  }
  return null;
}

async function cercaNominatim(q, bounded) {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&accept-language=it` +
    `&viewbox=${VIEWBOX}&bounded=${bounded ? 1 : 0}&q=${encodeURIComponent(q)}`;
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  if (!r.ok) return null;
  const [x] = await r.json();
  return x ? { lat: Number(x.lat), lon: Number(x.lon) } : null;
}

// Prova varianti del nome: intero, pezzi separati da trattini/virgole, senza "Bar/Ristorante…",
// la sola via, e versioni accorciate ("Parco degli Artisti Ciclabile Marecchia" → "Parco degli Artisti").
export function variantiNome(nome) {
  const base = String(nome).trim();
  const out = [base];
  const pezzi = base.split(/\s[–-]\s|,|\(|\)/).map((x) => x.trim()).filter((x) => x.length > 2);
  out.push(...pezzi);
  for (const x of pezzi) {
    const senza = x.replace(/^(bar|caff[eè]|ristorante|pizzeria|piadineria|gelateria|parcheggio|chiosco)\s+/i, "");
    out.push(senza);
    const via = senza.match(/\b((?:via|viale|piazza|piazzale|corso|largo)\s.+)$/i);
    if (via) { out.push(senza.slice(0, via.index).trim()); out.push(via[1]); }
    const parole = senza.split(/\s+/);
    for (let n = parole.length - 1; n >= 2; n--) if (!/^(di|del|dei|degli|della|delle|da|in|a|al|alla|e|via|viale)$/i.test(parole[n - 1])) out.push(parole.slice(0, n).join(" "));
  }
  return [...new Set(out.filter((x) => x.length > 2))].slice(0, 7);
}

export async function cercaPerNome(nome) {
  let primo = true;
  for (const q of variantiNome(nome)) {
    if (!primo) await new Promise((r) => setTimeout(r, 1100));   // regole d'uso di Nominatim: max 1 richiesta al secondo
    primo = false;
    try { const c = await cercaNominatim(q, true); if (c) return c; }
    catch { return null; }
  }
  return null;
}

// Ritorna {lat, lon, approx}
export function coordinateLuogo(luogo, api) {
  if (!luogo) return Promise.resolve({ ...ZONA, approx: true });
  if (luogo.lat != null && luogo.lon != null) return Promise.resolve({ lat: luogo.lat, lon: luogo.lon });
  const k = `${luogo.id}|${luogo.nome}`;
  const c = mem.coord[k];
  if (c && (!c.approx || Date.now() - c.t < 7 * 864e5)) return Promise.resolve(c);
  return unaVolta("c" + k, async () => {
    let p = coordDaTesto(luogo.link_mappa) || (await cercaPerNome(luogo.nome));
    if (p) { api?.impostaCoordinateLuogo?.(luogo.id, p.lat, p.lon).catch(() => {}); luogo.lat = p.lat; luogo.lon = p.lon; }
    else p = { ...ZONA, approx: true };
    mem.coord[k] = { ...p, t: Date.now() }; salva();
    return p;
  });
}

// ---------- previsioni ------------------------------------------------
async function previsione(lat, lon) {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const c = mem.prev[k];
  if (c && Date.now() - c.t < TTL_PREV) return c.d;
  return unaVolta("p" + k, async () => {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m` +
      `&timezone=Europe%2FRome&forecast_days=${GIORNI}&timeformat=unixtime`;
    const r = await fetch(u);
    if (!r.ok) throw new Error("meteo non disponibile");
    const j = await r.json();
    const d = { h: j.hourly, t: Date.now() };
    for (const kk of Object.keys(mem.prev)) if (Date.now() - mem.prev[kk].t > TTL_PREV) delete mem.prev[kk];
    mem.prev[k] = { d, t: Date.now() }; salva();
    return d;
  });
}

const ICONE = [[0, "☀️", "Sereno"], [1, "🌤️", "Poco nuvoloso"], [2, "⛅", "Parz. nuvoloso"], [3, "☁️", "Coperto"],
  [45, "🌫️", "Nebbia"], [48, "🌫️", "Nebbia"], [51, "🌦️", "Pioviggine"], [56, "🌧️", "Pioviggine gelata"],
  [61, "🌧️", "Pioggia"], [66, "🌧️", "Pioggia gelata"], [71, "🌨️", "Neve"], [77, "🌨️", "Neve"],
  [80, "🌦️", "Rovesci"], [85, "🌨️", "Rovesci di neve"], [95, "⛈️", "Temporale"]];
const icona = (c) => { let r = ICONE[0]; for (const x of ICONE) if (c >= x[0]) r = x; return r; };
const BUSSOLA = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const daDove = (g) => BUSSOLA[Math.round(((g % 360) + 360) % 360 / 45) % 8];

function durataOre(u) {
  const t = (u.tipo?.nome || "").toLowerCase();
  const v = t.includes("mtb") ? 13 : t.includes("gravel") ? 18 : 25;
  return u.km ? Math.min(7, Math.max(1, Math.round(u.km / v))) : 3;
}

// Riassunto della previsione per un'uscita, o {fuori:true, da:Date}
export async function meteoUscita(u, api) {
  const inizio = new Date(u.data_ora);
  const limite = new Date(); limite.setHours(0, 0, 0, 0); limite.setDate(limite.getDate() + GIORNI);
  if (inizio >= limite) {
    const da = new Date(inizio); da.setDate(da.getDate() - GIORNI + 1);
    return { fuori: true, da };
  }
  const pos = await coordinateLuogo(u.luogo, api);
  const { h } = await previsione(pos.lat, pos.lon);
  const t0 = Math.floor(inizio.getTime() / 36e5) * 3600, t1 = t0 + durataOre(u) * 3600;
  const ore = [];
  h.time.forEach((t, i) => { if (t >= t0 && t <= t1) ore.push({
    t, temp: h.temperature_2m[i], prob: h.precipitation_probability[i] ?? 0, mm: h.precipitation[i] ?? 0,
    code: h.weather_code[i], vento: h.wind_speed_10m[i], dir: h.wind_direction_10m[i] }); });
  if (!ore.length) return null;
  const temps = ore.map((o) => Math.round(o.temp));
  const peggiore = ore.reduce((a, b) => (b.code > a.code ? b : a));
  const probMax = Math.max(...ore.map((o) => o.prob));
  const piove = ore.find((o) => o.prob >= 40 || o.mm >= 0.3);
  const ventoMax = ore.reduce((a, b) => (b.vento > a.vento ? b : a));
  return {
    approx: !!pos.approx, ore, probMax, piove,
    icona: icona(peggiore.code)[1], descr: icona(peggiore.code)[2],
    tMin: Math.min(...temps), tMax: Math.max(...temps),
    pioggia: probMax >= 50 || peggiore.code >= 61,
    vento: { kmh: Math.round(ventoMax.vento), da: daDove(ventoMax.dir) },
    oraIcona: (o) => icona(o.code)[1],
  };
}
