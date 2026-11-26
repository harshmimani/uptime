// Browser check for the Workout section (workout.html). Needs Playwright with Chromium.
//   node tests/browser/check-workout.mjs [outDir]
// Runs the real flows at 360 px, 390 px and a desktop width:
//   check-in → set (warm-up, prefill, beat last time) → log → rest (−15/+15/skip) → swap → undo
//   → All exercises → Full/Short → finish → summary; reopen mid-rest; > 90 min resume;
//   run (rep, recovery, finish); log something else (save on tap, edit, undo).
// Checks: no console errors, no horizontal scroll, Log button in the bottom third and
// ≥ 48 px, timers right after "time passes", every save lands in localStorage.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = new URL("../..", import.meta.url).pathname;
const out = process.argv[2];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = join(root, p.endsWith("/") ? p + "index.html" : p);
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/workout.html`;
const browser = await chromium.launch();
let failed = 0;
const fail = (m) => { failed++; console.log("FAIL", m); };
const ok = (m) => console.log("ok  ", m);
const check = (cond, m) => (cond ? ok(m) : fail(m));

const T0 = new Date("2026-11-26T07:30:00").getTime();
// A bench session 6 days ago so "last time" and "beat last time" have something to show.
const HISTORY = {
  v: 2, activities: [], active: null, settings: {},
  sessions: [{ id: "s0", date: "2026-11-20", t: T0 - 6 * 864e5, session: "LA", name: "Lower A", items: [] },
    { id: "s1", date: "2026-11-21", t: T0 - 5 * 864e5, session: "UB", name: "Upper B", items: [] },
    { id: "s2", date: "2026-11-23", t: T0 - 3 * 864e5, session: "LB", name: "Lower B", items: [] },
    { id: "s3", date: "2026-11-19", t: T0 - 7 * 864e5, session: "UA", name: "Upper A",
      items: [{ key: "1", ex: "dumbbell-bench-press", role: "main", sets: [{ kg: 15, reps: 8 }, { kg: 15, reps: 8 }, { kg: 15, reps: 7 }] }] }],
};

async function page(name, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: out ? 2 : 1, hasTouch: viewport.width < 600, isMobile: viewport.width < 600, reducedMotion: opts.reducedMotion || "no-preference" });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message));
  pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await pg.clock.install({ time: T0 });
  if (opts.seed) await pg.addInitScript((s) => { if (!localStorage.getItem("uptime2")) localStorage.setItem("uptime2", s); }, JSON.stringify(opts.seed));
  return { pg, ctx, errors };
}
const shot = async (pg, n) => { if (out) await pg.screenshot({ path: `${out}/${n}.png`, fullPage: false }); };
const noHScroll = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const db = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("uptime2")));
async function logBtnInThumbZone(pg) {
  return pg.evaluate(() => {
    const b = document.querySelector("#log-btn, [data-act=checkin]");
    const r = b.getBoundingClientRect();
    return r.top > innerHeight * 0.6 && r.bottom <= innerHeight + 1 && r.height >= 48;
  });
}

async function liftFlow(label, viewport) {
  const { pg, ctx, errors } = await page(label, viewport, { seed: HISTORY });
  await pg.goto(base);
  await pg.waitForSelector("[data-act=start-lift]");
  check(await pg.textContent("#next-title").then((t) => t.includes("Upper A")), `${label}: rotation says Upper A is next`);
  await shot(pg, `${label}-01-launcher`);
  check(await noHScroll(pg), `${label}: launcher has no horizontal scroll`);

  await pg.click("[data-act=start-lift]");
  await pg.waitForSelector("[data-screen=checkin]");
  await pg.waitForTimeout(700);
  await shot(pg, `${label}-02-checkin`);
  check(await noHScroll(pg), `${label}: check-in has no horizontal scroll`);
  check(await logBtnInThumbZone(pg), `${label}: check-in buttons sit in the thumb zone`);
  await pg.click("[data-act=pick-length][data-short='1']");
  check(await pg.locator(".exlist li.out").count() === 4, `${label}: Short greys out 4 of 7 exercises`);
  await pg.click("[data-act=pick-length][data-short='0']");
  await pg.click("[data-act=checkin][data-v=Good]");
  await pg.waitForSelector("[data-screen=set]");
  await pg.waitForTimeout(300);
  check(await pg.isVisible("#warm-left"), `${label}: warm-up card on the first exercise`);
  check((await pg.textContent("#ex-name")).includes("Negative pull-up"), `${label}: first exercise is the ladder`);
  check(await logBtnInThumbZone(pg), `${label}: Log set is in the bottom third and ≥ 48 px`);
  check(await noHScroll(pg), `${label}: set screen has no horizontal scroll`);
  await shot(pg, `${label}-03-set-warmup`);

  // jump to bench via All exercises to see prefill + beat last time
  await pg.click("[data-act=open-all]");
  await pg.waitForSelector(".sheet");
  await shot(pg, `${label}-04-all-exercises`);
  await pg.click("[data-act=jump][data-key='1']");
  await pg.waitForTimeout(200);
  check((await pg.inputValue("#v-kg")) === "15", `${label}: weight prefilled from last time (15 kg)`);
  check((await pg.textContent("#v-reps")) === "8", `${label}: reps prefilled from last time (8)`);
  check((await pg.textContent("#beat")).includes("Beat 15 kg × 8"), `${label}: beat-last-time target shown`);
  check(await pg.isVisible("#warm-left"), `${label}: warm-up card moved with the user to bench`);
  await pg.click("[data-act=step][data-f=reps][data-d='1']");
  check(await pg.locator("#beat.on").count() === 1, `${label}: 9 reps lights up "Beats last time"`);
  check((await pg.textContent("#log-label")).includes("9 × 15 kg"), `${label}: Log restates 9 × 15 kg`);
  check((await db(pg)).active.log.length === 0, `${label}: tapping a number never logs`);
  await shot(pg, `${label}-05-set-beat`);

  await pg.click("#log-btn");
  await pg.waitForTimeout(250);
  await shot(pg, `${label}-06-set-done-anim`);
  await pg.waitForSelector("#ring");
  await pg.waitForTimeout(400);
  const d1 = await db(pg);
  check(d1.active.log.length === 1 && d1.active.log[0].reps === 9 && d1.active.log[0].kg === 15, `${label}: set saved right away (9 × 15 kg)`);
  check(await pg.isHidden("#warm-left").catch(() => true), `${label}: warm-up card leaves after set 1`);
  check(/^2:0\d$/.test(await pg.textContent("#ring-time")), `${label}: 2:00 rest started by itself`);
  check(await pg.isVisible(".toast-slot .toast"), `${label}: "Set 1 logged · Undo" toast`);
  check(await logBtnInThumbZone(pg), `${label}: Log set 2 stays live during rest, same place`);
  await shot(pg, `${label}-07-rest`);
  await pg.click("[data-act=rest-add][data-d='15']");
  check(/^2:1\d$/.test(await pg.textContent("#ring-time")), `${label}: +15 s`);
  await pg.click("[data-act=rest-add][data-d='-15']");
  await pg.click("[data-act=rest-add][data-d='-15']");
  check(/^1:[45]\d$/.test(await pg.textContent("#ring-time")), `${label}: −15 s`);

  // phone locked for a minute, then reopened: the timer is still right
  await pg.clock.fastForward(60000);
  await pg.reload();
  await pg.waitForSelector("#ring");
  await pg.waitForTimeout(300);
  const t = await pg.textContent("#ring-time");
  check(/^0:[45]\d$/.test(t), `${label}: reopened mid-rest, straight back to the set with ${t} left`);
  await pg.clock.fastForward(60000);
  await pg.waitForTimeout(400);
  check((await pg.textContent("#ring-time")) === "Go", `${label}: rest over shows Go`);
  await shot(pg, `${label}-08-rest-over`);
  check((await pg.inputValue("#v-kg")) === "15", `${label}: weight carries to set 2`);

  // swap
  await pg.click("[data-act=open-swap]");
  await pg.waitForSelector(".sheet");
  await shot(pg, `${label}-09-swap`);
  await pg.click("[data-act=swap-to][data-ex=dumbbell-floor-press]");
  await pg.waitForTimeout(200);
  check((await pg.textContent("#ex-name")).includes("floor press"), `${label}: swapped to floor press`);
  check((await pg.inputValue("#v-kg")) === "15", `${label}: swap keeps the working weight`);
  await pg.click(".toast [data-act=undo-swap]");
  check((await pg.textContent("#ex-name")).includes("bench press"), `${label}: undo swap`);

  // log set 2 then undo it
  await pg.click("#log-btn");
  await pg.waitForTimeout(800);
  await pg.click(".toast [data-act=undo]");
  check((await db(pg)).active.log.length === 1, `${label}: undo removes the set`);

  // switch to Short from the sheet, then finish early
  await pg.click("[data-act=open-all]");
  await pg.click("[data-act=set-length][data-short='1']");
  check((await db(pg)).active.items.length === 3, `${label}: switched to Short mid-session`);
  await pg.click("[data-act=open-all]");
  await pg.click("[data-act=finish-now]");
  await pg.waitForSelector("[data-screen=summary]");
  await pg.waitForTimeout(1300);
  await shot(pg, `${label}-10-summary-partial`);
  const d2 = await db(pg);
  check(d2.active === null && d2.sessions.some((s) => s.partial && s.session === "UA"), `${label}: finish early saves a partial session`);
  check(await noHScroll(pg), `${label}: summary has no horizontal scroll`);
  await pg.click(".toast [data-act=resume]");
  await pg.waitForSelector("[data-screen=set]");
  check((await db(pg)).active?.log.length === 1, `${label}: Resume brings the session back`);

  // finish the Short version properly: log everything
  for (let i = 0; i < 20; i++) {
    if (await pg.locator("[data-screen=summary]").count()) break;
    await pg.click("#log-btn");
    await pg.waitForTimeout(700);
  }
  await pg.waitForSelector("[data-screen=summary]");
  await pg.waitForTimeout(1500);
  await shot(pg, `${label}-11-summary`);
  check((await pg.textContent("h1")).includes("Upper A done"), `${label}: summary title`);
  check(await pg.locator(".nextlist li").count() >= 2, `${label}: summary says what changes next time`);
  await pg.click("[data-act=home]");
  await pg.waitForSelector("[data-screen=home]");
  check((await pg.textContent("#next-title")).includes("Lower A"), `${label}: rotation moved on to Lower A`);
  check(!(await pg.locator("[data-act=start-lift]").count()), `${label}: no second lift offered today`);
  check(errors.length === 0, `${label}: no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}

async function timedAndResume(label, viewport) {
  const { pg, ctx, errors } = await page(label, viewport, { seed: { ...HISTORY, sessions: HISTORY.sessions.filter((s) => s.session !== "UA").concat([{ id: "u", date: "2026-11-24", t: T0 - 2 * 864e5, session: "UA", name: "Upper A", items: [] }]) } });
  await pg.goto(base);
  // the latest strength session is Upper A (24th), so Lower A is next: it has a carry (timed set)
  await pg.click("[data-act=start-lift]");
  await pg.click("[data-act=checkin][data-v=Rough]");
  await pg.waitForSelector("[data-screen=set]");
  check(await pg.isVisible(".toast"), `${label}: Rough turns on Short with an undo line`);
  check((await db(pg)).active.short === true, `${label}: Rough → Short version`);
  await shot(pg, `${label}-12-rough-short`);
  await pg.click(".toast [data-act=to-full]");
  check((await db(pg)).active.short === false, `${label}: Switch to full from the undo line`);
  // find a timed exercise (carry) via All exercises if present
  const w = (await db(pg)).active;
  const timed = w.items.find((i) => i.sec);
  if (timed) {
    await pg.click("[data-act=open-all]");
    await pg.click(`[data-act=jump][data-key='${timed.key}']`);
    check((await pg.textContent("#log-label")).startsWith("Start"), `${label}: timed set starts with one tap`);
    await pg.click("#log-btn");
    await pg.waitForSelector("#ring[data-kind=work]");
    await shot(pg, `${label}-13-timed`);
    await pg.clock.fastForward(timed.sec[0] * 1000 * (timed.perSide ? 2 : 1) + 500);
    await pg.waitForTimeout(1200);
    const a = (await db(pg)).active;
    check(a.log.length === 1 && a.log[0].sec > 0, `${label}: timed set logs itself when it ends`);
  }
  // > 90 minutes later
  await pg.clock.fastForward(95 * 60000);
  await pg.reload();
  await pg.waitForSelector("[data-screen=resume]");
  await shot(pg, `${label}-14-resume`);
  check(await pg.isVisible("[data-act=pick-up]"), `${label}: > 90 min asks Pick up or Finish`);
  await pg.click("[data-act=pick-up]");
  await pg.waitForSelector("[data-screen=set]");
  // next day: saved as partial
  await pg.clock.fastForward(24 * 3600000);
  await pg.reload();
  await pg.waitForSelector("[data-screen=home]");
  check((await pg.textContent(".toast")).includes("as partial"), `${label}: unfinished session saved as partial the next day`);
  check(errors.length === 0, `${label}: no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}

async function runAndOther(label, viewport) {
  const { pg, ctx, errors } = await page(label, viewport, { seed: HISTORY });
  await pg.goto(base);
  await pg.click("[data-act=start-run]");
  await pg.click("[data-act=checkin][data-v=Good]");
  await pg.waitForSelector("[data-screen=run]");
  await shot(pg, `${label}-15-run-warmup`);
  check(await noHScroll(pg), `${label}: run screen has no horizontal scroll`);
  check(await logBtnInThumbZone(pg), `${label}: run primary in the thumb zone`);
  await pg.click("#log-btn");
  await pg.waitForSelector("#run-clock");
  await pg.clock.fastForward(105000);
  await pg.waitForTimeout(300);
  check((await pg.textContent("#run-clock")).startsWith("1:4"), `${label}: rep stopwatch runs from a timestamp`);
  await shot(pg, `${label}-16-run-rep`);
  await pg.click("#log-btn");
  await pg.waitForSelector("#ring[data-kind=rest]");
  await pg.waitForTimeout(500);
  await shot(pg, `${label}-17-run-recovery`);
  check((await db(pg)).active.log.length === 1, `${label}: rep saved`);
  await pg.click("[data-act=finish-now]");
  await pg.waitForSelector("[data-screen=run-summary]");
  await pg.waitForTimeout(1200);
  await shot(pg, `${label}-18-run-summary`);
  check((await db(pg)).activities.some((a) => a.kind === "run" && a.partial), `${label}: run saved as partial`);
  await pg.click("[data-act=home]");

  await pg.click("[data-act=open-other]");
  await pg.waitForSelector("[data-screen=other]");
  await shot(pg, `${label}-19-other`);
  check(await noHScroll(pg), `${label}: log-something-else has no horizontal scroll`);
  await pg.click("[data-act=log-activity][data-ex=basketball]");
  const d = await db(pg);
  check(d.activities.some((a) => a.kind === "sport" && a.min === 60), `${label}: basketball saved on tap, 60 min`);
  await pg.click("[data-act=edit-activity]");
  await pg.click("[data-act=step][data-f=min][data-d='5']");
  await pg.click("[data-act=edit-date]:has-text('Yesterday')");
  const a = (await db(pg)).activities.find((x) => x.kind === "sport");
  check(a.min === 65 && a.date === "2026-11-25", `${label}: edit autosaves duration and date`);
  await shot(pg, `${label}-20-other-saved`);
  await pg.click("[data-act=undo-activity]");
  check(!(await db(pg)).activities.some((x) => x.kind === "sport"), `${label}: undo removes it`);
  check(errors.length === 0, `${label}: no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}

const SIZES = [["360", { width: 360, height: 740 }], ["390", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]];
for (const [n, vp] of SIZES) {
  await liftFlow(`lift-${n}`, vp);
  await timedAndResume(`timed-${n}`, vp);
  await runAndOther(`run-${n}`, vp);
}
// short phone: everything still reachable
await liftFlow("lift-360x640", { width: 360, height: 640 });

await browser.close();
server.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
