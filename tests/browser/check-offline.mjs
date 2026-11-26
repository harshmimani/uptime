// Browser check for offline use, installability and clean updates. Needs Playwright with Chromium.
//   node tests/browser/check-offline.mjs [outDir]
//
// 1. After one visit, every page works with no network: Home, Workout (a full set logged),
//    Progress and Plan, with no console errors.
// 2. Installable: the manifest has name, start_url, standalone display and 192/512 + maskable icons.
// 3. A new release (a different VERSION and changed file) is downloaded in the background and
//    offered as "New version, tap to refresh"; nothing changes until the tap, then the page
//    reloads onto the new version with every file from the new release.
// 4. The prompt never shows while a workout is running; it appears once the workout is finished.
// 5. Shipping the redesign over the old live app: the new worker takes over from the old one
//    ("uptime-v1") silently, with no prompt, and the old cache is removed.
// The app is served from a temporary copy under /uptime/ (as on GitHub Pages) so a release can be faked.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile, cp, mkdtemp, rm } from "node:fs/promises";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const src = new URL("../..", import.meta.url).pathname;
const out = process.argv[2];
const dir = await mkdtemp(join(tmpdir(), "uptime-offline-"));
for (const f of ["index.html", "workout.html", "progress.html", "plan.html", "manifest.webmanifest", "sw.js", "css", "js", "assets"]) await cp(join(src, f), join(dir, f), { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!p.startsWith("/uptime/")) throw 0;
    p = p.slice(7);
    const f = join(dir, p.endsWith("/") ? p + "index.html" : p);
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream", "cache-control": "max-age=600" });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/uptime/`;

let failed = 0;
const fail = (m) => { failed++; console.log("FAIL", m); };
const ok = (m) => console.log("ok  ", m);
const check = (cond, m) => (cond ? ok(m) : fail(m));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: out ? 2 : 1 });
const errors = [];
const watch = (pg) => {
  pg.on("pageerror", (e) => errors.push(e.message));
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text()); });
};
const pg = await ctx.newPage();
watch(pg);
const controlled = () => pg.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
const version = () => pg.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("uptime")));

// ---------------------------------------------------------------- 1. offline
await pg.goto(base);
await controlled();
check((await version()).length === 1, `one versioned cache after the first visit (${(await version()).join(", ")})`);
await ctx.setOffline(true);
for (const [path, sel, label] of [["", ".hm-start", "Home"], ["progress.html", ".tabs", "Progress"], ["plan.html", ".tabs", "Plan"]]) {
  await pg.goto(base + path);
  check(await pg.locator(sel).first().isVisible({ timeout: 5000 }).catch(() => false), `offline: ${label} renders`);
}
await pg.goto(base);
await pg.tap(".hm-start");
await pg.waitForSelector("[data-screen=checkin]", { timeout: 10000 });
await pg.getByRole("button", { name: "Good" }).tap();
await pg.waitForSelector("#log-btn", { timeout: 10000 });
await pg.tap("#log-btn");
await pg.waitForTimeout(400);
const logged = await pg.evaluate(() => JSON.parse(localStorage.getItem("uptime2"))?.active?.log?.length);
check(logged === 1, "offline: Start → check-in → log a set works");
check(errors.length === 0, `offline: no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await ctx.setOffline(false);

// ---------------------------------------------------------------- 2. installable
const manifest = JSON.parse(await readFile(join(dir, "manifest.webmanifest"), "utf8"));
const sizes = manifest.icons.map((i) => `${i.sizes}${i.purpose === "maskable" ? " maskable" : ""}`);
check(manifest.name && manifest.start_url && manifest.display === "standalone" && sizes.includes("192x192") && sizes.includes("512x512") && sizes.includes("512x512 maskable"), `installable manifest (${sizes.join(", ")})`);
for (const i of manifest.icons) check((await pg.request.get(base + i.src)).ok(), `icon ${i.src} served`);

// ---------------------------------------------------------------- 3 + 4. a new release while a workout runs
const swSrc = await readFile(join(dir, "sw.js"), "utf8");
await writeFile(join(dir, "sw.js"), swSrc.replace(/^const VERSION = ".*";/m, 'const VERSION = "next-release";'));
await writeFile(join(dir, "css/pages.css"), (await readFile(join(dir, "css/pages.css"), "utf8")) + "\n/* next-release */\n");
const before = await version();
// the workout is still running (one set logged): the update downloads but isn't offered
await pg.goto(base + "workout.html");
await pg.waitForSelector("#log-btn", { timeout: 10000 });
await pg.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r?.waiting), null, { timeout: 20000 });
await pg.waitForTimeout(1500);
check(!(await pg.locator("#update").count()), "update downloaded, but no prompt while a workout is running");
check(JSON.stringify(await version()).includes(before[0]), "the running version keeps its own cache untouched");
// finish the workout: the prompt appears on the next screen
await pg.evaluate(() => { const d = JSON.parse(localStorage.getItem("uptime2")); d.active = null; localStorage.setItem("uptime2", JSON.stringify(d)); });
await pg.goto(base + "progress.html");
const prompt = pg.locator("#update");
await prompt.waitFor({ timeout: 20000 }).catch(() => {});
check(await prompt.isVisible(), "after the workout: \"New version, tap to refresh\" is shown");
check((await prompt.textContent()).includes("New version, tap to refresh"), "prompt wording");
await pg.evaluate(() => { window.__sameDoc = true; });
await pg.waitForTimeout(2500); // let the entrance settle; nothing may reload meanwhile
check(await pg.evaluate(() => window.__sameDoc === true), "nothing reloads before the tap");
const box = await prompt.boundingBox();
check(box && Math.round(box.height) >= 48 && box.y < 120, `prompt is a ≥48 px target at the top, out of the thumb zone (${box && Math.round(box.height)} px at y ${box && Math.round(box.y)})`);
if (out) await pg.screenshot({ path: `${out}/update-prompt.png` });
await Promise.all([pg.waitForEvent("load", { timeout: 20000 }), prompt.tap()]);
await controlled();
const after = await version();
check(after.length === 1 && after[0] === "uptime-next-release", `tap → reloaded onto the new version, old cache removed (${after.join(", ")})`);
const css = await pg.evaluate(() => fetch("css/pages.css").then((r) => r.text()));
check(css.includes("next-release"), "the new version serves the new files");
check(!(await pg.locator("#update").count()), "no prompt after updating");
check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);

// ---------------------------------------------------------------- 5. taking over from the old live app
{
  const LEGACY = `const CACHE = "uptime-v1";
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "index.html"])).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => { if (e.request.mode === "navigate") e.respondWith(fetch(e.request).catch(() => caches.match("index.html"))); });`;
  const current = await readFile(join(dir, "sw.js"), "utf8");
  await writeFile(join(dir, "sw.js"), LEGACY);
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await c2.newPage();
  watch(p2);
  await p2.goto(base);
  await p2.waitForFunction(() => caches.keys().then((k) => k.includes("uptime-v1")) && !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  await p2.evaluate(() => { window.__sameDoc = true; });
  await writeFile(join(dir, "sw.js"), current); // the redesign goes live
  await p2.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await p2.waitForFunction(() => caches.keys().then((k) => k.length === 1 && k[0] === "uptime-next-release"), null, { timeout: 20000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  const keys = await p2.evaluate(() => caches.keys());
  check(keys.length === 1 && keys[0] === "uptime-next-release", `old live worker replaced silently, its cache removed (${keys.join(", ")})`);
  check(!(await p2.locator("#update").count()), "no prompt when taking over from the old app");
  check(await p2.evaluate(() => window.__sameDoc === true), "no reload when taking over from the old app");
  await c2.close();
}

await browser.close();
server.close();
await rm(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
