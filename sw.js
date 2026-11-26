/* Uptime service worker: the app keeps working with no signal at the gym or track.
   The page is fetched from the network first so updates arrive straight away,
   with the cached copy as the fallback. Static assets are served from the cache.

   Rolling back from the redesign: phones that loaded the redesign have its worker and
   its cache ("uptime-<hash>"). This worker installs over it straight away, deletes every
   other cache, and reloads any open window so nothing keeps running the redesign. */
const CACHE = "uptime-v5";
const ASSETS = ["./", "index.html", "manifest.webmanifest", "assets/archivo.woff2",
  "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable.png", "assets/apple-touch-icon.png"];

// Both "reload" (install) and "no-cache" (pages) skip the browser's HTTP cache (GitHub
// Pages sends max-age=600), so a stale copy of the redesign can never be served or cached.
const isApp = url => /\/(index\.html)?$/.test(new URL(url).pathname);
// Passing the request itself keeps its redirect mode, so a redirect still reaches the browser.
const fresh = req => fetch(req, { cache: "no-cache" });

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(async keys => {
      // Any other "uptime-" cache that isn't "uptime-vN" belongs to the redesign.
      const fromRedesign = keys.some(k => k.startsWith("uptime-") && !/^uptime-v\d+$/.test(k));
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
      await self.clients.claim();
      if (!fromRedesign) return;
      // Not awaited: the reload goes through this worker, which must finish activating first.
      const wins = await self.clients.matchAll({ type: "window" });
      wins.forEach(w => w.navigate(new URL("./", self.registration.scope).href).catch(() => {}));
    }));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fresh(req)
      .then(res => {
        // Only the app page itself replaces the offline copy, never a 404 or another page.
        if (res.ok && isApp(req.url)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); }
        return res;
      })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
