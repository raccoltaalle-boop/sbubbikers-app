// Accesso ai dati reali su Supabase
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USCITA_SELECT =
  "id,socio_id,data_ora,km,dislivello,andatura,note,link_percorso,annullata," +
  "tipo:tipi_bici(id,nome,emoji),luogo:luoghi(id,nome,link_mappa)," +
  "autore:soci!uscite_socio_id_fkey(nome,cognome)," +
  "partecipanti(socio_id,socio:soci(nome,cognome))";

function traduci(msg = "") {
  if (msg.includes("duplicate key")) return "Esiste già un elemento con questo nome";
  if (msg.includes("foreign key")) return "Elemento in uso, non si può eliminare";
  if (msg.includes("row-level security") || msg.includes("permission denied")) return "Permesso negato";
  if (msg.includes("Failed to fetch")) return "Connessione assente, riprova";
  return msg;
}

function descrizioneDispositivo() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Altro";
  return `${os} · ${new Date().toLocaleDateString("it-IT")}`;
}

export function createApi(cfg) {
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  let me = null;

  const ok = ({ data, error }) => {
    if (error) throw new Error(traduci(error.message));
    return data;
  };

  async function loadMe() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (me = null);
    const { data, error } = await sb
      .from("dispositivi")
      .select("socio:soci(id,nome,cognome,ruolo,attivo)")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error || !data?.socio?.attivo) return (me = null);
    return (me = data.socio);
  }

  const normUscita = (u) => ({
    ...u,
    partecipanti: (u.partecipanti || []).map((p) => ({ socio_id: p.socio_id, ...p.socio })),
  });

  return {
    demo: false,
    get me() { return me; },
    init: loadMe,

    async riscatta(codice) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const r = await sb.auth.signInAnonymously();
        if (r.error) throw new Error("Accesso non disponibile: " + r.error.message);
      }
      ok(await sb.rpc("riscatta_invito", { p_codice: codice, p_descrizione: descrizioneDispositivo() }));
      return loadMe();
    },

    async esci() {
      const { data: { session } } = await sb.auth.getSession();
      if (session) await sb.from("dispositivi").delete().eq("user_id", session.user.id);
      await sb.auth.signOut();
      me = null;
    },

    // ----- dati di base
    tipiBici: async () => ok(await sb.from("tipi_bici").select("*").order("ordine")),
    luoghi: async () => ok(await sb.from("luoghi").select("*").order("ordine").order("nome")),

    // ----- uscite
    async uscite() {
      const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
      const rows = ok(await sb.from("uscite").select(USCITA_SELECT).gte("data_ora", oggi.toISOString()).order("data_ora"));
      return rows.map(normUscita);
    },
    async creaUscita(d) {
      let luogo_id = d.luogo_id;
      if (d.nuovo_luogo) {
        const nome = d.nuovo_luogo.trim();
        const esistente = ok(await sb.from("luoghi").select("id").ilike("nome", nome).maybeSingle());
        luogo_id = esistente ? esistente.id
          : ok(await sb.from("luoghi").insert({ nome, creato_da: me.id }).select("id").single()).id;
      }
      const row = {
        socio_id: me.id, tipo_bici_id: d.tipo_bici_id, luogo_id, data_ora: d.data_ora,
        km: d.km || null, dislivello: d.dislivello || null, andatura: d.andatura || null,
        note: d.note || null, link_percorso: d.link_percorso || null,
      };
      // l'autore conta sempre come partecipante (non serve inserirlo)
      return ok(await sb.from("uscite").insert(row).select("id").single()).id;
    },
    async partecipa(uscitaId, si) {
      if (si) ok(await sb.from("partecipanti").insert({ uscita_id: uscitaId, socio_id: me.id }));
      else ok(await sb.from("partecipanti").delete().eq("uscita_id", uscitaId).eq("socio_id", me.id));
    },
    annullaUscita: async (id) => ok(await sb.from("uscite").update({ annullata: true }).eq("id", id)),

    // ----- avvisi
    avvisi: async () => ok(await sb.from("avvisi").select("*,autore:soci(nome,cognome)").order("created_at", { ascending: false }).limit(50)),
    creaAvviso: async (a) => ok(await sb.from("avvisi").insert({ ...a, autore_id: me.id })),
    eliminaAvviso: async (id) => ok(await sb.from("avvisi").delete().eq("id", id)),

    // ----- convenzioni
    convenzioni: async () => ok(await sb.from("convenzioni").select("*").eq("attiva", true).order("negozio")),
    async salvaConvenzione(c) {
      const { id, ...dati } = c;
      if (id) ok(await sb.from("convenzioni").update(dati).eq("id", id));
      else ok(await sb.from("convenzioni").insert(dati));
    },
    eliminaConvenzione: async (id) => ok(await sb.from("convenzioni").delete().eq("id", id)),

    // ----- divise
    async divise() {
      const rows = ok(await sb.from("capi").select("*,capi_taglie(taglia,disp,ordine)").eq("attivo", true).order("ordine").order("nome"));
      return rows.map(({ capi_taglie, ...c }) => ({
        ...c, prezzo: Number(c.prezzo),
        taglie: (capi_taglie || []).sort((a, b) => a.ordine - b.ordine).map((t) => ({ t: t.taglia, disp: t.disp })),
      }));
    },
    async miePrenotazioni() {
      const rows = ok(await sb.from("prenotazioni").select("*,capo:capi(*)").eq("socio_id", me.id).order("created_at", { ascending: false }).limit(100));
      return rows.map((p) => ({ ...p, capo: { ...p.capo, prezzo: Number(p.capo.prezzo) } }));
    },
    prenota: async (capoId, taglia, qta) => ok(await sb.rpc("prenota_capo", { p_capo: capoId, p_taglia: taglia, p_qta: qta })),
    annullaPrenotazione: async (id) => ok(await sb.rpc("annulla_prenotazione", { p_id: id })),
    async tuttePrenotazioni() {
      const rows = ok(await sb.from("prenotazioni").select("*,capo:capi(*),socio:soci(nome,cognome)").neq("stato", "annullata").order("created_at", { ascending: false }));
      return rows.map((p) => ({ ...p, capo: { ...p.capo, prezzo: Number(p.capo.prezzo) } }));
    },
    aggiornaPrenotazione: async (id, patch) => ok(await sb.from("prenotazioni").update(patch).eq("id", id)),
    async salvaCapo({ taglie, id, ...dati }) {
      const capo = id
        ? ok(await sb.from("capi").update(dati).eq("id", id).select("id").single())
        : ok(await sb.from("capi").insert(dati).select("id").single());
      if (taglie) {
        ok(await sb.from("capi_taglie").delete().eq("capo_id", capo.id));
        if (taglie.length) ok(await sb.from("capi_taglie").insert(taglie.map((t, i) => ({ capo_id: capo.id, taglia: t.t, disp: t.disp, ordine: i }))));
      }
      return capo.id;
    },
    async caricaFoto(blob) {
      const nome = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      ok(await sb.storage.from("divise").upload(nome, blob, { contentType: "image/jpeg", upsert: false }));
      return sb.storage.from("divise").getPublicUrl(nome).data.publicUrl;
    },

    // ----- admin
    async soci() {
      const rows = ok(await sb.from("soci").select("id,nome,cognome,ruolo,attivo,inviti(codice),dispositivi(user_id)").order("cognome"));
      return rows.map((s) => ({ ...s, codice: s.inviti?.codice || null, n_dispositivi: (s.dispositivi || []).length }));
    },
    creaSocio: async (nome, cognome, admin) => ok(await sb.rpc("admin_crea_socio", { p_nome: nome, p_cognome: cognome, p_admin: admin })),
    resetInvito: async (id) => ok(await sb.rpc("admin_reset_invito", { p_socio: id })),
    aggiornaSocio: async (id, patch) => ok(await sb.from("soci").update(patch).eq("id", id)),
    aggiungiLuogo: async (nome) => ok(await sb.from("luoghi").insert({ nome, creato_da: me.id })),
    rinominaLuogo: async (id, nome) => ok(await sb.from("luoghi").update({ nome }).eq("id", id)),
    eliminaLuogo: async (id) => ok(await sb.from("luoghi").delete().eq("id", id)),
  };
}
