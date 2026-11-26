// Uptime storage: one versioned record in localStorage, with step-by-step migrations.
//
// Rules (CLAUDE.md, Engineering): never delete or corrupt the user's logs.
// - The new app writes only `uptime2`. The old app's `uptime1` is read once to bring its
//   strength history across (so "last time" works from day one) and is never written.
// - Every save reports whether it worked, so the UI can say so instead of losing a set.
// - Nothing here touches the DOM; `storage` is injectable so Node tests can run it.
//
// Shape (v2)
//   {
//     v: 2,
//     sessions: [{ id, date, t, end, session, name, checkIn, short, noGym, deload, reduced,
//                  partial, items: [{ key, ex, role, sets: [{ kg?, reps?, sec?, t }] }] }],
//     activities: [{ id, date, t, kind: "run" | "sport" | "conditioning", run?, ex?, min,
//                    level?, checkIn?, short?, reps?: [{ sec }], sec?, partial? }],
//     settings: { modeLog: [], deloads: [], busyWeekdays: [], sound: true,
//                 swapsAlways: { planExerciseId: swappedExerciseId },
//                 ladderLevel, jumpBlock, runLevels: { interval, tempo } },
//     active: null | the workout in progress (see js/workout/model.js),
//     legacy: { from: "uptime1", at, sets: { "date|exerciseId": [{ t, kg, reps }] } } | absent
//   }

import PLAN from "./plan.js";

export const KEY = "uptime2";
export const LEGACY_KEY = "uptime1";
export const SCHEMA = 2;

export function emptyDB(plan = PLAN) {
  return {
    v: SCHEMA,
    sessions: [],
    activities: [],
    settings: {
      modeLog: [],
      deloads: [],
      busyWeekdays: [],
      sound: true,
      swapsAlways: {},
      ladderLevel: plan.baseline.ladderLevel,
      jumpBlock: 1,
      runLevels: { interval: 1, tempo: 1 },
    },
    active: null,
  };
}

/** Strength sets from the old app (`uptime1.sets`), keyed the same way. Other shapes are left behind in uptime1. */
export function legacySets(old) {
  const out = {};
  if (!old || typeof old !== "object" || !old.sets || typeof old.sets !== "object") return out;
  for (const [k, list] of Object.entries(old.sets)) {
    if (!/^\d{4}-\d{2}-\d{2}\|[\w-]+$/.test(k) || !Array.isArray(list)) continue;
    const sets = list
      .filter((s) => s && typeof s === "object" && (s.r != null || s.kg != null))
      .map((s) => ({ t: Number(s.t) || 0, kg: s.kg == null || s.kg === "" ? null : Number(s.kg), reps: s.r == null ? null : Number(s.r) }))
      .filter((s) => (s.kg == null || Number.isFinite(s.kg)) && (s.reps == null || Number.isFinite(s.reps)));
    if (sets.length) out[k] = sets;
  }
  return out;
}

// MIGRATIONS[n] takes a record at version n-1 and returns version n. v2 is the first
// uptime2 schema, so there are none yet; add steps here, never edit old ones.
const MIGRATIONS = {};

/**
 * Bring any stored value up to the current schema. Unknown fields are kept.
 * `legacy` is the parsed uptime1 object (or null), used only when there's no v2 record yet.
 */
export function migrate(raw, legacy = null, plan = PLAN, now = Date.now()) {
  if (!raw || typeof raw !== "object") {
    const db = emptyDB(plan);
    const sets = legacySets(legacy);
    if (Object.keys(sets).length) db.legacy = { from: LEGACY_KEY, at: now, sets };
    return db;
  }
  let db = raw;
  const from = Number(db.v) || SCHEMA;
  if (from > SCHEMA) throw new Error(`Saved data is from a newer version (${from}).`);
  for (let v = from + 1; v <= SCHEMA; v++) if (MIGRATIONS[v]) db = MIGRATIONS[v](db);
  // Fill anything missing without touching what's there.
  const base = emptyDB(plan);
  db.v = SCHEMA;
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.activities = Array.isArray(db.activities) ? db.activities : [];
  db.settings = { ...base.settings, ...(db.settings || {}) };
  db.settings.runLevels = { ...base.settings.runLevels, ...(db.settings.runLevels || {}) };
  db.settings.swapsAlways = { ...(db.settings.swapsAlways || {}) };
  if (db.active === undefined) db.active = null;
  return db;
}

export function createStore(storage = globalThis.localStorage, plan = PLAN) {
  let db;
  let loadError = null;
  const read = (k) => {
    try {
      const s = storage?.getItem(k);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };
  function load() {
    let raw = null;
    try {
      const s = storage?.getItem(KEY);
      raw = s ? JSON.parse(s) : null;
    } catch (e) {
      // Unreadable record: keep it where it is (never overwrite) and run from memory.
      loadError = e;
    }
    try {
      db = migrate(raw, raw ? null : read(LEGACY_KEY), plan);
    } catch (e) {
      loadError = e;
      db = emptyDB(plan);
    }
    return db;
  }
  /** Write the whole record. Returns { ok, error }. Never throws. */
  function save() {
    if (loadError) return { ok: false, error: loadError, readOnly: true };
    try {
      storage.setItem(KEY, JSON.stringify(db));
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }
  load();
  return {
    get db() { return db; },
    get readOnly() { return !!loadError; },
    load,
    save,
  };
}

// ------------------------------------------------------------------ derived views

let idn = 0;
export const newId = (prefix = "x") => `${prefix}${Date.now().toString(36)}${(idn++).toString(36)}`;

/** Log entries in the engine's shape (js/engine.js, "log entries"). */
export function engineLog(db) {
  const out = [];
  for (const s of db.sessions) {
    out.push({ date: s.date, t: s.t, session: s.session, checkIn: s.checkIn, short: s.short || undefined, deload: s.deload || undefined });
  }
  for (const a of db.activities) {
    if (a.kind === "run") out.push({ date: a.date, t: a.t, kind: "run", run: a.run, checkIn: a.checkIn });
    else if (a.kind === "sport") out.push({ date: a.date, t: a.t, kind: "sport", ex: a.ex });
    else if (a.kind === "conditioning") out.push({ date: a.date, t: a.t, kind: "conditioning", ex: a.ex });
  }
  return out;
}

/**
 * Every past session of one exercise, oldest first:
 * [{ date, sets: [{ kg, reps, sec }], short, deload, reduced, legacy }]
 */
export function exerciseHistory(db, ex) {
  const byDate = new Map();
  for (const s of db.sessions) {
    const sets = s.items.filter((it) => it.ex === ex).flatMap((it) => it.sets);
    if (!sets.length) continue;
    byDate.set(`${s.date}|${s.t}`, { date: s.date, t: s.t, sets, short: !!s.short, deload: !!s.deload, reduced: !!s.reduced, partial: !!s.partial });
  }
  for (const [k, sets] of Object.entries(db.legacy?.sets || {})) {
    const [date, id] = k.split("|");
    if (id !== ex) continue;
    byDate.set(`${date}|legacy`, { date, t: sets[0]?.t || 0, sets: sets.map(({ kg, reps }) => ({ kg: kg ?? undefined, reps: reps ?? undefined })), legacy: true });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t);
}

/** Latest activity of a kind/run type, for "last time" on runs. */
export function lastActivity(db, pred) {
  for (let i = db.activities.length - 1; i >= 0; i--) if (pred(db.activities[i])) return db.activities[i];
  return null;
}

/** Local calendar date as "YYYY-MM-DD". */
export function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
