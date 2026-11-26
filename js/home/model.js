// Home: what the page shows, as plain data. No DOM, no storage, no clock:
// everything comes in as arguments so tests/home.test.js can check every state.
//
// Home content (CLAUDE.md, "Home page & first impression"), in priority order:
//   1. Next up + Start, on the Rotation Dial (the rotation as an arc, today's session lit)
//   2. Rolling-week progress and streak
//   3. One standout stat (never a run stat: Strava has those)
//   + only when relevant: the Busy mode banner or suggestion, a quiet run/sport line,
//     "Log something else".

import PLAN from "../plan.js";
import * as E from "../engine.js";
import { engineLog } from "../store.js";
import * as M from "../workout/model.js";
import * as R from "../workout/run.js";

/** Why a lift is flagged today, in a few words (engine caution codes). */
const REASON = {
  "third-hard-day": "two hard days in a row",
  "lower-after-hard-cardio": "your legs worked hard yesterday",
  "full-body-back-to-back": "full body yesterday",
  "busy-week-cap": "three sessions already this week",
  "lower-before-race": "race tomorrow",
  "race-day": "it's race day",
  "long-run-after-lower": "Lower yesterday",
  "day-after-sport": "sport yesterday",
};

const RACE = { "5k": "5K", "10k": "10K", "21k": "half marathon" };

/** Filled slots of the 6 a Full week holds: 4 lifts, 1 run, 1 sport/conditioning. */
export function weekFilled(pr) {
  return Math.min(4, pr.lifts) + Math.min(1, pr.run) + Math.min(1, pr.cond + Math.max(0, pr.run - 1));
}

/** One line on what the next week level needs. */
export function weekLine(pr) {
  if (!pr.nextLevel) return "Full week. Everything else is a bonus.";
  const m = pr.missing[pr.nextLevel];
  const bits = [];
  const WORD = ["", "One", "Two", "Three", "Four"];
  if (m.lifts) bits.push(m.lifts === 1 ? "one more lift" : `${(WORD[m.lifts] || m.lifts).toLowerCase()} more lifts`);
  if (m.run) bits.push("a run");
  if (m.cond) bits.push("sport or conditioning");
  const text = `${bits.join(" + ")} for ${pr.nextLevel === "Minimum" ? "a Minimum" : `a ${pr.nextLevel}`} week.`;
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * The standout stat. Pull-up max (the goal is 10) once there's a strict rep;
 * otherwise kg lifted in the last 30 days, compared with the 30 before.
 * Returns { kind, label, value, unit, note, goal? } or { kind: "empty", note }.
 */
export function standoutStat(db, today) {
  let pullMax = 0;
  for (const s of db.sessions) for (const it of s.items || []) {
    if (it.ex !== "pull-up") continue;
    for (const set of it.sets || []) if (!set.kg && Number(set.reps) > pullMax) pullMax = Number(set.reps);
  }
  if (pullMax > 0) {
    const goal = 10;
    return {
      kind: "pullups", label: "Strict pull-ups in one set", value: pullMax, unit: "", goal,
      note: pullMax >= goal ? "Ten. Goal reached; now keep it." : `${goal - pullMax} to go to ${goal}.`,
    };
  }
  const from = E.addDays(today, -29), prevFrom = E.addDays(today, -59);
  let cur = 0, prev = 0;
  const add = (date, set) => {
    const v = (Number(set.kg) || 0) * (Number(set.reps) || 0);
    if (!v || date > today) return;
    if (date >= from) cur += v;
    else if (date >= prevFrom) prev += v;
  };
  for (const s of db.sessions) for (const it of s.items || []) for (const set of it.sets || []) add(s.date, set);
  for (const [k, sets] of Object.entries(db.legacy?.sets || {})) for (const set of sets) add(k.split("|")[0], set);
  if (!cur) return { kind: "empty", note: "Shows up after your first session: kg lifted, then pull-ups." };
  const change = prev ? Math.round(((cur - prev) / prev) * 100) : null;
  return {
    kind: "volume", label: "Lifted in the last 30 days", value: Math.round(cur), unit: "kg",
    note: change == null ? "Your first month of numbers." : change > 0 ? `Up ${change}% on the 30 days before.` : change === 0 ? "Level with the 30 days before." : "Steady counts. Lighter weeks happen.",
    up: change > 0,
  };
}

/**
 * Busy mode suggestion (CLAUDE.md, Modes): the rolling week ended below Minimum in two
 * 7-day blocks in a row. Never while Busy mode is on; after "Not now", not again until
 * the next block. Blocks are the streak's 7-day blocks, so they never flicker.
 */
export function busyNudge(log, settings, today, plan = PLAN) {
  if (E.isBusy(settings, today)) return null;
  const L = log.filter((e) => e.date <= today);
  if (!L.length) return null;
  const first = L.reduce((a, e) => (e.date < a ? e.date : a), L[0].date);
  const anchor = settings.streakAnchor || first;
  const k = Math.floor(E.daysBetween(anchor, today) / 7);
  if (k < 2) return null;
  const end = (j) => E.addDays(anchor, j * 7 + 6);
  const below = (j) => E.weekLevel(E.windowStats(L, end(j), plan)) === null;
  if (!below(k - 1) || !below(k - 2)) return null;
  const block = E.addDays(anchor, k * 7);
  if (settings.busyNudgeDismissed === block) return null;
  return { block };
}

/** The rotation as dial nodes: done (this cycle), current, upcoming. */
export function rotationNodes(next, busy, liftedTodayId, plan = PLAN) {
  const rot = busy ? plan.busy.rotation : plan.rules.rotation;
  const k = Math.max(0, rot.indexOf(next));
  return rot.map((id, i) => {
    const def = E.sessionDef(id, plan);
    const short = id.startsWith("FB") ? `FB${id.slice(2)}` : `${def.name[0]}${def.name.slice(-1)}`;
    return { id, name: def.name, short, state: i < k || id === liftedTodayId ? "done" : i === k ? "current" : "upcoming", today: id === liftedTodayId };
  });
}

/** Everything Home renders. `db` is the store record (js/store.js), `today` a local ISO date. */
export function homeModel(db, today, plan = PLAN) {
  const log = engineLog(db);
  const settings = db.settings || {};
  const p = E.planToday(log, settings, today, {}, plan);
  const busy = p.mode === "busy";
  const def = E.sessionDef(p.next, plan);
  const firstEver = !db.sessions.length && !db.activities.length && !db.legacy;
  const todays = log.filter((e) => e.date === today);
  const liftedToday = todays.filter((e) => e.session).at(-1)?.session || null;

  // ---- the lift on offer today, if any (primary or an allowed double)
  const lift = p.primary.type === "lift" ? p.primary : p.options.find((o) => o.type === "lift") || null;
  const adjust = lift?.adjust || { loadFactor: p.returnAdjustment.loadFactor, setsDelta: p.returnAdjustment.setsDelta, setsFactor: p.deload.active ? p.deload.setsFactor : 1 };
  const items = M.buildItems(p.next, { settings, adjust }, plan);
  const minutes = M.estimateMin(items, plan);

  // ---- the card's label and one short note
  let label = "Next up";
  if (firstEver) label = "Your first session";
  else if (liftedToday) label = "Next up · tomorrow or later";
  else if (lift?.double) label = "Next up · fits as a double today";

  const notes = [];
  const ret = p.returnAdjustment;
  if (firstEver) notes.push("The weights are starting suggestions. The app learns from this one.");
  else if (liftedToday) notes.push(`${E.sessionDef(liftedToday, plan).name} done today. Nice work.`);
  else if (ret.tier === "short") notes.push(`Welcome back. ${ret.daysOff} days off, so today starts at about 90% of last time.`);
  else if (ret.tier === "long") notes.push("Welcome back. First week: about 80% and one set fewer per exercise.");
  else if (p.deload.active) notes.push("Deload week: same exercises, about half the sets.");
  if (!liftedToday && lift && p.primary !== lift) {
    const why = REASON[lift.cautions[0]];
    const instead = p.primary.type === "rest" ? "Rest fits better today" : p.primary.type === "run" ? `A run fits better today` : p.primary.type === "conditioning" ? "Something easy fits better today" : null;
    if (instead) notes.push(`${instead}${why ? `: ${why}` : ""}. ${def.name} is here if you feel fresh.`);
  } else if (!liftedToday && lift?.short) {
    notes.push("A Short version suits today. You pick on the next screen.");
  }

  // ---- the quiet run/sport line under Next up (floats: done any day they fit)
  const runOpt = [p.primary, ...p.options].find((o) => o.type === "run");
  const condOpt = [p.primary, ...p.options].find((o) => o.type === "conditioning");
  let float = null;
  if (runOpt) {
    const t = R.runTarget(runOpt, R.fiveKSec(db.activities, settings, plan), plan);
    const first = p.primary === runOpt ? "Good day for" : liftedToday || lift?.double ? "Still fits today" : "Also fits today";
    float = { act: "run", href: "workout.html?start=run", lead: first, name: t.name, detail: t.target };
    if (p.race.kind === "race") float.lead = `Race day · ${RACE[p.race.distance] || "race"}`;
  } else if (condOpt) {
    const c = plan.conditioning.options.find((o) => o.ex === condOpt.ex) || plan.conditioning.options[0];
    float = { act: "other", href: "workout.html?start=other", lead: p.primary === condOpt ? "Good day for" : "Also fits today", name: M.exName(c.ex, plan), detail: `${c.minutes[0]} min, or a game if there is one` };
  }

  const pr = p.progress;
  const st = p.streak;
  return {
    today,
    busy,
    next: p.next,
    name: def.name,
    focus: def.focus || "Full body",
    minutes,
    exercises: items.length,
    canStart: !!lift,
    label,
    note: notes[0] || "",
    nodes: rotationNodes(p.next, busy, liftedToday, plan),
    float,
    week: {
      filled: weekFilled(pr),
      level: pr.level,
      line: weekLine(pr),
      empty: !log.some((e) => e.date <= today && e.date >= pr.start),
    },
    streak: { weeks: st.weeks, currentMet: st.currentMet },
    stat: standoutStat(db, today),
    nudge: busyNudge(log, settings, today, plan),
    firstEver,
  };
}
