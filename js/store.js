// Uptime storage: one versioned record in localStorage, with step-by-step migrations.
//
// Rules (CLAUDE.md, Engineering): never delete or corrupt the user's logs.
// - The new app writes only `uptime2`. The old apps' records are read to bring their history
//   across (so "last time" works from day one) and are never written or removed:
//     uptime1   the app before the redesign (Nov 2026)
//     fm3       the version before that (Oct 2026), keyed "w<week>:<day>:<slug>"
//     kg:<slug> the first versions (Oct 2026): one remembered weight per exercise, no dates
//   Old exercise ids stay as they were in `legacy.sets`; PLAN.legacyIds maps them to plan
//   exercises by movement when history is read, so a better mapping never needs a migration.
// - Every save reports whether it worked, so the UI can say so instead of losing a set.
// - Nothing here touches the DOM; `storage` is injectable so Node tests can run it.
//
// Shape (v4; v3 added body, legacy extras and the Settings fields; v4 re-reads every old key
//        and adds legacy.lastKg)
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
//     legacy: { from: "uptime1", at, sets: { "date|oldExerciseId": [{ t, kg, reps }] },
//               lastKg: { oldExerciseId: kg },     // last typed weight; used only before any dated set
//               fiveK: [{ date, sec }], ladder: { level, log }, broad: { date: cm },
//               waist: { date: cm }, play: { date: kind } } | absent
//   }
//
// Backups (never overwritten by the app's own saves):
//   uptime-backup-v1/-v2/-v3 the raw stored text (and every old key's text), written once before a migration from that version
//   uptime-backup-last       { at, reason, data } written before an import or a reset, for Undo

import PLAN from "./plan.js";

export const KEY = "uptime2";
export const LEGACY_KEY = "uptime1";
export const OLDER_KEY = "fm3";
export const SCHEMA = 4;
export const BACKUP_PREFIX = "uptime-backup-v";
export const LAST_BACKUP_KEY = "uptime-backup-last";
export const NOTICE_KEY = "uptime-notice-migrated"; // which migration's notice was already shown

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

/** Strength sets from the old app (`uptime1.sets`), keyed the same way. Other shapes are left behind in uptime1.
    A weight of 0 meant "box left empty" in the old app, so it becomes no weight. */
export function legacySets(old) {
  const out = {};
  if (!old || typeof old !== "object" || !old.sets || typeof old.sets !== "object") return out;
  for (const [k, list] of Object.entries(old.sets)) {
    if (!/^\d{4}-\d{2}-\d{2}\|[\w-]+$/.test(k) || !Array.isArray(list)) continue;
    const sets = list
      .filter((s) => s && typeof s === "object" && (s.r != null || s.kg != null))
      .map((s) => ({ t: Number(s.t) || 0, kg: s.kg == null || s.kg === "" || !(Number(s.kg) > 0) ? null : Number(s.kg), reps: s.r == null ? null : Number(s.r) }))
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

/** Last typed weight per old exercise id (the `kg` map of uptime1/fm3, or kg:<slug> keys). Real weights only. */
export function legacyLastKg(old) {
  const out = {};
  for (const [id, v] of Object.entries(old?.kg || {})) {
    const kg = num(v);
    if (/^[\w-]+$/.test(id) && kg > 0 && kg < 500) out[id] = kg;
  }
  return out;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const FM3_START = [2026, 9, 12]; // fm3's week 1 Monday, as the uptime1 app converted it
function localIso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** fm3 sets ("w<week>:<day>:<slug>") in uptime1's "date|id" shape. A set's own timestamp wins over the week maths. */
export function fm3Sets(sets) {
  const out = {};
  for (const [k, list] of Object.entries(sets || {})) {
    const m = k.match(/^w(\d+):(\d+):([\w-]+)$/);
    if (!m || !Array.isArray(list)) continue;
    const t = list.find((s) => s && Number(s.t) > 0)?.t;
    const d = t ? new Date(Number(t)) : new Date(FM3_START[0], FM3_START[1], FM3_START[2] + (Number(m[1]) - 1) * 7 + Number(m[2]));
    const key = `${localIso(d)}|${m[3]}`;
    out[key] = [...(out[key] || []), ...list];
  }
  return out;
}

/**
 * Everything the earlier apps left, as one uptime1-shaped object (or null when there's nothing).
 * uptime1 wins where they overlap (it already holds fm3's sets if it converted them).
 */
export function combineOld({ uptime1 = null, fm3 = null, kgKeys = {} } = {}) {
  const o1 = uptime1 && typeof uptime1 === "object" && !Array.isArray(uptime1) ? uptime1 : null;
  const o3 = fm3 && typeof fm3 === "object" && !Array.isArray(fm3) ? fm3 : null;
  const anyKg = Object.keys(kgKeys || {}).length > 0;
  if (!o1 && !o3 && !anyKg) return null;
  return {
    ...(o1 || {}),
    sets: { ...fm3Sets(o3?.sets), ...(o1?.sets || {}) },
    kg: { ...(kgKeys || {}), ...(o3?.kg || {}), ...(o1?.kg || {}) },
  };
}

/** Read every old-app key (never writes). { old: combineOld(...), texts: { key: raw stored text } } */
export function readOldSources(storage) {
  const texts = {};
  const get = (k) => { try { return storage?.getItem(k) ?? null; } catch { return null; } };
  const parse = (k) => {
    const t = get(k);
    if (t == null) return null;
    texts[k] = t;
    try { return JSON.parse(t); } catch { return null; }
  };
  const uptime1 = parse(LEGACY_KEY);
  const fm3 = parse(OLDER_KEY);
  const kgKeys = {};
  try {
    const n = Number(storage?.length) || 0;
    for (let i = 0; i < n; i++) {
      const k = storage.key(i);
      if (!k || !/^kg:[\w-]+$/.test(k)) continue;
      texts[k] = get(k);
      kgKeys[k.slice(3)] = texts[k];
    }
  } catch { /* a storage without key(): the JSON records are enough */ }
  return { old: combineOld({ uptime1, fm3, kgKeys }), texts };
}

/**
 * Bring the old apps' logs into `db` (sets → legacy.sets, last weights → legacy.lastKg,
 * bodyweight → body.weight, the rest → legacy). Never replaces anything already there.
 */
export function importLegacy(db, old, now = Date.now()) {
  const sets = legacySets(old);
  const x = legacyExtras(old);
  const lastKg = legacyLastKg(old);
  const has = Object.keys(sets).length || Object.keys(lastKg).length || x.weight.length || x.fiveK.length || x.ladder || Object.keys(x.broad).length || Object.keys(x.waist).length || Object.keys(x.play).length;
  if (!has) return db;
  const prev = db.legacy || {};
  const fk = new Map((prev.fiveK || []).map((f) => [f.date, f]));
  for (const f of x.fiveK) if (!fk.has(f.date)) fk.set(f.date, f);
  db.legacy = { ...prev, from: LEGACY_KEY, at: prev.at || now,
    sets: { ...sets, ...(prev.sets || {}) },
    lastKg: { ...lastKg, ...(prev.lastKg || {}) },
    fiveK: [...fk.values()].sort((a, b) => a.date.localeCompare(b.date)),
    ladder: prev.ladder || x.ladder,
    broad: { ...x.broad, ...(prev.broad || {}) }, waist: { ...x.waist, ...(prev.waist || {}) }, play: { ...x.play, ...(prev.play || {}) } };
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
  // v4: the old apps' data again, now from every key they used (uptime1, fm3, kg:<slug>),
  // plus their last typed weights. Sets already brought across stay as they are.
  4: (db, legacy, now) => (legacy ? importLegacy(db, legacy, now) : db),
};

/**
 * Bring any stored value up to the current schema. Unknown fields are kept.
 * `legacy` is the old apps' data (combineOld) or null.
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
  function backupBefore(version, rawText, oldTexts) {
    const k = BACKUP_PREFIX + version;
    try {
      if (storage.getItem(k) != null) return true;
      storage.setItem(k, JSON.stringify({ at: Date.now(), from: version, ...oldTexts, [KEY]: rawText, [LEGACY_KEY]: oldTexts[LEGACY_KEY] ?? null }));
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
    const old = !loadError && (from == null || from < SCHEMA) ? readOldSources(storage) : { old: null, texts: {} };
    try {
      db = migrate(raw, old.old, plan);
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
      if (backupBefore(version, rawText, old.texts)) {
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
    /**
     * The "your data moved" note, once: the text the first time a page asks after a migration,
     * then null (also after a reload, and when a later load runs the same migration again).
     */
    takeMigrationNotice() {
      if (!migrated) return null;
      const id = String(migrated.from);
      try {
        if (storage.getItem(NOTICE_KEY) === id) return null;
        storage.setItem(NOTICE_KEY, id);
      } catch { /* can't remember it: still shown only on this load */ }
      const text = migrated.from === 1 ? "Found your log from the earlier app. Everything is kept, with a backup copy." : "Your data moved to the new format. A backup copy is kept.";
      migrated = null;
      return text;
    },
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
  if (/^﻿?"?date"?,/i.test(String(textIn).trimStart())) {
    const old = parseOldCSV(textIn);
    if (!old) return { error: "That CSV isn't a lift log from the earlier app." };
    const db = migrate(null, old, plan, now);
    return db.legacy ? { db, legacy: true, old } : { error: "That CSV has no sets in it." };
  }
  try { o = JSON.parse(textIn); } catch { return { error: "That file isn't a backup: it couldn't be read as JSON." }; }
  if (o && o.app === "uptime" && o.data) o = o.data;
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "That file isn't an Uptime backup." };
  try {
    if (Array.isArray(o.sessions) || Array.isArray(o.activities)) {
      if (!(Number(o.v) >= 2)) o.v = 2;
      return { db: migrate(structuredClone(o), null, plan, now) };
    }
    if (o.sets && typeof o.sets === "object") {
      const isFm3 = Object.keys(o.sets).some((k) => /^w\d+:/.test(k));
      const old = combineOld(isFm3 ? { fm3: o } : { uptime1: o });
      const db = migrate(null, old, plan, now);
      if (db.legacy) return { db, legacy: true, old };
    }
  } catch (e) {
    return { error: e.message || "That backup couldn't be read." };
  }
  return { error: "That file isn't an Uptime backup." };
}

function csvRows(textIn) {
  const rows = [];
  let row = [], cell = "", q = false;
  const t = String(textIn).replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/**
 * The earlier apps' CSV exports as an uptime1-shaped object (or null):
 *   uptime-log-*.csv          date, exercise, set, kg, reps_or_units, score
 *   five-mornings-log-*.csv   date, week, day, exercise, set, kg, reps_or_m
 * Exercise names become old ids (slugs; PLAN.legacyIds maps them). Rows without a date are skipped.
 */
export function parseOldCSV(textIn) {
  const rows = csvRows(textIn);
  if (rows.length < 2) return null;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const iDate = head.indexOf("date"), iEx = head.indexOf("exercise"), iKg = head.indexOf("kg");
  const iReps = head.findIndex((h) => h.startsWith("reps"));
  if (iDate < 0 || iEx < 0 || iReps < 0) return null;
  const old = { sets: {}, body: { w: {}, waist: {} }, tests: { fivek: [], broad: {} } };
  rows.slice(1).forEach((r, n) => {
    const date = (r[iDate] || "").trim();
    if (!isoKey(date)) return;
    const name = (r[iEx] || "").trim();
    const val = num(r[iReps]);
    if (name === "Body weight") { if (val) old.body.w[date] = val; return; }
    if (name === "Waist (cm)") { if (val) old.body.waist[date] = val; return; }
    if (name === "5K time (s)") { if (val) old.tests.fivek.push({ d: date, sec: val }); return; }
    if (name === "Broad jump (cm)") { if (val) old.tests.broad[date] = val; return; }
    const id = slug(name);
    const kg = iKg >= 0 ? num(r[iKg]) : null;
    if (!id || (val == null && kg == null)) return;
    (old.sets[`${date}|${id}`] ||= []).push({ t: n + 1, kg, r: val });
  });
  return Object.keys(old.sets).length || Object.keys(old.body.w).length || old.tests.fivek.length ? old : null;
}

// ------------------------------------------------------------------ derived views

/**
 * The exercise an id's logs count as now: the plan exercise that lists it in `from` (it replaced
 * it with the same movement and weight, e.g. hammer curl → cross-body hammer curl), else itself.
 * The logs keep their own id; only reading follows the carry.
 */
const carryMaps = new WeakMap();
export function carriedTo(id, plan = PLAN) {
  if (!carryMaps.has(plan)) {
    const m = new Map();
    for (const [ex, e] of Object.entries(plan.exercises)) for (const old of e.from || []) m.set(old, ex);
    carryMaps.set(plan, m);
  }
  return carryMaps.get(plan).get(id) || id;
}

/** The plan exercise an old app's exercise id counts as (PLAN.legacyIds, else the same id), or null. */
export function legacyTarget(oldId, plan = PLAN) {
  const m = plan.legacyIds?.[oldId];
  if (m) return m.to ? carriedTo(m.to, plan) : null;
  return plan.exercises[oldId] ? carriedTo(oldId, plan) : null;
}

/** The old app's last typed weight for a plan exercise (kg or null). Used only before any dated set exists. */
export function oldLastKg(db, ex, plan = PLAN) {
  for (const [id, kg] of Object.entries(db.legacy?.lastKg || {})) if (kg > 0 && legacyTarget(id, plan) === ex) return kg;
  return null;
}

/**
 * What came across from the old apps, one row per old exercise, matched first:
 * [{ id, name, to, why, sessions, last: { date, kg, reps } | null, lastKg }]
 * `to` is the plan exercise it counts as; null means kept, but not part of this plan.
 * Runs and old timed workouts are left out (Strava has runs; scores aren't weights).
 */
export function legacyReport(db, plan = PLAN) {
  const by = new Map();
  const row = (id) => {
    if (!by.has(id)) {
      const m = plan.legacyIds?.[id];
      const to = legacyTarget(id, plan);
      by.set(id, { id, name: m?.name || plan.exercises[id]?.name || (id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ")),
        to, why: m?.why || null, skip: !!m?.skip || ["run", "sport", "conditioning"].includes(plan.exercises[to]?.kind),
        sessions: 0, last: null, lastKg: null });
    }
    return by.get(id);
  };
  for (const [k, sets] of Object.entries(db.legacy?.sets || {})) {
    const [date, id] = k.split("|");
    const r = row(id);
    r.sessions++;
    const top = Math.max(0, ...sets.map((s) => s.kg || 0));
    if (!r.last || date >= r.last.date) r.last = { date, kg: top || null, reps: sets.find((s) => (s.kg || 0) === top)?.reps ?? null };
  }
  for (const [id, kg] of Object.entries(db.legacy?.lastKg || {})) row(id).lastKg = kg;
  return [...by.values()].filter((r) => !r.skip).sort((a, b) => (!a.to - !b.to) || a.name.localeCompare(b.name));
}

let idn = 0;
export const newId = (prefix = "x") => `${prefix}${Date.now().toString(36)}${(idn++).toString(36)}`;

/**
 * A partial session saved with under half its planned sets (Exit › Save and finish after a set
 * or two). Its sets stay in history and count for each exercise's progress, but it isn't the
 * session: the rotation stays on it and it doesn't fill a slot of the week.
 */
export function isStub(s) {
  if (!s?.partial || !(s.planned > 0)) return false;
  const logged = (s.items || []).reduce((n, it) => n + (it.sets?.length || 0), 0);
  return logged * 2 < s.planned;
}

/** Log entries in the engine's shape (js/engine.js, "log entries"). Stubs (above) are left out. */
export function engineLog(db) {
  const out = [];
  for (const s of db.sessions) {
    if (isStub(s)) continue;
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
 * Every past session of one exercise, oldest first, including the logs of exercises it
 * replaced (`from` in js/plan.js):
 * [{ date, sets: [{ kg, reps, sec }], short, deload, reduced, legacy }]
 */
export function exerciseHistory(db, ex) {
  const byDate = new Map();
  for (const s of db.sessions) {
    const sets = s.items.filter((it) => carriedTo(it.ex) === ex).flatMap((it) => it.sets);
    if (!sets.length) continue;
    byDate.set(`${s.date}|${s.t}`, { date: s.date, t: s.t, sets, short: !!s.short, deload: !!s.deload, reduced: !!s.reduced, partial: !!s.partial });
  }
  for (const [k, sets] of Object.entries(db.legacy?.sets || {})) {
    const [date, id] = k.split("|");
    if (legacyTarget(id) !== ex) continue;
    const mine = sets.map(({ kg, reps }) => ({ kg: kg ?? undefined, reps: reps ?? undefined }));
    const prev = byDate.get(`${date}|legacy`); // two old names for one plan exercise on the same day
    byDate.set(`${date}|legacy`, { date, t: sets[0]?.t || 0, sets: prev ? [...prev.sets, ...mine] : mine, legacy: true });
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
