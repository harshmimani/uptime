// Browser check for the Progress and Plan pages. Needs Playwright with Chromium.
//   node tests/browser/check-pages.mjs [outDir]
// At 360 px, 390 px and desktop: no console errors, no horizontal scroll, charts render,
// tap targets ≥ 48 px; bodyweight log + Undo; Plan sections; units switch; export,
// import and reset with Undo; the first load migrates old data and keeps a backup.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = new URL("../..", import.meta.url).pathname;
const out = process.argv[2];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = join(root, p.endsWith("/") ? p + "index.html" : p);
    const body = await readFile(f); // read first: a missing file must still get its 404
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
let failed = 0;
const check = (c, m) => { if (c) console.log("ok  ", m); else { failed++; console.log("FAIL", m); } };

const T0 = new Date("2026-11-26T08:00:00").getTime();
const day = (n) => new Date(T0 - n * 864e5).toISOString().slice(0, 10);
const bench = (kg, reps) => ({ key: "1", ex: "dumbbell-bench-press", role: "main", sets: [{ kg, reps }, { kg, reps }] });
const SEED = {
  v: 2, active: null, settings: { sound: true },
  sessions: [
    { id: "a", date: day(20), t: T0 - 20 * 864e5, session: "UA", name: "Upper A", items: [bench(15, 8), { key: "0", ex: "pull-up", sets: [{ reps: 1 }] }] },
    { id: "b", date: day(18), t: T0 - 18 * 864e5, session: "LA", name: "Lower A", items: [{ key: "1", ex: "smith-machine-back-squat", sets: [{ kg: 40, reps: 8 }] }] },
    { id: "c", date: day(12), t: T0 - 12 * 864e5, session: "UB", name: "Upper B", items: [] },
    { id: "d", date: day(9), t: T0 - 9 * 864e5, session: "LB", name: "Lower B", items: [] },
    { id: "e", date: day(5), t: T0 - 5 * 864e5, session: "UA", name: "Upper A", items: [bench(17.5, 8), { key: "0", ex: "pull-up", sets: [{ reps: 3 }] }] },
    { id: "f", date: day(2), t: T0 - 2 * 864e5, session: "LA", name: "Lower A", items: [{ key: "1", ex: "smith-machine-back-squat", sets: [{ kg: 45, reps: 6 }] }] },
  ],
  activities: [
    { id: "r1", date: day(15), t: 1, kind: "run", run: "tempo", time: "5k 27:40" },
    { id: "r2", date: day(3), t: 2, kind: "run", run: "long", time: "10k 55:00" },
    { id: "s1", date: day(1), t: 3, kind: "sport", ex: "basketball", min: 60 },
  ],
};
const OLD = { v: 1, sets: { [`${day(30)}|dumbbell-bench-press`]: [{ t: 1, kg: 12.5, r: 8 }] }, body: { w: { [day(13)]: 74.5, [day(6)]: 74, [day(1)]: 73.4 } } };

async function open(path, viewport, seed = { uptime2: SEED, uptime1: OLD }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: out ? 2 : 1, hasTouch: viewport.width < 600, isMobile: viewport.width < 600, acceptDownloads: true });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message));
  pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await pg.clock.install({ time: T0 });
  await pg.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
  }, seed);
  await pg.goto(base + path);
  await pg.waitForSelector("main");
  return { pg, ctx, errors };
}
// innerWidth catches a mobile page that zooms out to fit something too wide
const noHScroll = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && innerWidth <= screen.width);
const db = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("uptime2")));
const smallTargets = (pg) => pg.evaluate(() => [...document.querySelectorAll("button, a.tabs__tab, a.chip, summary, input")]
  .filter((e) => e.offsetParent && !e.closest(".sr-only")).map((e) => e.getBoundingClientRect())
  .filter((r) => r.height < 44 || r.width < 44).length);
const shot = async (pg, n) => { if (out) await pg.screenshot({ path: `${out}/${n}.png`, fullPage: true }); };

for (const [label, viewport] of [["360", { width: 360, height: 780 }], ["390", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
  // ---------------- Progress
  const { pg, ctx, errors } = await open("progress.html", viewport);
  let d = await db(pg);
  check(d.v === 3, `${label}: v2 record migrated to v3 on first load`);
  check(await pg.evaluate(() => !!localStorage.getItem("uptime-backup-v2")), `${label}: backup of the v2 record kept`);
  check(d.body.weight.length === 3 && d.sessions.length === 6, `${label}: old bodyweight joined, sessions kept`);
  check(await pg.isVisible("text=Your data moved to the new format"), `${label}: migration is said once, in one line`);
  check(await pg.locator(".chart").count() >= 5, `${label}: weeks, lifts, pull-ups, 5K and bodyweight charts render`);
  check((await pg.textContent(".big")).includes("3"), `${label}: streak shows 3 weeks`);
  check(await noHScroll(pg), `${label}: Progress has no horizontal scroll`);
  check(await smallTargets(pg) === 0, `${label}: Progress tap targets ≥ 44 px`);
  await pg.locator(".chart__hit").first().click();
  check((await pg.locator(".chart__read").first().textContent()).length > 5, `${label}: tapping a chart shows its value`);
  await shot(pg, `${label}-progress`);
  await pg.fill("#bw", "72.9");
  await pg.click("#bw-form button");
  d = await db(pg);
  check(d.body.weight.some((w) => w.kg === 72.9), `${label}: bodyweight logged`);
  await pg.click(".toast button");
  d = await db(pg);
  check(!d.body.weight.some((w) => w.kg === 72.9), `${label}: Undo removes it`);
  await pg.fill("#bw", "7");
  await pg.click("#bw-form button");
  check((await db(pg)).body.weight.length === 3, `${label}: a silly bodyweight is refused`);
  check(errors.length === 0, `${label}: Progress has no console errors ${errors.join(" | ")}`);
  await ctx.close();

  // ---------------- Plan
  const p = await open("plan.html", viewport);
  const pp = p.pg;
  check(await pp.isVisible("text=Busy mode"), `${label}: Plan opens on Modes`);
  await pp.click("[data-act=busy]");
  check((await db(pp)).settings.modeLog.at(-1).busy === true, `${label}: Busy mode switch saves`);
  await pp.click(".toast button");
  check((await db(pp)).settings.modeLog.length === 0, `${label}: Busy mode Undo`);
  for (const s of ["fuel", "learn", "settings"]) {
    await pp.click(`[data-act=section][data-s=${s}]`);
    check(await noHScroll(pp), `${label}: ${s} has no horizontal scroll`);
    check(await smallTargets(pp) === 0, `${label}: ${s} tap targets ≥ 44 px`);
    await shot(pp, `${label}-plan-${s}`);
    if (s === "fuel") {
      check((await pp.textContent(".big")).includes("115–145"), `${label}: protein target from latest bodyweight (73.4 kg)`);
      await pp.click("[data-act=diet][data-d=veg]");
      check(await pp.locator(".food-table", { hasText: "Chicken" }).count() === 0 && await pp.locator(".food-table", { hasText: "Paneer" }).count() === 1, `${label}: Veg filter`);
    }
    if (s === "learn") {
      check(await pp.locator("details.explain").count() === 6, `${label}: six explainers`);
      await pp.click("#learn-double-progression summary");
      check(await pp.isVisible("text=Add reps first"), `${label}: explainer opens`);
    }
  }
  // settings
  await pp.fill("#sport", "Football");
  await pp.press("#sport", "Enter");
  check((await db(pp)).settings.sportName === "Football", `${label}: sport name saves`);
  await pp.click("[data-act=weekday][data-d='2']");
  check((await db(pp)).settings.busyWeekdays.includes(2), `${label}: busy weekday saves`);
  await pp.click("[data-act=units][data-u=lb]");
  check((await db(pp)).settings.units === "lb", `${label}: units switch to lb`);
  await pp.click("[data-act=vibrate]");
  check((await db(pp)).settings.vibrate === false, `${label}: vibration off`);
  const [dl] = await Promise.all([pp.waitForEvent("download"), pp.click("[data-act=export]")]);
  const file = await dl.path();
  const exported = JSON.parse(await readFile(file, "utf8"));
  check(exported.app === "uptime" && exported.data.sessions.length === 6, `${label}: export has everything`);
  await pp.click("[data-act=reset-all]");
  check((await db(pp)).sessions.length === 0, `${label}: Erase everything`);
  await pp.click(".toast button");
  check((await db(pp)).sessions.length === 6, `${label}: Undo brings it all back`);
  await pp.click("[data-act=reset-all]");
  await pp.setInputFiles("#import", file);
  await pp.waitForFunction(() => JSON.parse(localStorage.getItem("uptime2")).sessions.length === 6);
  check((await db(pp)).settings.units === "lb", `${label}: import restores everything`);
  await pp.click("[data-act=reset-prefs]");
  d = await db(pp);
  check(d.settings.units === "kg" && d.settings.sportName === "Basketball" && d.sessions.length === 6, `${label}: reset settings keeps logs`);
  await pp.click("[data-act=restore]");
  check((await db(pp)).settings.units === "lb", `${label}: restore the kept copy`);
  check(p.errors.length === 0, `${label}: Plan has no console errors ${p.errors.join(" | ")}`);
  await p.ctx.close();
}

// Units reach the workout screen
{
  // straight in through Home's Start link (Home itself is checked by check-home.mjs)
  const { pg, ctx, errors } = await open("workout.html?start=lift", { width: 390, height: 844 }, { uptime2: { ...SEED, v: 3, settings: { units: "lb" } } });
  await pg.click("[data-act=checkin][data-v=Good]");
  await pg.waitForSelector("[data-screen=set]");
  // Upper sessions open with bodyweight pulls: jump to the first press, whose set and ramp-up show weights
  await pg.click("[data-act=open-all]");
  await pg.waitForSelector("[data-act=jump]");
  await pg.locator("[data-act=jump]", { hasText: "press" }).first().click();
  await pg.waitForSelector("[data-screen=set]");
  const txt = await pg.textContent("main");
  check(/\blb\b/.test(txt) && !/\d kg\b/.test(txt), "workout shows lb when units are lb");
  check(errors.length === 0, `workout in lb has no console errors ${errors.join(" | ")}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
