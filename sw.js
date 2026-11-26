/* Uptime service worker: the app keeps working with no signal at the gym or track, and
   opens instantly on repeat visits.
   Stale-while-revalidate for everything on this origin: the cached copy answers at once
   and a fresh copy is fetched in the background, so an update shows on the next open.
   Pages are cached by path (no query), so workout.html?start=lift reuses workout.html.
   The desktop-only light effect is left out on purpose: phones must never download it. */
const CACHE = "uptime-v2";
const ASSETS = [
  "./", "index.html", "workout.html", "manifest.webmanifest",
  "css/tokens.css", "css/components.css", "css/home.css", "css/workout.css",
  "js/plan.js", "js/engine.js", "js/store.js", "js/motion.js",
  "js/home/app.js", "js/home/model.js",
  "js/workout/app.js", "js/workout/model.js", "js/workout/run.js", "js/workout/feedback.js",
  "assets/archivo.woff2", "assets/keep-awake.mp4",
  "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable.png", "assets/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  // one missing file must not stop the rest from being cached
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const nav = req.mode === "navigate";
  const key = nav ? url.origin + url.pathname : req;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(key, { ignoreSearch: nav });
    const fresh = fetch(req).then((res) => {
      if (res.ok && res.type === "basic") c.put(key, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh.catch(async () => (nav ? (await c.match("index.html")) : undefined) || Response.error());
  }));
});
