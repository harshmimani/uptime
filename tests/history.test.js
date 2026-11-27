// History: past sessions, the last 7 days, this week's slots.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pastSessions, sessionDetail, lastWeekSummary, weekSlots, dayLabel } from "../js/history.js";

const T = (d) => new Date(`${d}T09:00:00`).getTime();
const today = "2026-11-27";
const db = {
  settings: {},
  sessions: [
    { id: "a", date: "2026-11-21", t: T("2026-11-21"), end: T("2026-11-21") + 45 * 60000, session: "UA", name: "Upper A",
      items: [{ key: "1", ex: "dumbbell-bench-press", sets: [{ kg: 15, reps: 8 }, { kg: 15, reps: 7 }] }, { key: "2", ex: "hammer-curl", sets: [{ kg: 8, reps: 12 }] }] },
    { id: "b", date: "2026-11-25", t: T("2026-11-25"), session: "LA", name: "Lower A", partial: true,
      items: [{ key: "1", ex: "smith-machine-back-squat", sets: [{ kg: 60, reps: 6 }] }] },
    { id: "old", date: "2026-11-10", t: T("2026-11-10"), session: "UB", name: "Upper B", items: [{ key: "1", ex: "pull-up", sets: [{ reps: 3 }] }] },
  ],
  activities: [
    { id: "r1", date: "2026-11-24", t: T("2026-11-24"), kind: "run", run: "interval" },
    { id: "r2", date: "2026-11-26", t: T("2026-11-26"), kind: "run", run: "easy", ex: "easy-run", min: 30 },
  ],
};

test("past sessions: lifts and activities together, newest first", () => {
  const p = pastSessions(db);
  assert.deepEqual(p.map((x) => x.id), ["r2", "b", "r1", "a", "old"]);
  const a = p.find((x) => x.id === "a");
  assert.equal(a.sets, 3);
  assert.equal(a.exercises, 2);
  assert.equal(a.minutes, 45);
  assert.equal(p.find((x) => x.id === "b").partial, true);
  assert.equal(p.find((x) => x.id === "r1").name, "Intervals");
  assert.equal(pastSessions(db, { limit: 2 }).length, 2);
});

test("session detail lists each exercise with its sets", () => {
  const d = sessionDetail(db.sessions[0]);
  assert.equal(d[0].name, "Dumbbell bench press");
  assert.deepEqual(d[0].sets.map((s) => s.reps), [8, 7]);
});

test("last 7 days: sessions, exercises, sets and the muscles worked", () => {
  const s = lastWeekSummary(db, today);
  assert.equal(s.sessions, 4); // 2 lifts + 2 runs; the 10 Nov session is outside
  assert.equal(s.exercises, 3);
  assert.equal(s.sets, 4);
  assert.ok(s.muscles.main.includes("chest"));
  assert.ok(s.muscles.main.includes("quads"));
  assert.ok(!s.muscles.also.some((k) => s.muscles.main.includes(k)));
});

test("this week: done with the day, next, not yet; the quality run and the long-run slot", () => {
  const slots = weekSlots(db, today, { next: "UB" });
  const by = Object.fromEntries(slots.map((x) => [x.id, x]));
  assert.deepEqual(slots.map((x) => x.id), ["UA", "LA", "UB", "LB", "run", "long"]);
  assert.equal(by.UA.state, "done");
  assert.equal(by.LA.state, "done");
  assert.equal(by.UB.state, "next");
  assert.equal(by.LB.state, "later");
  assert.equal(by.run.state, "done");
  assert.equal(by.run.what, "Intervals");
  assert.equal(by.run.day, "Tue");
  assert.equal(by.long.state, "done"); // an easy run fills the long-run slot when there's no time
  assert.equal(by.long.what, "Easy run");
  assert.equal(by.long.day, "Yesterday");
});

test("a game fills the Run slot, never the long run", () => {
  const game = { id: "g", date: "2026-11-25", t: T("2026-11-25"), kind: "sport", ex: "basketball", min: 60 };
  const slots = weekSlots({ ...db, activities: [game] }, today, { next: "UB" });
  const by = Object.fromEntries(slots.map((x) => [x.id, x]));
  assert.equal(by.run.what, "Basketball");
  assert.equal(by.long.state, "later");
});

test("a 21K build shows three lifts and three runs", () => {
  const slots = weekSlots(db, today, { next: "UB", cycle: ["UA", "LA", "UB"], threeLifts: true });
  assert.deepEqual(slots.map((x) => x.id), ["UA", "LA", "UB", "run", "long", "easy"]);
  const by = Object.fromEntries(slots.map((x) => [x.id, x]));
  assert.equal(by.long.state, "later"); // only a long run fills it in a build
  assert.equal(by.easy.state, "done");
});

test("busy mode shows its full-body sessions and the run", () => {
  const slots = weekSlots({ ...db, sessions: [] }, today, { next: "FB1", busy: true });
  assert.deepEqual(slots.map((x) => x.id), ["FB1", "FB2", "FB3", "run"]);
});

test("day labels", () => {
  assert.equal(dayLabel(today, today), "Today");
  assert.equal(dayLabel("2026-11-26", today), "Yesterday");
  assert.equal(dayLabel("2026-11-24", today), "Tue");
});
