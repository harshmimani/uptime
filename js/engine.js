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
//   { date, kind: "run", run: "interval" | "tempo" | "time-trial" }   the Run slot
//   { date, kind: "run", run: "easy" }                     fills the sport/conditioning slot
//   { date, kind: "sport", ex: "basketball" }              fills the sport/conditioning slot (hard)
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

import PLAN from "./plan.js";

export const ENGINE_VERSION = 1;

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
    if (entry.run === "easy") return { slot: "cond", hard: entry.hard ?? false, cardio: true };
    return { slot: "run", hard: entry.hard ?? true, cardio: true };
  }
  if (entry.kind === "sport") return { slot: "cond", hard: entry.hard ?? true, cardio: true, sport: true };
  if (entry.kind === "conditioning") {
    const opt = plan.conditioning.options.find((o) => o.ex === entry.ex);
    return { slot: "cond", hard: entry.hard ?? opt?.hard ?? false, cardio: true, sport: entry.ex === "basketball" };
  }
  return { slot: null, hard: false };
}

/** Valid entries, oldest first, each with its classification attached as `c`. */
export function normalizeLog(log = [], plan = PLAN) {
  return log
    .map((e, i) => ({ e, i, c: classify(e, plan) }))
    .filter((x) => x.c.slot)
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || (a.e.t ?? 0) - (b.e.t ?? 0) || a.i - b.i)
    .map((x) => ({ ...x.e, c: x.c }));
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
export function nextSession(log, { busy = false } = {}, plan = PLAN) {
  const L = norm(log, plan);
  const rot = busy ? plan.busy.rotation : plan.rules.rotation;
  for (let i = L.length - 1; i >= 0; i--) {
    const k = rot.indexOf(L[i].session);
    if (k !== -1) return rot[(k + 1) % rot.length];
  }
  return rot[0];
}

/** Interval and tempo alternate; a 5K time trial replaces the run every 6 weeks. */
export function nextRunType(log, today, plan = PLAN) {
  const L = norm(log, plan).filter((e) => e.date <= today);
  if (!L.length) return plan.run.order[0];
  const trials = L.filter((e) => e.run === "time-trial");
  const since = trials.length ? trials[trials.length - 1].date : L[0].date;
  if (daysBetween(since, today) >= plan.run.timeTrial.everyDays) return "time-trial";
  const runs = L.filter((e) => e.c.slot === "run" && plan.run.order.includes(e.run));
  if (!runs.length) return plan.run.order[0];
  const order = plan.run.order;
  return order[(order.indexOf(runs[runs.length - 1].run) + 1) % order.length];
}

// --------------------------------------------------------- rolling week + levels

/** Counts over the rolling 7 days ending on `end` (inclusive). */
export function windowStats(log, end, plan = PLAN, days = 7) {
  const L = norm(log, plan);
  const start = addDays(end, -(days - 1));
  const es = L.filter((e) => e.date >= start && e.date <= end);
  const s = { start, end, lifts: 0, upper: 0, lower: 0, full: 0, run: 0, cond: 0, sessions: es.length };
  for (const e of es) {
    if (e.c.slot === "lift") {
      s.lifts++;
      s[e.c.liftKind]++;
    } else if (e.c.slot === "run") s.run++;
    else if (e.c.slot === "cond") s.cond++;
  }
  return s;
}

/** "Full" | "Good" | "Minimum" | null for a set of counts. */
export function weekLevel(s) {
  const cardio = s.run + s.cond;
  if (s.lifts >= 4 && s.run >= 1 && cardio >= 2) return "Full";
  if (s.lifts >= 3 && cardio >= 1) return "Good";
  if (s.lifts >= 2) return "Minimum";
  return null;
}

/** What's still missing for each level, given counts. */
function missingFor(s) {
  const cardio = s.run + s.cond;
  return {
    Minimum: { lifts: Math.max(0, 2 - s.lifts), run: 0, cond: 0 },
    Good: { lifts: Math.max(0, 3 - s.lifts), run: 0, cond: cardio >= 1 ? 0 : 1 },
    Full: {
      lifts: Math.max(0, 4 - s.lifts),
      run: s.run >= 1 ? 0 : 1,
      cond: cardio - Math.min(s.run, 1) >= 1 ? 0 : 1,
    },
  };
}

/** Rolling 7-day progress for the Home card. */
export function rollingProgress(log, today, plan = PLAN) {
  const s = windowStats(log, today, plan);
  const level = weekLevel(s);
  const nextLevel = level === "Full" ? null : LEVELS[level ? LEVELS.indexOf(level) + 1 : 0];
  return { ...s, level, nextLevel, missing: missingFor(s) };
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

/**
 * Deload state on `today`.
 * Active for 7 days from a deload start in settings.deloads. Suggested after
 * 3+ Rough check-ins within one rotation, or 6 weeks (overdue at 8) since the
 * last deload or break of 7+ days. `pendingCheckIn` is today's check-in before
 * the session is logged.
 */
export function deloadStatus(log, settings = {}, today, { pendingCheckIn } = {}, plan = PLAN) {
  const cfg = plan.rules.deload;
  const L = norm(log, plan).filter((e) => e.date <= today);
  const starts = (settings.deloads || []).filter((d) => d <= today).sort();
  const last = starts[starts.length - 1];
  if (last && daysBetween(last, today) < DELOAD_DAYS) {
    return { active: true, suggested: false, reasons: [], setsFactor: cfg.setsFactor, since: last, endsOn: addDays(last, DELOAD_DAYS - 1) };
  }
  const base = { active: false, suggested: false, reasons: [], setsFactor: 1, roughCount: 0, daysSince: 0 };
  if (!L.length && pendingCheckIn !== "Rough") return base;

  const candidates = [L[0]?.date, last && addDays(last, DELOAD_DAYS), lastReturnDate(liftDates(L), plan)].filter(Boolean);
  const clockStart = candidates.sort().pop() || today;
  const daysSince = daysBetween(clockStart, today);

  const cycle = plan.rules.rotation.length + plan.run.perRotation + 1;
  const recent = L.filter((e) => e.date >= clockStart).slice(-(pendingCheckIn ? cycle - 1 : cycle));
  const roughCount = recent.filter((e) => e.checkIn === "Rough").length + (pendingCheckIn === "Rough" ? 1 : 0);

  const reasons = [];
  if (roughCount >= cfg.roughCheckInsPerRotation) reasons.push("rough");
  if (daysSince >= cfg.everyDays[0]) reasons.push(daysSince >= cfg.everyDays[1] ? "overdue" : "time");
  return { ...base, suggested: reasons.length > 0, reasons, setsFactor: reasons.length ? cfg.setsFactor : 1, roughCount, daysSince };
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
  const top = item.reps ? item.reps[1] : item.sec ? item.sec[1] : null;
  const allTop = top != null && last.sets.length >= (item.sets || 1) && last.sets.every((s) => (s.reps ?? s.sec ?? 0) >= top);
  if (allTop) return { action: "increase", kg: topKg ? topKg + increment(item, topKg, plan) : topKg };
  if (stall.stalled) return { action: "reset", kg: topKg ? roundDown(topKg * 0.9) : topKg, advice: plan.rules.stallAdvice };
  return { action: "hold", kg: topKg };
}

// ------------------------------------------------------- session prescription

/**
 * A session's items with today's adjustments applied.
 * adj: { short, setsFactor (deload), setsDelta, loadFactor (return after gap) }
 * Weighted items carry `loadFactor` for the UI to apply to the last weight.
 */
export function prescribe(sessionId, adj = {}, plan = PLAN) {
  const def = sessionDef(sessionId, plan);
  if (!def) return null;
  let items = def.items;
  if (adj.short) items = items.slice(0, plan.short.items);
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
 *   { type: "run", run, double?, cautions: [] }
 *   { type: "conditioning", ex, double?, cautions: [] }
 *   { type: "rest" } | { type: "done" }
 */
export function planToday(log, settings = {}, today, { checkIn } = {}, plan = PLAN) {
  const L = norm(log, plan).filter((e) => e.date <= today);
  const busy = isBusy(settings, today);
  const next = nextSession(L, { busy }, plan);
  const nextDef = sessionDef(next, plan);
  const t = dayInfo(L, today);
  const y = dayInfo(L, addDays(today, -1));
  const y2 = dayInfo(L, addDays(today, -2));
  const win = windowStats(L, today, plan);

  const ret = returnAdjustment(L, today, plan);
  const deload = deloadStatus(L, settings, today, { pendingCheckIn: checkIn }, plan);
  const busyDay = (settings.busyWeekdays || []).includes(weekday(today));

  // ---- what's due in the rolling week
  // Busy mode asks for 1 run of any kind; normally the Run slot needs a quality run.
  const runDue = busy ? win.run + win.cond === 0 : win.run === 0;
  const condDue = !busy && win.cond === 0 && win.run < 2;

  // ---- same-day rules
  const liftAllowed = !t.lift && (!t.cardio || nextDef.kind === "upper");
  const cardioAllowed = !t.cardio && (!t.lift || t.liftKinds.every((k) => k === "upper"));

  const threeHard = y.hard && y2.hard && !t.any;
  const legsTired = ["lower", "full"].includes(nextDef.kind) && y.hardCardio;

  const options = [];
  let lift = null;
  if (liftAllowed) {
    const cautions = [];
    if (threeHard) cautions.push("third-hard-day");
    if (legsTired) cautions.push("lower-after-hard-cardio");
    if (busy && y.liftKinds.includes("full")) cautions.push("full-body-back-to-back");
    if (busy && win.lifts >= 3) cautions.push("busy-week-cap");
    lift = {
      type: "lift",
      session: next,
      name: nextDef.name,
      kind: nextDef.kind,
      double: t.cardio || undefined,
      short: !!(checkInAdvice(checkIn).suggestShort || busyDay) || undefined,
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
    if (!t.lift && ["lower", "full"].includes(nextDef.kind) && !busy) cautions.push("better-after-lower");
    if (y.sport) cautions.push("day-after-sport");
    const type = busy ? "tempo" : nextRunType(L, today, plan);
    run = { type: "run", run: type, double: t.lift || undefined, cautions };
  }
  let cond = null;
  if (condDue && cardioAllowed) {
    const rec = plan.conditioning.options.find((o) => o.recommended) || plan.conditioning.options[0];
    cond = { type: "conditioning", ex: rec.ex, double: t.lift || undefined, cautions: [] };
  }

  let primary;
  if (t.any) {
    // Something is done today: only allowed doubles are offered, never as the headline.
    primary = { type: "done" };
    for (const o of [lift, run, cond]) if (o) options.push(o);
  } else {
    const clean = (o) => o && o.cautions.length === 0;
    const floats = [cond, run].filter(Boolean);
    if (threeHard) primary = cond || { type: "rest" };
    // A spacing rule flags the lift: another clean option, else rest. The lift stays offered.
    else if (lift && lift.cautions.length) primary = floats.find(clean) || { type: "rest" };
    else if (!busy && win.lifts >= 4 && floats.length) primary = floats.find(clean) || floats[0];
    else primary = lift || floats[0] || { type: "rest" };
    for (const o of [lift, run, cond]) if (o && o !== primary) options.push(o);
    if (primary.type !== "rest") options.push({ type: "rest" });
  }

  return {
    date: today,
    mode: busy ? "busy" : "normal",
    next,
    nextMain: nextSession(L, { busy: false }, plan),
    primary,
    options,
    progress: rollingProgress(L, today, plan),
    streak: streak(L, settings, today, plan),
    returnAdjustment: ret,
    deload,
    hints: busyDay ? ["busy-weekday"] : [],
  };
}
