// Service worker: rende l'app installabile e apribile anche con rete scarsa.
// Strategia "prima la rete": si vedono sempre i file aggiornati, la cache serve solo offline.
const CACHE = "sbb-v1";
const SHELL = ["./", "index.html", "style.css", "js/config.js", "js/app.js", "js/api-supabase.js", "js/api-demo.js",
  "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // solo i file dell'app; i dati (Supabase) passano sempre dalla rete
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
