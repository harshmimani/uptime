// Storage v3 migration and backups, export/import/reset undo, Progress numbers, units.
import { test } from "node:test";
import assert from "node:assert/strict";
import PLAN from "../js/plan.js";
import { createStore, migrate, exportJSON, parseImport, emptyDB, KEY, LEGACY_KEY, SCHEMA, BACKUP_PREFIX, LAST_BACKUP_KEY } from "../js/store.js";
import * as P from "../js/progress-data.js";
import { setUnits, toUnit, fromUnit, fmtW, weightStep } from "../js/units.js";
import * as M from "../js/workout/model.js";

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

const OLD = {
  v: 1,
  sets: {
    "2026-10-20|dumbbell-bench-press": [{ t: 1, kg: 12.5, r: 8 }],
    "2026-11-02|dumbbell-bench-press": [{ t: 2, kg: 15, r: 8 }, { t: 3, kg: 15, r: 6 }],
    "2026-11-03|pull-up": [{ t: 4, r: 2 }],
    "2026-10-25|five-k-time-trial": [{ t: 5, sec: 1720 }],
  },
  body: { w: { "2026-11-01": 74.2, "2026-11-03": "73.8", "2026-11-04": "" }, waist: { "2026-11-01": 82 }, photos: {} },
  tests: { fivek: [{ d: "2026-11-10", sec: 1690 }], broad: { "2026-11-10": 210 } },
  ladder: { level: 3, log: [{ d: "2026-11-01", level: 2, act: "pass" }] },
  play: { "2026-11-05": "basketball", "2026-11-06": "none" },
  protein: { "2026-11-05": [{ n: "dal", g: 9 }] },
};

const V2 = {
  v: 2,
  sessions: [{ id: "s1", date: "2026-11-24", t: 1, session: "UA", name: "Upper A", items: [{ key: "1", ex: "dumbbell-bench-press", role: "main", sets: [{ kg: 17.5, reps: 8 }] }] }],
  activities: [{ id: "r1", date: "2026-11-25", t: 2, kind: "run", run: "tempo", time: "10k 52:30" }],
  settings: { sound: false, busyWeekdays: [2] },
  active: null,
  legacy: { from: "uptime1", at: 5, sets: { "2026-11-02|dumbbell-bench-press": [{ t: 2, kg: 15, reps: 8 }] } },
};

test("first load after the old app: everything migrates, a backup is kept, uptime1 untouched", () => {
  const st = memStorage({ [LEGACY_KEY]: JSON.stringify(OLD) });
  const store = createStore(st);
  assert.equal(store.migrated.from, 1);
  const saved = JSON.parse(st.map.get(KEY));
  assert.equal(saved.v, SCHEMA); // saved straight away
  assert.deepEqual(saved.body.weight.map((w) => [w.date, w.kg]), [["2026-11-01", 74.2], ["2026-11-03", 73.8]]);
  assert.deepEqual(saved.legacy.fiveK, [{ date: "2026-10-25", sec: 1720 }, { date: "2026-11-10", sec: 1690 }]);
  assert.equal(saved.legacy.ladder.level, 3);
  assert.deepEqual(saved.legacy.play, { "2026-11-05": "basketball" });
  assert.equal(st.map.get(LEGACY_KEY), JSON.stringify(OLD));
  const backup = JSON.parse(st.map.get(BACKUP_PREFIX + 1));
  assert.equal(backup[LEGACY_KEY], JSON.stringify(OLD));
  // second load: nothing to migrate, backup not rewritten
  const again = createStore(st);
  assert.equal(again.migrated, null);
  assert.equal(JSON.parse(st.map.get(BACKUP_PREFIX + 1)).at, backup.at);
});

test("v2 record migrates to v3 with a raw backup; nothing is lost; old app extras join in", () => {
  const raw = JSON.stringify(V2);
  const st = memStorage({ [KEY]: raw, [LEGACY_KEY]: JSON.stringify(OLD) });
  const store = createStore(st);
  assert.equal(store.migrated.from, 2);
  assert.equal(JSON.parse(st.map.get(BACKUP_PREFIX + 2))[KEY], raw);
  const db = store.db;
  assert.equal(db.v, 3);
  assert.equal(db.sessions.length, 1);
  assert.equal(db.activities[0].time, "10k 52:30");
  assert.equal(db.settings.sound, false);
  assert.deepEqual(db.settings.busyWeekdays, [2]);
  assert.equal(db.settings.units, "kg");
  assert.equal(db.settings.sportName, "Basketball");
  assert.equal(db.settings.vibrate, true);
  assert.equal(db.body.weight.length, 2);
  assert.equal(db.legacy.at, 5); // kept
  assert.ok(db.legacy.sets["2026-10-20|dumbbell-bench-press"]);
  assert.equal(JSON.parse(st.map.get(KEY)).v, 3);
});

test("an unreadable record is never overwritten, even by the migration", () => {
  const st = memStorage({ [KEY]: "{oops", [LEGACY_KEY]: JSON.stringify(OLD) });
  const store = createStore(st);
  assert.equal(store.readOnly, true);
  assert.equal(st.map.get(KEY), "{oops");
  assert.equal(store.replace(emptyDB(), "x").ok, false);
});

test("export → import round trip; old app files import too; junk is refused", () => {
  const db = migrate(structuredClone(V2));
  const back = parseImport(exportJSON(db));
  assert.deepEqual(back.db.sessions, db.sessions);
  assert.equal(back.db.v, SCHEMA);
  const old = parseImport(JSON.stringify(OLD));
  assert.equal(old.legacy, true);
  assert.equal(old.db.body.weight.length, 2);
  assert.ok(parseImport("not json").error);
  assert.ok(parseImport("[1,2]").error);
  assert.ok(parseImport(JSON.stringify({ hello: 1 })).error);
  assert.ok(parseImport(JSON.stringify({ v: 99, sessions: [] })).error);
});

test("replace keeps a backup first and restoreLast undoes it (twice = redo)", () => {
  const st = memStorage({ [KEY]: JSON.stringify(migrate(structuredClone(V2))) });
  const store = createStore(st);
  assert.equal(store.replace(emptyDB(), "erasing everything").ok, true);
  assert.equal(store.db.sessions.length, 0);
  assert.equal(store.lastBackup().reason, "erasing everything");
  // survives a reload
  const s2 = createStore(st);
  const r = s2.restoreLast();
  assert.equal(r.ok, true);
  assert.equal(s2.db.sessions.length, 1);
  assert.equal(JSON.parse(st.map.get(KEY)).sessions.length, 1);
  assert.equal(JSON.parse(st.map.get(LAST_BACKUP_KEY)).data.sessions.length, 0);
});

test("replace refuses when no backup copy can be kept", () => {
  const st = memStorage({ [KEY]: JSON.stringify(migrate(structuredClone(V2))) });
  const store = createStore(st);
  st.setItem = (k, v) => { if (k === LAST_BACKUP_KEY) throw new Error("full"); st.map.set(k, v); };
  assert.equal(store.replace(emptyDB(), "erase").ok, false);
  assert.equal(store.db.sessions.length, 1);
});

// ------------------------------------------------------------------ progress numbers

const sess = (date, session, items = []) => ({ id: date + session, date, t: Date.parse(date), session, name: session, items });
const bench = (kg, reps) => ({ key: "1", ex: "dumbbell-bench-press", role: "main", sets: [{ kg, reps }, { kg: kg - 2.5, reps: reps + 2 }] });

test("week history and streak: rolling 7-day blocks, best streak remembered", () => {
  const db = migrate(null);
  // weeks anchored on 2026-10-01: two good blocks, a gap block, then one block
  for (const d of ["2026-10-01", "2026-10-03", "2026-10-08", "2026-10-10", "2026-10-22", "2026-10-24"]) db.sessions.push(sess(d, "UA"));
  const s = P.streakInfo(db, "2026-10-28");
  assert.equal(s.weeks, 1);
  assert.equal(s.best, 2);
  const h = P.weekHistory(db, "2026-10-28", 4);
  assert.equal(h.length, 4);
  assert.equal(h[0].current, true);
  assert.equal(h[0].lifts, 2);
  assert.equal(h[0].level, "Minimum");
  assert.equal(h[1].lifts, 0);
});

test("lift trend uses the top set per session, including old-app history", () => {
  const db = migrate(structuredClone(V2));
  db.sessions.push(sess("2026-11-26", "UA", [bench(20, 6)]));
  const t = P.liftTrend(db, "dumbbell-bench-press");
  assert.deepEqual(t.map((p) => [p.date, p.kg]), [["2026-11-02", 15], ["2026-11-24", 17.5], ["2026-11-26", 20]]);
  assert.equal(t[2].reps, 6);
  assert.deepEqual(P.mainLifts(), ["dumbbell-bench-press", "smith-machine-back-squat", "standing-dumbbell-overhead-press", "barbell-deadlift"]);
});

test("pull-up max: best strict set per day; ladder drills don't count", () => {
  const db = migrate(null, OLD);
  db.sessions.push(sess("2026-11-20", "UA", [{ key: "0", ex: "pull-up", role: "main", sets: [{ reps: 3 }, { reps: 4 }, { reps: 2 }] }, { key: "x", ex: "negative-pull-up", sets: [{ reps: 5 }] }]));
  assert.deepEqual(P.pullUpTrend(db), [{ date: "2026-11-03", reps: 2 }, { date: "2026-11-20", reps: 4 }]);
});

test("5K trend: typed time lines as 5K-equivalents plus old time trials; nothing else", () => {
  const db = migrate(null, OLD);
  db.activities.push({ id: "a", date: "2026-11-25", kind: "run", run: "long", time: "10k 52:30" });
  db.activities.push({ id: "b", date: "2026-11-26", kind: "run", run: "tempo" });
  db.activities.push({ id: "c", date: "2026-11-27", kind: "run", run: "tempo", time: "felt good" });
  const t = P.fiveKTrend(db);
  assert.deepEqual(t.map((p) => p.date), ["2026-10-25", "2026-11-10", "2026-11-25"]);
  assert.ok(t[2].sec > 1490 && t[2].sec < 1520, String(t[2].sec)); // 52:30 10K ≈ 25:10 5K
});

test("weekly bodyweight: averages per rolling 7-day block, empty blocks skipped", () => {
  const db = migrate(null);
  db.body.weight = [
    { date: "2026-11-26", kg: 72 }, { date: "2026-11-24", kg: 73 },
    { date: "2026-11-18", kg: 74 }, { date: "2026-11-05", kg: 75 },
  ];
  const w = P.weeklyWeight(db, "2026-11-26", 4);
  assert.deepEqual(w.map((x) => [x.end, x.kg, x.count]), [["2026-11-05", 75, 1], ["2026-11-19", 74, 1], ["2026-11-26", 72.5, 2]]);
  assert.equal(P.latestWeight(db).kg, 72);
});

test("protein target follows the plan's g/kg range", () => {
  assert.deepEqual(P.proteinTarget(70), [110, 140]);
  assert.equal(PLAN.food.protein.perKg[0], 1.6);
  assert.ok(PLAN.learn.every((l) => l.title && l.points.length >= 3));
  for (const l of PLAN.learn) for (const ex of l.exercises || []) assert.ok(PLAN.exercises[ex]?.cue, ex);
});

test("units: stored kg, shown in lb on request; model text follows", () => {
  setUnits("lb");
  try {
    assert.equal(toUnit(20), 44);
    assert.equal(fmtW(17.5), "38.5");
    assert.ok(Math.abs(fromUnit(100) - 45.359) < 0.01);
    assert.ok(Math.abs(weightStep() - 2.268) < 0.01);
    assert.equal(M.lastTimeText({ sets: [{ kg: 20, reps: 8 }, { kg: 20, reps: 7 }] }), "44 lb × 8, 7");
  } finally {
    setUnits("kg");
  }
  assert.equal(fmtW(17.5), "17.5");
  assert.equal(M.lastTimeText({ sets: [{ kg: 20, reps: 8 }] }), "20 kg × 8");
});
