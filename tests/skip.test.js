// Skipping sets and exercises, removing a logged set, going back to an earlier exercise.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/workout/model.js";

const T0 = Date.UTC(2026, 10, 26, 7, 0);
const mk = (opts = {}) => M.newWorkout({ id: "w1", sessionId: "UA", date: "2026-11-26", now: T0, checkIn: "Good", ...opts });
const log = (w, n = 1) => { for (let i = 0; i < n; i++) M.logSet(w, { reps: 5 }, T0 + w.log.length * 60000 + 60000); };

test("skip a set: one fewer set today, nothing logged, the exercise stays in focus", () => {
  const w = mk();
  const total = M.totalSets(w);
  const res = M.skipSet(w);
  assert.equal(res.finished, false);
  assert.equal(w.items[0].sets, 3);
  assert.equal(w.items[0].skipped, 1);
  assert.equal(w.log.length, 0);
  assert.equal(w.cur, "0");
  assert.equal(M.totalSets(w), total - 1);
});

test("skipping the last open set of an exercise moves on to the next one", () => {
  const w = mk();
  log(w, 3);
  assert.equal(w.cur, "0");
  M.skipSet(w);
  assert.equal(w.cur, "1");
});

test("skip an exercise: its open sets are dropped, logged ones stay, focus moves on", () => {
  const w = mk();
  log(w, 1);
  const res = M.skipExercise(w);
  assert.equal(res.sets, 3);
  assert.equal(w.items[0].sets, 1);
  assert.equal(w.items[0].skipped, 3);
  assert.equal(w.log.length, 1);
  assert.equal(w.cur, "1");
  assert.equal(M.isOpen(w, w.items[0]), false);
  assert.equal(M.toSession(w).skipped, 3);
});

test("skipping everything left finishes the workout", () => {
  const w = mk({ short: true });
  let res;
  for (const it of w.items) { w.cur = it.key; res = M.skipExercise(w); }
  assert.equal(res.finished, true);
  assert.equal(M.isFinished(w), true);
});

test("a skip survives switching Full ↔ Short", () => {
  const w = mk();
  M.skipExercise(w);
  M.setShort(w, true);
  M.setShort(w, false);
  assert.equal(w.items[0].sets, 0);
});

test("snapshot/restore undoes a skip exactly", () => {
  const w = mk();
  log(w, 1);
  const snap = M.snapshot(w);
  M.skipExercise(w);
  M.restore(w, snap);
  assert.equal(w.items[0].sets, 4);
  assert.equal(w.items[0].skipped, undefined);
  assert.equal(w.cur, "0");
});

test("remove a logged set: the others renumber and the set is open again", () => {
  const w = mk();
  log(w, 3);
  const gone = M.removeLogged(w, 0);
  assert.equal(gone.n, 1);
  assert.deepEqual(w.log.map((l) => l.n), [1, 2]);
  assert.equal(M.doneCount(w, "0"), 2);
  assert.equal(M.isOpen(w, w.items[0]), true);
});

test("go back to a finished exercise, then add a set to it", () => {
  const w = mk();
  log(w, 4);
  assert.equal(w.cur, "1");
  assert.equal(M.neighbour(w, -1).key, "0");
  assert.equal(M.jumpTo(w, "0"), true);
  assert.equal(M.isOpen(w, w.items[0]), false);
  M.addSet(w);
  assert.equal(w.items[0].sets, 5);
  assert.equal(M.isOpen(w, w.items[0]), true);
  log(w, 1);
  assert.equal(M.doneCount(w, "0"), 5);
  assert.equal(M.neighbour(w, 1)?.key, "2"); // focus moved on to exercise 2 ("1"), whose next is "2"
});
