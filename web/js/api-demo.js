// MODALITÀ DEMO: dati finti salvati solo su questo dispositivo.
// Stessa interfaccia di api-supabase.js. Codice d'invito demo: DEMO2026
const KEY = "sbb-demo-v3";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

function giorno(offset, ore, minuti = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(ore, minuti, 0, 0);
  return d.toISOString();
}

function seed() {
  const soci = [
    { id: "s1", nome: "Alex", cognome: "Demo", ruolo: "admin", attivo: true, codice: "DEMO2026", n_dispositivi: 0 },
    { id: "s2", nome: "Marco", cognome: "Bianchi", ruolo: "socio", attivo: true, codice: "K7F2QXA9", n_dispositivi: 1 },
    { id: "s3", nome: "Elena", cognome: "Rossi", ruolo: "admin", attivo: true, codice: "PANTADN2", n_dispositivi: 2 },
    { id: "s4", nome: "Bruno", cognome: "Fabbri", ruolo: "socio", attivo: true, codice: "W8RTB3MZ", n_dispositivi: 1 },
    { id: "s5", nome: "Giorgio", cognome: "Neri", ruolo: "socio", attivo: true, codice: "H4NXC7PE", n_dispositivi: 0 },
  ];
  const tipi = [
    { id: 1, nome: "Strada", emoji: "🚴", ordine: 1 },
    { id: 2, nome: "Gravel", emoji: "🪨", ordine: 2 },
    { id: 3, nome: "MTB / E-bike", emoji: "🚵", ordine: 3 },
  ];
  const luoghi = [
    { id: 1, nome: "Piazzale Kennedy – Rimini", link_mappa: "https://maps.google.com/?q=Piazzale+Kennedy+Rimini", ordine: 1 },
    { id: 2, nome: "Arco d'Augusto – Rimini", link_mappa: null, ordine: 2 },
    { id: 3, nome: "Stazione di Santarcangelo", link_mappa: null, ordine: 3 },
    { id: 4, nome: "Ponte di Tiberio – Rimini", link_mappa: null, ordine: 4 },
  ];
  const uscite = [
    { id: uid(), socio_id: "s2", tipo_bici_id: 1, luogo_id: 1, data_ora: giorno(3, 8, 30), km: 95, dislivello: 1200, andatura: "media",
      note: "Giro delle colline: San Leo e ritorno da Verucchio. Caffè a metà strada ☕", link_percorso: "https://www.komoot.com/", annullata: false, partecipanti: ["s3", "s4"] },
    { id: uid(), socio_id: "s4", tipo_bici_id: 3, luogo_id: 3, data_ora: giorno(4, 9, 0), km: 40, dislivello: 900, andatura: "sostenuta",
      note: "Sentieri del Marecchia, fango garantito 🐗", link_percorso: null, annullata: false, partecipanti: [] },
    { id: uid(), socio_id: "s3", tipo_bici_id: 2, luogo_id: 2, data_ora: giorno(4, 14, 30), km: 55, dislivello: null, andatura: "tranquilla",
      note: null, link_percorso: null, annullata: false, partecipanti: ["s5"] },
  ];
  const avvisi = [
    { id: uid(), titolo: "Assemblea dei soci", testo: "Venerdì alle 18.30 assemblea annuale in sede. Ordine del giorno: bilancio, calendario 2027, divise nuove.", autore_id: "s3", pubblica_telegram: true, created_at: giorno(-1, 18) },
    { id: uid(), titolo: "Ordine divise: ultimi giorni", testo: "Lo smanicato nero è rimasto solo in taglia M. Chi vuole altri capi scriva entro domenica nel topic Ordine Divise.", autore_id: "s1", pubblica_telegram: true, created_at: giorno(-4, 17) },
  ];
  const convenzioni = [
    { id: uid(), negozio: "Ciclofficina Esempio", categoria: "Officina", sconto: "-15%", descrizione: "Manodopera e ricambi.", come_ottenerlo: "Mostra l'app alla cassa", indirizzo: "Via Esempio 1, Rimini", link: null, scadenza: "2027-12-31", attiva: true },
    { id: uid(), negozio: "Bar del Ciclista", categoria: "Ristoro", sconto: "Caffè + brioche 2 €", descrizione: "Il punto di ritrovo della domenica.", come_ottenerlo: "In maglia SBUBBIKERS", indirizzo: null, link: null, scadenza: null, attiva: true },
    { id: uid(), negozio: "Fisio Sport", categoria: "Salute", sconto: "-10%", descrizione: "Massaggi sportivi e biomeccanica.", come_ottenerlo: "Prenota citando la squadra", indirizzo: null, link: null, scadenza: null, attiva: true },
  ];
  const T = (arr) => arr.map(([t, d]) => ({ t, disp: d }));
  const chiusura = new Date(); chiusura.setDate(chiusura.getDate() + 20); chiusura.setHours(23, 59, 0, 0);
  const capi = [
    { id: "c1", nome: "Maglia estiva 2027", tipo: "maglia", c1: "#14171c", c2: "#ff5a1f", prezzo: 65, modalita: "ordine", scadenza: chiusura.toISOString(),
      descrizione: "Manica corta, tessuto traspirante, zip intera, 3 tasche posteriori. Nuova grafica 2027.", taglie: T([["XS",null],["S",null],["M",null],["L",null],["XL",null],["XXL",null]]) },
    { id: "c2", nome: "Salopette pro", tipo: "salopette", c1: "#14171c", c2: "#ff5a1f", prezzo: 85, modalita: "ordine", scadenza: chiusura.toISOString(),
      descrizione: "Fondello 3D per lunghe distanze, bretelle in rete.", taglie: T([["S",null],["M",null],["L",null],["XL",null],["XXL",null]]) },
    { id: "c3", nome: "Smanicato antivento", tipo: "smanicato", c1: "#14171c", c2: "#ffffff", prezzo: 45, modalita: "magazzino",
      descrizione: "Leggero, si piega in tasca. Retro in rete traspirante.", taglie: T([["S",0],["M",1],["L",0],["XL",0]]) },
    { id: "c4", nome: "Giacca invernale", tipo: "giacca", c1: "#1e2a44", c2: "#ff5a1f", prezzo: 110, modalita: "magazzino",
      descrizione: "Termica, antivento davanti, felpata dentro. Per uscite da 0 a 10 °C.", taglie: T([["S",2],["M",4],["L",3],["XL",1],["XXL",0]]) },
    { id: "c5", nome: "Calze SBUBBIKERS", tipo: "calze", c1: "#ffffff", c2: "#ff5a1f", prezzo: 12, modalita: "magazzino",
      descrizione: "Altezza media, tessuto tecnico.", taglie: T([["36-39",6],["40-43",9],["44-47",2]]) },
  ];
  const prenotazioni = [
    { id: "p1", capo_id: "c1", socio_id: "s2", taglia: "M", qta: 1, stato: "attesa", pagato: false, created_at: giorno(-2, 10) },
    { id: "p2", capo_id: "c1", socio_id: "s3", taglia: "S", qta: 1, stato: "attesa", pagato: true, created_at: giorno(-1, 9) },
    { id: "p3", capo_id: "c2", socio_id: "s3", taglia: "S", qta: 1, stato: "attesa", pagato: true, created_at: giorno(-1, 9) },
    { id: "p4", capo_id: "c4", socio_id: "s4", taglia: "L", qta: 1, stato: "pronta", pagato: false, created_at: giorno(-5, 18) },
    { id: "p5", capo_id: "c1", socio_id: "s4", taglia: "L", qta: 2, stato: "attesa", pagato: false, created_at: giorno(-3, 21) },
    { id: "p6", capo_id: "c5", socio_id: "s1", taglia: "40-43", qta: 2, stato: "consegnata", pagato: true, created_at: giorno(-9, 12) },
  ];
  return { soci, tipi, luoghi, uscite, avvisi, convenzioni, capi, prenotazioni, me: null };
}

export function createApi() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { db = seed(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
  const wait = (x) => new Promise((r) => setTimeout(() => r(structuredClone(x)), 120));
  const socio = (id) => db.soci.find((s) => s.id === id);
  const meObj = () => (db.me ? socio(db.me) : null);
  const soloAdmin = () => { if (meObj()?.ruolo !== "admin") throw new Error("Solo admin"); };
  const codice = () => Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

  return {
    demo: true,
    get me() { return meObj(); },
    init: async () => meObj(),
    async riscatta(c) {
      const s = db.soci.find((x) => x.codice === String(c).trim().toUpperCase());
      if (!s) throw new Error("Codice non valido (in demo usa DEMO2026)");
      db.me = s.id; s.n_dispositivi++; save(); return meObj();
    },
    async esci() { db.me = null; save(); },
    reset() { localStorage.removeItem(KEY); },

    tipiBici: () => wait(db.tipi),
    luoghi: () => wait(db.luoghi),

    async uscite() {
      const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
      return wait(db.uscite.filter((u) => new Date(u.data_ora) >= oggi)
        .sort((a, b) => a.data_ora.localeCompare(b.data_ora))
        .map((u) => ({
          ...u,
          tipo: db.tipi.find((t) => t.id === u.tipo_bici_id),
          luogo: db.luoghi.find((l) => l.id === u.luogo_id),
          autore: socio(u.socio_id),
          partecipanti: u.partecipanti.map((id) => ({ socio_id: id, ...socio(id) })),
        })));
    },
    async creaUscita(d) {
      let luogo_id = d.luogo_id;
      if (d.nuovo_luogo) {
        const n = d.nuovo_luogo.trim();
        const e = db.luoghi.find((l) => l.nome.toLowerCase() === n.toLowerCase());
        if (e) luogo_id = e.id;
        else { luogo_id = Math.max(0, ...db.luoghi.map((l) => l.id)) + 1; db.luoghi.push({ id: luogo_id, nome: n, link_mappa: null, ordine: 100 }); }
      }
      const id = uid();
      db.uscite.push({ id, socio_id: db.me, tipo_bici_id: d.tipo_bici_id, luogo_id, data_ora: d.data_ora, km: d.km || null,
        dislivello: d.dislivello || null, andatura: d.andatura || null, note: d.note || null, link_percorso: d.link_percorso || null,
        annullata: false, partecipanti: [] });
      save(); return id;
    },
    async partecipa(id, si) {
      const u = db.uscite.find((x) => x.id === id);
      u.partecipanti = u.partecipanti.filter((p) => p !== db.me);
      if (si) u.partecipanti.push(db.me);
      save();
    },
    async annullaUscita(id) { db.uscite.find((x) => x.id === id).annullata = true; save(); },

    avvisi: () => wait([...db.avvisi].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => ({ ...a, autore: socio(a.autore_id) }))),
    async creaAvviso(a) { soloAdmin(); db.avvisi.push({ id: uid(), ...a, autore_id: db.me, created_at: new Date().toISOString() }); save(); },
    async eliminaAvviso(id) { soloAdmin(); db.avvisi = db.avvisi.filter((a) => a.id !== id); save(); },

    convenzioni: () => wait(db.convenzioni.filter((c) => c.attiva).sort((a, b) => a.negozio.localeCompare(b.negozio))),
    async salvaConvenzione(c) {
      soloAdmin();
      if (c.id) Object.assign(db.convenzioni.find((x) => x.id === c.id), c);
      else db.convenzioni.push({ ...c, id: uid(), attiva: true });
      save();
    },
    async eliminaConvenzione(id) { soloAdmin(); db.convenzioni = db.convenzioni.filter((c) => c.id !== id); save(); },


    // ----- divise
    divise: () => wait(db.capi.filter((c) => c.attivo !== false)),
    async caricaFoto(blob) {
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    },
    async miePrenotazioni() {
      return wait(db.prenotazioni.filter((p) => p.socio_id === db.me).sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((p) => ({ ...p, capo: db.capi.find((c) => c.id === p.capo_id) })));
    },
    async prenota(capoId, taglia, qta) {
      const c = db.capi.find((x) => x.id === capoId), t = c.taglie.find((x) => x.t === taglia);
      if (c.modalita === "magazzino") {
        if ((t.disp ?? 0) < qta) throw new Error(`Taglia ${taglia}: ne restano solo ${t.disp ?? 0}`);
        t.disp -= qta;
      } else if (c.scadenza && new Date(c.scadenza) < new Date()) throw new Error("Ordine chiuso");
      db.prenotazioni.push({ id: uid(), capo_id: capoId, socio_id: db.me, taglia, qta, stato: c.modalita === "magazzino" ? "confermata" : "attesa", pagato: false, created_at: new Date().toISOString() });
      save();
    },
    async annullaPrenotazione(id) {
      const p = db.prenotazioni.find((x) => x.id === id);
      if (p.socio_id !== db.me && meObj()?.ruolo !== "admin") throw new Error("Permesso negato");
      const c = db.capi.find((x) => x.id === p.capo_id);
      if (c.modalita === "magazzino") c.taglie.find((x) => x.t === p.taglia).disp += p.qta;
      p.stato = "annullata"; save();
    },
    async tuttePrenotazioni() {
      soloAdmin();
      return wait(db.prenotazioni.filter((p) => p.stato !== "annullata").sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((p) => ({ ...p, capo: db.capi.find((c) => c.id === p.capo_id), socio: socio(p.socio_id) })));
    },
    async aggiornaPrenotazione(id, patch) { soloAdmin(); Object.assign(db.prenotazioni.find((x) => x.id === id), patch); save(); },
    async salvaCapo(c) {
      soloAdmin();
      if (c.id) Object.assign(db.capi.find((x) => x.id === c.id), c);
      else db.capi.push({ attivo: true, ...c, id: uid() });
      save();
    },

    soci: async () => { soloAdmin(); return wait([...db.soci].sort((a, b) => a.cognome.localeCompare(b.cognome))); },
    async creaSocio(nome, cognome, admin) {
      soloAdmin();
      const s = { id: uid(), nome, cognome, ruolo: admin ? "admin" : "socio", attivo: true, codice: codice(), n_dispositivi: 0 };
      db.soci.push(s); save(); return { id: s.id, codice: s.codice };
    },
    async resetInvito(id) { soloAdmin(); const s = socio(id); s.codice = codice(); s.n_dispositivi = 0; save(); return s.codice; },
    async aggiornaSocio(id, patch) { soloAdmin(); Object.assign(socio(id), patch); save(); },
    async rinominaLuogo(id, nome) { soloAdmin(); db.luoghi.find((l) => l.id === id).nome = nome; save(); },
    async eliminaLuogo(id) {
      soloAdmin();
      if (db.uscite.some((u) => u.luogo_id === id)) throw new Error("Elemento in uso, non si può eliminare");
      db.luoghi = db.luoghi.filter((l) => l.id !== id); save();
    },
  };
}
