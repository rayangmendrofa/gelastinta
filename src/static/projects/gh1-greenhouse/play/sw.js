// Offline support: the game's own files are fetched fresh when online and served from the cache when not;
// Pyodide and the font come from versioned CDN URLs, so they are cached on first use and reused.
const CACHE = "gh1-farm-v2";
const SHELL = ["./", "index.html", "app.js", "worker.js", "manifest.webmanifest", "img/icon-192.png", "img/logo.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const FOREVER = /^https:\/\/(cdn\.jsdelivr\.net\/pyodide\/v[\d.]+\/|fonts\.(googleapis|gstatic)\.com\/)/;
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;
  if (FOREVER.test(url)) {                               // cache first: these URLs never change
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  } else if (new URL(url).origin === self.location.origin) {   // network first, the cache when offline
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match("index.html"))));
  }
});
