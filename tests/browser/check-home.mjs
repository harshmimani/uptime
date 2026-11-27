// Browser check for Home (index.html). Needs Playwright with Chromium.
//   node tests/browser/check-home.mjs [outDir]
//
// 1. Start is tappable within 1 s on a throttled mid-range phone (opening the installed app): 4× CPU slowdown and
//    slow 4G (150 ms round trip, 1.6 Mbit/s down), files gzipped as GitHub Pages serves
//    them. Measured warm (service worker installed: the 1 s rule) and cold (first visit,
//    nothing cached: held to the 1.5 s first-load budget),
//    worst of 3 runs each. "Tappable" = the Start link is on screen, fully opaque, and is
//    the element a tap at its centre would hit; then a real tap must open the check-in.
// 2. The intro plays on the first open of the day only; later opens have no animation.
// 3. Reduced motion: nothing moves or scales, things only fade, and page changes are a
//    plain cross-fade (no shared-element morph).
// 4. Start morphs the card into the Workout screen (cross-document view transition).
// 5. A workout in progress opens straight to it; the back button still reaches Home,
//    which then offers Resume.
// 6. Busy mode banner (Turn off + Undo), the suggestion after two light weeks (Not now),
//    "done today", first run; no horizontal scroll, Start in the thumb zone, no console errors.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = new URL("../..", import.meta.url).pathname;
const out = process.argv[2];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json" };
const TEXT = new Set([".html", ".js", ".css", ".webmanifest"]);
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = join(root, p.endsWith("/") ? p + "index.html" : p);
    let body = await readFile(f);
    const head = { "content-type": TYPES[extname(f)] || "application/octet-stream", "cache-control": "max-age=600" };
    if (TEXT.has(extname(f)) && /gzip/.test(req.headers["accept-encoding"] || "")) { body = gzipSync(body); head["content-encoding"] = "gzip"; }
    res.writeHead(200, head);
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const origin = `http://localhost:${server.address().port}`;
const home = `${origin}/index.html`;
const browser = await chromium.launch();
let failed = 0;
const fail = (m) => { failed++; console.log("FAIL", m); };
const ok = (m) => console.log("ok  ", m);
const check = (cond, m) => (cond ? ok(m) : fail(m));

// ---------------------------------------------------------------- data
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const ts = (n) => Date.now() - n * 864e5;
const S = (n, session, items = []) => ({ id: `s${n}${session}`, date: daysAgo(n), t: ts(n), session, name: session, items });
const REGULAR = { // a returning user: Upper A, Lower A, Upper B done this week, a 3-week streak, pull-ups at 4
  v: 2, active: null, settings: {},
  activities: [{ id: "r1", date: daysAgo(4), t: ts(4), kind: "run", run: "interval" }],
  sessions: [S(20, "UB"), S(18, "LA"), S(13, "LB"), S(11, "UA"), S(6, "UA", [{ key: "1", ex: "dumbbell-bench-press", sets: [{ kg: 15, reps: 8 }, { kg: 15, reps: 8 }] }]),
    S(5, "LA", [{ key: "1", ex: "smith-machine-back-squat", sets: [{ kg: 60, reps: 6 }, { kg: 60, reps: 6 }, { kg: 60, reps: 6 }] }]),
    S(2, "UB", [{ key: "1", ex: "pull-up", sets: [{ reps: 4 }, { reps: 3 }] }])],
};

async function open(viewport, { seed, reducedMotion = "no-preference", introSeen = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: out ? 2 : 1, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message));
  pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await pg.addInitScript(([s, seen]) => {
    if (s && !localStorage.getItem("uptime2")) localStorage.setItem("uptime2", s);
    if (seen && !localStorage.getItem("uptime-home")) localStorage.setItem("uptime-home", seen);
  }, [seed ? JSON.stringify(seed) : null, introSeen ? JSON.stringify({ day: iso(new Date()), next: null }) : null]);
  return { pg, ctx, errors };
}
const shot = async (pg, n) => { if (out) await pg.screenshot({ path: `${out}/${n}.png` }); };
const noHScroll = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const stored = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("uptime2")));
const noErrors = (label, errors) => check(errors.length === 0, `${label}: no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);

// ---------------------------------------------------------------- 1. Start within 1 s, throttled
const WATCH = () => {
  // rAF loop from the very start: the first frame in which a tap on Start would land on Start
  const tick = () => {
    const b = document.querySelector(".hm-start");
    if (b) {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (r.height >= 48 && r.bottom <= innerHeight && hit?.closest(".hm-start") === b && getComputedStyle(b).opacity === "1") {
        window.__tappable = performance.now();
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function throttle(pg) {
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

async function startTiming() {
  const results = { cold: [], warm: [] };
  for (let run = 0; run < 3; run++) {
    const { pg, ctx, errors } = await open({ width: 390, height: 844 }, { seed: REGULAR });
    await pg.addInitScript(WATCH);
    await throttle(pg);
    await pg.goto(home, { waitUntil: "commit" });
    await pg.waitForFunction(() => window.__tappable, null, { timeout: 15000 });
    results.cold.push(await pg.evaluate(() => window.__tappable));
    // let the service worker install and take control, then reopen (an installed app's normal open)
    await pg.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 20000 });
    await pg.reload({ waitUntil: "load" });
    await pg.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
    await pg.waitForTimeout(500);
    await pg.goto(home, { waitUntil: "commit" });
    await pg.waitForFunction(() => window.__tappable, null, { timeout: 15000 });
    results.warm.push(await pg.evaluate(() => window.__tappable));
    if (run === 0) {
      await pg.tap(".hm-start");
      await pg.waitForSelector("[data-screen=checkin]", { timeout: 10000 });
      ok("throttled: a tap on Start opens the check-in");
    }
    noErrors(`throttled run ${run + 1}`, errors);
    await ctx.close();
  }
  const worst = (a) => Math.max(...a);
  const fmt = (a) => a.map((x) => `${Math.round(x)} ms`).join(", ");
  console.log(`     cold (first visit): ${fmt(results.cold)}`);
  console.log(`     warm (installed):   ${fmt(results.warm)}`);
  check(worst(results.warm) < 1000, `Start tappable within 1 s on a throttled mid-range phone, installed (worst ${Math.round(worst(results.warm))} ms)`);
  // A first visit (nothing cached yet) is held to the first-load budget, 1.5 s (CLAUDE.md, Engineering).
  // This server speaks HTTP/1.1 (6 connections); GitHub Pages uses HTTP/2, so real first visits are quicker.
  check(worst(results.cold) < 1500, `first visit over slow 4G within the 1.5 s first-load budget (worst ${Math.round(worst(results.cold))} ms)`);
  return results;
}

// ---------------------------------------------------------------- 2. intro once a day + layout
async function introAndLayout(label, viewport) {
  const { pg, ctx, errors } = await open(viewport, { seed: REGULAR });
  await pg.goto(home);
  check(await pg.evaluate(() => document.getElementById("app").classList.contains("is-intro")), `${label}: first open of the day plays the intro`);
  const startStill = await pg.evaluate(() => {
    const b = document.querySelector(".hm-start");
    return getComputedStyle(b).opacity === "1" && b.getAnimations().length === 0;
  });
  check(startStill, `${label}: Start is still and opaque from the first frame (not part of the intro)`);
  await pg.waitForTimeout(250);
  await shot(pg, `${label}-01-intro-midway`);
  await pg.waitForTimeout(1500);
  const left = await pg.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.playState === "running").length);
  check(left === 0, `${label}: the intro is over within 1.75 s`);
  await shot(pg, `${label}-02-home`);
  check(await noHScroll(pg), `${label}: no horizontal scroll`);
  check((await pg.textContent("#next-title")).includes("Lower B"), `${label}: Next up is the next in the rotation (Lower B)`);
  check((await pg.textContent(".tile--week")).includes("3-week streak"), `${label}: rolling week and streak shown`);
  check((await pg.textContent(".tile--stat")).includes("Strict pull-ups"), `${label}: standout stat is the pull-up max, not a run stat`);
  check(await pg.locator(".float").count() === 1, `${label}: one quiet run/sport line under Next up`);
  check(await pg.locator(".tabbar [aria-current=page]").textContent().then((t) => t.includes("Home")), `${label}: tabs with Home current`);
  if (viewport.width < 600) {
    const zone = await pg.evaluate(() => { const r = document.querySelector(".hm-start").getBoundingClientRect(); return r.top > innerHeight * 0.6 && r.bottom <= innerHeight - 56 && r.height >= 48; });
    check(zone, `${label}: Start sits in the thumb zone, above the tabs, ≥ 48 px`);
  }
  // second open the same day: instant, nothing animates
  await pg.reload();
  const still = await pg.evaluate(() => ({
    intro: document.getElementById("app").classList.contains("is-intro"),
    anims: document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
  }));
  check(!still.intro && still.anims === 0, `${label}: later opens the same day appear instantly (no intro, ${still.anims} animations)`);
  noErrors(label, errors);
  await ctx.close();
}

// ---------------------------------------------------------------- 3. reduced motion
async function reducedMotion() {
  const label = "reduced-motion";
  const { pg, ctx, errors } = await open({ width: 390, height: 844 }, { seed: REGULAR, reducedMotion: "reduce" });
  await pg.goto(home, { waitUntil: "commit" });
  await pg.waitForSelector(".dial__name .ch");
  const rects = () => pg.evaluate(() => [...document.querySelectorAll(".tile, .dial-card, .dial__name .ch, .dial__marker, .dial__seg, .float")]
    .map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(","); }));
  const a = await rects();
  const fading = await pg.evaluate(() => document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).length);
  await pg.waitForTimeout(80);
  const mid = await rects();
  await pg.waitForTimeout(1200);
  const b = await rects();
  check(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(mid) === JSON.stringify(b), `${label}: nothing moves or scales during the intro`);
  check(fading > 0, `${label}: still a calm cross-fade in (${fading} fades), not a hard cut`);
  const loops = await pg.evaluate(() => document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations === Infinity).length);
  check(loops === 0, `${label}: grain and light are still`);
  const names = await pg.evaluate(() => [...document.querySelectorAll(".dial-card, .hm-start, .tabbar")].map((e) => getComputedStyle(e).viewTransitionName));
  check(names.every((n) => n === "none"), `${label}: page changes are a plain cross-fade, no morph`);
  await shot(pg, `${label}-home`);
  noErrors(label, errors);
  await ctx.close();
}

// ---------------------------------------------------------------- 4 + 5. morph, resume
async function morphAndResume(label, viewport) {
  const { pg, ctx, errors } = await open(viewport, { seed: REGULAR, introSeen: true });
  await pg.addInitScript(() => addEventListener("pagereveal", (e) => { window.__vt = !!e.viewTransition; }));
  await pg.goto(home);
  await pg.click(".hm-start");
  if (out) { await pg.waitForTimeout(220); await shot(pg, `${label}-03-morph-midway`); }
  await pg.waitForSelector("[data-screen=checkin]");
  // the check-in can be in the DOM a frame before the page is revealed: wait for the reveal itself
  await pg.waitForFunction(() => window.__vt !== undefined, null, { timeout: 5000 }).catch(() => {});
  check(await pg.evaluate(() => window.__vt === true), `${label}: Start morphs the card into the Workout (view transition ran)`);
  await pg.waitForTimeout(2300);
  check(!(await pg.evaluate(() => location.search)), `${label}: the start link is dropped from the address after the morph`);
  await shot(pg, `${label}-04-checkin`);
  await pg.click("[data-act=checkin][data-v=Good]");
  await pg.waitForSelector("[data-screen=set]");
  // back button: Home with a Resume shortcut
  await pg.goBack();
  await pg.waitForSelector("[data-screen=home] .hm-start");
  check((await pg.textContent(".hm-start")).includes("Resume"), `${label}: back to Home offers Resume`);
  await pg.click(".hm-start");
  await pg.waitForSelector("[data-screen=set]");
  ok(`${label}: Resume goes straight back to the set`);
  // a fresh open while a workout is running skips Home
  await pg.goto(home);
  await pg.waitForURL(/workout\.html/);
  await pg.waitForSelector("[data-screen=set]");
  ok(`${label}: opening the app mid-workout skips Home`);
  noErrors(label, errors);
  await ctx.close();
}

// ---------------------------------------------------------------- 6. modes and states
async function states() {
  const vp = { width: 390, height: 844 };
  { // Busy mode on: banner with Turn off and Undo
    const { pg, ctx, errors } = await open(vp, { seed: { ...REGULAR, settings: { modeLog: [{ date: daysAgo(3), busy: true }] } }, introSeen: true });
    await pg.goto(home);
    check(await pg.isVisible("[data-act=busy-off]"), "busy: banner with Turn off");
    check((await pg.textContent("#next-title")).includes("Full body"), "busy: Next up comes from the Busy rotation");
    await shot(pg, "state-busy");
    await pg.click("[data-act=busy-off]");
    check(!(await pg.isVisible("[data-act=busy-off]")) && (await pg.textContent("#next-title")).includes("Lower B"), "busy: Turn off returns to the rotation where it left off");
    check((await pg.textContent(".toast")).includes("Back to the rotation"), "busy: says so, with Undo");
    await pg.click(".toast [data-act=undo]");
    check(await pg.isVisible("[data-act=busy-off]"), "busy: Undo turns it back on");
    noErrors("busy", errors);
    await ctx.close();
  }
  { // two light 7-day blocks in a row: the suggestion
    const seed = { v: 2, active: null, settings: {}, activities: [], sessions: [S(22, "UA"), S(12, "LA")] };
    const { pg, ctx, errors } = await open(vp, { seed, introSeen: true });
    await pg.goto(home);
    check(await pg.isVisible("[data-act=busy-on]"), "nudge: suggests Busy mode after two light weeks");
    await shot(pg, "state-nudge");
    await pg.click("[data-act=nudge-dismiss]");
    await pg.reload();
    check(!(await pg.isVisible("[data-act=busy-on]")) && !!(await stored(pg)).settings.busyNudgeDismissed, "nudge: Not now holds until the next block");
    noErrors("nudge", errors);
    await ctx.close();
  }
  { // lifted today: no second lift
    const seed = { ...REGULAR, sessions: [...REGULAR.sessions, S(0, "LB")] };
    const { pg, ctx, errors } = await open(vp, { seed, introSeen: true });
    await pg.goto(home);
    check(!(await pg.locator(".hm-start").count()), "done today: no second lift offered");
    check((await pg.textContent(".dial__label")).includes("tomorrow"), "done today: Next up · tomorrow or later");
    await shot(pg, "state-done-today");
    noErrors("done today", errors);
    await ctx.close();
  }
  { // first run
    const { pg, ctx, errors } = await open({ width: 360, height: 640 });
    await pg.goto(home);
    await pg.waitForTimeout(1600);
    check((await pg.textContent(".dial__label")).includes("first session") && (await pg.textContent("#next-title")).includes("Upper A"), "first run: Upper A, your first session");
    check(!(await pg.locator(".tile--stat").count()), "first run: no empty standout stat (it appears once there's a number)");
    check(await pg.locator(".slot").count() === 6, "first run: This week shows the six slots");
    const inView = await pg.evaluate(() => document.querySelector(".hm-start").getBoundingClientRect().bottom <= innerHeight - 56);
    check(inView, "first run 360×640: Start is on the first screen");
    check(await noHScroll(pg), "first run 360×640: no horizontal scroll");
    await shot(pg, "state-first-run-360x640");
    noErrors("first run", errors);
    await ctx.close();
  }
}

await startTiming();
for (const [n, vp] of [["360", { width: 360, height: 740 }], ["390", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
  await introAndLayout(`home-${n}`, vp);
}
await reducedMotion();
await morphAndResume("morph-390", { width: 390, height: 844 });
await morphAndResume("morph-desktop", { width: 1440, height: 900 });
await states();

await browser.close();
server.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
