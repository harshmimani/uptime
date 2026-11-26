// Progress tab: streak, rolling-week history, main-lift trends, pull-up max, 5K trend and
// weekly bodyweight. Read-mostly; the only input is today's bodyweight.
// No run stats beyond the 5K-equivalent of times the user types in: Strava has the rest.

import PLAN from "../plan.js";
import { createStore, isoDate } from "../store.js";
import * as P from "../progress-data.js";
import { lineChart, weekBars, wireCharts } from "../charts.js";
import { startServiceWorker } from "../sw-client.js";
import { tabBar, esc, showToast, say, dayMonth } from "../nav.js";
import { setUnits, units, wu, fmtW, fromUnit, toUnit } from "../units.js";
import { mmss } from "../workout/run.js";
import { exName } from "../workout/model.js";

const store = createStore();
const db = () => store.db;
const app = document.getElementById("app");
const today = () => isoDate(new Date());
setUnits(db().settings.units);

function persist() {
  const r = store.save();
  if (!r.ok) showToast(r.readOnly ? "Saved data couldn't be read, so nothing is changed. Export a backup from Plan › Settings." : "Couldn't save. Your phone may be out of space; nothing was lost.", null, null, 9000);
  return r.ok;
}

const signed = (v, unit) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}${unit ? ` ${unit}` : ""}`;

// ------------------------------------------------------------------ sections

function streakCard() {
  const s = P.streakInfo(db(), today());
  const wk = P.weekHistory(db(), today(), 1)[0];
  const parts = [`${wk.lifts} ${wk.lifts === 1 ? "lift" : "lifts"}`, `${wk.run} ${wk.run === 1 ? "run" : "runs"}`, `${wk.cond} sport or conditioning`];
  return `<section class="card" aria-labelledby="streak-h">
    <span class="label" id="streak-h">Streak</span>
    <div class="row between" style="align-items:flex-end">
      <p class="big num${s.weeks ? " green" : ""}">${s.weeks}<small> ${s.weeks === 1 ? "week" : "weeks"}</small></p>
      <p class="meta" style="text-align:right">${s.best > s.weeks ? `Best ${s.best} weeks` : s.weeks ? "Your best yet" : ""}</p>
    </div>
    <p class="meta">Last 7 days: <b style="color:var(--c-text)">${wk.level || "below Minimum so far"}</b> · ${parts.join(" · ")}.
    ${s.currentMet ? "This week already counts." : s.block ? `Reach Minimum (2 sessions) in the next ${s.block.daysLeft + 1} ${s.block.daysLeft ? "days" : "day"} to keep it going.` : ""}</p>
  </section>`;
}

function weeksSection() {
  const weeks = P.weekHistory(db(), today(), 8).reverse();
  const data = weeks.map((w) => ({
    x: w.current ? "Now" : dayMonth(w.end),
    value: w.lifts + w.run + w.cond,
    met: !!w.level,
    current: w.current,
    read: `${w.current ? "Last 7 days" : `${dayMonth(w.start)} – ${dayMonth(w.end)}`}: ${w.level || "below Minimum"} · ${w.lifts} lifts, ${w.run} run, ${w.cond} sport or conditioning`,
  }));
  return `<section class="section" aria-labelledby="weeks-h">
    <h2 id="weeks-h">Rolling weeks</h2>
    <div class="card">
      ${weekBars(data, { label: "Sessions per 7-day block, last 8 blocks" })}
      <div class="legend"><span><i class="met"></i>Reached Minimum or better</span><span><i class="not"></i>Below Minimum</span></div>
    </div>
  </section>`;
}

function liftCard(ex) {
  const pts = P.liftTrend(db(), ex);
  if (!pts.length) return "";
  const last = pts[pts.length - 1], first = pts[0];
  const diff = Math.round((toUnit(last.kg) - toUnit(first.kg)) * 10) / 10;
  const chart = pts.length > 1
    ? lineChart(pts.map((p) => ({ x: dayMonth(p.date), y: toUnit(p.kg), read: `${dayMonth(p.date)}: ${fmtW(p.kg)} ${wu()}${p.reps ? ` × ${p.reps}` : ""}` })), { label: `${exName(ex)} top set`, fmt: (v) => `${v} ${wu()}`, minSpan: units() === "lb" ? 10 : 5 })
    : `<p class="quiet">One session so far. The trend line starts after the next one.</p>`;
  return `<article class="card">
    <div class="lift-head"><h3>${esc(exName(ex))}</h3><span class="num">${fmtW(last.kg)} ${wu()}${last.reps ? ` × ${last.reps}` : ""}</span></div>
    ${pts.length > 1 ? `<p class="meta">Top set each session. <span class="${diff > 0 ? "up" : ""}">${signed(diff, wu())}</span> since ${dayMonth(first.date)}.</p>` : ""}
    ${chart}
  </article>`;
}

function liftsSection() {
  const cards = P.mainLifts().map(liftCard).filter(Boolean);
  return `<section class="section" aria-labelledby="lifts-h">
    <h2 id="lifts-h">Main lifts</h2>
    ${cards.length ? cards.join("") : `<div class="card"><p class="meta">Your first numbers show up after one session. Each main lift gets its own trend: squat, deadlift, bench and overhead press.</p></div>`}
  </section>`;
}

function otherLiftsSection() {
  const rows = P.otherLifts(db());
  if (!rows.length) return "";
  const set = (p) => `${fmtW(p.kg)} ${wu()}${p.reps ? ` × ${p.reps}` : ""}`;
  return `<section class="section" aria-labelledby="other-h">
    <h2 id="other-h">Every other lift</h2>
    <div class="card"><ul class="oldmap">${rows.map((r) => `<li>
      <div class="lift-head"><b>${esc(exName(r.ex))}</b><span class="num">${set(r.last)}</span></div>
      <span>Last ${dayMonth(r.last.date)}${r.legacy ? " (earlier app)" : ""}${r.best !== r.last && r.best.kg > r.last.kg ? ` · best ${set(r.best)}` : ""} · ${r.sessions} ${r.sessions === 1 ? "session" : "sessions"}</span></li>`).join("")}</ul>
      <p class="quiet">Top set of the last session. Your workouts start from these weights.</p></div>
  </section>`;
}

function pullUpSection() {
  const pts = P.pullUpTrend(db());
  const lvl = PLAN.ladder.find((l) => l.level === db().settings.ladderLevel) || PLAN.ladder[0];
  const goal = PLAN.baseline.goals.pullUps;
  const best = pts.length ? Math.max(...pts.map((p) => p.reps)) : 0;
  return `<section class="section" aria-labelledby="pull-h">
    <h2 id="pull-h">Pull-up max</h2>
    <div class="card">
      <div class="lift-head"><h3>Most strict reps in one set</h3><span class="num">${best}<span class="meta"> / ${goal}</span></span></div>
      ${pts.length > 1
        ? lineChart(pts.map((p) => ({ x: dayMonth(p.date), y: p.reps, read: `${dayMonth(p.date)}: ${p.reps} strict ${p.reps === 1 ? "rep" : "reps"}` })), { label: "Pull-up max", fmt: (v) => `${v} reps`, minSpan: 3 })
        : `<p class="meta">${pts.length ? "One session with strict pull-ups so far. The trend starts after the next." : `No strict pull-ups yet, and that's expected. You're on ladder level ${lvl.level}: ${esc(lvl.name)}. ${esc(lvl.pass ? `Next step: ${lvl.pass}` : "")}`}</p>`}
    </div>
  </section>`;
}

function fiveKSection() {
  const pts = P.fiveKTrend(db());
  const goal = PLAN.baseline.goals.fiveKSec;
  const best = pts.length ? Math.min(...pts.map((p) => p.sec)) : null;
  return `<section class="section" aria-labelledby="fivek-h">
    <h2 id="fivek-h">5K trend</h2>
    <div class="card">
      ${pts.length
        ? `<div class="lift-head"><h3>5K-equivalent</h3><span class="num">${mmss(pts[pts.length - 1].sec)}</span></div>
           <p class="meta">Goal ${mmss(goal)}.${best <= goal ? ` <span class="up">Done: best ${mmss(best)}.</span>` : ` ${mmss(best - goal)} to go from your best.`} Lower is better.</p>
           ${pts.length > 1 ? lineChart(pts.map((p) => ({ x: dayMonth(p.date), y: Math.round(p.sec), read: `${dayMonth(p.date)}: ${p.from === "5K time trial" ? "5K time trial" : `"${p.from}"`} → 5K about ${mmss(p.sec)}` })), { label: "5K-equivalent time", fmt: (v) => mmss(v), minSpan: 60, lowerIsBetter: true }) : ""}`
        : ""}
      <p class="quiet">Only from times you type on the run screen (like "10k 52:30"), turned into a 5K-equivalent. Strava keeps everything else.</p>
    </div>
  </section>`;
}

function weightSection() {
  const weeks = P.weeklyWeight(db(), today(), 12);
  const latest = P.latestWeight(db());
  const cur = weeks.length && weeks[weeks.length - 1].end === today() ? weeks[weeks.length - 1] : null;
  const prev = cur && weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const diff = cur && prev ? Math.round((toUnit(cur.kg) - toUnit(prev.kg)) * 10) / 10 : null;
  const loggedToday = latest?.date === today();
  return `<section class="section" aria-labelledby="bw-h">
    <h2 id="bw-h">Bodyweight</h2>
    <div class="card">
      ${cur ? `<div class="lift-head"><h3>Last 7 days, average</h3><span class="num">${fmtW(cur.kg)} ${wu()}</span></div>
        <p class="meta">${prev ? `${signed(diff, wu())} on the 7 days before.` : "The weekly average is the number to watch."} ${cur.count} ${cur.count === 1 ? "weigh-in" : "weigh-ins"} this week.</p>` : ""}
      ${weeks.length > 1 ? lineChart(weeks.map((w) => ({ x: dayMonth(w.end), y: toUnit(w.kg), read: `${dayMonth(w.start)} – ${dayMonth(w.end)}: ${fmtW(w.kg)} ${wu()} average (${w.count} ${w.count === 1 ? "weigh-in" : "weigh-ins"})` })), { label: "Weekly average bodyweight", fmt: (v) => `${v} ${wu()}`, minSpan: units() === "lb" ? 4 : 2, neutral: true }) : ""}
      <form class="row" id="bw-form" style="align-items:flex-end" novalidate>
        <label class="field grow"><span class="label">${loggedToday ? "Today (logged)" : "Today"}</span>
          <input id="bw" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="${latest ? fmtW(latest.kg) : units() === "lb" ? "160" : "72.5"}" aria-label="Bodyweight today in ${wu()}" value="${loggedToday ? fmtW(latest.kg) : ""}"></label>
        <button class="btn btn--secondary" type="submit" style="min-height:var(--hit-key)">${loggedToday ? "Update" : "Log"} ${wu()}</button>
      </form>
      <p class="quiet">Same time of day, ideally after waking. Daily weight swings 1–2 kg with water and salt; the weekly average shows the real trend.</p>
    </div>
  </section>`;
}

// ------------------------------------------------------------------ page

function render() {
  const first = !db().sessions.length && !db().activities.length && !db().legacy;
  const mig = store.migrated;
  app.innerHTML = `<main class="scr" data-screen="progress">
    <header class="scr__head"><span class="label">${esc(new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }))}</span>
      <h1 class="h1 page-title" tabindex="-1">Progress</h1></header>
    <div class="scr__body">
      ${store.readOnly ? `<div class="notice notice--warn"><div><b>Saved data couldn't be read.</b> Nothing is changed or deleted. Export a backup from Plan › Settings.</div></div>` : ""}
      ${mig ? `<div class="notice notice--done"><div><b>${mig.from === 1 ? "Found your log from the earlier app." : "Your data moved to the new format."}</b> Everything is kept, and a backup copy of the old data is saved.</div></div>` : ""}
      ${first ? `<div class="notice"><div>Your first numbers show up after one session. Until then, this is where the streak, lift trends and bodyweight will live.</div></div>` : ""}
      ${streakCard()}
      ${weeksSection()}
      ${liftsSection()}
      ${otherLiftsSection()}
      ${pullUpSection()}
      ${fiveKSection()}
      ${weightSection()}
      <p class="disclaimer">${esc(PLAN.disclaimer)}</p>
    </div>
    <div class="scr__foot scr__foot--tabs"><div class="toast-slot" id="toast-slot" aria-live="polite"></div>${tabBar("progress")}</div>
  </main>`;
}

function logWeight(ev) {
  ev.preventDefault();
  const input = document.getElementById("bw");
  const v = parseFloat(String(input.value).replace(",", "."));
  const kg = fromUnit(v);
  if (!Number.isFinite(kg) || kg < 25 || kg > 300) {
    showToast(`That doesn't look like a bodyweight in ${wu()}. Nothing saved.`);
    input.focus();
    return;
  }
  const list = db().body.weight;
  const before = list.filter((x) => x.date === today());
  db().body.weight = list.filter((x) => x.date !== today()).concat({ date: today(), kg: Math.round(kg * 100) / 100, t: Date.now() });
  if (!persist()) { db().body.weight = list; return; }
  render();
  say(`Logged ${fmtW(kg)} ${wu()}`);
  showToast(`Logged ${fmtW(kg)} ${wu()} for today.`, "Undo", () => {
    db().body.weight = db().body.weight.filter((x) => x.date !== today()).concat(before);
    persist();
    render();
    say("Removed");
  });
}

app.addEventListener("submit", (ev) => { if (ev.target.id === "bw-form") logWeight(ev); });
wireCharts(app);
render();

startServiceWorker();
