// Browser check: ways out, the back gesture, skip/remove/previous, the new Home and overlaps.
// Needs Playwright with Chromium.   node tests/browser/check-nav.mjs [outDir]
//
// 1. Every Workout screen has a back/exit button at the top left.
// 2. Exit › Save and finish saves a partial session (Resume undoes it); Exit › Discard goes
//    Home with Undo, and Undo brings the workout back with its sets.
// 3. The back gesture: closes an open sheet first; on a screen it goes to Home, which offers
//    Resume, and the workout is untouched. On Home, back closes a session sheet.
// 4. Skip a set, skip an exercise (with Undo), remove a logged set, Previous to a finished
//    exercise and Add a set.
// 5. Home: Start first, This week's six slots (done with the day, next, not yet), a slot opens
//    its exercises with muscle maps and YouTube links, the how-to map is large, past sessions
//    open their sets; desktop uses two columns.
// 6. No text overlaps other text on any screen at 360 px, 390 px and desktop, in both themes.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = new URL("../..", import.meta.url).pathname;
const out = process.argv[2];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = join(root, p.endsWith("/") ? p + "index.html" : p);
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0;
const fail = (m) => { failed++; console.log("FAIL", m); };
const ok = (m) => console.log("ok  ", m);
const check = (cond, m) => (cond ? ok(m) : fail(m));

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const ts = (n) => Date.now() - n * 864e5;
const S = (n, session, name, items = []) => ({ id: `s${n}${session}`, date: daysAgo(n), t: ts(n), end: ts(n) + 40 * 6e4, session, name, items, planned: 18 });
const DATA = {
  v: 4, active: null, settings: {}, body: { weight: [] },
  activities: [{ id: "r1", date: daysAgo(3), t: ts(3), kind: "run", run: "interval" }],
  // Lower A, Upper B and Lower B this week, so Upper A (reps first: negative pull-ups) is next
  sessions: [S(6, "LA", "Lower A", [{ key: "1", ex: "smith-machine-back-squat", sets: [{ kg: 60, reps: 6 }, { kg: 60, reps: 6 }] }]),
    S(5, "UB", "Upper B", [{ key: "2", ex: "dumbbell-overhead-press", sets: [{ kg: 12.5, reps: 8 }] }]),
    S(4, "LB", "Lower B", [{ key: "1", ex: "barbell-deadlift", sets: [{ kg: 70, reps: 5 }] }])],
};

/** While a rest runs the dock is one line: Edit opens Swap / Skip set / All. */
async function dock(pg) { if (await pg.locator("[data-act=dock-edit]").count()) await pg.click("[data-act=dock-edit]"); }

async function open(viewport, { seed = DATA, theme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: out ? 2 : 1, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: "reduce" });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => { if (!/ViewTransition|Transition was aborted/.test(e.message)) errors.push(e.message); });
  pg.on("console", (m) => { if (m.type() === "error" && !/ViewTransition|Transition was aborted|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await pg.addInitScript(([s, t, day]) => {
    if (s && !localStorage.getItem("uptime2")) localStorage.setItem("uptime2", s);
    localStorage.setItem("uptime-theme", t);
    if (!localStorage.getItem("uptime-home")) localStorage.setItem("uptime-home", JSON.stringify({ day, next: null }));
  }, [seed ? JSON.stringify(seed) : null, theme, iso(new Date())]);
  return { pg, ctx, errors };
}
const db = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("uptime2")));
const shot = async (pg, n) => { if (out) { await pg.waitForTimeout(450); await pg.screenshot({ path: `${out}/${n}.png` }); } };
const noErrors = (label, errors) => check(errors.length === 0, `${label}: no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
const topLeft = (pg) => pg.evaluate(() => {
  const b = document.querySelector(".back");
  if (!b) return false;
  const r = b.getBoundingClientRect();
  return r.left < 40 && r.top < 110 && r.height >= 48 && r.width >= 48;
});
/** From Home: Start → Good → the set screen. */
async function startLift(pg) {
  await pg.goto(`${origin}/index.html`);
  await pg.click(".hm-start");
  await pg.waitForSelector("[data-screen=checkin]");
  await pg.click("[data-act=checkin][data-v=Good]");
  await pg.waitForSelector("[data-screen=set]");
}
const logSet = async (pg) => { await pg.click("#log-btn"); await pg.waitForTimeout(700); };

// ---------------------------------------------------------------- 1 + 2: ways out
async function waysOut() {
  const vp = { width: 390, height: 844 };
  { // a back button on every screen
    const { pg, ctx, errors } = await open(vp);
    await pg.goto(`${origin}/index.html`);
    await pg.click(".hm-start");
    await pg.waitForSelector("[data-screen=checkin]");
    check(await topLeft(pg), "check-in: back button at the top left, ≥ 48 px");
    await pg.click(".back");
    await pg.waitForSelector("[data-screen=home]");
    check(!(await db(pg)).active, "check-in: Back goes Home and starts nothing");
    for (const [start, screen] of [["run", "run"], ["other", "other"]]) {
      await pg.goto(`${origin}/workout.html?start=${start}`);
      await pg.waitForSelector(`[data-screen=${screen}]`);
      check(await topLeft(pg), `${screen}: back button at the top left`);
    }
    await startLift(pg);
    check(await topLeft(pg), "set screen: Exit at the top left");
    await shot(pg, "nav-01-set");
    await logSet(pg);
    await logSet(pg);
    await pg.click("[data-act=exit]");
    await pg.waitForSelector(".sheet [data-act=exit-save]");
    await shot(pg, "nav-02-exit-sheet");
    check((await pg.textContent(".sheet")).includes("Save and finish") && (await pg.textContent(".sheet")).includes("Discard"), "Exit asks Save and finish or Discard");
    await pg.click(".sheet [data-act=close-sheet]");
    await pg.waitForSelector(".sheet", { state: "detached" });
    check(await pg.isVisible("[data-screen=set]"), "Keep going closes the sheet and stays on the set");
    // Pause, keep it open: the first option; Home then offers Resume and nothing is saved or lost
    await pg.click("[data-act=exit]");
    check(await pg.evaluate(() => document.querySelector(".sheet .opt")?.dataset.act === "exit-pause"), "Exit: \"Pause, keep it open\" comes first");
    await pg.click("[data-act=exit-pause]");
    await pg.waitForSelector("[data-screen=home] .hm-start");
    check((await pg.textContent(".hm-start")).includes("Resume") && (await db(pg)).active?.log.length === 2, "Pause: back on Home with Resume, both sets kept");
    await pg.click(".hm-start");
    await pg.waitForSelector("[data-screen=set]");
    await pg.click("[data-act=exit]");
    await pg.click("[data-act=exit-save]");
    await pg.waitForSelector("[data-screen=summary]");
    let d = await db(pg);
    check(!d.active && d.sessions.at(-1).partial === true && d.sessions.at(-1).items.flatMap((i) => i.sets).length === 2, "Save and finish: saved as a partial session with both sets");
    check((await pg.textContent("[data-screen=summary]")).includes("stays next up"), "Save and finish under half the sets: the summary says the session stays next up");
    check(await topLeft(pg), "summary: back button at the top left");
    await pg.click(".toast [data-act=resume]");
    await pg.waitForSelector("[data-screen=set]");
    d = await db(pg);
    check(d.active?.log.length === 2 && !d.sessions.some((s) => s.id === d.active.id), "Resume undoes Save and finish: the workout is back with its sets");
    // Discard, then Undo
    await pg.click("[data-act=exit]");
    await pg.click("[data-act=exit-discard]");
    await pg.waitForSelector("[data-screen=home]");
    d = await db(pg);
    check(!d.active && !d.sessions.some((s) => s.partial && s.date === iso(new Date())), "Discard: nothing saved, the workout is gone");
    check((await pg.textContent(".toast")).includes("discarded"), "Discard: Home says so, with Undo");
    await shot(pg, "nav-03-discarded");
    await pg.click(".toast [data-act=undo]");
    await pg.waitForSelector("[data-screen=set]");
    check((await db(pg)).active?.log.length === 2, "Undo after Discard brings the workout back with its sets");
    noErrors("ways out", errors);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- 3: the back gesture
async function backGesture() {
  const { pg, ctx, errors } = await open({ width: 390, height: 844 });
  await startLift(pg);
  const liftName = (await db(pg)).active.name;
  await logSet(pg);
  await dock(pg); await pg.click("[data-act=open-skip]");
  await pg.waitForSelector(".sheet");
  await pg.goBack();
  await pg.waitForSelector(".sheet", { state: "detached" });
  check(await pg.isVisible("[data-screen=set]") && (await db(pg)).active?.log.length === 1, "back with a sheet open: closes the sheet, stays in the workout");
  await pg.click(".howto-btn");
  await pg.waitForSelector(".sheet");
  await pg.goBack();
  await pg.waitForSelector(".sheet", { state: "detached" });
  check(await pg.isVisible("[data-screen=set]"), "back closes the how-to too");
  await pg.goBack();
  await pg.waitForSelector("[data-screen=home] .hm-start");
  check((await pg.textContent(".hm-start")).includes("Resume") && (await db(pg)).active?.log.length === 1, "back on the set screen: Home offers Resume, the workout is untouched");
  await pg.click(".hm-start");
  await pg.waitForSelector("[data-screen=set]");
  ok("Resume returns to the same workout");
  // Exit from the workout returns one step back to Home (history stays clean)
  await pg.click("[data-act=exit]");
  await pg.click("[data-act=exit-save]");
  await pg.waitForSelector("[data-screen=summary]");
  await pg.click("[data-screen=summary] .back");
  await pg.waitForSelector("[data-screen=home]");
  check((await pg.textContent("#next-title")).includes(liftName), `summary › Home: one set saved isn't the session, ${liftName} is still next up`);
  // Home: a slot sheet closes on back
  await pg.click(".slot >> nth=0");
  await pg.waitForSelector(".sheet");
  await pg.goBack();
  await pg.waitForSelector(".sheet", { state: "detached" });
  check(await pg.isVisible("[data-screen=home]"), "Home: back closes the session sheet and stays on Home");
  noErrors("back gesture", errors);
  await ctx.close();
}

// ---------------------------------------------------------------- 4: skip, remove, previous
async function skipping() {
  const { pg, ctx, errors } = await open({ width: 390, height: 844 });
  await startLift(pg);
  const first = await pg.textContent("#ex-name");
  const setsOf = async () => (await db(pg)).active.items[0].sets;
  const before = await setsOf();
  await dock(pg); await pg.click("[data-act=open-skip]");
  await shot(pg, "nav-04-skip-sheet");
  await pg.click("[data-act=skip-set]");
  check(await setsOf() === before - 1 && (await db(pg)).active.log.length === 0, "Skip this set: one fewer set, nothing logged");
  await pg.click(".toast [data-act=undo-snap]");
  check(await setsOf() === before, "Undo brings the skipped set back");
  await logSet(pg);
  await dock(pg); await pg.click("[data-act=open-skip]");
  await pg.click("[data-act=skip-ex]");
  check((await pg.textContent("#ex-name")) !== first && (await db(pg)).active.log.length === 1, "Skip the rest of an exercise: on to the next one, the logged set stays");
  await pg.click("[data-act=prev-ex]");
  await pg.waitForSelector("[data-screen=review]");
  check((await pg.textContent("#ex-name")) === first, "Previous goes back to the earlier exercise");
  await shot(pg, "nav-05-review");
  await pg.click("[data-act=remove-set]");
  check((await db(pg)).active.log.length === 0, "Remove deletes a logged set");
  await pg.click(".toast [data-act=undo-snap]");
  check((await db(pg)).active.log.length === 1, "Undo puts the removed set back");
  await pg.click("[data-act=add-set]");
  await pg.waitForSelector("[data-screen=set]");
  check((await pg.textContent("#ex-name")) === first && await pg.isVisible("#log-btn"), "Add a set reopens the exercise for logging");
  await pg.click("[data-act=next-ex]");
  check((await pg.textContent("#ex-name")) !== first, "Next moves forward without dropping anything");
  await dock(pg); await pg.click("[data-act=open-all]");
  check(!(await pg.locator(".sheet [data-act=jump][disabled]").count()), "All exercises: finished ones can be opened too");
  noErrors("skipping", errors);
  await ctx.close();
}

// ---------------------------------------------------------------- 5: the new Home
async function home() {
  for (const [label, vp] of [["390", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
    const { pg, ctx, errors } = await open(vp);
    await pg.goto(`${origin}/index.html`);
    await pg.waitForSelector(".slot");
    const order = await pg.evaluate(() => [".dial-card", ".hm-week"].map((s) => document.querySelector(s).getBoundingClientRect().top));
    const leftCol = await pg.evaluate(() => document.querySelector(".dial-card").getBoundingClientRect().left < document.querySelector(".hm-week").getBoundingClientRect().left);
    check(label === "desktop" ? leftCol && order[0] <= order[1] + 40 : order[0] < order[1], `${label}: today's session comes first`);
    const bg = await pg.evaluate(() => getComputedStyle(document.querySelector(".hm-start")).backgroundColor);
    check(bg === "rgb(25, 122, 86)", `${label}: Start is BCG green (${bg})`);
    check(await pg.locator(".slot").count() === 6, `${label}: This week has six slots`);
    const states = await pg.evaluate(() => [...document.querySelectorAll(".slot")].map((b) => b.className.match(/slot--(\w+)/)[1]));
    check(states.filter((x) => x === "done").length === 4 && states.includes("next") && states.includes("later"), `${label}: done, next and not yet (${states.join(",")})`);
    check(/Today|Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(await pg.textContent(".slot--done .slot__state")), `${label}: a done slot shows its day`);
    check(!(await pg.locator(".hm-greet").count()) && !(await pg.textContent("body")).includes("Late one"), `${label}: no "Late one"`);
    if (label === "desktop") {
      const side = await pg.evaluate(() => document.querySelector(".hm-week").getBoundingClientRect().left > document.querySelector(".dial-card").getBoundingClientRect().right);
      check(side, "desktop: two columns (week beside the session)");
    }
    await shot(pg, `nav-06-home-${label}`);
    await pg.click(".slot--next");
    await pg.waitForSelector(".sheet .exrow");
    check(await pg.locator(".sheet .exrow .mmap").count() >= 5, `${label}: the session sheet lists exercises with muscle maps`);
    const yt = await pg.getAttribute(".sheet .exrow__video", "href");
    check(yt.startsWith("https://www.youtube.com/results?search_query="), `${label}: each exercise has a YouTube search link`);
    await shot(pg, `nav-07-session-${label}`);
    await pg.click(".sheet .exrow button >> nth=0");
    await pg.waitForSelector(".sheet .mmap--l");
    const w = await pg.evaluate(() => document.querySelector(".sheet .mmap--l").getBoundingClientRect().width);
    const hgt = await pg.evaluate(() => document.querySelector(".sheet .mmap--l").getBoundingClientRect().height);
    check(w >= 150 && hgt <= 221, `${label}: the how-to map is readable and capped so the steps show (${Math.round(w)} × ${Math.round(hgt)} px)`);
    await pg.click(".sheet [data-act=slot]");
    await pg.waitForSelector(".sheet .exrow");
    ok(`${label}: Back to the session from the how-to`);
    await pg.keyboard.press("Escape");
    await pg.waitForSelector(".sheet", { state: "detached" });
    await pg.click("[data-act=past] >> nth=0");
    await pg.waitForSelector(".sheet");
    const past = await pg.textContent(".sheet");
    check(/×|reps|Strava/.test(past), `${label}: a past session opens with its sets`);
    noErrors(`home ${label}`, errors);
    await ctx.close();
  }
  { // Progress: past sessions with sets and weights, last 7 days with a muscle map
    const { pg, ctx, errors } = await open({ width: 390, height: 844 });
    await pg.goto(`${origin}/progress.html`);
    check((await pg.textContent(".l7")).includes("Sets") && await pg.isVisible(".l7 .mmap"), "Progress: Last 7 days with sets and a combined muscle map");
    const n = await pg.locator("#history [data-act=past]").count();
    check(n === 4, `Progress: every past session listed (${n})`);
    await pg.click("#history [data-act=past] >> text=Lower A");
    await pg.waitForSelector(".sheet .done-sets");
    check((await pg.textContent(".sheet")).includes("60 kg × 6"), "Progress: a past session shows its sets and weights");
    noErrors("progress history", errors);
    await ctx.close();
  }
  { // Plan opens on the week
    const { pg, ctx, errors } = await open({ width: 390, height: 844 });
    await pg.goto(`${origin}/plan.html`);
    check((await pg.textContent(".subnav [aria-current=page]")).trim() === "Week" && await pg.locator(".week-ups > li").count() >= 6, "Plan: the week plan comes first, every session listed");
    noErrors("plan", errors);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- 6: no overlapping text
const OVERLAPS = () => {
  const leaves = [];
  const walk = (el) => {
    if (el.closest(".sr-only, .toast-slot, .scrim, [aria-hidden=true], svg")) return;
    if (el.matches("details:not([open]) > :not(summary)")) return; // a closed card's contents aren't painted
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return;
    const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (texts.length) {
      const r = document.createRange();
      for (const t of texts) {
        r.selectNodeContents(t);
        // text cut off by its own box (an ellipsis) only paints inside that box
        const clip = st.overflow !== "visible" ? el.getBoundingClientRect() : null;
        for (const b0 of r.getClientRects()) {
          const b = clip ? { left: Math.max(b0.left, clip.left), right: Math.min(b0.right, clip.right), top: Math.max(b0.top, clip.top), bottom: Math.min(b0.bottom, clip.bottom) } : b0;
          b.width = b.right - b.left; b.height = b.bottom - b.top;
          if (b.width > 1 && b.height > 1) leaves.push({ el, b });
        }
      }
    }
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  const hits = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], c = leaves[j];
    if (a.el === c.el || a.el.contains(c.el) || c.el.contains(a.el)) continue;
    // sticky header/footer and the tab bar sit on top of the page by design: text scrolling under
    // them is hidden (they're opaque, checked below), not overlapping
    const layer = (e) => e.closest(".scr__head, .scr__foot, .tabbar, .tabs, .sheet");
    if (layer(a.el) !== layer(c.el)) continue;
    const x0 = Math.max(a.b.left, c.b.left), x1 = Math.min(a.b.right, c.b.right);
    const y0 = Math.max(a.b.top, c.b.top), y1 = Math.min(a.b.bottom, c.b.bottom);
    if (x1 - x0 < 3 || y1 - y0 < 3) continue;
    const top = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
    // only a real overlap if both are painted there (an opaque header covering scrolled text is fine)
    if (!top || !(a.el.contains(top) || top.contains(a.el) || c.el.contains(top) || top.contains(c.el))) continue;
    const visA = getComputedStyle(a.el).color, visC = getComputedStyle(c.el).color;
    if (visA && visC) hits.push(`"${a.el.textContent.trim().slice(0, 30)}" × "${c.el.textContent.trim().slice(0, 30)}"`);
  }
  for (const bar of document.querySelectorAll(".scr__head, .scr__foot, .tabs")) {
    const m = getComputedStyle(bar).backgroundColor.match(/rgba?\(([^)]+)\)/);
    const alpha = m ? Number(m[1].split(",")[3] ?? 1) : 0;
    if (alpha < 0.95) hits.push(`${bar.className} is see-through (alpha ${alpha}), so text scrolling under it shows through`);
  }
  return hits;
};
async function overlaps() {
  const screens = [
    ["home", async (pg) => { await pg.goto(`${origin}/index.html`); }],
    ["home-first", async (pg) => { await pg.goto(`${origin}/index.html`); }, null],
    ["checkin", async (pg) => { await pg.goto(`${origin}/workout.html?start=lift`); await pg.waitForSelector("[data-screen=checkin]"); }],
    ["checkin-scrolled", async (pg) => { await pg.goto(`${origin}/workout.html?start=lift`); await pg.waitForSelector("[data-screen=checkin]"); await pg.evaluate(() => scrollTo(0, 260)); }],
    ["set", async (pg) => { await pg.goto(`${origin}/workout.html?start=lift`); await pg.click("[data-v=Good]"); await pg.waitForSelector("[data-screen=set]"); }],
    ["rest", async (pg) => { await pg.goto(`${origin}/workout.html?start=lift`); await pg.click("[data-v=Good]"); await pg.click("#log-btn"); await pg.waitForSelector(".timerbox"); }],
    ["run", async (pg) => { await pg.goto(`${origin}/workout.html?start=run`); await pg.waitForSelector("[data-screen=run]"); }],
    ["other", async (pg) => { await pg.goto(`${origin}/workout.html?start=other`); await pg.waitForSelector("[data-screen=other]"); }],
    ["plan", async (pg) => { await pg.goto(`${origin}/plan.html`); }],
    ["plan-settings", async (pg) => { await pg.goto(`${origin}/plan.html#settings`); }],
    ["progress", async (pg) => { await pg.goto(`${origin}/progress.html`); }],
  ];
  for (const theme of ["light", "dark"]) {
    for (const [vn, vp] of [["360", { width: 360, height: 740 }], ["390", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
      let bad = [];
      for (const [name, go, seed = DATA] of screens) {
        const { pg, ctx } = await open(vp, { theme, seed });
        await go(pg);
        await pg.waitForTimeout(900);
        await pg.evaluate(() => document.querySelector(".toast-slot")?.replaceChildren());
        const hits = await pg.evaluate(OVERLAPS);
        const hscroll = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (hits.length) bad.push(`${name}: ${hits.slice(0, 3).join("; ")}`);
        if (hscroll) bad.push(`${name}: horizontal scroll`);
        await ctx.close();
      }
      check(!bad.length, `${theme} ${vn}: no overlapping text or sideways scroll on ${screens.length} screens${bad.length ? "\n       " + bad.join("\n       ") : ""}`);
    }
  }
}

await waysOut();
await backGesture();
await skipping();
await home();
await overlaps();
await browser.close();
server.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
