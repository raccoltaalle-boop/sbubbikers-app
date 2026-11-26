// ===== SBUBBIKERS — logica dell'app ====================================
const cfg = window.SBB_CONFIG || {};
const DEMO = !cfg.SUPABASE_URL;
let api;

const $app = document.getElementById("app");
const $sheet = document.getElementById("sheet-root");
const state = {
  tab: "uscite", filtroTipo: null, cercaConv: "", cercaSoci: "",
  tipi: [], luoghi: [], focusUscita: null,
};

// ---------- utilità ---------------------------------------------------
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? h(u) : null);
const iniziali = (p) => ((p?.nome?.[0] || "") + (p?.cognome?.[0] || "")).toUpperCase();
const nomeBreve = (p) => (p ? `${p.nome} ${p.cognome?.[0] || ""}.` : "");
const fmtOra = (d) => new Date(d).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const chiaveGiorno = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
function etichettaGiorno(d) {
  const x = new Date(d), oggi = new Date(), dom = new Date();
  dom.setDate(oggi.getDate() + 1);
  const data = x.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  if (chiaveGiorno(x) === chiaveGiorno(oggi)) return ["Oggi", data];
  if (chiaveGiorno(x) === chiaveGiorno(dom)) return ["Domani", data];
  return [x.toLocaleDateString("it-IT", { weekday: "long" }), data];
}
const fmtData = (d) => new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const ANDATURE = { tranquilla: "🐢 Tranquilla", media: "🚲 Media", sostenuta: "🔥 Sostenuta" };

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
async function prova(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast("⚠️ " + (e.message || e)); throw e; }
}
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
const linkInvito = (codice) => `${(cfg.APP_URL || location.origin).replace(/\/$/, "")}/?i=${codice}`;
const isAdmin = () => api.me?.ruolo === "admin";

// ---------- avvio -----------------------------------------------------
async function start() {
  const mod = DEMO ? await import("./api-demo.js") : await import("./api-supabase.js");
  api = mod.createApi(cfg);
  const params = new URLSearchParams(location.search);
  const codiceUrl = params.get("i");
  state.focusUscita = params.get("u");
  if (params.get("tab")) state.tab = params.get("tab");

  let me = null;
  try { me = await api.init(); } catch (e) { console.error(e); }

  // link d'invito aperto su un dispositivo non ancora collegato
  if (!me && codiceUrl) {
    renderLogin(codiceUrl.toUpperCase());
    return;
  }
  if (codiceUrl) history.replaceState(null, "", location.pathname + (state.focusUscita ? `?u=${state.focusUscita}` : ""));
  if (!me) return renderLogin("");
  await caricaBase();
  renderShell();
}

async function caricaBase() {
  [state.tipi, state.luoghi] = await Promise.all([api.tipiBici(), api.luoghi()]);
}

// ---------- accesso con invito -----------------------------------------
function renderLogin(codice) {
  $app.innerHTML = `
    ${DEMO ? `<div class="demo-banner">Modalità demo · codice di prova <b>DEMO2026</b></div>` : ""}
    <section class="login">
      <div class="logo-mark">SB</div>
      <h1>${h(cfg.NOME_SQUADRA || "SBUBBIKERS")}<br><span>Si pedala.</span></h1>
      <p>${codice ? "Hai ricevuto un invito personale. Tocca <b>Entra</b> per collegare questo dispositivo." : "Inserisci il codice personale che ti ha mandato un admin della squadra."}</p>
      <form id="f-login">
        <div class="field"><input class="input code-input" id="codice" maxlength="12" autocomplete="one-time-code" autocapitalize="characters"
          value="${h(codice)}" placeholder="CODICE" required></div>
        <div class="error" id="err"></div>
        <button class="btn accent block" id="entra">Entra</button>
      </form>
      <p class="hint">Non hai un codice? Chiedilo a un admin. Su iPhone, se installi l'app sulla schermata Home, ti verrà chiesto di nuovo il codice: conservalo.</p>
    </section>`;
  document.getElementById("f-login").onsubmit = async (e) => {
    e.preventDefault();
    const c = document.getElementById("codice").value.trim().toUpperCase();
    const btn = document.getElementById("entra");
    btn.disabled = true; btn.textContent = "Verifico…";
    try {
      const me = await api.riscatta(c);
      if (!me) throw new Error("Accesso non riuscito");
      ls.set("sbb-codice", c);
      history.replaceState(null, "", location.pathname + (state.focusUscita ? `?u=${state.focusUscita}` : ""));
      await caricaBase();
      renderBenvenuto(me, c);
    } catch (err) {
      document.getElementById("err").textContent = err.message;
      btn.disabled = false; btn.textContent = "Entra";
    }
  };
}

function renderBenvenuto(me, codice) {
  $app.innerHTML = `
    <section class="login">
      <div class="logo-mark">SB</div>
      <h1>Ciao<br><span>${h(me.nome)}!</span></h1>
      <p>Questo dispositivo è collegato. Prima di iniziare, salvati il tuo codice: serve se cambi telefono o installi l'app sulla schermata Home.</p>
      <div class="code-box"><span class="meta">IL TUO CODICE</span><strong>${h(codice)}</strong>
        <button class="btn ghost small" id="copia">Copia</button></div>
      <button class="btn accent block" id="vai">Andiamo 🚴</button>
      <button class="link-btn" id="installa">Come installo l'app sul telefono?</button>
    </section>`;
  document.getElementById("copia").onclick = () => navigator.clipboard?.writeText(codice).then(() => toast("Codice copiato"));
  document.getElementById("vai").onclick = renderShell;
  document.getElementById("installa").onclick = sheetInstalla;
}

// ---------- struttura con tab -----------------------------------------
const TABS = [
  { id: "uscite", ico: "🚴", lbl: "Uscite", titolo: "Uscite" },
  { id: "avvisi", ico: "📣", lbl: "Avvisi", titolo: "Avvisi" },
  { id: "divise", ico: "👕", lbl: "Divise", titolo: "Divise", serve: "divise" },
  { id: "convenzioni", ico: "🤝", lbl: "Sconti", titolo: "Convenzioni" },
  { id: "profilo", ico: "👤", lbl: "Profilo", titolo: "Profilo" },
];

function renderShell() {
  const tabs = TABS.filter((x) => !x.serve || typeof api[x.serve] === "function");
  if (!tabs.some((t) => t.id === state.tab)) state.tab = "uscite";
  const t = tabs.find((x) => x.id === state.tab);
  $app.innerHTML = `
    ${DEMO ? `<div class="demo-banner">Modalità demo: i dati restano su questo dispositivo · <button id="demo-reset">azzera</button></div>` : ""}
    <header class="topbar" id="topbar">
      <div><span class="brand">${h(cfg.NOME_SQUADRA || "SBUBBIKERS")}</span><h1>${t.titolo}</h1></div>
      <button class="icon-btn" id="refresh" aria-label="Aggiorna">↻</button>
    </header>
    <main id="main"><div class="spinner"></div></main>
    ${state.tab === "uscite" ? `<button class="fab" id="fab"><span>+</span> Uscita</button>` : ""}
    ${state.tab === "avvisi" && isAdmin() ? `<button class="fab" id="fab"><span>+</span> Avviso</button>` : ""}
    ${state.tab === "convenzioni" && isAdmin() ? `<button class="fab" id="fab"><span>+</span> Convenzione</button>` : ""}
    <nav class="tabbar"><div class="tabbar-inner">
      ${tabs.map((x) => `<button class="tab" data-tab="${x.id}" ${x.id === state.tab ? 'aria-current="page"' : ""}>
        <span class="ico">${x.ico}</span><span class="lbl">${x.lbl}</span></button>`).join("")}
    </div></nav>`;

  $app.querySelectorAll(".tab").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; window.scrollTo(0, 0); renderShell(); }));
  document.getElementById("refresh").onclick = () => renderTab();
  const fab = document.getElementById("fab");
  if (fab) fab.onclick = { uscite: sheetNuovaUscita, avvisi: sheetNuovoAvviso, convenzioni: () => sheetConvenzione() }[state.tab];
  const dr = document.getElementById("demo-reset");
  if (dr) dr.onclick = () => { api.reset(); location.reload(); };
  renderTab();
}

window.addEventListener("scroll", () => document.getElementById("topbar")?.classList.toggle("scrolled", scrollY > 4), { passive: true });
document.addEventListener("visibilitychange", () => { if (!document.hidden && api?.me && document.getElementById("main") && !$sheet.innerHTML) renderTab(); });

async function renderTab() {
  const main = document.getElementById("main");
  if (!main) return;
  try {
    await { uscite: tabUscite, avvisi: tabAvvisi, divise: tabDivise, convenzioni: tabConvenzioni, profilo: tabProfilo }[state.tab](main);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty"><div class="big">📡</div><p>${h(e.message || "Errore di caricamento")}</p>
      <button class="btn ghost" onclick="location.reload()">Riprova</button></div>`;
  }
}

// ---------- USCITE -----------------------------------------------------
async function tabUscite(main) {
  const uscite = await api.uscite();
  const lista = uscite.filter((u) => !state.filtroTipo || u.tipo?.id === state.filtroTipo);
  const chips = `<div class="chips">
    <button class="chip" data-f="" aria-pressed="${!state.filtroTipo}">Tutte</button>
    ${state.tipi.map((t) => `<button class="chip" data-f="${t.id}" aria-pressed="${state.filtroTipo === t.id}">${h(t.emoji)} ${h(t.nome)}</button>`).join("")}
  </div>`;

  if (!lista.length) {
    main.innerHTML = chips + `<div class="empty"><div class="big">🛣️</div>
      <p><b>Nessuna uscita in programma.</b><br>Proponine una e trova compagnia!</p></div>`;
  } else {
    let html = chips, giorno = null;
    for (const u of lista) {
      const k = chiaveGiorno(u.data_ora);
      if (k !== giorno) {
        if (giorno) html += `</div>`;
        const [g, d] = etichettaGiorno(u.data_ora);
        html += `<div class="day"><h2>${h(g)}</h2><small>${h(d)}</small></div><div class="timeline">`;
        giorno = k;
      }
      html += cardUscita(u);
    }
    main.innerHTML = html + `</div>`;
  }

  main.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { state.filtroTipo = b.dataset.f ? Number(b.dataset.f) : null; tabUscite(main); }));
  main.querySelectorAll("[data-join]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    await prova(() => api.partecipa(b.dataset.join, b.dataset.on === "1"), b.dataset.on === "1" ? "Ci sei! 💪" : "Ok, sarà per la prossima");
    tabUscite(main);
  }));
  main.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = async () => {
    if (!(await dialogo({ testo: "Annullare questa uscita? Lo vedranno tutti i partecipanti.", ok: "Annulla uscita", pericolo: true }))) return;
    await prova(() => api.annullaUscita(b.dataset.cancel), "Uscita annullata");
    tabUscite(main);
  }));
  main.querySelectorAll("[data-share]").forEach((b) => (b.onclick = () => condividiUscita(uscite.find((u) => u.id === b.dataset.share))));

  if (state.focusUscita) {
    const el = document.getElementById("u-" + state.focusUscita);
    if (el) { el.classList.add("highlight"); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    state.focusUscita = null;
  }
}

function cardUscita(u) {
  const me = api.me;
  const mia = u.socio_id === me.id;
  const persone = [u.autore, ...u.partecipanti.filter((p) => p.socio_id !== u.socio_id)];
  const ciSono = mia || u.partecipanti.some((p) => p.socio_id === me.id);
  const passata = new Date(u.data_ora) < new Date();
  const mappa = safeUrl(u.luogo?.link_mappa) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.luogo?.nome || "")}`;
  const percorso = safeUrl(u.link_percorso);
  const stats = [
    u.km && `📏 ${u.km} km`,
    u.dislivello && `⛰️ ${u.dislivello} m D+`,
    u.andatura && ANDATURE[u.andatura],
  ].filter(Boolean);
  const visibili = persone.slice(0, 5);
  const testoPersone = persone.length === 1 ? `${nomeBreve(u.autore)} cerca compagnia`
    : `${persone.length} ciclisti · ${persone.slice(0, 3).map((p) => h(p.nome)).join(", ")}${persone.length > 3 ? "…" : ""}`;

  let azione = "";
  if (u.annullata) azione = `<span class="badge-cancel">Annullata</span>`;
  else if (mia) azione = `<button class="btn danger small" data-cancel="${u.id}">Annulla</button>`;
  else if (!passata) azione = ciSono
    ? `<button class="btn going small" data-join="${u.id}" data-on="0">✓ Ci sono</button>`
    : `<button class="btn accent small" data-join="${u.id}" data-on="1">Partecipo</button>`;

  return `<article class="ride ${mia ? "mine" : ""} ${u.annullata ? "cancelled" : ""}" id="u-${u.id}">
    <div class="ride-head">
      <div class="ride-time">${fmtOra(u.data_ora)}</div>
      <div style="flex:1;min-width:0">
        <div class="ride-type">${h(u.tipo?.emoji)} ${h(u.tipo?.nome)}</div>
        <div class="ride-place">📍 <a href="${mappa}" target="_blank" rel="noopener">${h(u.luogo?.nome)}</a></div>
      </div>
      <button class="icon-btn" data-share="${u.id}" aria-label="Condividi">↗</button>
    </div>
    ${stats.length ? `<div class="stats">${stats.map((s) => `<span class="stat">${s}</span>`).join("")}</div>` : ""}
    ${u.note ? `<p class="note">${h(u.note)}</p>` : ""}
    ${percorso ? `<p class="note"><a href="${percorso}" target="_blank" rel="noopener">🗺️ Vedi il percorso</a></p>` : ""}
    <div class="ride-foot">
      <div class="people">
        ${visibili.map((p) => `<span class="avatar" title="${h(p.nome)} ${h(p.cognome)}">${h(iniziali(p))}</span>`).join("")}
        <span class="people-txt">${testoPersone}</span>
      </div>
      ${azione}
    </div>
    ${isAdmin() && !mia && !u.annullata ? `<div class="row-actions"><button class="link-btn" data-cancel="${u.id}">Annulla (admin)</button></div>` : ""}
  </article>`;
}

function condividiUscita(u) {
  const [g, d] = etichettaGiorno(u.data_ora);
  const testo = `${u.tipo?.emoji} ${u.tipo?.nome} – ${g} ${d} ore ${fmtOra(u.data_ora)}\n📍 ${u.luogo?.nome}` +
    (u.km ? `\n📏 ${u.km} km` : "") + (u.dislivello ? ` · ⛰️ ${u.dislivello} m` : "");
  const url = `${(cfg.APP_URL || location.origin).replace(/\/$/, "")}/?u=${u.id}`;
  condividiTesto(`${testo}\n${url}`);
}

function prossimoGiorno() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sheetNuovaUscita() {
  const sel = { tipo: null, andatura: null };
  openSheet("Nuova uscita", `
    <form id="f-uscita">
      <div class="field"><span class="lbl">Che bici?</span>
        <div class="choice" id="c-tipo">${state.tipi.map((t) => `<button type="button" class="chip" data-v="${t.id}" aria-pressed="false">${h(t.emoji)} ${h(t.nome)}</button>`).join("")}</div>
      </div>
      <div class="field"><label for="luogo">Partenza</label>
        <select class="input" id="luogo" required>
          <option value="">Scegli il luogo…</option>
          ${state.luoghi.map((l) => `<option value="${l.id}">${h(l.nome)}</option>`).join("")}
          <option value="__nuovo">➕ Un altro luogo…</option>
        </select>
        <input class="input" id="nuovo-luogo" placeholder="Nome del nuovo luogo di partenza" style="display:none;margin-top:8px" maxlength="80">
      </div>
      <div class="grid2">
        <div class="field"><label for="data">Giorno</label><input class="input" type="date" id="data" required value="${prossimoGiorno()}"></div>
        <div class="field"><label for="ora">Ora</label><input class="input" type="time" id="ora" required value="08:30" step="300"></div>
      </div>
      <details class="more" open><summary>Dettagli facoltativi</summary>
        <div class="grid2" style="margin-top:10px">
          <div class="field"><label for="km">Km stimati <span class="opt">(facolt.)</span></label><input class="input" type="number" id="km" min="1" max="1000" inputmode="numeric"></div>
          <div class="field"><label for="disl">Dislivello m <span class="opt">(facolt.)</span></label><input class="input" type="number" id="disl" min="0" max="10000" step="50" inputmode="numeric"></div>
        </div>
        <div class="field"><span class="lbl">Andatura <span class="opt">(facolt.)</span></span>
          <div class="choice" id="c-and">${Object.entries(ANDATURE).map(([k, v]) => `<button type="button" class="chip" data-v="${k}" aria-pressed="false">${v}</button>`).join("")}</div>
        </div>
        <div class="field"><label for="link">Link percorso <span class="opt">(Komoot, Strava…)</span></label><input class="input" type="url" id="link" placeholder="https://"></div>
        <div class="field"><label for="note">Note <span class="opt">(facolt.)</span></label><textarea class="input" id="note" rows="3" maxlength="500" placeholder="Giro, soste, cosa portare…"></textarea></div>
      </details>
      <div class="error" id="err"></div>
      <button class="btn accent block" id="pubblica">Pubblica uscita</button>
      ${cfg.TELEGRAM_CHANNEL_URL ? `<p class="hint" style="text-align:center">Verrà pubblicata anche sul canale Telegram della squadra.</p>` : ""}
    </form>`, (root) => {
    const sceltaSingola = (id, key, toggle) => root.querySelectorAll(`#${id} .chip`).forEach((b) => (b.onclick = () => {
      const v = b.dataset.v;
      sel[key] = toggle && sel[key] === v ? null : v;
      root.querySelectorAll(`#${id} .chip`).forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === sel[key]));
    }));
    sceltaSingola("c-tipo", "tipo", false);
    sceltaSingola("c-and", "andatura", true);
    const luogo = root.querySelector("#luogo"), nuovo = root.querySelector("#nuovo-luogo");
    luogo.onchange = () => { const n = luogo.value === "__nuovo"; nuovo.style.display = n ? "block" : "none"; nuovo.required = n; if (n) nuovo.focus(); };

    root.querySelector("#f-uscita").onsubmit = async (e) => {
      e.preventDefault();
      const err = root.querySelector("#err");
      if (!sel.tipo) return (err.textContent = "Scegli il tipo di bici");
      const dataOra = new Date(`${root.querySelector("#data").value}T${root.querySelector("#ora").value}`);
      if (isNaN(dataOra) || dataOra < new Date()) return (err.textContent = "Data e ora devono essere nel futuro");
      const num = (id) => { const v = root.querySelector(id).value; return v ? Number(v) : null; };
      const link = root.querySelector("#link").value.trim();
      if (link && !/^https?:\/\//i.test(link)) return (err.textContent = "Il link deve iniziare con https://");
      const btn = root.querySelector("#pubblica"); btn.disabled = true;
      try {
        const id = await prova(() => api.creaUscita({
          tipo_bici_id: Number(sel.tipo),
          luogo_id: luogo.value === "__nuovo" ? null : Number(luogo.value),
          nuovo_luogo: luogo.value === "__nuovo" ? nuovo.value : null,
          data_ora: dataOra.toISOString(), km: num("#km"), dislivello: num("#disl"),
          andatura: sel.andatura, link_percorso: link, note: root.querySelector("#note").value.trim(),
        }), "Uscita pubblicata! 🚴");
        if (luogo.value === "__nuovo") state.luoghi = await api.luoghi();
        state.focusUscita = id; state.filtroTipo = null;
        closeSheet(); renderTab();
      } catch { btn.disabled = false; }
    };
  });
}

// ---------- AVVISI -----------------------------------------------------
async function tabAvvisi(main) {
  const avvisi = await api.avvisi();
  main.innerHTML = avvisi.length ? avvisi.map((a) => `
    <article class="card">
      <div class="notice-date">${fmtData(a.created_at)}</div>
      <h3>${h(a.titolo)}</h3>
      <p class="note" style="margin-top:4px">${h(a.testo)}</p>
      <div class="meta">${a.autore ? "— " + h(a.autore.nome) + " " + h(a.autore.cognome) : ""}</div>
      ${isAdmin() ? `<div class="row-actions"><button class="link-btn" data-del="${a.id}">Elimina</button></div>` : ""}
    </article>`).join("")
    : `<div class="empty"><div class="big">📭</div><p>Nessun avviso, tutto tranquillo.</p></div>`;
  main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!(await dialogo({ testo: cfg.TELEGRAM_CHANNEL_URL ? "Eliminare l'avviso? Il bot prova a toglierlo anche da Telegram (possibile entro 48 ore)." : "Eliminare l'avviso?", ok: "Elimina", pericolo: true }))) return;
    await prova(() => api.eliminaAvviso(b.dataset.del), "Avviso eliminato"); tabAvvisi(main);
  }));
}

function sheetNuovoAvviso() {
  openSheet("Nuovo avviso", `
    <form id="f-avv">
      <div class="field"><label for="tit">Titolo</label><input class="input" id="tit" required maxlength="120"></div>
      <div class="field"><label for="txt">Testo</label><textarea class="input" id="txt" rows="6" required maxlength="3000"></textarea></div>
      ${cfg.TELEGRAM_CHANNEL_URL ? `<div class="field"><label class="check"><input type="checkbox" id="tg" checked> Pubblica anche sul canale Telegram</label></div>` : ""}
      <div class="error" id="err"></div>
      <button class="btn accent block">Pubblica avviso</button>
    </form>`, (root) => {
    root.querySelector("#f-avv").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await prova(() => api.creaAvviso({
          titolo: root.querySelector("#tit").value.trim(), testo: root.querySelector("#txt").value.trim(),
          pubblica_telegram: root.querySelector("#tg")?.checked ?? false,
        }), "Avviso pubblicato 📣");
        closeSheet(); renderTab();
      } catch {}
    };
  });
}

// ---------- CONVENZIONI -----------------------------------------------
async function tabConvenzioni(main) {
  const conv = await api.convenzioni();
  const draw = () => {
    const q = state.cercaConv.toLowerCase();
    const lista = conv.filter((c) => !q || `${c.negozio} ${c.categoria} ${c.descrizione}`.toLowerCase().includes(q));
    main.querySelector("#conv-list").innerHTML = lista.length ? lista.map((c) => {
      const scaduta = c.scadenza && new Date(c.scadenza) < new Date(new Date().toDateString());
      const link = safeUrl(c.link);
      return `<article class="card deal" ${scaduta ? 'style="opacity:.5"' : ""}>
        <div>${c.categoria ? `<div class="cat">${h(c.categoria)}</div>` : ""}<h3>${h(c.negozio)}</h3></div>
        <div class="discount">${h(c.sconto)}</div>
        <div>${c.descrizione ? `<p>${h(c.descrizione)}</p>` : ""}
          ${c.indirizzo ? `<p class="meta">📍 <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.indirizzo)}" target="_blank" rel="noopener">${h(c.indirizzo)}</a></p>` : ""}
          ${link ? `<p class="meta">🔗 <a href="${link}" target="_blank" rel="noopener">Sito</a></p>` : ""}
          ${c.scadenza ? `<p class="meta">${scaduta ? "Scaduta il" : "Valida fino al"} ${fmtData(c.scadenza)}</p>` : ""}</div>
        ${c.come_ottenerlo ? `<div class="how">💡 ${h(c.come_ottenerlo)}</div>` : ""}
        ${isAdmin() ? `<div class="row-actions" style="grid-column:1/-1"><button class="btn ghost small" data-edit="${c.id}">Modifica</button><button class="btn danger small" data-del="${c.id}">Elimina</button></div>` : ""}
      </article>`;
    }).join("") : `<div class="empty"><div class="big">🏷️</div><p>${q ? "Nessun risultato." : "Ancora nessuna convenzione."}</p></div>`;
    main.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => sheetConvenzione(conv.find((c) => c.id === b.dataset.edit))));
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!(await dialogo({ testo: "Eliminare la convenzione?", ok: "Elimina", pericolo: true }))) return;
      await prova(() => api.eliminaConvenzione(b.dataset.del), "Eliminata"); tabConvenzioni(main);
    }));
  };
  main.innerHTML = `<input class="search" id="q" type="search" placeholder="Cerca negozio o categoria…" value="${h(state.cercaConv)}"><div id="conv-list"></div>`;
  main.querySelector("#q").oninput = (e) => { state.cercaConv = e.target.value; draw(); };
  draw();
}

function sheetConvenzione(c = {}) {
  const f = (id, label, attrs = "", val = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" ${attrs} value="${h(val)}"></div>`;
  openSheet(c.id ? "Modifica convenzione" : "Nuova convenzione", `
    <form id="f-conv">
      ${f("negozio", "Negozio / attività", "required maxlength=80", c.negozio)}
      <div class="grid2">${f("sconto", "Sconto", 'required maxlength=40 placeholder="-15%"', c.sconto)}${f("categoria", 'Categoria <span class="opt">(facolt.)</span>', 'maxlength=30 placeholder="Officina"', c.categoria)}</div>
      <div class="field"><label for="descr">Descrizione <span class="opt">(facolt.)</span></label><textarea class="input" id="descr" rows="2" maxlength="300">${h(c.descrizione)}</textarea></div>
      ${f("come", 'Come ottenerla <span class="opt">(facolt.)</span>', 'maxlength=150 placeholder="Mostra l\'app alla cassa"', c.come_ottenerlo)}
      ${f("ind", 'Indirizzo <span class="opt">(facolt.)</span>', "maxlength=120", c.indirizzo)}
      <div class="grid2">${f("link", 'Sito <span class="opt">(facolt.)</span>', 'type=url placeholder="https://"', c.link)}${f("scad", 'Scadenza <span class="opt">(facolt.)</span>', "type=date", c.scadenza)}</div>
      <button class="btn accent block">Salva</button>
    </form>`, (root) => {
    root.querySelector("#f-conv").onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => root.querySelector("#" + id).value.trim() || null;
      try {
        await prova(() => api.salvaConvenzione({
          ...(c.id ? { id: c.id } : {}), negozio: v("negozio"), sconto: v("sconto"), categoria: v("categoria"),
          descrizione: v("descr"), come_ottenerlo: v("come"), indirizzo: v("ind"), link: v("link"), scadenza: v("scad"),
        }), "Salvata");
        closeSheet(); renderTab();
      } catch {}
    };
  });
}

// ---------- DIVISE -----------------------------------------------------
const STATI = {
  attesa: { lbl: "In attesa", ico: "⏳", cls: "st-wait" },
  confermata: { lbl: "Confermata", ico: "✓", cls: "st-ok" },
  pronta: { lbl: "Pronta da ritirare", ico: "📦", cls: "st-ready" },
  consegnata: { lbl: "Consegnata", ico: "🎉", cls: "st-done" },
  annullata: { lbl: "Annullata", ico: "✕", cls: "st-off" },
};
const GUIDA_TAGLIE = {
  default: [["XS", "84–88", "70–74"], ["S", "88–92", "74–78"], ["M", "92–96", "78–82"], ["L", "96–102", "82–88"], ["XL", "102–108", "88–94"], ["XXL", "108–114", "94–100"]],
};
const euro = (n) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// disegno del capo (SVG generato, nessuna foto necessaria per la demo)
let svgN = 0;
const fotoOk = (u) => /^(https:\/\/|data:image\/)/i.test(u || "");
function disegnoCapo(c, cls = "") {
  if (fotoOk(c.foto_url)) return `<img class="capo-foto ${cls}" src="${h(c.foto_url)}" alt="${h(c.nome)}" loading="lazy">`;
  const id = "cp" + svgN++;
  const forme = {
    maglia: "M70 32 L55 37 L18 62 L33 98 L55 88 L55 176 L145 176 L145 88 L167 98 L182 62 L145 37 L130 32 Q100 52 70 32 Z",
    giacca: "M70 30 L55 35 L28 66 L14 152 L38 155 L55 96 L55 178 L145 178 L145 96 L162 155 L186 152 L172 66 L145 35 L130 30 Q100 50 70 30 Z",
    smanicato: "M70 30 L57 34 Q63 70 50 90 L50 176 L150 176 L150 90 Q137 70 143 34 L130 30 Q100 50 70 30 Z",
    salopette: "M72 18 L85 18 L89 72 L111 72 L115 18 L128 18 L133 82 L151 102 L154 172 L111 174 L100 132 L89 174 L46 172 L49 102 L67 82 Z",
    calze: "M78 16 L122 16 L122 116 Q122 138 144 148 L164 158 Q178 172 164 184 L96 184 Q76 184 78 160 Z",
  };
  const d = forme[c.tipo] || forme.maglia;
  const zip = ["maglia", "giacca", "smanicato"].includes(c.tipo);
  const banda = c.tipo === "calze" ? `<rect x="60" y="40" width="120" height="14" fill="${h(c.c2)}"/><rect x="60" y="62" width="120" height="6" fill="${h(c.c2)}"/>`
    : c.tipo === "salopette" ? `<rect x="40" y="148" width="130" height="10" fill="${h(c.c2)}"/>`
    : `<rect x="0" y="104" width="200" height="16" fill="${h(c.c2)}"/><rect x="0" y="126" width="200" height="5" fill="${h(c.c2)}"/>`;
  return `<svg class="capo-svg ${cls}" viewBox="0 0 200 200" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="${d}"/></clipPath>
      <linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>
    <ellipse cx="100" cy="190" rx="62" ry="6" fill="#000" opacity=".12"/>
    <path d="${d}" fill="${h(c.c1)}" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>
    <g clip-path="url(#${id})">${banda}
      ${zip ? `<line x1="100" y1="46" x2="100" y2="180" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="3 3"/>` : ""}
      ${c.tipo !== "calze" ? `<text x="${c.tipo === "salopette" ? 100 : 124}" y="${c.tipo === "salopette" ? 120 : 82}" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="20" text-anchor="middle" fill="${h(c.c2)}">SB</text>` : ""}
      <rect width="200" height="200" fill="url(#${id}g)"/></g>
  </svg>`;
}

function infoDisponibilita(c) {
  if (c.modalita === "ordine") {
    const chiusa = c.scadenza && new Date(c.scadenza) < new Date();
    return chiusa ? { txt: "Ordine chiuso", cls: "off" } : { txt: "Su ordinazione", cls: "order" };
  }
  const tot = c.taglie.reduce((a, t) => a + (t.disp || 0), 0);
  if (!tot) return { txt: "Esaurito", cls: "off" };
  return tot <= 3 ? { txt: tot === 1 ? "Ultimo pezzo" : `Ultimi ${tot} pezzi`, cls: "low" } : { txt: "Disponibile subito", cls: "ok" };
}

async function tabDivise(main) {
  state.divisa = state.divisa || "catalogo";
  const [capi, mie] = await Promise.all([api.divise(), api.miePrenotazioni()]);
  const attive = mie.filter((p) => !["consegnata", "annullata"].includes(p.stato)).length;
  const ordineAperto = capi.filter((c) => c.modalita === "ordine" && c.scadenza && new Date(c.scadenza) > new Date())
    .sort((a, b) => a.scadenza.localeCompare(b.scadenza))[0];
  const giorni = ordineAperto ? Math.ceil((new Date(ordineAperto.scadenza) - new Date()) / 864e5) : 0;

  const seg = [["catalogo", "Catalogo"], ["mie", `Le mie${attive ? ` · ${attive}` : ""}`], ...(isAdmin() ? [["gestione", "Gestione"]] : [])];
  main.innerHTML = `
    ${ordineAperto ? `<div class="order-banner"><div class="ob-num">${giorni}</div>
      <div><b>Ordine collettivo aperto</b><br><span>${giorni === 1 ? "giorno" : "giorni"} alla chiusura · ${new Date(ordineAperto.scadenza).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}</span></div></div>` : ""}
    <div class="seg">${seg.map(([k, l]) => `<button data-seg="${k}" aria-pressed="${state.divisa === k}">${h(l)}</button>`).join("")}</div>
    <div id="div-body"></div>`;
  main.querySelectorAll("[data-seg]").forEach((b) => (b.onclick = () => { state.divisa = b.dataset.seg; tabDivise(main); }));
  const body = main.querySelector("#div-body");

  if (state.divisa === "catalogo") {
    const gruppi = [["ordine", "Su ordinazione", "Si prenota ora, si ordina tutti insieme al fornitore alla chiusura."],
      ["magazzino", "Pronti in sede", "Già disponibili: prenoti la taglia e la ritiri."]];
    body.innerHTML = gruppi.map(([m, tit, sub]) => {
      const lista = capi.filter((c) => c.modalita === m);
      if (!lista.length) return "";
      return `<div class="section-title">${tit}</div><p class="hint" style="margin-top:-2px">${sub}</p>
        <div class="shop-grid">${lista.map((c) => {
          const inf = infoDisponibilita(c);
          return `<button class="prod" data-capo="${h(c.id)}">
            <div class="prod-img" style="--tint:${h(c.c2)}">${disegnoCapo(c)}</div>
            <div class="prod-body"><div class="prod-name">${h(c.nome)}</div>
              <div class="prod-row"><span class="prod-price">${euro(c.prezzo)}</span><span class="avail ${inf.cls}">${inf.txt}</span></div></div>
          </button>`;
        }).join("")}</div>`;
    }).join("") || `<div class="empty"><div class="big">👕</div><p>Il catalogo è ancora vuoto.${isAdmin() ? "<br>Aggiungi il primo capo da <b>Gestione</b>." : ""}</p></div>`;
    body.querySelectorAll("[data-capo]").forEach((b) => (b.onclick = () => sheetCapo(capi.find((c) => c.id === b.dataset.capo), () => tabDivise(main))));
  }

  if (state.divisa === "mie") {
    const tot = mie.filter((p) => p.stato !== "annullata").reduce((a, p) => a + p.qta * p.capo.prezzo, 0);
    const daPagare = mie.filter((p) => p.stato !== "annullata" && !p.pagato).reduce((a, p) => a + p.qta * p.capo.prezzo, 0);
    body.innerHTML = mie.length ? `
      <div class="totbox"><div><span class="meta">Totale prenotato</span><strong>${euro(tot)}</strong></div>
        <div><span class="meta">Da pagare</span><strong class="${daPagare ? "due" : ""}">${euro(daPagare)}</strong></div></div>
      ${mie.map((p) => {
        const st = STATI[p.stato];
        return `<article class="card booking ${p.stato === "annullata" ? "is-off" : ""}">
          <div class="bk-img">${disegnoCapo(p.capo)}</div>
          <div class="grow"><div class="name">${h(p.capo.nome)}</div>
            <div class="meta">Taglia <b>${h(p.taglia)}</b> · ${p.qta} pz · ${euro(p.qta * p.capo.prezzo)}</div>
            <div class="row-actions" style="margin-top:8px;align-items:center">
              <span class="status ${st.cls}">${st.ico} ${st.lbl}</span>
              ${p.stato !== "annullata" ? `<span class="status ${p.pagato ? "st-ok" : "st-wait"}">${p.pagato ? "€ Pagato" : "€ Da pagare"}</span>` : ""}
            </div>
            ${["attesa", "confermata"].includes(p.stato) ? `<button class="link-btn" data-ann="${h(p.id)}" style="margin-top:8px">Annulla prenotazione</button>` : ""}
          </div></article>`;
      }).join("")}
      <div class="card"><h3>💶 Come pagare</h3><p>Contanti al ritiro in sede, oppure bonifico:</p>
        <p class="meta">IBAN: IT00 X000 0000 0000 0000 0000 000 (esempio)<br>Causale: Divise – ${h(api.me.nome)} ${h(api.me.cognome)}</p></div>`
      : `<div class="empty"><div class="big">👕</div><p>Nessuna prenotazione.<br>Dai un'occhiata al catalogo!</p></div>`;
    body.querySelectorAll("[data-ann]").forEach((b) => (b.onclick = async () => {
      if (!(await dialogo({ testo: "Annullare questa prenotazione?", ok: "Annulla prenotazione", pericolo: true }))) return;
      await prova(() => api.annullaPrenotazione(b.dataset.ann), "Prenotazione annullata"); tabDivise(main);
    }));
  }

  if (state.divisa === "gestione") await gestioneDivise(body, capi, () => tabDivise(main));
}

function sheetCapo(c, dopo) {
  const inf = infoDisponibilita(c);
  const chiuso = inf.cls === "off";
  const sel = { taglia: null, qta: 1 };
  const guida = c.tipo === "calze" ? "" : `<details class="more"><summary>📏 Guida alle taglie</summary>
    <table class="size-table"><thead><tr><th>Taglia</th><th>Torace cm</th><th>Vita cm</th></tr></thead><tbody>
    ${GUIDA_TAGLIE.default.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</tbody></table>
    <p class="hint">Vestibilità aderente: tra due taglie, prendi la più grande. Misure d'esempio.</p></details>`;
  openSheet(c.nome, `
    <div class="prod-hero" style="--tint:${h(c.c2)}">${disegnoCapo(c, "big")}</div>
    <div class="prod-row" style="margin:12px 0 4px"><span class="prod-price big">${euro(c.prezzo)}</span><span class="avail ${inf.cls}">${inf.txt}</span></div>
    <p class="note" style="margin:6px 0 14px">${h(c.descrizione)}</p>
    ${c.modalita === "ordine" && c.scadenza ? `<p class="hint" style="margin:-6px 0 14px">🗓️ Prenotazioni fino al ${new Date(c.scadenza).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}, poi si ordina al fornitore. Consegna stimata: 4–6 settimane.</p>` : ""}
    <div class="field"><span class="lbl">Taglia</span>
      <div class="sizes">${c.taglie.map((t) => {
        const esaurita = c.modalita === "magazzino" && !t.disp;
        return `<button type="button" class="size" data-t="${h(t.t)}" ${esaurita || chiuso ? "disabled" : ""} aria-pressed="false">${h(t.t)}
          ${c.modalita === "magazzino" ? `<small>${esaurita ? "esaurita" : t.disp <= 2 ? `ultim${t.disp === 1 ? "a" : "e"} ${t.disp}` : "disp."}</small>` : ""}</button>`;
      }).join("")}</div>
    </div>
    ${guida}
    <div class="field"><span class="lbl">Quantità</span>
      <div class="stepper"><button type="button" id="q-meno" aria-label="Meno">−</button><span id="q">1</span><button type="button" id="q-piu" aria-label="Più">+</button></div></div>
    <div class="error" id="err"></div>
    <button class="btn accent block" id="b-pren" ${chiuso ? "disabled" : ""}>${chiuso ? inf.txt : "Prenota"}</button>
    <p class="hint" style="text-align:center">Nessun pagamento ora: paghi al ritiro o con bonifico.</p>`, (root) => {
    const aggiorna = () => {
      root.querySelector("#q").textContent = sel.qta;
      const b = root.querySelector("#b-pren");
      if (!chiuso) b.textContent = sel.taglia ? `Prenota ${sel.qta} × ${sel.taglia} · ${euro(sel.qta * c.prezzo)}` : "Scegli la taglia";
    };
    root.querySelectorAll(".size").forEach((b) => (b.onclick = () => {
      sel.taglia = b.dataset.t;
      root.querySelectorAll(".size").forEach((x) => x.setAttribute("aria-pressed", x === b));
      const t = c.taglie.find((x) => x.t === sel.taglia);
      if (c.modalita === "magazzino" && sel.qta > t.disp) sel.qta = t.disp;
      aggiorna();
    }));
    root.querySelector("#q-meno").onclick = () => { sel.qta = Math.max(1, sel.qta - 1); aggiorna(); };
    root.querySelector("#q-piu").onclick = () => {
      const max = c.modalita === "magazzino" && sel.taglia ? c.taglie.find((x) => x.t === sel.taglia).disp : 10;
      sel.qta = Math.min(max, sel.qta + 1); aggiorna();
    };
    root.querySelector("#b-pren").onclick = async () => {
      if (!sel.taglia) return (root.querySelector("#err").textContent = "Scegli una taglia");
      try {
        await prova(() => api.prenota(c.id, sel.taglia, sel.qta), "Prenotato! 👕");
        state.divisa = "mie"; closeSheet(); dopo();
      } catch {}
    };
    aggiorna();
  });
}

async function gestioneDivise(body, capi, dopo) {
  const pren = await api.tuttePrenotazioni();
  const daOrdinare = capi.filter((c) => c.modalita === "ordine").map((c) => {
    const righe = pren.filter((p) => p.capo_id === c.id);
    const perTaglia = c.taglie.map((t) => [t.t, righe.filter((p) => p.taglia === t.t).reduce((a, p) => a + p.qta, 0)]);
    return { c, perTaglia, tot: perTaglia.reduce((a, [, n]) => a + n, 0) };
  });
  const incassato = pren.filter((p) => p.pagato).reduce((a, p) => a + p.qta * p.capo.prezzo, 0);
  const daIncassare = pren.filter((p) => !p.pagato).reduce((a, p) => a + p.qta * p.capo.prezzo, 0);
  const testoFornitore = daOrdinare.filter((x) => x.tot).map((x) =>
    `${x.c.nome}: ${x.perTaglia.filter(([, n]) => n).map(([t, n]) => `${n}×${t}`).join(", ")} (tot ${x.tot})`).join("\n");

  body.innerHTML = `
    <div class="totbox"><div><span class="meta">Incassato</span><strong>${euro(incassato)}</strong></div>
      <div><span class="meta">Da incassare</span><strong class="${daIncassare ? "due" : ""}">${euro(daIncassare)}</strong></div></div>

    <div class="section-title">Riepilogo per il fornitore</div>
    <div class="card">
      ${daOrdinare.map((x) => `<div class="sum-row"><div class="name">${h(x.c.nome)} <span class="meta">· ${x.tot} pz</span></div>
        <div class="sum-sizes">${x.perTaglia.map(([t, n]) => `<span class="${n ? "has" : ""}"><small>${h(t)}</small>${n}</span>`).join("")}</div></div>`).join("")}
      <button class="btn ghost small" id="b-forn" style="margin-top:10px" ${testoFornitore ? "" : "disabled"}>📋 Copia ordine per il fornitore</button>
    </div>

    <div class="section-title">Prenotazioni · ${pren.length}</div>
    <div class="card">${pren.map((p) => `
      <div class="list-item" style="align-items:flex-start">
        <span class="avatar" style="margin:0">${h(iniziali(p.socio))}</span>
        <div class="grow"><div class="name">${h(p.socio?.nome)} ${h(p.socio?.cognome)}</div>
          <div class="meta">${h(p.capo.nome)} · <b>${h(p.taglia)}</b> × ${p.qta} · ${euro(p.qta * p.capo.prezzo)}</div>
          <div class="row-actions" style="margin-top:6px">
            <select class="mini-select" data-stato="${h(p.id)}">${["attesa", "confermata", "pronta", "consegnata"].map((s) => `<option value="${s}" ${p.stato === s ? "selected" : ""}>${STATI[s].ico} ${STATI[s].lbl}</option>`).join("")}</select>
            <button class="status ${p.pagato ? "st-ok" : "st-wait"} as-btn" data-pag="${h(p.id)}">${p.pagato ? "€ Pagato" : "€ Segna pagato"}</button>
          </div></div>
      </div>`).join("") || `<p class="meta">Nessuna prenotazione.</p>`}</div>

    <div class="section-title">Capi in catalogo · ${capi.length}</div>
    <div class="card">
      <button class="btn accent block" id="b-capo">+ Aggiungi un capo</button>
      ${capi.map((c) => `
      <div class="list-item"><div class="bk-img small">${disegnoCapo(c)}</div>
        <div class="grow"><div class="name">${h(c.nome)}</div><div class="meta">${euro(c.prezzo)} · ${c.modalita === "ordine" ? "su ordinazione" + (c.scadenza ? " fino al " + new Date(c.scadenza).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "") : "magazzino: " + c.taglie.map((t) => `${h(t.t)} ${t.disp ?? 0}`).join(" · ")}</div></div>
        <button class="btn ghost small" data-mod="${h(c.id)}">Modifica</button>
      </div>`).join("")}
    </div>`;

  body.querySelector("#b-capo").onclick = () => sheetEditorCapo(null, dopo);
  body.querySelectorAll("[data-mod]").forEach((b) => (b.onclick = () => sheetEditorCapo(capi.find((c) => c.id === b.dataset.mod), dopo)));
  body.querySelector("#b-forn").onclick = () => navigator.clipboard?.writeText(testoFornitore).then(() => toast("Ordine copiato")).catch(() => toast("Copia non riuscita"));
  body.querySelectorAll("[data-stato]").forEach((s) => (s.onchange = async () => {
    await prova(() => api.aggiornaPrenotazione(s.dataset.stato, { stato: s.value }), "Stato aggiornato"); dopo();
  }));
  body.querySelectorAll("[data-pag]").forEach((b) => (b.onclick = async () => {
    const p = pren.find((x) => x.id === b.dataset.pag);
    await prova(() => api.aggiornaPrenotazione(p.id, { pagato: !p.pagato }), p.pagato ? "Segnato da pagare" : "Pagamento registrato"); dopo();
  }));
}


// riduce la foto (max 1000 px, JPEG) prima del caricamento
function riduciFoto(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => (b ? res(b) : rej(new Error("Foto non leggibile"))), "image/jpeg", 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => rej(new Error("Formato foto non supportato"));
    img.src = URL.createObjectURL(file);
  });
}

const PRESET_TAGLIE = { "XS–XXL": ["XS", "S", "M", "L", "XL", "XXL"], "S–XXL": ["S", "M", "L", "XL", "XXL"], "Calze": ["36-39", "40-43", "44-47"], "Unica": ["Unica"] };

function sheetEditorCapo(capo, dopo) {
  const c = capo ? structuredClone(capo) : { nome: "", tipo: "maglia", c1: "#14171c", c2: "#ff5a1f", prezzo: "", descrizione: "", modalita: "ordine", scadenza: null, foto_url: null, taglie: PRESET_TAGLIE["XS–XXL"].map((t) => ({ t, disp: null })) };
  const scad = c.scadenza ? new Date(c.scadenza) : null;
  const scadVal = scad ? `${scad.getFullYear()}-${String(scad.getMonth() + 1).padStart(2, "0")}-${String(scad.getDate()).padStart(2, "0")}` : "";
  openSheet(capo ? "Modifica capo" : "Nuovo capo", `
    <form id="f-capo">
      <div class="prod-hero" id="ed-prev" style="--tint:${h(c.c2)}">${disegnoCapo(c, "big")}</div>
      <div class="row-actions" style="margin:10px 0 16px">
        <label class="btn ghost small" style="cursor:pointer">📷 <span id="ed-foto-lbl">${c.foto_url ? "Cambia foto" : "Aggiungi foto"}</span><input type="file" accept="image/*" id="ed-foto" hidden></label>
        <button type="button" class="btn ghost small" id="ed-nofoto" ${c.foto_url ? "" : 'style="display:none"'}>Usa il disegno</button>
      </div>
      <div class="field"><label for="ed-nome">Nome</label><input class="input" id="ed-nome" required maxlength="60" value="${h(c.nome)}" placeholder="Maglia estiva 2027"></div>
      <div class="grid2">
        <div class="field"><label for="ed-prezzo">Prezzo €</label><input class="input" id="ed-prezzo" type="number" min="0" step="0.5" required inputmode="decimal" value="${h(c.prezzo)}"></div>
        <div class="field"><label for="ed-tipo">Tipo</label><select class="input" id="ed-tipo">
          ${["maglia", "smanicato", "giacca", "salopette", "calze", "altro"].map((t) => `<option ${c.tipo === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      </div>
      <div class="field"><span class="lbl">Colori del disegno <span class="opt">(se non c'è la foto)</span></span>
        <div class="row-actions" style="margin:0"><input type="color" id="ed-c1" value="${h(c.c1)}" class="swatch"><input type="color" id="ed-c2" value="${h(c.c2)}" class="swatch"></div></div>
      <div class="field"><label for="ed-descr">Descrizione</label><textarea class="input" id="ed-descr" rows="2" maxlength="300">${h(c.descrizione)}</textarea></div>
      <div class="field"><span class="lbl">Come si prenota</span>
        <div class="seg" id="ed-mod">
          <button type="button" data-v="ordine" aria-pressed="${c.modalita === "ordine"}">Su ordinazione</button>
          <button type="button" data-v="magazzino" aria-pressed="${c.modalita === "magazzino"}">A magazzino</button></div></div>
      <div class="field" id="ed-scad-box"><label for="ed-scad">Chiusura ordine <span class="opt">(facolt.)</span></label><input class="input" id="ed-scad" type="date" value="${scadVal}"></div>
      <div class="field"><span class="lbl">Taglie <span class="opt" id="ed-tg-hint"></span></span>
        <div class="chips" style="padding-top:0">${Object.keys(PRESET_TAGLIE).map((k) => `<button type="button" class="chip" data-preset="${h(k)}">${h(k)}</button>`).join("")}</div>
        <div id="ed-taglie"></div>
        <button type="button" class="link-btn" id="ed-add">+ aggiungi taglia</button></div>
      <div class="error" id="err"></div>
      <button class="btn accent block" id="ed-save">Salva</button>
      ${capo ? `<button type="button" class="btn danger block" id="ed-off" style="margin-top:10px">Togli dal catalogo</button>` : ""}
    </form>`, (root) => {
    const $ = (q) => root.querySelector(q);
    const leggiTaglie = () => [...root.querySelectorAll(".tg-row")].map((r) => ({
      t: r.querySelector(".tg-n").value.trim(), disp: c.modalita === "magazzino" ? Math.max(0, Number(r.querySelector(".tg-q").value) || 0) : null,
    })).filter((x) => x.t);
    const disegnaTaglie = () => {
      $("#ed-taglie").innerHTML = c.taglie.map((t) => `<div class="tg-row">
        <input class="input tg-n" value="${h(t.t)}" maxlength="12" aria-label="Taglia">
        ${c.modalita === "magazzino" ? `<input class="input tg-q" type="number" min="0" max="999" inputmode="numeric" value="${t.disp ?? 0}" aria-label="Pezzi">` : ""}
        <button type="button" class="icon-btn tg-x" aria-label="Rimuovi">✕</button></div>`).join("");
      $("#ed-tg-hint").textContent = c.modalita === "magazzino" ? "(taglia · pezzi in sede)" : "";
      root.querySelectorAll(".tg-x").forEach((b, i) => (b.onclick = () => { c.taglie = leggiTaglie(); c.taglie.splice(i, 1); disegnaTaglie(); }));
    };
    const anteprima = () => { $("#ed-prev").style.setProperty("--tint", c.c2); $("#ed-prev").innerHTML = disegnoCapo(c, "big"); $("#ed-nofoto").style.display = c.foto_url ? "" : "none"; $("#ed-foto-lbl").textContent = c.foto_url ? "Cambia foto" : "Aggiungi foto"; };
    const modalita = () => {
      root.querySelectorAll("#ed-mod button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === c.modalita));
      $("#ed-scad-box").style.display = c.modalita === "ordine" ? "" : "none";
      disegnaTaglie();
    };
    root.querySelectorAll("#ed-mod button").forEach((b) => (b.onclick = () => { c.taglie = leggiTaglie(); c.modalita = b.dataset.v; modalita(); }));
    root.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => { c.taglie = PRESET_TAGLIE[b.dataset.preset].map((t) => ({ t, disp: 0 })); disegnaTaglie(); }));
    $("#ed-add").onclick = () => { c.taglie = leggiTaglie(); c.taglie.push({ t: "", disp: 0 }); disegnaTaglie(); root.querySelector(".tg-row:last-child .tg-n").focus(); };
    ["#ed-c1", "#ed-c2", "#ed-tipo"].forEach((q) => ($(q).oninput = () => { c.c1 = $("#ed-c1").value; c.c2 = $("#ed-c2").value; c.tipo = $("#ed-tipo").value; c.nome = $("#ed-nome").value; anteprima(); }));
    $("#ed-nofoto").onclick = () => { c.foto_url = null; anteprima(); };
    $("#ed-foto").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      $("#ed-prev").innerHTML = `<div class="spinner"></div>`;
      try { c.foto_url = await api.caricaFoto(await riduciFoto(f)); toast("Foto caricata"); }
      catch (err) { toast("⚠️ " + err.message); }
      anteprima();
    };
    $("#f-capo").onsubmit = async (e) => {
      e.preventDefault();
      const taglie = leggiTaglie();
      if (!taglie.length) return ($("#err").textContent = "Inserisci almeno una taglia");
      if (new Set(taglie.map((t) => t.t)).size !== taglie.length) return ($("#err").textContent = "Ci sono taglie ripetute");
      const sv = $("#ed-scad").value;
      const dati = {
        ...(capo ? { id: capo.id } : {}), nome: $("#ed-nome").value.trim(), tipo: $("#ed-tipo").value, c1: $("#ed-c1").value, c2: $("#ed-c2").value,
        prezzo: Number($("#ed-prezzo").value), descrizione: $("#ed-descr").value.trim() || null, modalita: c.modalita,
        scadenza: c.modalita === "ordine" && sv ? new Date(`${sv}T23:59:00`).toISOString() : null, foto_url: c.foto_url || null, taglie,
      };
      $("#ed-save").disabled = true;
      try { await prova(() => api.salvaCapo(dati), "Capo salvato"); closeSheet(); dopo(); }
      catch { $("#ed-save").disabled = false; }
    };
    if (capo) $("#ed-off").onclick = async () => {
      if (!(await dialogo({ testo: `Togliere "${capo.nome}" dal catalogo? Le prenotazioni esistenti restano.`, ok: "Togli", pericolo: true }))) return;
      await prova(() => api.salvaCapo({ id: capo.id, attivo: false }), "Tolto dal catalogo"); closeSheet(); dopo();
    };
    modalita();
  });
}

// ---------- PROFILO + ADMIN --------------------------------------------
async function tabProfilo(main) {
  const me = api.me;
  const codice = ls.get("sbb-codice");
  main.innerHTML = `
    <div class="card" style="display:flex;gap:14px;align-items:center">
      <span class="avatar" style="width:56px;height:56px;font-size:20px;margin:0">${h(iniziali(me))}</span>
      <div><h3 style="margin:0">${h(me.nome)} ${h(me.cognome)}</h3>
        <div class="meta">${isAdmin() ? '<span class="tag admin" style="margin:0">Admin</span>' : "Socio"}</div></div>
    </div>
    ${codice ? `<div class="card"><div class="meta">IL TUO CODICE DI ACCESSO</div>
      <div style="font:800 28px/1.2 var(--display);letter-spacing:4px">${h(codice)}</div>
      <p class="hint">Serve per collegare un altro dispositivo o l'app installata sulla Home. Non condividerlo.</p></div>` : ""}
    <div class="card">
      <h3>📲 Installa l'app</h3>
      <p>Aggiungila alla schermata Home: si apre come un'app vera, a schermo intero.</p>
      <button class="btn ghost small" id="b-inst">Come si fa</button>
    </div>
    ${safeUrl(cfg.TELEGRAM_CHANNEL_URL) ? `<div class="card">
      <h3>🔔 Notifiche</h3>
      <p>Uscite e avvisi arrivano sul canale Telegram della squadra: tieni attive le notifiche solo lì.</p>
      <a class="btn accent small" href="${safeUrl(cfg.TELEGRAM_CHANNEL_URL)}" target="_blank" rel="noopener">Apri il canale</a>
    </div>` : ""}
    <div id="admin"></div>
    <div style="text-align:center;margin-top:24px"><button class="link-btn" id="b-esci">Scollega questo dispositivo</button></div>`;
  main.querySelector("#b-inst").onclick = sheetInstalla;
  main.querySelector("#b-esci").onclick = async () => {
    if (!(await dialogo({ testo: "Scollegare questo dispositivo? Per rientrare servirà di nuovo il codice.", ok: "Scollega", pericolo: true }))) return;
    await api.esci(); ls.del("sbb-codice"); location.reload();
  };
  if (isAdmin()) await sezioneAdmin(main.querySelector("#admin"));
}

async function sezioneAdmin(box) {
  const soci = await api.soci();
  const draw = () => {
    const q = state.cercaSoci.toLowerCase();
    const lista = soci.filter((s) => !q || `${s.nome} ${s.cognome}`.toLowerCase().includes(q));
    box.querySelector("#soci-list").innerHTML = lista.map((s) => `
      <div class="list-item">
        <span class="avatar" style="margin:0;${s.attivo ? "" : "opacity:.4"}">${h(iniziali(s))}</span>
        <div class="grow"><div class="name">${h(s.cognome)} ${h(s.nome)}
          ${s.ruolo === "admin" ? '<span class="tag admin">admin</span>' : ""}${s.attivo ? "" : '<span class="tag off">disattivo</span>'}</div>
          <div class="meta">${s.n_dispositivi ? `📱 ${s.n_dispositivi} dispositiv${s.n_dispositivi === 1 ? "o" : "i"}` : "⏳ invito non ancora usato"}</div></div>
        <button class="btn ghost small" data-socio="${s.id}">Gestisci</button>
      </div>`).join("") || `<p class="meta">Nessun socio trovato.</p>`;
    box.querySelectorAll("[data-socio]").forEach((b) => (b.onclick = () => sheetSocio(soci.find((s) => s.id === b.dataset.socio))));
  };
  box.innerHTML = `
    <div class="section-title">Soci · ${soci.length}</div>
    <div class="card">
      <button class="btn accent block" id="b-nuovo">+ Invita un socio</button>
      <input class="search" id="qs" type="search" placeholder="Cerca socio…" value="${h(state.cercaSoci)}" style="margin-top:12px">
      <div id="soci-list"></div>
    </div>
    <div class="section-title">Luoghi di partenza</div>
    <div class="card">${state.luoghi.map((l) => `
      <div class="list-item"><div class="grow">${h(l.nome)}</div>
        <button class="btn ghost small" data-ren="${l.id}">Rinomina</button>
        <button class="btn danger small" data-dl="${l.id}">✕</button></div>`).join("")}
      <p class="hint">I nuovi luoghi li aggiungono i soci quando creano un'uscita. Un luogo usato da qualche uscita non si può eliminare.</p>
    </div>`;
  box.querySelector("#qs").oninput = (e) => { state.cercaSoci = e.target.value; draw(); };
  box.querySelector("#b-nuovo").onclick = sheetNuovoSocio;
  box.querySelectorAll("[data-ren]").forEach((b) => (b.onclick = async () => {
    const l = state.luoghi.find((x) => x.id === Number(b.dataset.ren));
    const nome = await dialogo({ testo: "Nuovo nome del luogo", input: l.nome, ok: "Salva" });
    if (!nome || nome.trim() === l.nome) return;
    await prova(() => api.rinominaLuogo(l.id, nome.trim()), "Rinominato");
    state.luoghi = await api.luoghi(); renderTab();
  }));
  box.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => {
    if (!(await dialogo({ testo: "Eliminare questo luogo?", ok: "Elimina", pericolo: true }))) return;
    await prova(() => api.eliminaLuogo(Number(b.dataset.dl)), "Eliminato");
    state.luoghi = await api.luoghi(); renderTab();
  }));
  draw();
}

function messaggioInvito(nome, codice) {
  return `Ciao ${nome}! 🚴 Ecco il tuo accesso personale all'app ${cfg.NOME_SQUADRA || "SBUBBIKERS"}:\n👉 ${linkInvito(codice)}\n\nIl tuo codice è ${codice}: conservalo, serve se installi l'app sulla schermata Home o cambi telefono. Non girarlo ad altri, è solo tuo.`;
}

function bloccoInvito(nome, codice) {
  return `<div class="code-box"><span class="meta">CODICE DI ${h(nome.toUpperCase())}</span><strong>${h(codice)}</strong>
    <div class="meta" style="word-break:break-all">${h(linkInvito(codice))}</div></div>
    <div class="grid2" style="margin-top:12px">
      <button class="btn accent" id="b-share">Invia…</button>
      <button class="btn ghost" id="b-copy">Copia messaggio</button>
    </div>`;
}
function attivaInvito(root, nome, codice) {
  const msg = messaggioInvito(nome, codice);
  root.querySelector("#b-share").onclick = () => condividiTesto(msg);
  root.querySelector("#b-copy").onclick = () => navigator.clipboard?.writeText(msg).then(() => toast("Messaggio copiato"));
}

function sheetNuovoSocio() {
  openSheet("Invita un socio", `
    <form id="f-socio">
      <div class="grid2">
        <div class="field"><label for="n">Nome</label><input class="input" id="n" required maxlength="40" autocapitalize="words"></div>
        <div class="field"><label for="c">Cognome</label><input class="input" id="c" required maxlength="40" autocapitalize="words"></div>
      </div>
      <div class="field"><label class="check"><input type="checkbox" id="adm"> È un admin (può pubblicare avvisi e gestire soci)</label></div>
      <button class="btn accent block">Crea invito</button>
    </form>
    <div id="esito"></div>`, (root) => {
    root.querySelector("#f-socio").onsubmit = async (e) => {
      e.preventDefault();
      const nome = root.querySelector("#n").value.trim(), cognome = root.querySelector("#c").value.trim();
      try {
        const r = await prova(() => api.creaSocio(nome, cognome, root.querySelector("#adm").checked), "Invito creato");
        root.querySelector("#f-socio").style.display = "none";
        root.querySelector("#esito").innerHTML = `<p>Invito pronto per <b>${h(nome)} ${h(cognome)}</b>. Mandaglielo in privato (WhatsApp, Telegram…):</p>` + bloccoInvito(nome, r.codice);
        attivaInvito(root, nome, r.codice);
        renderTab();
      } catch {}
    };
  });
}

function sheetSocio(s) {
  openSheet(`${s.nome} ${s.cognome}`, `
    <div id="inv">${s.codice ? bloccoInvito(s.nome, s.codice) : `<p class="meta">Nessun codice attivo.</p>`}</div>
    <div class="section-title">Azioni</div>
    <div class="card">
      <div class="list-item"><div class="grow"><div class="name">Nuovo codice</div><div class="meta">Scollega tutti i suoi dispositivi e genera un nuovo invito (telefono perso, codice girato ad altri…)</div></div>
        <button class="btn ghost small" id="a-reset">Rigenera</button></div>
      <div class="list-item"><div class="grow"><div class="name">${s.ruolo === "admin" ? "Togli admin" : "Rendi admin"}</div></div>
        <button class="btn ghost small" id="a-ruolo" ${s.id === api.me.id ? "disabled" : ""}>${s.ruolo === "admin" ? "Togli" : "Promuovi"}</button></div>
      <div class="list-item"><div class="grow"><div class="name">${s.attivo ? "Disattiva accesso" : "Riattiva accesso"}</div><div class="meta">Chi lascia la squadra non vede più nulla</div></div>
        <button class="btn ${s.attivo ? "danger" : "ghost"} small" id="a-att" ${s.id === api.me.id ? "disabled" : ""}>${s.attivo ? "Disattiva" : "Riattiva"}</button></div>
    </div>`, (root) => {
    if (s.codice) attivaInvito(root, s.nome, s.codice);
    root.querySelector("#a-reset").onclick = async () => {
      if (!(await dialogo({ testo: `Generare un nuovo codice per ${s.nome}? I suoi dispositivi verranno scollegati.`, ok: "Rigenera", pericolo: true }))) return;
      const cod = await prova(() => api.resetInvito(s.id), "Nuovo codice generato");
      root.querySelector("#inv").innerHTML = bloccoInvito(s.nome, cod);
      attivaInvito(root, s.nome, cod); renderTab();
    };
    root.querySelector("#a-ruolo").onclick = async () => {
      await prova(() => api.aggiornaSocio(s.id, { ruolo: s.ruolo === "admin" ? "socio" : "admin" }), "Ruolo aggiornato");
      closeSheet(); renderTab();
    };
    root.querySelector("#a-att").onclick = async () => {
      if (s.attivo && !(await dialogo({ testo: `Disattivare l'accesso di ${s.nome}?`, ok: "Disattiva", pericolo: true }))) return;
      await prova(() => api.aggiornaSocio(s.id, { attivo: !s.attivo }), s.attivo ? "Accesso disattivato" : "Accesso riattivato");
      closeSheet(); renderTab();
    };
  });
}

function sheetInstalla() {
  openSheet("Installa l'app", `
    ${state.installPrompt ? `<button class="btn accent block" id="b-pr">Installa ora</button><p class="hint" style="text-align:center">oppure segui i passi qui sotto</p>` : ""}
    <div class="card"><h3>🍏 iPhone (Safari)</h3><ol class="steps">
      <li>Apri il link dell'app con <b>Safari</b></li>
      <li>Tocca il pulsante <b>Condividi</b> (quadrato con freccia ↑)</li>
      <li>Scorri e scegli <b>Aggiungi alla schermata Home</b></li>
      <li>Apri l'app dalla nuova icona e inserisci il tuo <b>codice</b></li></ol></div>
    <div class="card"><h3>🤖 Android (Chrome)</h3><ol class="steps">
      <li>Apri il link dell'app con <b>Chrome</b></li>
      <li>Tocca i <b>tre puntini ⋮</b> in alto a destra</li>
      <li>Scegli <b>Installa app</b> (o <i>Aggiungi a schermata Home</i>)</li></ol></div>
    <div class="card"><h3>💻 Computer</h3><p>Chrome o Edge: icona di installazione nella barra degli indirizzi. Oppure usa semplicemente il sito.</p></div>`, (root) => {
    const b = root.querySelector("#b-pr");
    if (b) b.onclick = async () => { state.installPrompt.prompt(); state.installPrompt = null; closeSheet(); };
  });
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.installPrompt = e; });

// ---------- bottom sheet -----------------------------------------------
function openSheet(titolo, html, onMount) {
  $sheet.innerHTML = `<div class="sheet-backdrop" id="bd"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${h(titolo)}"><div class="grab"></div><h2>${h(titolo)}</h2>${html}</div>`;
  document.body.style.overflow = "hidden";
  $sheet.querySelector("#bd").onclick = closeSheet;
  onMount?.($sheet.querySelector(".sheet"));
}
function closeSheet() { $sheet.innerHTML = ""; document.body.style.overflow = ""; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

// ---------- finestra di conferma interna (al posto di confirm/prompt) ----
function dialogo({ testo, input = null, ok = "Conferma", pericolo = false }) {
  return new Promise((resolve) => {
    const d = document.createElement("div");
    d.className = "dlg-wrap";
    d.innerHTML = `<div class="dlg" role="alertdialog" aria-modal="true">
      <p>${h(testo)}</p>
      ${input !== null ? `<input class="input" id="dlg-in" value="${h(input)}" maxlength="80">` : ""}
      <div class="grid2" style="margin-top:14px">
        <button class="btn ghost" data-r="0">Indietro</button>
        <button class="btn ${pericolo ? "danger-fill" : "accent"}" data-r="1">${h(ok)}</button>
      </div></div>`;
    document.body.appendChild(d);
    const fine = (v) => { d.remove(); resolve(v); };
    d.querySelector('[data-r="0"]').onclick = () => fine(input !== null ? null : false);
    d.querySelector('[data-r="1"]').onclick = () => fine(input !== null ? d.querySelector("#dlg-in").value : true);
    d.onclick = (e) => { if (e.target === d) fine(input !== null ? null : false); };
    (d.querySelector("#dlg-in") || d.querySelector('[data-r="1"]')).focus();
  });
}
async function condividiTesto(testo) {
  try { if (navigator.share) { await navigator.share({ text: testo }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(testo); toast("Copiato: incollalo in WhatsApp o Telegram"); }
  catch { toast("Copia non riuscita"); }
}


// ---------- service worker (app installabile / offline) ----------------
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

start().catch((e) => {
  console.error(e);
  $app.innerHTML = `<div class="empty"><div class="big">⚠️</div><p>Impossibile avviare l'app.<br>${h(e.message)}</p></div>`;
});
