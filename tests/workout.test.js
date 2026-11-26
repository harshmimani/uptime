// Workout and run models, storage and migration.
import { test } from "node:test";
import assert from "node:assert/strict";
import PLAN from "../js/plan.js";
import * as M from "../js/workout/model.js";
import * as R from "../js/workout/run.js";
import { createStore, migrate, exerciseHistory, engineLog, KEY, LEGACY_KEY } from "../js/store.js";

const T0 = Date.UTC(2026, 10, 26, 7, 0);
const noHistory = () => [];
const mk = (opts = {}) => M.newWorkout({ id: "w1", sessionId: "UA", date: "2026-11-26", now: T0, checkIn: "Good", ...opts });

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test("Upper A builds from the plan with the ladder slot filled", () => {
  const w = mk();
  assert.equal(w.items[0].ex, "negative-pull-up");
  assert.equal(w.items[0].role, "main");
  assert.equal(w.items[1].ex, "dumbbell-bench-press");
  assert.equal(w.items.length, 7);
  assert.equal(w.cur, "0");
});

test("Short version: first 3 exercises, 2 sets each, under 30 minutes", () => {
  const w = mk({ short: true });
  assert.equal(w.items.length, 3);
  assert.ok(w.items.every((it) => it.sets === 2));
  assert.ok(M.estimateMin(w.items) <= 30);
  assert.ok(M.estimateMin(mk().items) <= 50);
});

test("Lower B jump slot uses block 1; Upper B ladder level 1 expands to two items", () => {
  const lb = M.newWorkout({ id: "x", sessionId: "LB", date: "2026-11-26", now: T0 });
  assert.equal(lb.items[0].ex, "broad-jump");
  const ub = M.newWorkout({ id: "x", sessionId: "UB", date: "2026-11-26", now: T0 });
  assert.deepEqual(ub.items.slice(0, 2).map((i) => i.ex), ["dead-hang", "scap-pull-up"]);
  assert.deepEqual(ub.items.slice(0, 2).map((i) => i.key), ["0.0", "0.1"]);
});

test("No-gym swaps every exercise to its no-equipment version and adds lower extras", () => {
  const la = M.newWorkout({ id: "x", sessionId: "LA", date: "2026-11-26", now: T0, noGym: true });
  const squat = la.items.find((i) => i.planEx === "smith-machine-back-squat");
  assert.equal(squat.ex, "bodyweight-bulgarian-split-squat");
  assert.equal(squat.swapped, "nogym");
  assert.equal(la.items[la.items.length - 1].ex, "tibialis-raise");
});

test("logging walks sets in order, rests between them, and finishes", () => {
  const w = mk({ short: true });
  let now = T0;
  let r = M.logSet(w, { reps: 3 }, (now += 60000));
  assert.equal(w.cur, "0");
  assert.equal(r.restSec, 90);
  assert.ok(w.rest.endAt === now + 90000);
  M.logSet(w, { reps: 3 }, (now += 60000));
  assert.equal(w.cur, "1"); // next exercise
  let n = 2;
  while (!r.finished) { r = M.logSet(w, { kg: 15, reps: 8 }, (now += 60000)); n++; }
  assert.equal(n, 6);
  assert.equal(w.rest, null);
  assert.equal(M.isFinished(w), true);
});

test("supersets alternate with no rest, then rest after the round", () => {
  const w = mk();
  // finish the first three exercises
  let now = T0;
  while (["0", "1", "2"].includes(w.cur)) M.logSet(w, { kg: 10, reps: 8 }, (now += 1000));
  assert.equal(w.cur, "3"); // pulldown (pair b)
  let r = M.logSet(w, { kg: 10, reps: 10 }, (now += 1000));
  assert.equal(w.cur, "6"); // pallof (pair b)
  assert.equal(r.restSec, 0);
  r = M.logSet(w, { kg: 10, reps: 10 }, (now += 1000));
  assert.equal(w.cur, "3");
  assert.equal(r.restSec, 45);
});

test("undo puts the set back on screen with its numbers", () => {
  const w = mk();
  M.logSet(w, { reps: 3 }, T0 + 1000);
  const l = M.undoLast(w);
  assert.equal(l.reps, 3);
  assert.equal(w.log.length, 0);
  assert.equal(w.rest, null);
  assert.equal(w.draft.reps, 3);
});

test("switching Full → Short keeps logged sets and exercises that have them", () => {
  const w = mk();
  let now = T0;
  M.jumpTo(w, "4");
  M.logSet(w, { kg: 7.5, reps: 12 }, (now += 1000));
  M.setShort(w, true);
  assert.ok(w.items.some((i) => i.key === "4"));
  assert.equal(M.item(w, "4").sets, 1);
  assert.equal(w.items.length, 4);
  M.setShort(w, false);
  assert.equal(w.items.length, 7);
  assert.equal(M.doneCount(w, "4"), 1);
});

test("prefill: last time's numbers, a beat target, and the progression jump", () => {
  const w = mk();
  M.jumpTo(w, "1");
  const hist = (ex) => (ex === "dumbbell-bench-press" ? [{ date: "2026-11-20", sets: [{ kg: 15, reps: 8 }, { kg: 15, reps: 8 }, { kg: 15, reps: 7 }] }] : []);
  let p = M.prefill(w, "1", hist);
  assert.equal(p.kg, 15);
  assert.equal(p.reps, 8);
  assert.equal(p.target.kind, "beat");
  assert.equal(M.beats({ kg: 15, reps: 9 }, p.lastSet), true);
  assert.equal(M.beats({ kg: 15, reps: 8 }, p.lastSet), false);
  assert.equal(M.beats({ kg: 17.5, reps: 5 }, p.lastSet), true);

  const allTop = () => [{ date: "2026-11-20", sets: [{ kg: 15, reps: 8 }, { kg: 15, reps: 8 }, { kg: 15, reps: 8 }] }];
  p = M.prefill(w, "1", allTop);
  assert.equal(p.kg, 17.5);
  assert.equal(p.reps, 5);
  assert.equal(p.target.kind, "up");
});

test("prefill: return after a gap lowers the weight; a changed weight carries forward", () => {
  const w = mk({ adjust: { loadFactor: 0.9 } });
  M.jumpTo(w, "1");
  const hist = () => [{ date: "2026-11-10", sets: [{ kg: 20, reps: 6 }] }];
  let p = M.prefill(w, "1", hist);
  assert.equal(p.kg, 17.5);
  assert.equal(p.target.kind, "easy");
  M.logSet(w, { kg: 20, reps: 6 }, T0 + 1000);
  p = M.prefill(w, "1", hist);
  assert.equal(p.kg, 20);
});

test("prefill: first time uses the plan's starting weight; bodyweight has no weight", () => {
  const w = mk();
  assert.equal(M.prefill(w, "1", noHistory).kg, 12.5);
  assert.equal(M.prefill(w, "1", noHistory).target.kind, "first");
  assert.equal(M.prefill(w, "2", noHistory).weighted, false); // inverted row
  assert.equal(M.prefill(w, "0", noHistory).weighted, false); // negatives
  assert.equal(M.prefill(w, "4", noHistory).weighted, true); // hammer curl
});

test("swap keeps logged sets on the old exercise and carries the weight", () => {
  const w = mk();
  M.jumpTo(w, "1");
  M.logSet(w, { kg: 15, reps: 8 }, T0 + 1000);
  M.jumpTo(w, "1");
  const before = M.swapExercise(w, "1", "dumbbell-floor-press", { kg: 15 });
  const p = M.prefill(w, "1", noHistory);
  assert.equal(p.kg, 15);
  assert.equal(M.item(w, "1").swapped, "today");
  M.logSet(w, { kg: 15, reps: 8 }, T0 + 2000);
  const s = M.toSession(w);
  assert.deepEqual(s.items.map((i) => i.ex), ["dumbbell-bench-press", "dumbbell-floor-press"]);
  M.restoreSwap(w, "1", before);
  assert.equal(M.item(w, "1").ex, "dumbbell-bench-press");
});

test("warm-up ramp is built from today's first loaded main lift", () => {
  const w = mk();
  const wu = M.warmup(w, noHistory);
  assert.equal(wu.ramp.ex, "dumbbell-bench-press");
  assert.ok(wu.ramp.sets.every((s) => s.kg < 12.5 && s.kg > 0));
});

test("summary counts sets beaten and says what goes up next time", () => {
  const w = mk({ short: true });
  M.jumpTo(w, "1");
  const before = [{ date: "2026-11-20", sets: [{ kg: 15, reps: 8 }, { kg: 15, reps: 7 }, { kg: 15, reps: 7 }] }];
  const hist = (ex) => (ex === "dumbbell-bench-press" ? before : []);
  M.logSet(w, { kg: 15, reps: 8 }, T0 + 60000);
  M.logSet(w, { kg: 15, reps: 8 }, T0 + 120000);
  const s = M.summarize(w, hist, hist);
  assert.equal(s.sets, 2);
  assert.equal(s.beat, 1);
  assert.equal(s.partial, true);
});

test("store: migrates old uptime1 strength sets once, never writes uptime1", () => {
  const old = { v: 1, sets: { "2026-11-23|dumbbell-bench-press": [{ t: 1, kg: 15, r: 8 }, { t: 2, kg: 15, r: 7 }], "2026-11-24|five-k-time-trial": [{ t: 1, sec: 1700 }] } };
  const st = memStorage({ [LEGACY_KEY]: JSON.stringify(old) });
  const store = createStore(st);
  const h = exerciseHistory(store.db, "dumbbell-bench-press");
  assert.equal(h.length, 1);
  assert.deepEqual(h[0].sets.map((s) => s.reps), [8, 7]);
  assert.equal(store.save().ok, true);
  assert.equal(st.map.get(LEGACY_KEY), JSON.stringify(old));
  assert.equal(JSON.parse(st.map.get(KEY)).v, 2);
});

test("store: a failed write is reported, not swallowed; unreadable data is never overwritten", () => {
  const st = memStorage();
  st.setItem = () => { throw new Error("QuotaExceededError"); };
  const store = createStore(st);
  assert.equal(store.save().ok, false);
  const bad = memStorage({ [KEY]: "{not json" });
  const s2 = createStore(bad);
  assert.equal(s2.save().ok, false);
  assert.equal(bad.map.get(KEY), "{not json");
  assert.throws(() => migrate({ v: 99 }));
});

test("store: sessions and activities feed the engine log", () => {
  const db = migrate(null);
  const w = mk({ short: true });
  M.logSet(w, { reps: 3 }, T0 + 1000);
  db.sessions.push(M.toSession(w, { partial: true }));
  db.activities.push({ id: "a", date: "2026-11-26", t: T0, kind: "sport", ex: "basketball", min: 60 });
  const log = engineLog(db);
  assert.deepEqual(log.map((e) => e.session || e.kind), ["UA", "sport"]);
});

test("run: interval reps from the 5K pace, short has fewer reps, level up only when earned", () => {
  const r = R.buildRun("interval", { level: 1, fiveK: 1710 });
  assert.equal(r.steps.length, 6);
  assert.equal(r.steps[0].targetSec, Math.round(((1710 / 5 - 15) * 400) / 1000));
  assert.ok(R.buildRun("interval", { level: 1, short: true }).steps.length < 6);
  assert.equal(R.buildRun("tempo", { level: 3, short: true }).steps.length, 1);
  assert.equal(R.nextLevel("interval", 1, { allOnPace: true, feltOk: true }), 2);
  assert.equal(R.nextLevel("interval", 1, { allOnPace: true, feltOk: false }), 1);
  assert.equal(R.nextLevel("interval", 6, { allOnPace: true, feltOk: true }), 6);
});

test("run: stopwatch reps, countdown blocks, recovery between", () => {
  const run = R.newRun({ id: "r", type: "tempo", date: "2026-11-26", now: T0, settings: { runLevels: { tempo: 1 } } });
  R.startStep(run, T0);
  assert.equal(run.work.endAt, T0 + 8 * 60000);
  R.finishStep(run, T0 + 9 * 60000); // ended while the screen was off: capped at the block
  assert.equal(run.log[0].sec, 480);
  assert.equal(run.rest.endAt, T0 + 8 * 60000 + 120000);
  const iv = R.newRun({ id: "r", type: "interval", date: "2026-11-26", now: T0 });
  R.startStep(iv, T0);
  R.finishStep(iv, T0 + 100000);
  assert.equal(iv.log[0].sec, 100);
  assert.ok(R.onPace(iv.steps[0], 100));
  assert.equal(R.toActivity(iv, { partial: true }).partial, true);
});

test("run: a time trial updates the 5K used for paces", () => {
  assert.equal(R.fiveKSec([], {}), PLAN.baseline.fiveKSec);
  assert.equal(R.fiveKSec([{ kind: "run", run: "time-trial", sec: 1650 }], {}), 1650);
});
