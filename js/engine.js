// Uptime rotation engine: what to train next, and how hard.
//
// Pure functions, no DOM, no storage, no clock. Every function takes the log,
// the settings and `today` (a local "YYYY-MM-DD" date) as arguments, so the
// same inputs always give the same answer and everything is testable.
// Plan content and numbers come from `plan.js`; behaviour rules follow
// CLAUDE.md ("Training model", "Session rules", "Modes").
//
// ---------------------------------------------------------------- log entries
// One entry per session the user did (the storage layer maps its own shape to
// this). Order within a day comes from `t` (ms timestamp) when present.
//
//   { date: "2026-11-26", session: "UA" }                  strength (UA LA UB LB, or busy FB1-3)
//   { date, kind: "run", run: "interval" | "tempo" | "shakeout" | "race" }   the Run slot (quality run)
//                                                         (older logs may hold "time-trial"; it still counts)
//   { date, kind: "sport", ex: "basketball" }              the Run slot too: a game replaces the quality run (hard)
//   { date, kind: "run", run: "long", km }                 the sport/conditioning slot: the long run (hard)
//   { date, kind: "run", run: "easy" }                     sport/conditioning slot
//   { date, kind: "conditioning", ex: "bike-or-incline-walk" }  sport/conditioning slot
//
//   Optional on any entry: t, checkIn ("Good" | "Okay" | "Rough"), short (true
//   when the Short version was done), deload (true when done as a deload),
//   hard (overrides the default hard/easy classification).
//
// ------------------------------------------------------------------ settings
//   {
//     modeLog: [{ date, busy: true | false }],  // Busy mode toggles, any order
//     deloads: ["YYYY-MM-DD"],                  // start date of each deload week taken
//     busyWeekdays: [0-6],                      // optional, 0 = Sunday; gentle hints only
//     streakAnchor: "YYYY-MM-DD",               // optional; defaults to the first logged session
//     race: { distance: "5k" | "10k" | "21k", date: "YYYY-MM-DD" } | null,  // optional race mode
//   }
//
// Interpretations (where CLAUDE.md leaves room):
// - "Days off" before a return = full calendar days with no strength session
//   (Lift Monday, next lift Thursday = 2 days off). Runs don't count because
//   the reductions are about lifting weights.
// - Week level "Minimum = 2 full-body sessions" counts any 2 strength sessions.
//   Because Upper and Lower alternate, two sessions in a row always cover the
//   whole body.
// - Streak weeks are 7-day blocks counted from the user's first session (never
//   Mon-Sun), so the streak only changes at a block boundary and can't flicker.
//   The current block can only add to the streak, never break it.
// - "Within one rotation" for Rough check-ins = the last 6 sessions (a full
//   cycle: 4 lifts + run + sport/conditioning), since the last deload or break.
// - The two run slots changed on 27 Nov 2026 (coach review): long runs used to fill the Run
//   slot and games the sport slot. Old logs are read with today's meaning; nothing is rewritten.
// - "Light" 7-day blocks for skipping a scheduled deload: Minimum-level lifting (2 lifts or
//   fewer), or any day of the block in Busy mode. Lifting is what a deload unloads, so a week of
//   3–4 lifts with no run isn't light. Blocks are counted back from the date the deload fell due.

import PLAN from "./plan.js";

export const ENGINE_VERSION = 2;

const DAY_MS = 86400000;
const DELOAD_DAYS = 7;
export const LEVELS = ["Minimum", "Good", "Full"];

// ---------------------------------------------------------------------- dates

export function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}
export function fromDayNumber(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  return fromDayNumber(dayNumber(iso) + n);
}
/** Whole days from a to b (b later = positive). */
export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}
export function weekday(iso) {
  return new Date(dayNumber(iso) * DAY_MS).getUTCDay();
}

// ------------------------------------------------------------- classification

export function sessionDef(id, plan = PLAN) {
  return plan.sessions[id] || plan.busy.sessions[id] || null;
}

/**
 * What a log entry counts as.
 * slot: "lift" | "run" | "cond" | null; hard: counts toward "3 hard days";
 * liftKind: "upper" | "lower" | "full" for strength; cardio: run/sport/conditioning.
 */
export function classify(entry, plan = PLAN) {
  if (!entry || typeof entry.date !== "string") return { slot: null, hard: false };
  if (entry.session) {
    const def = sessionDef(entry.session, plan);
    if (!def) return { slot: null, hard: false };
    return {
      slot: "lift",
      hard: entry.hard ?? true,
      liftKind: def.kind,
      busy: plan.busy.rotation.includes(entry.session),
    };
  }
  if (entry.kind === "run") {
    if (entry.run === "easy") return { slot: "cond", hard: entry.hard ?? false, cardio: true, easy: true };
    if (entry.run === "long") return { slot: "cond", hard: entry.hard ?? true, cardio: true, long: true };
    return { slot: "run", hard: entry.hard ?? entry.run !== "shakeout", cardio: true, long: entry.run === "race", interval: entry.run === "interval" };
  }
  // A game replaces the quality run (Run slot), never the long run.
  if (entry.kind === "sport") return { slot: "run", hard: entry.hard ?? true, cardio: true, sport: true };
  if (entry.kind === "conditioning") {
    const opt = plan.conditioning.options.find((o) => o.ex === entry.ex);
    const sport = entry.ex === "basketball";
    return { slot: sport || opt?.fills === "run" ? "run" : "cond", hard: entry.hard ?? opt?.hard ?? false, cardio: true, sport };
  }
  return { slot: null, hard: false };
}

/** Valid entries, oldest first, each with its classification attached as `c`. */
export function normalizeLog(log = [], plan = PLAN) {
  return capGames(
    log
      .map((e, i) => ({ e, i, c: classify(e, plan) }))
      .filter((x) => x.c.slot)
      .sort((a, b) => a.e.date.localeCompare(b.e.date) || (a.e.t ?? 0) - (b.e.t ?? 0) || a.i - b.i)
      .map((x) => ({ ...x.e, c: x.c })),
    plan,
  );
}

/**
 * A game stands in for the quality run at most `run.gameStandInMax` rotations in a row. A game
 * "stands in" when it fills an empty Run slot (nothing in that slot in the 6 days before it).
 * Past the limit a game is still a hard day (sport, cardio) but fills no slot (slot "extra"),
 * so the quality run stays due until one is run. Any run in the Run slot resets the count.
 */
function capGames(L, plan) {
  const max = plan.run.gameStandInMax;
  if (!max) return L;
  let inRow = 0;
  let lastFill = null;
  for (const e of L) {
    if (e.c.slot !== "run") continue;
    const fresh = !lastFill || daysBetween(lastFill, e.date) >= 7;
    if (!e.c.sport) {
      inRow = 0;
      lastFill = e.date;
    } else if (fresh) {
      if (inRow >= max) e.c = { ...e.c, slot: "extra", overGameLimit: true };
      else {
        inRow++;
        lastFill = e.date;
      }
    }
  }
  return L;
}

/** Games in a row that stood in for the quality run (since the last run in that slot). */
export function gamesInRow(log, today, plan = PLAN) {
  const L = norm(log, plan).filter((e) => e.date <= today && e.c.slot === "run");
  let n = 0;
  let lastFill = null;
  for (const e of L) {
    if (!e.c.sport) n = 0;
    else if (!lastFill || daysBetween(lastFill, e.date) >= 7) n++;
    else continue;
    lastFill = e.date;
  }
  return n;
}

function norm(log, plan) {
  return log && log.length && log[0] && log[0].c ? log : normalizeLog(log, plan);
}

function dayInfo(L, date) {
  const es = L.filter((e) => e.date === date);
  const lifts = es.filter((e) => e.c.slot === "lift");
  return {
    any: es.length > 0,
    lift: lifts.length > 0,
    liftKinds: lifts.map((e) => e.c.liftKind),
    sessions: lifts.map((e) => e.session),
    run: es.some((e) => e.c.slot === "run"),
    cardio: es.some((e) => e.c.cardio),
    hard: es.some((e) => e.c.hard),
    hardCardio: es.some((e) => e.c.cardio && e.c.hard),
    sport: es.some((e) => e.c.sport),
  };
}

// ----------------------------------------------------------------------- modes

/** Busy mode state on a date: the latest toggle on or before it. */
export function isBusy(settings = {}, date) {
  const toggles = (settings.modeLog || []).filter((m) => m.date <= date);
  if (!toggles.length) return false;
  const latest = toggles.reduce((a, b) => (b.date >= a.date ? b : a));
  return !!latest.busy;
}

/** Returns new settings with Busy mode switched on or off from `date`. */
export function setBusy(settings = {}, on, date) {
  return { ...settings, modeLog: [...(settings.modeLog || []), { date, busy: !!on }] };
}

// --------------------------------------------------------------------- rotation

/**
 * The next strength session in line. Missed days never skip a session and
 * nothing stacks: it's always exactly one session, the one after the last done.
 * Busy mode has its own rotation, so the main one resumes where it stopped.
 */
export function nextSession(log, { busy = false, threeLifts = false } = {}, plan = PLAN) {
  const L = norm(log, plan);
  const rot = busy ? plan.busy.rotation : plan.rules.rotation;
  const build = plan.run.race.buildLowers || [];
  for (let i = L.length - 1; i >= 0; i--) {
    const id = L[i].session;
    if (!busy && threeLifts) {
      // Upper A → the build Lower (squat and deadlift take turns) → Upper B → Upper A
      if (!rot.includes(id) && !build.includes(id)) continue;
      if (sessionDef(id, plan).kind === "lower") return "UB";
      if (id === "UB") return "UA";
      return buildLower(L, plan);
    }
    const k = rot.indexOf(id);
    if (k === -1) continue;
    return rot[(k + 1) % rot.length];
  }
  return !busy && threeLifts ? "UA" : rot[0];
}

/**
 * The Lower due next in a three-lift build: the build Lower whose main lift wasn't done last
 * time (squat first). Every build Lower has Nordics and heavy slow calf raises.
 */
function buildLower(L, plan) {
  const [squat, hinge] = plan.run.race.buildLowers || ["LA", "LB"];
  const last = [...L].reverse().find((e) => e.c.slot === "lift" && e.c.liftKind === "lower" && !e.c.busy);
  const squatted = last && sessionDef(last.session, plan)?.items.some((it) => it.ex === "smith-machine-back-squat");
  return squatted ? hinge : squat;
}

/**
 * Is today in a build that trades one lift for a third run (21K, last 12 weeks)? The long-run
 * build starts earlier (buildDays); this part only covers `threeLiftDays`. Never in Busy mode.
 */
export function threeLiftBuild(settings = {}, today, plan = PLAN) {
  if (isBusy(settings, today)) return false;
  const ph = racePhase(settings, today, plan);
  const R = plan.run.race;
  if (!["build", "taper", "race-week", "race"].includes(ph.kind) || !(R.threeLifts || []).includes(ph.distance)) return false;
  const days = R.threeLiftDays?.[ph.distance];
  return days == null || ph.daysToGo <= days;
}

/**
 * The lifts of the current cycle, in order: the main rotation, Busy mode's full-body
 * sessions, or in a 21K build Upper A, this cycle's Lower and Upper B.
 */
export function liftCycle(log, settings = {}, today, plan = PLAN) {
  if (isBusy(settings, today)) return [...plan.busy.rotation];
  if (!threeLiftBuild(settings, today, plan)) return [...plan.rules.rotation];
  const L = norm(log, plan).filter((e) => e.date <= today);
  const last = [...L].reverse().find((e) => e.c.slot === "lift" && !e.c.busy);
  const built = plan.run.race.buildLowers || [];
  const lower = last && built.includes(last.session) ? last.session : buildLower(L, plan);
  return ["UA", lower, "UB"];
}

// ------------------------------------------------------------------- runs

/**
 * Race mode phase on a date. settings.race = { distance, date } (optional).
 * kind: "none" | "build" (last 8–12 weeks) | "taper" | "race-week" | "race" (race day).
 */
export function racePhase(settings = {}, today, plan = PLAN) {
  const race = settings.race;
  const R = plan.run.race;
  if (!race?.date || !R.distances[race.distance] || race.date < today) return { kind: "none" };
  const days = daysBetween(today, race.date);
  const base = { distance: race.distance, date: race.date, daysToGo: days };
  if (days === 0) return { ...base, kind: "race" };
  if (days <= R.raceWeekDays) return { ...base, kind: "race-week" };
  if (days <= R.taperDays[race.distance]) return { ...base, kind: "taper" };
  if (days <= R.buildDays[race.distance]) return { ...base, kind: "build" };
  return { ...base, kind: "none" };
}

const QUALITY = ["interval", "tempo"];

/**
 * The next quality run in the Run slot: tempo and intervals take turns, in a race build
 * too (their content leans toward the race in js/workout/run.js). Race week gives easy
 * shakeouts, race day gives the race. Busy mode: one tempo run. Games and long runs never
 * move the alternation: a game stands in for the run, and the next one is still due.
 */
export function nextRunType(log, today, settings = {}, plan = PLAN) {
  if (isBusy(settings, today)) return plan.run.busy;
  const ph = racePhase(settings, today, plan);
  if (ph.kind === "race") return "race";
  if (ph.kind === "race-week") return "shakeout";
  const cyc = plan.run.cycle;
  const L = norm(log, plan).filter((e) => e.date <= today);
  // Games stood in for the last two quality runs: this one is the tempo run.
  if (plan.run.gameStandInMax && gamesInRow(L, today, plan) >= plan.run.gameStandInMax) return plan.run.gameLimitRun;
  const last = [...L].reverse().find((e) => e.kind === "run" && (QUALITY.includes(e.run) || e.run === "time-trial"));
  if (!last) return cyc[0];
  if (last.run === "time-trial") return "interval"; // an old hard 5K effort: next is the other kind
  return cyc[(cyc.indexOf(last.run) + 1) % cyc.length];
}

/**
 * Reps for the next interval session (base and 5K builds): starts at the low end and adds
 * one every `addEvery` sessions up to the top. 31–60 days (`stepBackDays`–`resetDays`) since
 * the last interval session: one rep fewer than last time, never below the start. More than
 * `resetDays`: back to the start. A session that logged its `reps` counts at that number.
 */
export function intervalReps(log, today, plan = PLAN) {
  const cfg = plan.run.interval.base;
  const [lo, hi] = cfg.reps;
  const stepBack = cfg.stepBackDays ?? cfg.resetDays;
  const done = norm(log, plan).filter((e) => e.date <= today && e.kind === "run" && e.run === "interval");
  // prescription for a session on `date`, given the state after the sessions before it
  let reps = lo, atReps = 0, prev = null;
  const due = (date) => {
    if (!prev) return { reps: lo, atReps: 0 };
    const gap = daysBetween(prev.date, date);
    if (gap > cfg.resetDays) return { reps: lo, atReps: 0 };
    if (gap > stepBack) return { reps: Math.max(lo, prev.reps - 1), atReps: 0 };
    return atReps >= cfg.addEvery ? { reps: Math.min(hi, reps + 1), atReps: 0 } : { reps, atReps };
  };
  for (const e of done) {
    const d = due(e.date);
    reps = e.reps > 0 ? Math.min(hi, Math.max(lo, e.reps)) : d.reps;
    atReps = (e.reps > 0 && e.reps !== d.reps ? 0 : d.atReps) + 1;
    prev = { date: e.date, reps };
  }
  return due(today).reps;
}

/** 5K-equivalent seconds from settings alone: the latest time line, else onboarding, else the baseline. */
function fiveKFromSettings(settings = {}, plan = PLAN) {
  const ref = settings.paceRef;
  if (ref?.sec && ref?.km) return ref.sec * (5 / ref.km) ** plan.run.paces.riegel;
  return settings.fiveKSec || plan.baseline.fiveKSec;
}

/**
 * The normal-week long run cap: as many whole km as fit in `capMin` at the faster end of
 * easy pace, kept within 10–12 km. Slower runners stop nearer 10 km.
 */
export function longCapKm(settings = {}, plan = PLAN) {
  const lr = plan.run.long;
  const easy = fiveKFromSettings(settings, plan) / 5 + plan.run.paces.easyOffset[0];
  const km = Math.floor((lr.capMin * 60) / easy);
  return Math.min(lr.capKm[1], Math.max(lr.capKm[0], km));
}

const roundDownTo = (x, step) => Math.floor(x / step + 1e-9) * step;

/**
 * Distance of the next long run, in km (the sport/conditioning slot).
 * - First one: 8 km.
 * - Within 14 days of the last: at most 10% over the longest of the last 30 days, at most
 *   1 km more, rounded down to the half km, up to the cap.
 * - 15–30 days since the last: repeat it. Nothing in 30 days: 2 km lower (never below 8).
 * - Cap: 10–12 km (about 70 min) in normal weeks; 15 km (10K) or 18 km (21K) in a race
 *   build. The taper cuts it to about 60% of the race's longest.
 * Returns { km, cap, hold } (hold: at the cap, so it stays there).
 */
export function longRunKm(log, today, settings = {}, plan = PLAN) {
  const lr = plan.run.long;
  const R = plan.run.race;
  const ph = racePhase(settings, today, plan);
  const normalCap = longCapKm(settings, plan);
  const raceCap = ["build", "taper"].includes(ph.kind) ? R.longMaxKm[ph.distance] : null;
  const cap = raceCap || normalCap;
  if (ph.kind === "taper") {
    const km = Math.round(cap * R.taperLongFactor);
    return { km, cap: km, hold: false };
  }
  const all = norm(log, plan).filter((e) => e.date <= today);
  const L = all.filter((e) => e.run === "long" && e.km > 0);
  const last = L[L.length - 1];
  // A full running break: no run of any kind for more than `lookbackDays`. Today in one: an
  // easy run first (restart). One since the last long run: the long run starts again at startKm.
  const runDates = all.filter((e) => e.kind === "run" && (!last || e.date > last.date)).map((e) => e.date);
  const marks = [...(last ? [last.date] : []), ...runDates, today];
  const brokeOff = marks.slice(1).some((d, i) => daysBetween(marks[i], d) > lr.lookbackDays);
  const everRan = all.some((e) => e.kind === "run");
  if (everRan && daysBetween(marks[marks.length - 2] ?? today, today) > lr.lookbackDays) {
    return { km: null, cap, hold: false, restart: true };
  }
  let km;
  if (!last) km = lr.startKm;
  else {
    const since = daysBetween(last.date, today);
    if (since > lr.lookbackDays && brokeOff) km = lr.startKm;
    else if (since > lr.lookbackDays) km = Math.max(lr.startKm, last.km - lr.backOffKm);
    else if (since > lr.repeatAfterDays) km = last.km;
    else {
      const longest = Math.max(...L.filter((e) => daysBetween(e.date, today) <= lr.lookbackDays).map((e) => e.km));
      km = Math.min(last.km + (raceCap ? R.longStepKm : lr.maxStepKm), roundDownTo(longest * (1 + lr.growth), lr.roundKm));
      km = Math.max(km, Math.min(last.km, cap));
    }
  }
  km = Math.min(km, cap);
  return { km, cap, hold: km >= cap };
}

/** Everything the UI needs to show the next quality run: { run, reps?, phase, distance? }. */
export function runPick(log, today, settings = {}, plan = PLAN) {
  const run = nextRunType(log, today, settings, plan);
  const ph = racePhase(settings, today, plan);
  const pick = { run, phase: ph.kind, distance: ph.distance };
  if (!isBusy(settings, today) && !["race", "race-week"].includes(ph.kind) && plan.run.gameStandInMax
    && gamesInRow(log, today, plan) >= plan.run.gameStandInMax) pick.gameLimit = true;
  if (run === "interval" && (!["build", "taper"].includes(ph.kind) || ph.distance === "5k")) pick.reps = intervalReps(log, today, plan);
  return pick;
}

/** The long run for the sport/conditioning slot: { run: "long", km, cap, hold, phase, distance }. */
export function longPick(log, today, settings = {}, plan = PLAN) {
  const ph = racePhase(settings, today, plan);
  return { run: "long", ...longRunKm(log, today, settings, plan), phase: ph.kind, distance: ph.distance };
}

/**
 * What's coming, in order: one full cycle from the next session. The lifts keep their fixed
 * order; the run and the sport/conditioning slot float, so they're placed where the spacing
 * rules like them: before an upper (or full-body) session, never right before a lower one.
 * Busy mode: its full-body sessions and one run. A 21K build: three lifts and three runs.
 * Returns [{ type: "lift", id } | { type: "run", pick } | { type: "long", pick } | { type: "easy" }].
 */
export function upcoming(log, settings = {}, today, plan = PLAN) {
  const busy = isBusy(settings, today);
  const three = threeLiftBuild(settings, today, plan);
  const next = nextSession(log, { busy, threeLifts: three }, plan);
  let rot = busy ? plan.busy.rotation : plan.rules.rotation;
  if (three) {
    // this cycle's lifts from the next one: the Lower due is whichever comes next in line
    const L = norm(log, plan).filter((e) => e.date <= today);
    const lower = (plan.run.race.buildLowers || []).includes(next) ? next : buildLower(L, plan);
    rot = ["UA", lower, "UB"];
  }
  const start = Math.max(0, rot.indexOf(next));
  const out = rot.map((_, i) => ({ type: "lift", id: rot[(start + i) % rot.length] }));
  const floats = [{ type: "run", pick: runPick(log, today, settings, plan) }];
  if (!busy) floats.push({ type: "long", pick: longPick(log, today, settings, plan) });
  if (three) floats.push({ type: "easy" });
  let from = 1;
  for (const f of floats) {
    let i = out.findIndex((x, j) => j >= from && x.type === "lift" && sessionDef(x.id, plan)?.kind !== "lower");
    if (i < 0) i = out.length;
    out.splice(i, 0, f);
    from = i + 2;
  }
  return out;
}

// --------------------------------------------------------- rolling week + levels

/** Counts over the rolling 7 days ending on `end` (inclusive). */
export function windowStats(log, end, plan = PLAN, days = 7) {
  const L = norm(log, plan);
  const start = addDays(end, -(days - 1));
  const es = L.filter((e) => e.date >= start && e.date <= end);
  const s = { start, end, lifts: 0, upper: 0, lower: 0, full: 0, run: 0, cond: 0, long: 0, extra: 0, sessions: es.length };
  for (const e of es) {
    if (e.c.slot === "lift") {
      s.lifts++;
      s[e.c.liftKind]++;
    } else if (e.c.slot === "run") s.run++;
    else if (e.c.slot === "cond") {
      s.cond++;
      if (e.c.long) s.long++;
    } else if (e.c.slot === "extra") s.extra++;
  }
  return s;
}

/**
 * What a Full week holds: 4 lifts + the Run slot + the sport/conditioning slot, or in a 21K
 * build 3 lifts + the Run slot + 2 in the other slot (the long run and an easy run).
 */
export const FULL = { lifts: 4, cond: 1 };
export const FULL_THREE_LIFTS = { lifts: 3, cond: 2 };

/** "Full" | "Good" | "Minimum" | null for a set of counts. */
export function weekLevel(s, full = FULL) {
  const cardio = s.run + s.cond + (s.extra || 0); // a game past the stand-in limit is still cardio
  if (s.lifts >= full.lifts && s.run >= 1 && s.cond >= full.cond) return "Full";
  if (s.lifts >= 3 && cardio >= 1) return "Good";
  if (s.lifts >= 2) return "Minimum";
  return null;
}

/** What's still missing for each level, given counts. */
function missingFor(s, full = FULL) {
  const cardio = s.run + s.cond + (s.extra || 0);
  return {
    Minimum: { lifts: Math.max(0, 2 - s.lifts), run: 0, cond: 0 },
    Good: { lifts: Math.max(0, 3 - s.lifts), run: 0, cond: cardio >= 1 ? 0 : 1 },
    Full: {
      lifts: Math.max(0, full.lifts - s.lifts),
      run: s.run >= 1 ? 0 : 1,
      cond: Math.max(0, full.cond - s.cond),
    },
  };
}

/** Rolling 7-day progress for the Home card. Pass settings so a 21K build counts three lifts as Full. */
export function rollingProgress(log, today, plan = PLAN, settings = {}) {
  const s = windowStats(log, today, plan);
  const full = threeLiftBuild(settings, today, plan) ? FULL_THREE_LIFTS : FULL;
  const level = weekLevel(s, full);
  const nextLevel = level === "Full" ? null : LEVELS[level ? LEVELS.indexOf(level) + 1 : 0];
  return { ...s, level, nextLevel, full, missing: missingFor(s, full) };
}

/**
 * Streak = consecutive 7-day blocks (from the first session) that reached at
 * least Minimum. The block in progress counts once it reaches Minimum and
 * never breaks the streak while it's still running.
 */
export function streak(log, settings = {}, today, plan = PLAN) {
  const L = norm(log, plan).filter((e) => e.date <= today);
  if (!L.length) return { weeks: 0, currentMet: false, block: null };
  const anchor = settings.streakAnchor || L[0].date;
  const k = Math.floor(daysBetween(anchor, today) / 7);
  const blockEnd = (j) => addDays(anchor, j * 7 + 6);
  const met = (j) => weekLevel(windowStats(L, blockEnd(j), plan)) !== null;
  let weeks = 0;
  for (let j = k - 1; j >= 0 && met(j); j--) weeks++;
  const currentMet = met(k);
  if (currentMet) weeks++;
  return {
    weeks,
    currentMet,
    block: { start: addDays(anchor, k * 7), end: blockEnd(k), daysLeft: daysBetween(today, blockEnd(k)) },
  };
}

// --------------------------------------------------------- returns after a gap

function liftDates(L) {
  return [...new Set(L.filter((e) => e.c.slot === "lift").map((e) => e.date))];
}
const daysOffBetween = (a, b) => daysBetween(a, b) - 1;

/**
 * Load adjustment for lifting on `today` after time off.
 * 7-13 days off: first session at ~90%. 14+: first week at ~80%, one fewer set.
 */
export function returnAdjustment(log, today, plan = PLAN) {
  const none = { tier: null, loadFactor: 1, setsDelta: 0, daysOff: 0 };
  const dates = liftDates(norm(log, plan)).filter((d) => d < today);
  if (!dates.length) return none;
  const [shortRule, longRule] = plan.rules.returnAfterGap;
  const daysOff = daysOffBetween(dates[dates.length - 1], today);

  if (daysOff >= longRule.minDays) {
    return { tier: "long", loadFactor: longRule.loadFactor, setsDelta: longRule.setsDelta, daysOff, since: today, until: addDays(today, 6) };
  }
  if (daysOff >= shortRule.minDays) {
    return { tier: "short", loadFactor: shortRule.loadFactor, setsDelta: shortRule.setsDelta, daysOff };
  }
  // Still inside the first week back after a long break?
  for (let i = dates.length - 1; i > 0; i--) {
    if (daysBetween(dates[i], today) > 6) break;
    const off = daysOffBetween(dates[i - 1], dates[i]);
    if (off >= longRule.minDays) {
      return { tier: "long", loadFactor: longRule.loadFactor, setsDelta: longRule.setsDelta, daysOff: off, since: dates[i], until: addDays(dates[i], 6) };
    }
  }
  return { ...none, daysOff };
}

/** Date of the first lift after the latest break of 7+ days off, if any. */
function lastReturnDate(dates, plan) {
  const min = plan.rules.returnAfterGap[0].minDays;
  for (let i = dates.length - 1; i > 0; i--) {
    if (daysOffBetween(dates[i - 1], dates[i]) >= min) return dates[i];
  }
  return null;
}

// ---------------------------------------------------------------------- deload

/** Light 7-day blocks in the 42 days before `due`: 2 lifts or fewer, or any day in Busy mode. */
function lightBlocks(L, settings, due, plan) {
  let n = 0;
  for (let j = 1; j <= 6; j++) {
    const end = addDays(due, -1 - (j - 1) * 7);
    const s = windowStats(L, end, plan);
    const busy = [...Array(7).keys()].some((k) => isBusy(settings, addDays(end, -k)));
    if (busy || s.lifts < 3) n++;
  }
  return n;
}

/**
 * Deload state on `today`.
 * Active for 7 days from a deload start in settings.deloads. Suggested after
 * 3+ Rough check-ins within one rotation, or 6 weeks (overdue at 8) since the
 * last deload or break of 7+ days. A scheduled deload is skipped when 2+ of the
 * 6 weeks before it were light; its clock then restarts from the day it fell due.
 * `checkpoint`: the 6-week tests (pull-up max, single-leg heel raises) are due this week,
 * whether the deload is taken, suggested or skipped. `pendingCheckIn` is today's
 * check-in before the session is logged.
 */
export function deloadStatus(log, settings = {}, today, { pendingCheckIn } = {}, plan = PLAN) {
  const cfg = plan.rules.deload;
  const L = norm(log, plan).filter((e) => e.date <= today);
  const starts = (settings.deloads || []).filter((d) => d <= today).sort();
  const last = starts[starts.length - 1];
  if (last && daysBetween(last, today) < DELOAD_DAYS) {
    return { active: true, suggested: false, reasons: [], setsFactor: cfg.setsFactor, since: last, endsOn: addDays(last, DELOAD_DAYS - 1), checkpoint: true };
  }
  const base = { active: false, suggested: false, reasons: [], setsFactor: 1, roughCount: 0, daysSince: 0, checkpoint: false };
  if (!L.length && pendingCheckIn !== "Rough") return base;

  const candidates = [L[0]?.date, last && addDays(last, DELOAD_DAYS), lastReturnDate(liftDates(L), plan)].filter(Boolean);
  const since = candidates.sort().pop() || today; // the last real deload, break or first session
  let clockStart = since;
  let skipped = null;
  while (daysBetween(clockStart, today) >= cfg.everyDays[0]) {
    const due = addDays(clockStart, cfg.everyDays[0]);
    if (lightBlocks(L, settings, due, plan) < cfg.skipIfLightBlocks) break;
    skipped = due;
    clockStart = due;
  }
  const daysSince = daysBetween(clockStart, today);

  const cycle = plan.rules.rotation.length + plan.run.perRotation + 1;
  // a skipped deload isn't a rest, so Rough check-ins count from the last real one
  const recent = L.filter((e) => e.date >= since).slice(-(pendingCheckIn ? cycle - 1 : cycle));
  const roughCount = recent.filter((e) => e.checkIn === "Rough").length + (pendingCheckIn === "Rough" ? 1 : 0);

  const reasons = [];
  if (roughCount >= cfg.roughCheckInsPerRotation) reasons.push("rough");
  if (daysSince >= cfg.everyDays[0]) reasons.push(daysSince >= cfg.everyDays[1] ? "overdue" : "time");
  const checkpoint = reasons.some((r) => r !== "rough") || (skipped != null && daysBetween(skipped, today) < DELOAD_DAYS);
  return { ...base, suggested: reasons.length > 0, reasons, setsFactor: reasons.length ? cfg.setsFactor : 1, roughCount, daysSince, checkpoint, skipped };
}

// ------------------------------------------------------- progression + stalls

const LOWER_MAIN = new Set(
  Object.values(PLAN.sessions)
    .filter((s) => s.kind === "lower")
    .flatMap((s) => s.items.filter((i) => i.role === "main" && i.ex).map((i) => i.ex)),
);

function sessionScore(sets = []) {
  const topKg = Math.max(0, ...sets.map((s) => s.kg ?? 0));
  const work = sets.reduce((n, s) => n + (s.reps ?? s.sec ?? 0), 0);
  return { topKg, work };
}

/** More weight, or the same weight with more total reps (or seconds). */
export function progressed(prev, cur) {
  const a = sessionScore(prev.sets);
  const b = sessionScore(cur.sets);
  return b.topKg > a.topKg || (b.topKg === a.topKg && b.work > a.work);
}

// Sessions that are meant to be lighter don't count for or against a stall.
const comparable = (h) => !h.deload && !h.short && !h.reduced && h.sets && h.sets.length;

/**
 * Stalled = the last `n` comparable sessions of one exercise each failed to
 * beat the one before. history: [{ date, sets: [{ kg, reps | sec }], deload?, short?, reduced? }]
 */
export function detectStall(history = [], n = PLAN.rules.stallSessions) {
  const h = history.filter(comparable).sort((a, b) => a.date.localeCompare(b.date));
  if (h.length < n + 1) return { stalled: false, sessions: 0 };
  let flat = 0;
  for (let i = h.length - 1; i > 0 && !progressed(h[i - 1], h[i]); i--) flat++;
  return { stalled: flat >= n, sessions: flat };
}

export function roundDown(kg, step = 1.25) {
  return Math.floor(kg / step + 1e-9) * step;
}

/**
 * Today's rep range for an item. Items marked byLoad follow the dumbbell weight
 * (plan.rules.dumbbellBands, per hand); everything else uses its own range.
 */
export function repRange(item, kg, plan = PLAN) {
  if (!item?.reps) return null;
  if (!item.byLoad || !(kg > 0)) return item.reps;
  const band = plan.rules.dumbbellBands.find((b) => b.upToKg == null || kg <= b.upToKg + 1e-9);
  return band ? band.reps : item.reps;
}

function increment(item, kg, plan) {
  if (LOWER_MAIN.has(item.ex)) return plan.rules.increments.lowerMain;
  if (/dumbbell/.test(item.ex || "")) return 2.5; // "next dumbbell up"; UI snaps to the rack
  const [small, big] = plan.rules.increments.upperMain;
  return kg >= 20 ? big : small;
}

/**
 * Double progression for one exercise item from a session in plan.js.
 * action: "start" | "increase" | "hold" | "reset".
 */
export function progression(history = [], item, plan = PLAN) {
  const h = history.filter(comparable).sort((a, b) => a.date.localeCompare(b.date));
  if (!h.length) return { action: "start", kg: item.start?.kg ?? null };
  const last = h[h.length - 1];
  const { topKg } = sessionScore(last.sets);
  const stall = detectStall(h, plan.rules.stallSessions);
  const atTop = (sess) => {
    const kg = sessionScore(sess.sets).topKg;
    const top = item.reps ? repRange(item, kg, plan)[1] : item.sec ? item.sec[1] : null;
    return top != null && sess.sets.length >= (item.sets || 1) && sess.sets.every((s) => (s.reps ?? s.sec ?? 0) >= top);
  };
  if (atTop(last)) {
    // slowFirst: the first session at the top earns 3-s lowers at the same weight; the next one, a heavier dumbbell
    const prev = h[h.length - 2];
    if (item.slowFirst && topKg && !(prev && sessionScore(prev.sets).topKg === topKg && atTop(prev))) {
      return { action: "hold", kg: topKg, slow: true, advice: "Top of the range: same weight today with 3-second lowers. Next time, the next dumbbell up." };
    }
    const kg = topKg ? topKg + increment(item, topKg, plan) : topKg;
    return { action: "increase", kg, reps: item.reps ? repRange(item, kg, plan) : undefined };
  }
  if (stall.stalled) return { action: "reset", kg: topKg ? roundDown(topKg * 0.9) : topKg, advice: plan.rules.stallAdvice };
  return { action: "hold", kg: topKg };
}

// ------------------------------------------------------- session prescription

/**
 * A session's items with today's adjustments applied.
 * adj: { short, setsFactor (deload), setsDelta, loadFactor (return after gap) }
 * Weighted items carry `loadFactor` for the UI to apply to the last weight.
 */
/**
 * The Short version's items: the first `plan.short.items` stations, where a superset pair
 * counts as one station (so Lower A keeps calf raises + Copenhagen, Lower B Nordics + calves).
 */
export function shortItems(items, plan = PLAN) {
  const stations = [];
  return items.filter((it, i) => {
    const key = it.pair ? `pair:${it.pair}` : `item:${i}`;
    if (stations.includes(key)) return true;
    if (stations.length >= plan.short.items) return false;
    stations.push(key);
    return true;
  });
}

export function prescribe(sessionId, adj = {}, plan = PLAN) {
  const def = sessionDef(sessionId, plan);
  if (!def) return null;
  let items = def.items;
  if (adj.short) items = shortItems(items, plan);
  const setsFactor = adj.setsFactor ?? 1;
  const setsDelta = adj.setsDelta ?? 0;
  const loadFactor = adj.loadFactor ?? 1;
  return {
    id: sessionId,
    name: def.name,
    kind: def.kind,
    short: !!adj.short,
    items: items.map((it) => ({ ...it, sets: adjustSets(it.sets ?? 3, { ...adj, setsFactor, setsDelta }, plan), loadFactor })),
  };
}

/** Today's set count for one item: Short caps it, a deload scales it, a return removes one. Never below 1. */
export function adjustSets(sets, adj = {}, plan = PLAN) {
  let n = sets;
  if (adj.short) n = Math.min(n, plan.short.sets);
  return Math.max(1, Math.ceil(n * (adj.setsFactor ?? 1)) + (adj.setsDelta ?? 0));
}

/** Rough check-in → suggest the Short version. Never blocks anything. */
export function checkInAdvice(checkIn) {
  return checkIn === "Rough" ? { suggestShort: true } : { suggestShort: false };
}

// ------------------------------------------------------------------- today

/** May these two be done on the same day? Only run/sport + Upper. */
export function doubleAllowed(a, b) {
  const kinds = [a, b].map((x) => (x.type === "lift" ? `lift:${x.kind}` : "cardio"));
  return kinds.includes("cardio") && kinds.includes("lift:upper");
}

/**
 * What to do today. Returns the next session in line plus a primary
 * suggestion and alternatives. Spacing rules are suggestions with notes,
 * never blocks: everything sensible stays in `options`.
 *
 * primary/options items:
 *   { type: "lift", session, kind, double?, short?, adjust, cautions: [] }
 *   { type: "run", run, reps?, double?, cautions: [] }                   the quality run
 *   { type: "conditioning", ex: "long-run", run: "long", km, cap, hold, double?, cautions: [] }
 *   { type: "conditioning", ex, double?, cautions: [] }                  an easy run or other cardio
 *   { type: "rest" } | { type: "done" }
 */
export function planToday(log, settings = {}, today, { checkIn } = {}, plan = PLAN) {
  const L = norm(log, plan).filter((e) => e.date <= today);
  const busy = isBusy(settings, today);
  const three = threeLiftBuild(settings, today, plan);
  const next = nextSession(L, { busy, threeLifts: three }, plan);
  const nextDef = sessionDef(next, plan);
  const t = dayInfo(L, today);
  const y = dayInfo(L, addDays(today, -1));
  const y2 = dayInfo(L, addDays(today, -2));
  const win = windowStats(L, today, plan);

  const ret = returnAdjustment(L, today, plan);
  const deload = deloadStatus(L, settings, today, { pendingCheckIn: checkIn }, plan);
  const busyDay = (settings.busyWeekdays || []).includes(weekday(today));
  const race = racePhase(settings, today, plan);
  const raceTomorrow = racePhase(settings, addDays(today, 1), plan).kind === "race";
  // Nordics and deadlifts (Lower B, a half build's Lower) leave the hamstrings sore for 24–48 h.
  const afterLowerB = y.sessions.some((id) => sessionDef(id, plan)?.soreHamstrings);
  // A game played past the stand-in limit since the last hamstring-heavy Lower: that Lower is Short.
  const lastSore = [...L].reverse().find((e) => e.c.slot === "lift" && sessionDef(e.session, plan)?.soreHamstrings);
  const extraGame = !!nextDef.soreHamstrings && L.some((e) => e.c.overGameLimit && (!lastSore || e.date >= lastSore.date));

  // ---- what's due in the rolling week
  // Run slot: the quality run (a game fills it too). Sport/conditioning slot: the long run,
  // or any easy cardio. Busy mode asks for 1 run of any kind. A 21K build adds an easy run.
  const runDue = race.kind === "race" ? !t.run : busy ? win.run + win.cond === 0 : win.run === 0;
  const longDue = !busy && race.kind !== "race" && (three ? win.long === 0 : win.cond === 0);
  const easyDue = three && race.kind !== "race" && win.cond - win.long === 0;

  // ---- same-day rules
  const liftAllowed = !t.lift && (!t.cardio || nextDef.kind === "upper");
  const cardioAllowed = !t.cardio && (!t.lift || t.liftKinds.every((k) => k === "upper"));

  const threeHard = y.hard && y2.hard && !t.any;
  const legsTired = ["lower", "full"].includes(nextDef.kind) && y.hardCardio;
  const lowerNext = !t.lift && ["lower", "full"].includes(nextDef.kind) && !busy;

  const options = [];
  let lift = null;
  if (liftAllowed) {
    const cautions = [];
    if (threeHard) cautions.push("third-hard-day");
    if (legsTired) cautions.push("lower-after-hard-cardio");
    if (busy && y.liftKinds.includes("full")) cautions.push("full-body-back-to-back");
    if (busy && win.lifts >= 3) cautions.push("busy-week-cap");
    if (raceTomorrow && ["lower", "full"].includes(nextDef.kind)) cautions.push("lower-before-race");
    if (race.kind === "race") cautions.push("race-day");
    lift = {
      type: "lift",
      session: next,
      name: nextDef.name,
      kind: nextDef.kind,
      double: t.cardio || undefined,
      short: !!(checkInAdvice(checkIn).suggestShort || busyDay || extraGame || (plan.run.race.liftShortInTaper && ["taper", "race-week"].includes(race.kind))) || undefined,
      shortWhy: extraGame ? "extra-game" : undefined,
      adjust: {
        loadFactor: ret.loadFactor,
        setsDelta: ret.setsDelta,
        setsFactor: deload.active ? deload.setsFactor : 1,
        returnTier: ret.tier,
        deload: deload.active,
      },
      cautions,
    };
  }
  let run = null;
  if (runDue && cardioAllowed) {
    const cautions = [];
    if (threeHard) cautions.push("third-hard-day");
    if (lowerNext) cautions.push("better-after-lower");
    if (y.sport) cautions.push("day-after-sport");
    const pick = runPick(L, today, settings, plan);
    // Nordics and deadlifts yesterday: no sprinting on sore hamstrings.
    if (afterLowerB && pick.run === "interval") cautions.push("interval-after-lower-b");
    run = { type: "run", ...pick, double: t.lift || undefined, cautions };
  }
  let cond = null;
  if (longDue && cardioAllowed) {
    const double = t.lift || undefined;
    // Race week stays easy, and a long run would make a third hard day: an easy run instead.
    const long = longPick(L, today, settings, plan);
    if (race.kind === "race-week" || threeHard) cond = { type: "conditioning", ex: "easy-run", double, cautions: [] };
    // No running at all for a month: an easy run first, then the long run starts again.
    else if (long.restart) cond = { type: "conditioning", ex: "easy-run", restart: true, double, cautions: [] };
    else {
      const cautions = [];
      if (lowerNext) cautions.push("better-after-lower");
      // No Lower the day before a long run: so a long run isn't suggested the day after Lower.
      if (y.liftKinds.some((k) => k === "lower" || k === "full")) cautions.push("long-run-after-lower");
      cond = { type: "conditioning", ex: "long-run", ...long, double, cautions };
    }
  }
  const easy = easyDue && cardioAllowed && cond?.ex !== "easy-run" ? { type: "conditioning", ex: "easy-run", double: t.lift || undefined, cautions: [] } : null;

  let primary;
  if (t.any) {
    // Something is done today: only allowed doubles are offered, never as the headline.
    primary = { type: "done" };
    for (const o of [lift, run, cond, easy]) if (o) options.push(o);
  } else {
    const clean = (o) => o && o.cautions.length === 0;
    const floats = [cond, easy, run].filter(Boolean);
    if (race.kind === "race" && run) primary = run;
    else if (threeHard) primary = [cond, easy].find((o) => o && o.ex === "easy-run") || { type: "rest" };
    // A spacing rule flags the lift: another clean option, else rest. The lift stays offered.
    else if (lift && lift.cautions.length) primary = floats.find(clean) || { type: "rest" };
    else if (!busy && win.lifts >= (three ? 3 : 4) && floats.length) primary = floats.find(clean) || floats[0];
    else primary = lift || floats.find(clean) || floats[0] || { type: "rest" };
    for (const o of [lift, run, cond, easy]) if (o && o !== primary) options.push(o);
    if (primary.type !== "rest") options.push({ type: "rest" });
  }

  const hints = [];
  if (busyDay) hints.push("busy-weekday");
  if (afterLowerB) hints.push("no-sprint-after-lower-b");
  if (run?.gameLimit) hints.push("quality-run-after-games");
  return {
    date: today,
    mode: busy ? "busy" : "normal",
    threeLifts: three,
    next,
    nextMain: nextSession(L, { busy: false, threeLifts: threeLiftBuild({ ...settings, modeLog: [] }, today, plan) }, plan),
    primary,
    options,
    progress: rollingProgress(L, today, plan, settings),
    streak: streak(L, settings, today, plan),
    returnAdjustment: ret,
    deload,
    race,
    hints,
  };
}
