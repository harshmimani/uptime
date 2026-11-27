// History: past sessions, the last-7-days summary and this week's six slots, as plain data.
// No DOM, no storage, no clock: tests/history.test.js checks every case.
// Used by Home (This week, recent sessions) and Progress (Past sessions, Last 7 days).

import PLAN from "./plan.js";
import * as E from "./engine.js";
import { guideFor } from "./muscles.js";

const exName = (ex, plan) => plan.exercises[ex]?.name || ex;
const CONDITIONING = new Set(["sport", "conditioning"]);

/** What an activity was, in words: "Intervals", "Basketball", "Easy run". */
export function activityName(a, settings = {}, plan = PLAN) {
  if (a.kind === "run" && a.run && plan.run.names[a.run]) return a.run === "easy" ? "Easy run" : plan.run.names[a.run];
  if (a.kind === "run" && a.run === "easy") return "Easy run";
  if (a.ex === "basketball" && settings.sportName) return settings.sportName;
  if (a.ex) return exName(a.ex, plan);
  return a.kind === "run" ? "Run" : "Conditioning";
}

/**
 * Every past session and activity, newest first.
 * [{ id, type: "lift" | "run" | "sport" | "conditioning", date, t, name, sets, exercises, minutes, partial, ref }]
 * `ref` is the stored record (read only).
 */
export function pastSessions(db, { limit = Infinity, settings = db.settings || {} } = {}, plan = PLAN) {
  const out = [];
  for (const s of db.sessions) {
    const sets = (s.items || []).reduce((n, it) => n + (it.sets?.length || 0), 0);
    const exercises = new Set((s.items || []).filter((it) => it.sets?.length).map((it) => it.ex)).size;
    const minutes = s.end && s.t ? Math.max(1, Math.round((s.end - s.t) / 60000)) : null;
    out.push({ id: s.id, type: "lift", date: s.date, t: s.t || 0, name: s.name || E.sessionDef(s.session, plan)?.name || "Session",
      session: s.session, sets, exercises, minutes, partial: !!s.partial, short: !!s.short, ref: s });
  }
  for (const a of db.activities) {
    out.push({ id: a.id, type: a.kind, date: a.date, t: a.t || 0, name: activityName(a, settings, plan),
      sets: 0, exercises: 0, minutes: a.min || null, km: a.km || null, time: a.time || null, ref: a });
  }
  out.sort((a, b) => (a.date === b.date ? b.t - a.t : a.date < b.date ? 1 : -1));
  return out.slice(0, limit);
}

/**
 * One lift session's detail: each exercise with its sets, for the Past sessions sheet.
 * [{ ex, name, sets: [{ kg, reps, sec }] }] (same exercise logged twice in one session is merged).
 */
export function sessionDetail(s, plan = PLAN) {
  const rows = [];
  for (const it of s.items || []) {
    if (!it.sets?.length) continue;
    const row = rows.find((r) => r.ex === it.ex);
    if (row) row.sets.push(...it.sets);
    else rows.push({ ex: it.ex, name: exName(it.ex, plan), sets: [...it.sets] });
  }
  return rows;
}

/**
 * The last 7 days (today and the 6 before): sessions done, exercises completed, total sets,
 * and which muscles the work landed on.
 * muscles: { main: [keys worked as a main mover], also: [keys only worked as a helper], sets: { key: sets } }
 */
export function lastWeekSummary(db, today, plan = PLAN) {
  const start = E.addDays(today, -6);
  const inWin = (d) => d >= start && d <= today;
  const lifts = db.sessions.filter((s) => inWin(s.date));
  const acts = db.activities.filter((a) => inWin(a.date));
  const exercises = new Set();
  let sets = 0;
  const mainSets = {}, alsoSets = {};
  for (const s of lifts) {
    for (const it of s.items || []) {
      const n = it.sets?.length || 0;
      if (!n) continue;
      exercises.add(it.ex);
      sets += n;
      const g = guideFor(it.ex, plan);
      for (const k of g.m) mainSets[k] = (mainSets[k] || 0) + n;
      for (const k of g.s) alsoSets[k] = (alsoSets[k] || 0) + n;
    }
  }
  const main = Object.keys(mainSets).sort((a, b) => mainSets[b] - mainSets[a]);
  const also = Object.keys(alsoSets).filter((k) => !mainSets[k]).sort((a, b) => alsoSets[b] - alsoSets[a]);
  return {
    start, end: today,
    sessions: lifts.length + acts.length,
    lifts: lifts.length,
    runs: acts.filter((a) => a.kind === "run").length,
    other: acts.filter((a) => CONDITIONING.has(a.kind)).length,
    exercises: exercises.size,
    sets,
    muscles: { main, also, sets: mainSets },
  };
}

/** "Today", "Yesterday" or a short weekday ("Tue"). */
export function dayLabel(date, today) {
  if (date === today) return "Today";
  if (date === E.addDays(today, -1)) return "Yesterday";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
}

/**
 * This week's slots over the rolling 7 days: the lifts of the cycle (the four lifts, Busy
 * mode's full-body sessions, or a 21K build's three), the Run slot (the quality run; a game
 * counts) and the long-run slot (the long run, or any easy cardio). A 21K build adds an
 * easy-run slot. Partial sessions count.
 * [{ id, kind: "lift" | "run" | "long" | "easy", name, short, state: "done" | "next" | "later", date?, day?, what? }]
 */
export function weekSlots(db, today, { next, busy = false, runName = "Run", cycle = null, threeLifts = false } = {}, plan = PLAN) {
  const start = E.addDays(today, -6);
  const inWin = (d) => d >= start && d <= today;
  const latest = (list) => list.reduce((a, x) => (!a || x.date > a.date || (x.date === a.date && (x.t || 0) > (a.t || 0)) ? x : a), null);
  const rot = cycle || (busy ? plan.busy.rotation : plan.rules.rotation);
  const slots = rot.map((id) => {
    const def = E.sessionDef(id, plan);
    const done = latest(db.sessions.filter((s) => s.session === id && inWin(s.date)));
    const short = id.startsWith("FB") ? `FB${id.slice(2)}` : `${def.name[0]}${def.name.slice(-1)}`;
    return { id, kind: "lift", name: def.name, short, focus: def.focus || "Full body",
      state: done ? "done" : id === next ? "next" : "later", date: done?.date, day: done ? dayLabel(done.date, today) : null };
  });
  const acts = db.activities.filter((a) => inWin(a.date)).sort((a, b) => (a.date === b.date ? (a.t || 0) - (b.t || 0) : a.date < b.date ? -1 : 1));
  const slotOf = (a) => E.classify(a, plan);
  const runs = acts.filter((a) => slotOf(a).slot === "run");
  const longs = acts.filter((a) => slotOf(a).slot === "cond" && (!threeLifts || slotOf(a).long));
  const easies = acts.filter((a) => slotOf(a).slot === "cond" && !slotOf(a).long);
  const mk = (id, kind, name, short, focus, a) => ({ id, kind, name, short, focus, state: a ? "done" : "later", date: a?.date,
    day: a ? dayLabel(a.date, today) : null, what: a ? activityName(a, db.settings, plan) : null });
  slots.push(mk("run", "run", "Run", "Run", runName, latest(runs)));
  if (!busy) slots.push(mk("long", "long", "Long run", "Long", threeLifts ? "Long easy run" : "Or other easy cardio", latest(longs)));
  if (!busy && threeLifts) slots.push(mk("easy", "easy", "Easy run", "Easy", "30–40 min", latest(easies)));
  return slots;
}
