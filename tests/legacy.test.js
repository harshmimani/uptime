// The earlier apps' data (uptime1, fm3, kg:<slug>, their CSV exports), the old-to-new exercise
// mapping, and the how-to guide every exercise needs (muscles, steps, mistake, YouTube).
import { test } from "node:test";
import assert from "node:assert/strict";
import PLAN from "../js/plan.js";
import {
  createStore, migrate, parseImport, parseOldCSV, fm3Sets, combineOld, exerciseHistory, legacyReport, legacyTarget,
  oldLastKg, importLegacy, emptyDB, KEY, LEGACY_KEY, OLDER_KEY, SCHEMA, BACKUP_PREFIX,
} from "../js/store.js";
import * as M from "../js/workout/model.js";
import * as P from "../js/progress-data.js";
import { MUSCLE_NAMES, guideFor, youtubeURL, coverage, mapSVG, muscleLine } from "../js/muscles.js";

// localStorage-like, with key()/length so the kg:<slug> keys can be found
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, map: m,
  };
}

const UPTIME1 = {
  v: 1,
  sets: {
    "2026-11-20|dumbbell-bench-press": [{ t: 1, kg: 15, r: 8 }, { t: 2, kg: 15, r: 7 }],
    "2026-11-21|smith-machine-back-squat": [{ t: 3, kg: 40, r: 8 }],
    "2026-11-21|pull-up": [{ t: 4, r: 0 }],
    "2026-11-22|incline-dumbbell-curl": [{ t: 5, kg: 8, r: 10 }],
    "2026-11-22|one-arm-dumbbell-row": [{ t: 6, kg: 0, r: 10 }], // box left empty
  },
  kg: { "barbell-deadlift": "70", "hammer-curl": "" },
};
// fm3: week 2, day 1 (Tuesday 20 Oct from a 12 Oct start), one set with a timestamp
const FM3 = {
  sets: {
    "w2:1:dumbbell-romanian-deadlift": [{ kg: 17.5, r: 10 }],
    "w2:3:cable-overhead-triceps-extension": [{ kg: 12.5, r: 12, t: new Date(2026, 9, 23, 7).getTime() }],
  },
  kg: { "single-leg-calf-raise": "10" },
};

test("v3 record: v4 re-reads uptime1, fm3 and kg:<slug>, keeps what's there, backs up every old key", () => {
  const v3 = { ...emptyDB(), v: 3, legacy: { from: "uptime1", at: 9, sets: { "2026-11-20|dumbbell-bench-press": [{ t: 1, kg: 15, reps: 8 }] } } };
  const st = memStorage({ [KEY]: JSON.stringify(v3), [LEGACY_KEY]: JSON.stringify(UPTIME1), [OLDER_KEY]: JSON.stringify(FM3), "kg:barbell-back-squat": "60", "kg:lateral-raises": "5" });
  const store = createStore(st);
  assert.equal(store.migrated.from, 3);
  const db = store.db;
  assert.equal(db.v, SCHEMA);
  assert.equal(db.legacy.at, 9);
  assert.deepEqual(db.legacy.sets["2026-11-20|dumbbell-bench-press"], [{ t: 1, kg: 15, reps: 8 }]); // kept as it was
  assert.ok(db.legacy.sets["2026-10-20|dumbbell-romanian-deadlift"], "fm3 week maths");
  assert.ok(db.legacy.sets["2026-10-23|cable-overhead-triceps-extension"], "fm3 timestamp wins");
  assert.deepEqual(db.legacy.lastKg, { "barbell-back-squat": 60, "lateral-raises": 5, "single-leg-calf-raise": 10, "barbell-deadlift": 70 });
  assert.equal(db.legacy.sets["2026-11-22|one-arm-dumbbell-row"][0].kg, null, "0 kg was an empty box");
  const backup = JSON.parse(st.map.get(BACKUP_PREFIX + 3));
  assert.equal(backup[KEY], JSON.stringify(v3));
  assert.equal(backup[OLDER_KEY], JSON.stringify(FM3));
  assert.equal(backup["kg:barbell-back-squat"], "60");
  // old keys are never written
  assert.equal(st.map.get(LEGACY_KEY), JSON.stringify(UPTIME1));
  assert.equal(st.map.get(OLDER_KEY), JSON.stringify(FM3));
  assert.equal(createStore(st).migrated, null, "once only");
});

test("no uptime1 at all: fm3 alone (or kg keys alone) still comes across", () => {
  const st = memStorage({ [OLDER_KEY]: JSON.stringify(FM3) });
  const db = createStore(st).db;
  assert.equal(exerciseHistory(db, "dumbbell-romanian-deadlift").length, 1);
  assert.equal(exerciseHistory(db, "overhead-cable-extension")[0].sets[0].kg, 12.5, "mapped by movement");
  const st2 = memStorage({ "kg:dumbbell-bench-press": "12.5" });
  assert.equal(oldLastKg(createStore(st2).db, "dumbbell-bench-press"), 12.5);
});

test("mapping: same movement and equipment counts; different equipment is kept but not mapped", () => {
  assert.equal(legacyTarget("pull-ups"), "pull-up");
  assert.equal(legacyTarget("standing-dumbbell-shoulder-press"), "standing-dumbbell-overhead-press");
  assert.equal(legacyTarget("dumbbell-bench-press"), "dumbbell-bench-press");
  assert.equal(legacyTarget("barbell-back-squat"), null);
  assert.equal(legacyTarget("barbell-bench-press"), null);
  assert.equal(legacyTarget("something-unknown"), null);
  for (const [id, m] of Object.entries(PLAN.legacyIds)) {
    if (m.to) assert.ok(PLAN.exercises[m.to], `${id} → ${m.to} exists`);
    else assert.ok(m.skip || m.why, `${id} says why it isn't mapped`);
    assert.ok(!PLAN.exercises[id] || m.to === id, `${id} is a plan id, so it must map to itself`);
  }
});

test("legacyReport lists matched first, says why the rest aren't mapped, hides runs and timed workouts", () => {
  const db = migrate(null, combineOld({ uptime1: { ...UPTIME1, sets: { ...UPTIME1.sets, "2026-11-01|easy-run": [{ t: 1, r: 5 }], "2026-11-02|emom-burpee-shuffle": [{ t: 1, r: 6 }] } }, kgKeys: { "barbell-back-squat": "60" } }));
  const rows = legacyReport(db);
  const ids = rows.map((r) => r.id);
  assert.ok(!ids.includes("easy-run") && !ids.includes("emom-burpee-shuffle"));
  const bench = rows.find((r) => r.id === "dumbbell-bench-press");
  assert.deepEqual([bench.to, bench.last.kg, bench.last.reps, bench.sessions], ["dumbbell-bench-press", 15, 8, 1]);
  const squat = rows.find((r) => r.id === "barbell-back-squat");
  assert.equal(squat.to, null);
  assert.match(squat.why, /split squat/);
  assert.equal(squat.lastKg, 60);
  const firstUnmatched = rows.findIndex((r) => !r.to);
  assert.ok(rows.slice(firstUnmatched).every((r) => !r.to), "matched first");
});

test("old weights prefill the workout and show in Progress", () => {
  const db = migrate(null, combineOld({ uptime1: UPTIME1 }));
  const hist = (ex) => exerciseHistory(db, ex);
  hist.lastKg = (ex) => oldLastKg(db, ex);
  const w = M.newWorkout({ id: "w", sessionId: "UA", date: "2026-11-26", now: 0, checkIn: "Good" });
  const bench = w.items.find((x) => x.ex === "dumbbell-bench-press");
  M.jumpTo(w, bench.key);
  const p = M.prefill(w, bench.key, hist);
  assert.equal(p.kg, 15);
  assert.equal(p.target.kind, "beat");
  // deadlift: only a typed weight from the old app, no dated set
  const lb = M.newWorkout({ id: "w2", sessionId: "LB", date: "2026-11-26", now: 0, checkIn: "Good" });
  const dl = lb.items.find((x) => x.ex === "barbell-deadlift");
  M.jumpTo(lb, dl.key);
  assert.equal(M.prefill(lb, dl.key, hist).kg, 70);
  assert.equal(M.prefill(lb, dl.key, (ex) => exerciseHistory(db, ex)).kg, 62.5, "without it: the plan's start");
  // Progress: main lift trend and every other lift
  assert.equal(P.liftTrend(db, "smith-machine-back-squat")[0].kg, 40);
  const other = P.otherLifts(db);
  assert.ok(other.every((o) => !P.mainLifts().includes(o.ex)));
  assert.ok(!other.some((o) => ["one-arm-dumbbell-row", "dumbbell-bent-over-row"].includes(o.ex)), "no weight, no row");
});

test("old CSV exports import (both formats); old backups import as additions", () => {
  const csv2 = `"date","exercise","set","kg","reps_or_units","score"\n"2026-11-20","Dumbbell bench press","1","15","8",""\n"2026-11-20","Pull-up attempt + 2 negatives","1","","1",""\n"2026-11-21","Body weight","","","73.5",""\n"2026-11-21","5K time (s)","","","1690",""`;
  const o = parseOldCSV(csv2);
  assert.deepEqual(o.sets["2026-11-20|dumbbell-bench-press"], [{ t: 1, kg: 15, r: 8 }]);
  assert.equal(legacyTarget("pull-up-attempt-2-negatives"), "pull-up-attempt");
  assert.equal(o.body.w["2026-11-21"], 73.5);
  const csv1 = `"date","week","day","exercise","set","kg","reps_or_m"\r\n"2026-10-13","1","Mon","Barbell deadlift","1","60","5"\r\n"","1","Tue","Hammer curl","1","8","12"`;
  const o1 = parseOldCSV(csv1);
  assert.deepEqual(Object.keys(o1.sets), ["2026-10-13|barbell-deadlift"]);
  const r = parseImport(csv2);
  assert.equal(r.legacy, true);
  assert.ok(r.db.legacy.sets["2026-11-20|dumbbell-bench-press"]);
  assert.ok(parseImport(`"date","foo"\n"x","y"`).error);
  // fm3 JSON backup
  const f = parseImport(JSON.stringify(FM3));
  assert.equal(f.legacy, true);
  assert.ok(f.db.legacy.sets["2026-10-20|dumbbell-romanian-deadlift"]);
  // adding to a record that already has new sessions keeps them
  const cur = { ...emptyDB(), sessions: [{ id: "s", date: "2026-11-25", t: 1, session: "UA", items: [] }] };
  const next = importLegacy(structuredClone(cur), f.old);
  assert.equal(next.sessions.length, 1);
  assert.ok(next.legacy.sets["2026-10-20|dumbbell-romanian-deadlift"]);
});

test("fm3 keys without a timestamp use the old week maths", () => {
  assert.deepEqual(Object.keys(fm3Sets({ "w1:0:pull-up": [{ r: 1 }], "bad": [] })), ["2026-10-12|pull-up"]);
});

// ------------------------------------------------------------------ guide

test("every exercise has muscles, 3–4 steps, a mistake and a YouTube search", () => {
  for (const ex of Object.keys(PLAN.exercises)) {
    const g = guideFor(ex);
    assert.ok(g.m.length >= 1, `${ex}: main muscles`);
    for (const k of [...g.m, ...g.s]) assert.ok(MUSCLE_NAMES[k], `${ex}: known muscle ${k}`);
    assert.ok(!g.m.some((k) => g.s.includes(k)), `${ex}: a muscle is main or secondary, not both`);
    assert.ok(g.steps.length >= 3 && g.steps.length <= 4, `${ex}: 3–4 steps`);
    assert.ok(g.mistake && g.mistake.length > 10, `${ex}: mistake`);
    assert.match(youtubeURL(ex), /^https:\/\/www\.youtube\.com\/results\?search_query=[^&]+$/);
    assert.ok(muscleLine(ex));
  }
  assert.equal(youtubeURL("dumbbell-bench-press"), "https://www.youtube.com/results?search_query=Dumbbell%20bench%20press");
  assert.deepEqual(Object.keys(PLAN.guide).filter((k) => !PLAN.exercises[k]), [], "no guide for a missing exercise");
});

test("muscle map highlights main and secondary muscles", () => {
  const svg = mapSVG(["quads"], ["glutes"]);
  assert.equal((svg.match(/class="mm-main"/g) || []).length, 2);
  assert.equal((svg.match(/class="mm-also"/g) || []).length, 2);
  assert.match(svg, /aria-label="Works quads; also glutes"/);
});

test("coverage counts main-muscle sets per session", () => {
  const sessions = PLAN.rules.rotation.map((id) => ({ id, items: M.buildItems(id) }));
  const rows = coverage(sessions);
  const quads = rows.find((r) => r.label === "Quads");
  const la = sessions.findIndex((s) => s.id === "LA"), ua = sessions.findIndex((s) => s.id === "UA");
  assert.ok(quads.cells[la] >= 6);
  assert.equal(quads.cells[ua], 0);
  assert.ok(rows.find((r) => r.label === "Back").cells[ua] > 0);
});

test("up next: the next set, then the next different exercise", () => {
  const w = M.newWorkout({ id: "w", sessionId: "LB", date: "2026-11-26", now: 0, checkIn: "Good" });
  const first = M.item(w, w.cur);
  const u = M.upNext(w);
  assert.equal(u.item.key, first.key);
  assert.equal(u.n, 1);
  assert.notEqual(u.then.key, first.key);
  // once every set of the first is logged, the focus is the next exercise
  for (let i = 0; i < first.sets; i++) M.logSet(w, { reps: 3 }, i);
  assert.equal(M.upNext(w).item.key, u.then.key);
});

test("old training days count in the Rolling weeks chart, never in the rotation", () => {
  const old = { v: 1, sets: { "2026-11-20|dumbbell-bench-press": [{ t: 1, kg: 15, r: 8 }], "2026-11-22|smith-machine-back-squat": [{ t: 2, kg: 40, r: 8 }], "2026-11-23|easy-run": [{ t: 3, r: 1 }] } };
  const db = migrate(null, combineOld({ uptime1: old }));
  const wk = P.weekHistory(db, "2026-11-26", 1)[0];
  assert.equal(wk.lifts, 2);
  assert.equal(wk.level, "Minimum");
  assert.equal(P.progressLog(db).filter((e) => e.legacy).length, 2, "runs from the old app aren't sessions");
  assert.equal(engineLogLen(db), 0);
});
import { engineLog } from "../js/store.js";
const engineLogLen = (db) => engineLog(db).length;

test("the 'your data moved' note shows once, even if a later load migrates again", () => {
  const v3 = { ...emptyDB(), v: 3 };
  const st = memStorage({ [KEY]: JSON.stringify(v3) });
  const store = createStore(st);
  assert.match(store.takeMigrationNotice(), /new format/);
  assert.equal(store.takeMigrationNotice(), null, "not twice on the same page");
  // a save that never landed would migrate again on the next open: still no second note
  st.map.set(KEY, JSON.stringify(v3));
  const again = createStore(st);
  assert.equal(again.migrated.from, 3);
  assert.equal(again.takeMigrationNotice(), null);
});
