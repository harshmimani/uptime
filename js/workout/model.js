// Workout model: everything the strength Workout screen decides, as pure functions.
//
// No DOM, no storage, no clock: callers pass `now`, the plan and an exercise-history
// function, so all of it runs under `node --test` (tests/workout.test.js).
// Plan content comes from js/plan.js; rotation, progression and adjustments from js/engine.js.
//
// A workout in progress (saved after every set as `db.active`):
//   {
//     kind: "lift", id, session: "UA", name, sessionKind, date, startedAt,
//     checkIn: "Good" | "Okay" | "Rough", short, noGym, adjust: { loadFactor, setsDelta, setsFactor, returnTier, deload },
//     items: [{ key, planEx, ex, swapped: null | "today" | "always" | "nogym", role, sets, reps?, sec?, perSide?,
//               rest, pair?, tempo?, note?, start?, ladder?, carryKg? }],
//     log: [{ key, ex, n, kg?, reps?, sec?, t }],     // n = set number within the item, 1-based
//     cur: item key | null,                           // the exercise in focus
//     rest: { startAt, endAt } | null,                // end timestamp: right after a lock or app switch
//     work: { key, startAt, endAt } | null,           // a timed set (carry, plank, hang) that is running
//     draft: { key, n, kg, reps, sec } | null,        // stepper values not logged yet
//     lastSetAt: ms | null
//   }

import PLAN from "../plan.js";
import { fmtW, wu } from "../units.js";
import { sessionDef, adjustSets, progression, roundDown } from "../engine.js";

export const RESUME_AFTER_MS = 90 * 60 * 1000;
export const KG_STEP = 2.5;
export const SEC_STEP = 5;

// ------------------------------------------------------------------ exercise facts

export const exName = (ex, plan = PLAN) => plan.exercises[ex]?.name || ex;
export const exCue = (ex, plan = PLAN) => plan.exercises[ex]?.cue || "";

const LOADED = /dumbbell|cable|smith-machine-(back|box|pause)|smith-calf|barbell|deadlift|farmer|suitcase|weighted-pull|pallof|face-pull|pushdown|pulldown|carry|snatch|high-pull|hammer-curl|calf-raise|bulgarian|lunge|extension/;
const UNLOADED = /backpack|bodyweight|^step-|stair|inverted|nordic|plank|push-up|towel/;

/** Does this exercise take a weight? History or a starting weight settles it; otherwise the name does. */
export function isWeighted(ex, item = {}, history = []) {
  if (history.some((h) => h.sets?.some((s) => s.kg > 0))) return true;
  if (item.carryKg > 0) return true;
  if (ex === item.planEx && item.start?.kg != null) return true;
  return LOADED.test(ex) && !UNLOADED.test(ex);
}

const UNIT_NOTES = ["per hand", "added to the bar", "total"];
/** Short unit line under the weight: "kg per hand", "kg added to the bar". */
export function kgNote(item, ex) {
  const n = ex === item.planEx ? item.start?.note : null;
  if (UNIT_NOTES.includes(n)) return `${wu()} ${n}`;
  if (/^dumbbell|farmer|hammer|dumbbell-(bench|press)|incline-dumbbell|lateral-raise/.test(ex) && !/one-arm|suitcase|single-arm|snatch|calf/.test(ex)) return `${wu()} per hand`;
  if (/cable|pallof|face-pull|pushdown|pulldown/.test(ex)) return `${wu()} on the stack`;
  return wu();
}
/** Setup notes from the plan that aren't units ("bar at hip height", "light"). */
export function setupNote(item, ex) {
  const n = ex === item.planEx ? item.start?.note : null;
  return n && !UNIT_NOTES.includes(n) && n !== "light" ? n : "";
}

export const rangeText = (item) => {
  const side = item.perSide ? " per side" : "";
  if (item.sec) return item.sec[0] === item.sec[1] ? `${item.sec[0]} s${side}` : `${item.sec[0]}–${item.sec[1]} s${side}`;
  if (item.reps) return item.reps[0] === item.reps[1] ? `${item.reps[0]} reps${side}` : `${item.reps[0]}–${item.reps[1]} reps${side}`;
  return "";
};

// ------------------------------------------------------------------ building today's items

function resolveSlot(it, sessionId, settings, plan) {
  if (it.slot === "ladder") {
    const lvl = plan.ladder.find((l) => l.level === settings.ladderLevel) || plan.ladder[0];
    return (lvl[it.list] || []).map((x) => ({ ...x, role: "main", ladder: lvl.level }));
  }
  if (it.slot === "jump") {
    const blk = plan.jumpBlocks.find((b) => b.block === settings.jumpBlock) || plan.jumpBlocks[0];
    const j = blk[sessionId];
    if (!j) return [];
    const { then, alt, ...first } = j;
    return [first, then].filter(Boolean).map((x) => ({ ...x, role: "jump" }));
  }
  return [it];
}

const keyOrder = (k) => (k.startsWith("x") ? 1000 + Number(k.slice(1)) : parseFloat(k));

/**
 * Today's exercise list for a session, with Short, no-gym, deload, return and
 * "use this every time" swaps applied. Keys are stable across Full ↔ Short so
 * logged sets stay attached when the user switches mid-session.
 */
export function buildItems(sessionId, { short = false, noGym = false, adjust = {}, settings = {} } = {}, plan = PLAN) {
  const def = sessionDef(sessionId, plan);
  if (!def) return [];
  let raw = def.items.map((it, idx) => ({ it, idx }));
  if (short) raw = raw.slice(0, plan.short.items);
  const s = { ladderLevel: settings.ladderLevel ?? plan.baseline.ladderLevel, jumpBlock: settings.jumpBlock ?? 1 };
  const out = [];
  const add = (c, key, base) => {
    let ex = c.ex;
    let swapped = null;
    const none = plan.exercises[ex]?.swaps?.none;
    if (noGym && none && none !== ex) { ex = none; swapped = "nogym"; }
    else if (!noGym && settings.swapsAlways?.[c.ex] && plan.exercises[settings.swapsAlways[c.ex]]) { ex = settings.swapsAlways[c.ex]; swapped = "always"; }
    out.push({
      key, planEx: c.ex, ex, swapped,
      role: c.role ?? base.role,
      sets: adjustSets(c.sets ?? 3, { short, setsFactor: adjust.setsFactor, setsDelta: adjust.setsDelta }, plan),
      reps: c.reps, sec: c.sec, perSide: c.perSide, rest: c.rest ?? 60,
      pair: base.pair, tempo: c.tempo, note: c.note, start: c.start, ladder: c.ladder,
    });
  };
  for (const { it, idx } of raw) {
    const list = it.slot ? resolveSlot(it, sessionId, s, plan) : [it];
    list.forEach((c, sub) => add(c, list.length > 1 ? `${idx}.${sub}` : `${idx}`, it));
  }
  if (noGym && !short) {
    const extras = plan.noGym.extras[def.kind === "lower" ? "lower" : "upper"] || [];
    extras.forEach((c, i) => add(c, `x${i}`, c));
  }
  return out;
}

/** Rough minutes for a list of items: work + rest per round, plus warm-up and changeovers. */
export function estimateMin(items, plan = PLAN) {
  const work = (it) => (it.sec ? it.sec[0] : 40) * (it.perSide ? 2 : 1);
  let s = plan.warmup.minutes * 60;
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.key)) continue;
    const group = it.pair ? items.filter((x) => x.pair === it.pair) : [it];
    group.forEach((g) => seen.add(g.key));
    const rounds = Math.max(...group.map((g) => g.sets));
    s += rounds * (group.reduce((a, g) => a + work(g), 0) + (group[group.length - 1].rest || 0)) + 60;
  }
  return Math.max(10, Math.round(s / 300) * 5);
}

// ------------------------------------------------------------------ a workout in progress

export function newWorkout({ id, sessionId, date, now, checkIn, short = false, noGym = false, adjust = {}, settings = {} }, plan = PLAN) {
  const def = sessionDef(sessionId, plan);
  const w = {
    kind: "lift", id, session: sessionId, name: def.name, sessionKind: def.kind, date, startedAt: now,
    checkIn, short, noGym, adjust: { loadFactor: 1, setsDelta: 0, setsFactor: 1, ...adjust },
    items: buildItems(sessionId, { short, noGym, adjust, settings }, plan),
    log: [], cur: null, rest: null, work: null, draft: null, lastSetAt: null,
  };
  w.cur = nextStep(w, null)?.key ?? null;
  return w;
}

export const item = (w, key) => w.items.find((x) => x.key === key) || null;
export const doneCount = (w, key) => w.log.reduce((n, l) => n + (l.key === key), 0);
export const isOpen = (w, it) => doneCount(w, it.key) < it.sets;
export const totalSets = (w) => w.items.reduce((n, it) => n + Math.max(it.sets, doneCount(w, it.key)), 0);
export const isFinished = (w) => !w.items.some((it) => isOpen(w, it));
const groupOf = (w, it) => (it.pair ? w.items.filter((x) => x.pair === it.pair) : [it]);

/**
 * Where to go after logging a set of `lastKey` (or where to start, with null).
 * Supersets (items sharing `pair`) alternate with no rest; rest comes after each round.
 * Returns { key, rest } or null when every set is done.
 */
export function nextStep(w, lastKey) {
  if (lastKey) {
    const it = item(w, lastKey);
    const g = groupOf(w, it);
    const round = doneCount(w, lastKey);
    const later = g.slice(g.indexOf(it) + 1).find((x) => isOpen(w, x) && doneCount(w, x.key) < round);
    if (later) return { key: later.key, rest: false };
    const again = g.filter((x) => isOpen(w, x)).sort((a, b) => doneCount(w, a.key) - doneCount(w, b.key))[0];
    if (again) return { key: again.key, rest: true };
  }
  const z = w.items.find((x) => isOpen(w, x));
  if (!z) return null;
  const head = groupOf(w, z).filter((x) => isOpen(w, x)).sort((a, b) => doneCount(w, a.key) - doneCount(w, b.key))[0];
  return { key: head.key, rest: !!lastKey };
}

/**
 * What's coming: the exercise in focus and, if that's another set of the same thing,
 * the next different exercise after it. { item, n, then: item | null } or null.
 */
export function upNext(w) {
  const it = item(w, w.cur);
  if (!it) return null;
  const sim = { ...w, log: [...w.log] };
  let key = w.cur;
  for (let i = 0; i < 100; i++) {
    sim.log.push({ key, ex: item(w, key).ex, n: doneCount(sim, key) + 1 });
    const nx = nextStep(sim, key);
    if (!nx) break;
    if (nx.key !== w.cur) return { item: it, n: doneCount(w, it.key) + 1, then: item(w, nx.key) };
    key = nx.key;
  }
  return { item: it, n: doneCount(w, it.key) + 1, then: null };
}

/** Log one set of the exercise in focus. Returns { finished, restSec }. Mutates `w`. */
export function logSet(w, { kg, reps, sec }, now) {
  const it = item(w, w.cur);
  if (!it) return { finished: isFinished(w), restSec: 0 };
  const entry = { key: it.key, ex: it.ex, n: doneCount(w, it.key) + 1, t: now };
  if (kg != null) entry.kg = kg;
  if (reps != null) entry.reps = reps;
  if (sec != null) entry.sec = sec;
  w.log.push(entry);
  w.lastSetAt = now;
  w.draft = null;
  w.work = null;
  const nx = nextStep(w, it.key);
  if (!nx) {
    w.rest = null;
    return { finished: true, restSec: 0 };
  }
  w.cur = nx.key;
  const restSec = nx.rest ? it.rest || 0 : 0;
  w.rest = restSec ? { startAt: now, endAt: now + restSec * 1000 } : null;
  return { finished: false, restSec };
}

/** Undo the last logged set: it comes back on screen with its numbers. */
export function undoLast(w) {
  const l = w.log.pop();
  if (!l) return null;
  w.cur = l.key;
  w.rest = null;
  w.work = null;
  w.draft = { key: l.key, n: l.n, kg: l.kg, reps: l.reps, sec: l.sec };
  w.lastSetAt = w.log.length ? w.log[w.log.length - 1].t : null;
  return l;
}

/**
 * Put any exercise in focus: another one now (station taken), or back to an earlier one.
 * A finished exercise can be opened too: the set screen then shows what was logged,
 * with Remove on each set and "Add a set".
 */
export function jumpTo(w, key) {
  const it = item(w, key);
  if (!it) return false;
  w.cur = key;
  w.draft = null;
  return true;
}

/** The exercise before / after the one in focus, in list order (null at either end). */
export function neighbour(w, dir) {
  const i = w.items.findIndex((x) => x.key === w.cur);
  return w.items[i + dir] || null;
}

// ------------------------------------------------------------------ skipping and removing
// Skips only shrink what's planned for today: nothing is logged, the rotation still moves
// on as usual, and every change can be undone with restore(w, snapshot).

/** Everything a skip, a removal or an extra set can change, for Undo. */
export function snapshot(w) {
  return structuredClone({ items: w.items, log: w.log, cur: w.cur, rest: w.rest, draft: w.draft, lastSetAt: w.lastSetAt });
}
export function restore(w, snap) {
  Object.assign(w, structuredClone(snap));
}

/** Where to go once the exercise in focus has nothing left: the next open set, or null (all done). */
function moveOn(w) {
  const it = item(w, w.cur);
  if (it && isOpen(w, it)) return w.cur;
  w.draft = null;
  const nx = nextStep(w, null);
  if (nx) w.cur = nx.key;
  return nx ? nx.key : null;
}

/** Skip the next set of an exercise (one fewer set today). Returns { finished }. */
export function skipSet(w, key = w.cur) {
  const it = item(w, key);
  if (!it || !isOpen(w, it)) return { finished: isFinished(w) };
  it.sets -= 1;
  it.skipped = (it.skipped || 0) + 1;
  if (w.draft?.key === key) w.draft = null;
  return { finished: !moveOn(w) };
}

/** Skip the rest of an exercise: its open sets are dropped for today. Returns { finished, sets }. */
export function skipExercise(w, key = w.cur) {
  const it = item(w, key);
  if (!it) return { finished: isFinished(w), sets: 0 };
  const left = Math.max(0, it.sets - doneCount(w, key));
  it.sets -= left;
  it.skipped = (it.skipped || 0) + left;
  if (w.draft?.key === key) w.draft = null;
  return { finished: !moveOn(w), sets: left };
}

/** One more set of an exercise (also undoes a skipped set). The exercise comes into focus. */
export function addSet(w, key = w.cur) {
  const it = item(w, key);
  if (!it) return false;
  it.sets = Math.max(it.sets, doneCount(w, key)) + 1;
  if (it.skipped) it.skipped -= 1;
  w.cur = key;
  w.draft = null;
  return true;
}

/**
 * Remove a logged set (index into w.log). The exercise's other sets are renumbered and
 * the set comes back as open, so it can be logged again. Returns the removed entry.
 */
export function removeLogged(w, index) {
  const [l] = w.log.splice(index, 1);
  if (!l) return null;
  let n = 0;
  for (const x of w.log) if (x.key === l.key) x.n = ++n;
  w.lastSetAt = w.log.length ? Math.max(...w.log.map((x) => x.t ?? 0)) || null : null;
  if (w.draft?.key === l.key) w.draft = null;
  if (w.work?.key === l.key) w.work = null;
  return l;
}

/** Swap the exercise in focus. Logged sets keep their own exercise id. Returns what to restore on undo. */
export function swapExercise(w, key, ex, { always = false, kg = null } = {}) {
  const it = item(w, key);
  const before = { ex: it.ex, swapped: it.swapped, carryKg: it.carryKg };
  it.ex = ex;
  it.swapped = ex === it.planEx ? null : always ? "always" : "today";
  it.carryKg = kg > 0 ? kg : undefined;
  if (w.draft?.key === key) w.draft = null;
  return before;
}
export function restoreSwap(w, key, before) {
  Object.assign(item(w, key), before);
  if (w.draft?.key === key) w.draft = null;
}

/** Switch Full ↔ Short mid-session. Logged sets stay; an exercise with logged sets is never dropped. */
export function setShort(w, short, settings = {}, plan = PLAN) {
  const fresh = buildItems(w.session, { short, noGym: w.noGym, adjust: w.adjust, settings }, plan);
  const old = new Map(w.items.map((it) => [it.key, it]));
  const merged = fresh.map((f) => {
    const o = old.get(f.key);
    const done = doneCount(w, f.key);
    if (!o) return f;
    // a skipped exercise stays as the user left it
    const sets = o.skipped ? Math.min(o.sets, Math.max(f.sets, done)) : Math.max(f.sets, done);
    return { ...f, ex: o.ex, swapped: o.swapped, carryKg: o.carryKg, sets, skipped: o.skipped };
  });
  for (const o of w.items) {
    if (!merged.some((m) => m.key === o.key) && doneCount(w, o.key) > 0) merged.push({ ...o, sets: doneCount(w, o.key) });
  }
  merged.sort((a, b) => keyOrder(a.key) - keyOrder(b.key));
  w.items = merged;
  w.short = short;
  if (!w.cur || !item(w, w.cur) || !isOpen(w, item(w, w.cur))) w.cur = nextStep(w, null)?.key ?? null;
  if (w.draft && !item(w, w.draft.key)) w.draft = null;
}

// ------------------------------------------------------------------ prefill and "beat last time"

const roundTo = (kg, step = KG_STEP) => Math.max(step, Math.round(kg / step) * step);

/** Did these numbers beat last time's same set? More weight, or the same weight and more reps (or seconds). */
export function beats(v, last) {
  if (!last) return false;
  const k = v.kg ?? 0, lk = last.kg ?? 0;
  if (k !== lk) return k > lk;
  if (v.sec != null || last.sec != null) return (v.sec ?? 0) > (last.sec ?? 0);
  return (v.reps ?? 0) > (last.reps ?? 0);
}

/**
 * What the steppers show for the next set of `key`, and the target to beat.
 * history(ex) → past sessions of that exercise (store.exerciseHistory). history.lastKg(ex), if
 * given, is the old app's last typed weight, used only when there's no dated history.
 * target.kind: "beat" (last time's same set), "up" (progression added weight),
 *              "easy" (lighter day: return, deload, Short), "first" (no history).
 */
export function prefill(w, key, history, plan = PLAN) {
  const it = item(w, key);
  if (!it) return null;
  const ex = it.ex;
  const n = doneCount(w, key) + 1;
  const hist = history(ex).filter((h) => h.sets?.length);
  const last = hist[hist.length - 1] || null;
  const lastSet = last ? last.sets[n - 1] || last.sets[last.sets.length - 1] : null;
  const mine = w.log.filter((l) => l.key === key && l.ex === ex);
  const prev = mine[mine.length - 1];
  const oldKg = history.lastKg?.(ex) ?? null; // the old app's last typed weight, before any dated set
  const weighted = isWeighted(ex, oldKg ? { ...it, carryKg: it.carryKg ?? oldKg } : it, hist);
  const prog = progression(hist, { ...it, ex, start: ex === it.planEx ? it.start : undefined }, plan);
  const lighter = (w.adjust.loadFactor ?? 1) < 1;
  const reducedDay = lighter || w.adjust.deload || w.short;

  let kg = null;
  if (weighted) {
    if (prev?.kg != null) kg = prev.kg; // a changed weight carries forward to the remaining sets
    else {
      kg = prog.action === "start" ? (it.carryKg ?? oldKg ?? (ex === it.planEx ? it.start?.kg : null) ?? null)
        : prog.action === "reset" ? Math.max(0, ...(last?.sets || []).map((s) => s.kg ?? 0)) || null
        : prog.kg;
      if (kg && lighter) kg = roundTo(kg * w.adjust.loadFactor);
    }
    if (kg == null) kg = 0;
  }

  let reps = null, sec = null;
  if (it.sec) {
    sec = prev?.sec ?? (prog.action === "increase" ? it.sec[0] : lastSet?.sec) ?? it.sec[0];
  } else {
    const top = it.reps ? it.reps[1] : 8;
    if (prev?.reps != null && !lastSet) reps = prev.reps;
    else if (prog.action === "increase" && it.reps) reps = it.reps[0];
    else if (lastSet?.reps != null) reps = lastSet.reps;
    else reps = top;
  }

  let target;
  if (!last) target = { kind: "first" };
  else if (reducedDay) target = { kind: "easy", lighter, last: lastSet };
  else if (prog.action === "increase" && weighted && kg > (lastSet?.kg ?? 0)) target = { kind: "up", fromKg: lastSet?.kg ?? 0, toKg: kg, last: lastSet };
  else target = { kind: "beat", last: lastSet };

  if (w.draft && w.draft.key === key && w.draft.n === n) {
    if (weighted && w.draft.kg != null) kg = w.draft.kg;
    if (w.draft.reps != null && reps != null) reps = w.draft.reps;
    if (w.draft.sec != null && sec != null) sec = w.draft.sec;
  }
  return {
    key, ex, n, of: it.sets, weighted, kg, reps, sec, last, lastSet, prog, target,
    unit: kgNote(it, ex), setup: setupNote(it, ex),
  };
}

/** One line for "last time", e.g. "Last time: 15 kg × 8, 8, 7". */
export function lastTimeText(last) {
  if (!last) return "";
  const s = last.sets;
  const kgs = [...new Set(s.map((x) => x.kg).filter((k) => k > 0))];
  const vals = s.map((x) => (x.sec != null ? `${x.sec} s` : x.reps ?? "–")).join(", ");
  return kgs.length === 1 ? `${fmtKg(kgs[0])} ${wu()} × ${vals}` : kgs.length ? s.map((x) => `${fmtKg(x.kg ?? 0)}×${x.reps ?? x.sec}`).join(", ") : vals;
}
/** Weight in the display unit (js/units.js); stored values are always kg. */
export const fmtKg = (kg) => fmtW(kg);

// ------------------------------------------------------------------ warm-up

/** The warm-up card: general checklist plus ramp-up sets on the first loaded main lift. */
export function warmup(w, history, plan = PLAN) {
  const general = [...plan.warmup.general];
  if (w.sessionKind !== "upper") general.push(plan.warmup.lowerExtra.join(", "));
  let ramp = null;
  for (const it of w.items) {
    if (it.role !== "main") continue;
    const p = prefill(w, it.key, history, plan);
    if (!p.weighted || !(p.kg > 0)) continue;
    // 1–3 ramp-up sets (CLAUDE.md), fewer for light loads: three sets before 15 kg dumbbells
    // is more fatigue than preparation.
    const steps = p.kg < 20 ? [[0.6, 5]] : p.kg < 50 ? [[0.5, 5], [0.75, 3]] : [[0.5, 5], [0.7, 3], [0.85, 2]];
    const sets = steps.map(([f, reps]) => ({ kg: roundTo(p.kg * f), reps }))
      .filter((s, i, a) => s.kg < p.kg && (i === 0 || s.kg !== a[i - 1].kg));
    if (sets.length) ramp = { ex: it.ex, name: exName(it.ex, plan), sets };
    break;
  }
  return { minutes: plan.warmup.minutes, general, ramp };
}

// ------------------------------------------------------------------ finishing

/** The record saved in db.sessions. */
export function toSession(w, { partial = false, end } = {}) {
  const items = [];
  for (const l of w.log) {
    let row = items.find((x) => x.key === l.key && x.ex === l.ex);
    if (!row) {
      row = { key: l.key, ex: l.ex, role: item(w, l.key)?.role, sets: [] };
      items.push(row);
    }
    const s = { t: l.t };
    if (l.kg != null) s.kg = l.kg;
    if (l.reps != null) s.reps = l.reps;
    if (l.sec != null) s.sec = l.sec;
    row.sets.push(s);
  }
  return {
    id: w.id, date: w.date, t: w.startedAt, end: end ?? w.lastSetAt, session: w.session, name: w.name,
    checkIn: w.checkIn, short: !!w.short || undefined, noGym: !!w.noGym || undefined,
    deload: !!w.adjust.deload || undefined, reduced: (w.adjust.loadFactor ?? 1) < 1 || undefined,
    partial: partial || undefined, planned: totalSets(w), items,
    skipped: w.items.reduce((n, it) => n + (it.skipped || 0), 0) || undefined,
  };
}

/**
 * The finish summary. `history` must not include this session yet; `historyAfter`
 * must (for next time's targets).
 */
export function summarize(w, history, historyAfter, plan = PLAN) {
  const sets = w.log.length;
  const minutes = Math.max(1, Math.round(((w.lastSetAt ?? w.startedAt) - w.startedAt) / 60000));
  let volume = 0;
  let beat = 0;
  const lastByEx = new Map();
  for (const l of w.log) {
    if (l.kg && l.reps) volume += l.kg * l.reps * (item(w, l.key)?.perSide ? 2 : 1);
    if (!lastByEx.has(l.ex)) {
      const h = history(l.ex).filter((x) => x.sets?.length);
      lastByEx.set(l.ex, h[h.length - 1] || null);
    }
    const last = lastByEx.get(l.ex);
    const ls = last?.sets[l.n - 1];
    if (ls && beats(l, ls)) beat++;
  }
  const next = [];
  const seen = new Set();
  for (const l of w.log) {
    if (seen.has(l.ex)) continue;
    seen.add(l.ex);
    const it = item(w, l.key);
    const done = w.log.filter((x) => x.ex === l.ex);
    const p = progression(historyAfter(l.ex), { ...it, ex: l.ex }, plan);
    const vals = done.map((x) => (x.sec != null ? `${x.sec} s` : x.reps)).join(", ");
    const kgs = [...new Set(done.map((x) => x.kg).filter((k) => k > 0))];
    const at = kgs.length === 1 ? ` at ${fmtKg(kgs[0])} ${wu()}` : "";
    let line;
    if (it.ladder) {
      const lvl = plan.ladder.find((x) => x.level === it.ladder);
      line = { up: false, title: `${exName(l.ex, plan)}: ladder level ${it.ladder}`, detail: lvl?.pass ? `Pass test: ${lvl.pass}` : `${vals}.` };
    } else if (w.short || w.adjust.deload || (w.adjust.loadFactor ?? 1) < 1) {
      line = { up: false, title: `${exName(l.ex, plan)}: ${vals}${at}`, detail: "Lighter day, so it doesn't count against progress." };
    } else if (p.action === "increase" && p.kg > (kgs[0] ?? 0)) {
      line = { up: true, title: `${exName(l.ex, plan)} → ${fmtKg(p.kg)} ${wu()}`, detail: `${vals}${at}. Every set hit the top of the range.` };
    } else if (p.action === "increase" && it.sec) {
      line = { up: true, title: `${exName(l.ex, plan)} → ${Math.min(60, (it.sec[1] ?? 40) + 10)} s`, detail: `${vals}${at}. Add time, then weight.` };
    } else if (p.action === "increase") {
      line = { up: true, title: `${exName(l.ex, plan)}: harder version next`, detail: `${vals}. Top of the range on every set.` };
    } else if (p.action === "reset") {
      line = { up: false, title: `${exName(l.ex, plan)}: time for a small reset`, detail: plan.rules.stallAdvice };
    } else {
      line = { up: false, title: `${exName(l.ex, plan)}: beat ${vals}${at}`, detail: it.reps ? `Top of the range is ${it.reps[1]}. Hit it on every set and the weight goes up.` : "" };
    }
    next.push(line);
  }
  const planned = totalSets(w);
  return { sets, planned, minutes, volume: Math.round(volume), beat, next, partial: sets < planned };
}
