// Uptime storage: one versioned record in localStorage, with step-by-step migrations.
//
// Rules (CLAUDE.md, Engineering): never delete or corrupt the user's logs.
// - The new app writes only `uptime2`. The old app's `uptime1` is read once to bring its
//   strength history across (so "last time" works from day one) and is never written.
// - Every save reports whether it worked, so the UI can say so instead of losing a set.
// - Nothing here touches the DOM; `storage` is injectable so Node tests can run it.
//
// Shape (v3; v3 added body, legacy extras and the Settings fields)
//   {
//     v: 3,
//     sessions: [{ id, date, t, end, session, name, checkIn, short, noGym, deload, reduced,
//                  partial, items: [{ key, ex, role, sets: [{ kg?, reps?, sec?, t }] }] }],
//     activities: [{ id, date, t, kind: "run" | "sport" | "conditioning", run?, ex?, min?,
//                    km?, time?: "10k 52:30" }],          // older runs may also hold level, reps, sec, partial
//     settings: { modeLog: [], deloads: [], busyWeekdays: [], sound: true,
//                 swapsAlways: { planExerciseId: swappedExerciseId },
//                 ladderLevel, jumpBlock,
//                 race: { distance: "5k" | "10k" | "21k", date } | null,
//                 paceRef: { km, sec, date, text } | null,     // latest time line, sets run paces
//                 sportName: "Basketball", units: "kg" | "lb", vibrate: true },
//     body: { weight: [{ date, kg, t }] },                   // bodyweight, always stored in kg
//     active: null | the workout in progress (see js/workout/model.js),
//     legacy: { from: "uptime1", at, sets: { "date|exerciseId": [{ t, kg, reps }] },
//               fiveK: [{ date, sec }], ladder: { level, log }, broad: { date: cm },
//               waist: { date: cm }, play: { date: kind } } | absent
//   }
//
// Backups (never overwritten by the app's own saves):
//   uptime-backup-v1 / -v2   the raw stored text, written once before a migration from that version
//   uptime-backup-last       { at, reason, data } written before an import or a reset, for Undo

import PLAN from "./plan.js";

export const KEY = "uptime2";
export const LEGACY_KEY = "uptime1";
export const SCHEMA = 3;
export const BACKUP_PREFIX = "uptime-backup-v";
export const LAST_BACKUP_KEY = "uptime-backup-last";

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
      race: null,
      paceRef: null,
      sportName: "Basketball",
      units: "kg",
      vibrate: true,
    },
    body: { weight: [] },
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

const isoKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Everything else the old app kept, in the new shape. Bodyweight becomes real entries
 * (it's logged in the new app too); the rest is history for Progress.
 */
export function legacyExtras(old) {
  const out = { weight: [], fiveK: [], ladder: null, broad: {}, waist: {}, play: {} };
  if (!old || typeof old !== "object") return out;
  for (const [date, kg] of Object.entries(old.body?.w || {})) {
    const v = num(kg);
    if (isoKey(date) && v && v > 20 && v < 300) out.weight.push({ date, kg: v, t: 0 });
  }
  for (const [date, cm] of Object.entries(old.body?.waist || {})) if (isoKey(date) && num(cm)) out.waist[date] = num(cm);
  const fk = new Map();
  for (const x of Array.isArray(old.tests?.fivek) ? old.tests.fivek : []) if (x && isoKey(x.d) && num(x.sec) > 600) fk.set(x.d, num(x.sec));
  for (const [k, list] of Object.entries(old.sets || {})) {
    const m = k.match(/^(\d{4}-\d{2}-\d{2})\|five-k-time-trial$/);
    const sec = m && Array.isArray(list) ? num(list.find((s) => s && num(s.sec))?.sec) : null;
    if (sec > 600 && !fk.has(m[1])) fk.set(m[1], sec);
  }
  out.fiveK = [...fk].map(([date, sec]) => ({ date, sec })).sort((a, b) => a.date.localeCompare(b.date));
  if (old.ladder && typeof old.ladder === "object") out.ladder = { level: num(old.ladder.level) || 1, log: Array.isArray(old.ladder.log) ? old.ladder.log : [] };
  for (const [date, cm] of Object.entries(old.tests?.broad || {})) if (isoKey(date) && num(cm)) out.broad[date] = num(cm);
  for (const [date, kind] of Object.entries(old.play || {})) if (isoKey(date) && kind && kind !== "none") out.play[date] = String(kind);
  out.weight.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Bring the old app's logs into `db` (sets → legacy.sets, bodyweight → body.weight, the rest → legacy). */
function importLegacy(db, old, now) {
  const sets = legacySets(old);
  const x = legacyExtras(old);
  const has = Object.keys(sets).length || x.weight.length || x.fiveK.length || x.ladder || Object.keys(x.broad).length || Object.keys(x.waist).length || Object.keys(x.play).length;
  if (!has) return db;
  const prev = db.legacy || {};
  db.legacy = { ...prev, from: LEGACY_KEY, at: prev.at || now, sets: { ...sets, ...(prev.sets || {}) },
    fiveK: x.fiveK, ladder: x.ladder, broad: x.broad, waist: x.waist, play: x.play };
  const have = new Set(db.body.weight.map((w) => w.date));
  for (const w of x.weight) if (!have.has(w.date)) db.body.weight.push(w);
  db.body.weight.sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t);
  return db;
}

// MIGRATIONS[n] takes a record at version n-1 (and the old app's record, if any) and
// returns version n. Add steps here, never edit old ones.
const MIGRATIONS = {
  // v3: bodyweight log, Settings fields (filled below), and the rest of the old app's logs.
  3: (db, legacy, now) => {
    db.body = db.body && typeof db.body === "object" ? db.body : {};
    db.body.weight = Array.isArray(db.body.weight) ? db.body.weight : [];
    return legacy ? importLegacy(db, legacy, now) : db;
  },
};

/**
 * Bring any stored value up to the current schema. Unknown fields are kept.
 * `legacy` is the parsed uptime1 object (or null), used only when there's no v2 record yet.
 */
export function migrate(raw, legacy = null, plan = PLAN, now = Date.now()) {
  if (!raw || typeof raw !== "object") return importLegacy(emptyDB(plan), legacy, now);
  let db = raw;
  const from = Number(db.v) || SCHEMA;
  if (from > SCHEMA) throw new Error(`Saved data is from a newer version (${from}).`);
  for (let v = from + 1; v <= SCHEMA; v++) if (MIGRATIONS[v]) db = MIGRATIONS[v](db, legacy, now);
  // Fill anything missing without touching what's there.
  const base = emptyDB(plan);
  db.v = SCHEMA;
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.activities = Array.isArray(db.activities) ? db.activities : [];
  db.settings = { ...base.settings, ...(db.settings || {}) };
  db.settings.swapsAlways = { ...(db.settings.swapsAlways || {}) };
  db.body = db.body && typeof db.body === "object" ? db.body : { weight: [] };
  db.body.weight = Array.isArray(db.body.weight) ? db.body.weight : [];
  if (db.active === undefined) db.active = null;
  // Runs are no longer tracked step by step: an old run in progress becomes a logged run.
  if (db.active?.kind === "run") {
    const r = db.active;
    if (r.log?.length) db.activities.push({ id: r.id, date: r.date, t: r.startedAt, kind: "run", run: r.run, partial: true });
    db.active = null;
  }
  return db;
}

export function createStore(storage = globalThis.localStorage, plan = PLAN) {
  let db;
  let loadError = null;
  let migrated = null;
  const read = (k) => {
    try {
      const s = storage?.getItem(k);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };
  const text = (k) => {
    try { return storage?.getItem(k) ?? null; } catch { return null; }
  };
  /** Keep a copy of the stored text before a migration changes it. Written once per version. */
  function backupBefore(version, rawText, legacyText) {
    const k = BACKUP_PREFIX + version;
    try {
      if (storage.getItem(k) != null) return true;
      storage.setItem(k, JSON.stringify({ at: Date.now(), from: version, [KEY]: rawText, [LEGACY_KEY]: legacyText }));
      return true;
    } catch {
      return false;
    }
  }
  function load() {
    let raw = null;
    loadError = null;
    migrated = null;
    const rawText = text(KEY);
    try {
      raw = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      // Unreadable record: keep it where it is (never overwrite) and run from memory.
      loadError = e;
    }
    const from = raw && typeof raw === "object" ? Number(raw.v) || SCHEMA : null;
    const legacyText = !loadError && (from == null || from < SCHEMA) ? text(LEGACY_KEY) : null;
    try {
      db = migrate(raw, legacyText ? read(LEGACY_KEY) : null, plan);
    } catch (e) {
      loadError = e;
      db = emptyDB(plan);
    }
    // First load after an update (or the first open after the old app): back up, then save
    // the migrated record straight away. If the backup can't be written, run from memory and
    // leave the stored text alone until it can.
    const needs = !loadError && ((from != null && from < SCHEMA) || (from == null && db.legacy));
    if (needs) {
      const version = from ?? 1;
      if (backupBefore(version, rawText, legacyText)) {
        migrated = { from: version, at: Date.now() };
        save();
      }
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
  /** Snapshot before an import or reset, so it can be undone even after a reload. */
  function backupLast(reason) {
    try {
      storage.setItem(LAST_BACKUP_KEY, JSON.stringify({ at: Date.now(), reason, data: db }));
      return true;
    } catch {
      return false;
    }
  }
  function lastBackup() {
    const b = read(LAST_BACKUP_KEY);
    return b && b.data && typeof b.data === "object" ? b : null;
  }
  /** Replace the whole record (import, reset, undo). Backs up first; refuses if it can't. */
  function replace(next, reason) {
    if (loadError) return { ok: false, readOnly: true };
    if (reason && !backupLast(reason)) return { ok: false, error: new Error("Couldn't keep a backup copy first.") };
    const prev = db;
    db = next;
    const r = save();
    if (!r.ok) db = prev;
    return r;
  }
  /** Put back the copy from before the last import or reset. */
  function restoreLast() {
    const b = lastBackup();
    if (!b) return { ok: false };
    const cur = db;
    const r = replace(migrate(b.data, null, plan), null);
    if (r.ok) try { storage.setItem(LAST_BACKUP_KEY, JSON.stringify({ at: Date.now(), reason: `undo ${b.reason}`, data: cur })); } catch { /* the restore itself worked */ }
    return { ...r, reason: b.reason };
  }
  load();
  return {
    get db() { return db; },
    get readOnly() { return !!loadError; },
    get migrated() { return migrated; },
    load,
    save,
    replace,
    lastBackup,
    restoreLast,
  };
}

// ------------------------------------------------------------------ export / import

/** The backup file's contents. Everything, as stored. */
export function exportJSON(db, now = Date.now()) {
  return JSON.stringify({ app: "uptime", exportedAt: new Date(now).toISOString(), data: db }, null, 1);
}

/**
 * Read a backup file. Accepts this app's export, a raw uptime2 record, or the old app's
 * uptime1 record. Returns { db } or { error } with a plain-words reason. Never throws.
 */
export function parseImport(textIn, plan = PLAN, now = Date.now()) {
  let o;
  try { o = JSON.parse(textIn); } catch { return { error: "That file isn't a backup: it couldn't be read as JSON." }; }
  if (o && o.app === "uptime" && o.data) o = o.data;
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "That file isn't an Uptime backup." };
  try {
    if (Array.isArray(o.sessions) || Array.isArray(o.activities)) {
      if (!(Number(o.v) >= 2)) o.v = 2;
      return { db: migrate(structuredClone(o), null, plan, now) };
    }
    if (o.sets && typeof o.sets === "object") {
      const db = migrate(null, o, plan, now);
      if (db.legacy) return { db, legacy: true };
    }
  } catch (e) {
    return { error: e.message || "That backup couldn't be read." };
  }
  return { error: "That file isn't an Uptime backup." };
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
    if (a.kind === "run") out.push({ date: a.date, t: a.t, kind: "run", run: a.run, km: a.km, checkIn: a.checkIn });
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
