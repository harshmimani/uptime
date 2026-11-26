// Progress numbers, derived from the stored record. Pure: no DOM, no clock (today is passed in).
//
// - Rolling-week history: consecutive 7-day blocks ending today, the same windows Home uses.
// - Lift trends: the heaviest set of each session per main lift (top set), plus its reps.
// - Pull-up max: the most strict reps in one set of pull-ups per session.
// - 5K trend: only from times the user typed on the run screen (turned into a 5K-equivalent
//   with Riegel's formula) and old time trials. Nothing is tracked from runs themselves:
//   Strava does that.
// - Bodyweight: the average of each rolling 7-day block that has at least one weigh-in.

import PLAN from "./plan.js";
import * as E from "./engine.js";
import { engineLog, exerciseHistory } from "./store.js";
import { parseTimeLine, riegel } from "./workout/run.js";

/** Rolling 7-day blocks ending on `today`, newest first. */
export function weekHistory(db, today, n = 8, plan = PLAN) {
  const L = E.normalizeLog(engineLog(db), plan);
  const out = [];
  for (let j = 0; j < n; j++) {
    const end = E.addDays(today, -7 * j);
    const s = E.windowStats(L, end, plan);
    out.push({ ...s, level: E.weekLevel(s), current: j === 0 });
  }
  return out;
}

/** Current streak (engine rules) and the best run of qualifying 7-day blocks ever. */
export function streakInfo(db, today, plan = PLAN) {
  const L = E.normalizeLog(engineLog(db), plan).filter((e) => e.date <= today);
  const cur = E.streak(L, db.settings, today, plan);
  if (!L.length) return { ...cur, best: 0 };
  const anchor = db.settings.streakAnchor || L[0].date;
  const k = Math.floor(E.daysBetween(anchor, today) / 7);
  let best = 0, run = 0;
  for (let j = 0; j <= k; j++) {
    const met = E.weekLevel(E.windowStats(L, E.addDays(anchor, j * 7 + 6), plan)) !== null;
    run = met ? run + 1 : j === k ? run : 0; // the block in progress never breaks a run
    best = Math.max(best, run);
  }
  return { ...cur, best: Math.max(best, cur.weeks) };
}

/** Exercise ids of the main lifts in the rotation (not the ladder slot), in plan order. */
export function mainLifts(plan = PLAN) {
  const ids = [];
  for (const id of plan.rules.rotation) {
    for (const it of plan.sessions[id].items) if (it.role === "main" && it.ex && !ids.includes(it.ex)) ids.push(it.ex);
  }
  return ids;
}

/** One point per session: the top set by weight. [{ date, kg, reps }] oldest first. */
export function liftTrend(db, ex) {
  const pts = [];
  for (const h of exerciseHistory(db, ex)) {
    let top = null;
    for (const s of h.sets) if (s.kg > 0 && (!top || s.kg > top.kg || (s.kg === top.kg && (s.reps ?? 0) > (top.reps ?? 0)))) top = s;
    if (top) pts.push({ date: h.date, kg: top.kg, reps: top.reps ?? null, legacy: !!h.legacy });
  }
  return pts;
}

const PULL_UP_IDS = ["pull-up", "weighted-pull-up"];

/** Most reps in one set of strict pull-ups, per session date. [{ date, reps }] */
export function pullUpTrend(db) {
  const byDate = new Map();
  for (const ex of PULL_UP_IDS) {
    for (const h of exerciseHistory(db, ex)) {
      const best = Math.max(0, ...h.sets.map((s) => s.reps ?? 0));
      if (best > 0) byDate.set(h.date, Math.max(byDate.get(h.date) || 0, best));
    }
  }
  return [...byDate].map(([date, reps]) => ({ date, reps })).sort((a, b) => a.date.localeCompare(b.date));
}

/** 5K-equivalent seconds from typed time lines and old time trials. [{ date, sec, from }] */
export function fiveKTrend(db, plan = PLAN) {
  const byDate = new Map();
  const add = (date, sec, from) => {
    if (!date || !(sec > 0)) return;
    const prev = byDate.get(date);
    if (!prev || sec < prev.sec) byDate.set(date, { date, sec: Math.round(sec), from });
  };
  for (const x of db.legacy?.fiveK || []) add(x.date, x.sec, "5K time trial");
  for (const a of db.activities) {
    if (a.kind === "run" && a.run === "time-trial" && a.sec > 0 && !a.partial) add(a.date, a.sec, "5K time trial");
    const p = a.kind === "run" && a.time ? parseTimeLine(a.time) : null;
    if (p) add(a.date, riegel(p.sec, p.km, 5, plan), a.time);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Weekly bodyweight averages over rolling 7-day blocks ending today, oldest first.
 * Only blocks with a weigh-in appear. [{ start, end, kg, count }]
 */
export function weeklyWeight(db, today, n = 12) {
  const w = db.body?.weight || [];
  const out = [];
  for (let j = n - 1; j >= 0; j--) {
    const end = E.addDays(today, -7 * j);
    const start = E.addDays(end, -6);
    const xs = w.filter((x) => x.date >= start && x.date <= end && x.kg > 0);
    if (xs.length) out.push({ start, end, kg: Math.round((xs.reduce((a, x) => a + x.kg, 0) / xs.length) * 10) / 10, count: xs.length });
  }
  return out;
}

/** Latest logged bodyweight (kg) or null. */
export function latestWeight(db) {
  const w = db.body?.weight || [];
  let best = null;
  for (const x of w) if (x.kg > 0 && (!best || x.date > best.date || (x.date === best.date && (x.t || 0) >= (best.t || 0)))) best = x;
  return best;
}

/** Daily protein target range in grams for a bodyweight in kg. */
export function proteinTarget(kg, plan = PLAN) {
  const [lo, hi] = plan.food.protein.perKg;
  const round5 = (v) => Math.round(v / 5) * 5;
  return [round5(kg * lo), round5(kg * hi)];
}
