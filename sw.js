/* Uptime service worker: the whole app works with no signal at the gym or track, and
   opens instantly on repeat visits.

   Clean updates
   - Every release is one complete, versioned cache. A new version downloads in the
     background into its own cache; the running app keeps using the old one untouched, so
     a page never mixes old HTML with new scripts.
   - The new version waits. Each page shows a small "New version, tap to refresh" prompt
     (js/sw-client.js), never during a workout; a tap activates it and reloads. If the
     prompt is ignored, the new version starts the next time the app is fully closed.
   - VERSION is stamped by .githooks/pre-commit from the content of every app file, so any
     change to the app produces a new version without anyone remembering to bump it.
   - Install fails as a whole if any file is missing, so a half-cached version never goes
     live (tests/sw.test.js checks every file below exists and nothing is left out).

   Pages are cached by path (no query), so workout.html?start=lift reuses workout.html.
   The desktop-only light effect is left out on purpose: phones must never download it. */
const VERSION = "7c5c315c3543";
const CACHE = `uptime-${VERSION}`;
const ASSETS = [
  "./", "index.html", "workout.html", "progress.html", "plan.html", "manifest.webmanifest",
  "css/tokens.css", "css/components.css", "css/home.css", "css/workout.css", "css/pages.css",
  "js/plan.js", "js/engine.js", "js/store.js", "js/motion.js", "js/sw-client.js",
  "js/units.js", "js/nav.js", "js/charts.js", "js/progress-data.js", "js/muscles.js", "js/history.js", "js/session-view.js", "js/theme.js",
  "js/home/app.js", "js/home/model.js", "js/field.js", "js/pages/progress.js", "js/pages/plan.js",
  "js/workout/app.js", "js/workout/model.js", "js/workout/run.js", "js/workout/feedback.js", "js/sheet.js",
  "assets/archivo.woff2", "assets/keep-awake.mp4",
  "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable.png", "assets/apple-touch-icon.png",
  "assets/favicon.svg",
];

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache (GitHub Pages sends max-age=600), so a
  // new version never picks up a stale copy of a file.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: "reload" }))))
    // Taking over from the pre-redesign worker (caches "uptime-v1".."uptime-v3"): it had no
    // update prompt to wait for, and the page is already the new one, so switch silently.
    .then(() => caches.keys())
    .then((keys) => { if (keys.some((k) => /^uptime-v\d+$/.test(k))) self.skipWaiting(); }));
});

// The page asks for this when the user taps the update prompt.
self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("uptime") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(url.origin + url.pathname, { ignoreSearch: true });
      if (hit) return hit;
      try { return await fetch(req); } catch { return (await c.match("index.html")) || Response.error(); }
    })());
    return;
  }
  // App files: from this version's cache. Anything else (docs, a file not in the app):
  // the network, with the cache as a fallback.
  e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req, { ignoreSearch: true })) || fetch(req)));
});
