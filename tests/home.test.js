// Home's data (js/home/model.js): what the page shows in each state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { homeModel, weekLine, weekFilled, standoutStat, busyNudge, rotationNodes } from "../js/home/model.js";
import { emptyDB, engineLog } from "../js/store.js";
import { addDays } from "../js/engine.js";

const TODAY = "2026-11-26";
const sess = (daysAgo, session, items = []) => ({ id: `${daysAgo}${session}`, date: addDays(TODAY, -daysAgo), t: daysAgo, session, name: session, items });
const db = (over = {}) => ({ ...emptyDB(), ...over, settings: { ...emptyDB().settings, ...(over.settings || {}) } });

test("first run: Upper A, labelled as the first session, Start on offer", () => {
  const m = homeModel(db(), TODAY);
  assert.equal(m.next, "UA");
  assert.equal(m.label, "Your first session");
  assert.equal(m.canStart, true);
  assert.equal(m.stat.kind, "empty");
  assert.deepEqual(m.nodes.map((n) => n.state), ["current", "upcoming", "upcoming", "upcoming"]);
});

test("the dial marks this cycle's done sessions and the next one in line", () => {
  const m = homeModel(db({ sessions: [sess(3, "UA"), sess(2, "LA")] }), TODAY);
  assert.equal(m.next, "UB");
  assert.deepEqual(m.nodes.map((n) => n.state), ["done", "done", "current", "upcoming"]);
});

test("lifted today: no second lift, today's session shows done", () => {
  const m = homeModel(db({ sessions: [sess(1, "UA"), sess(0, "LA")] }), TODAY);
  assert.equal(m.canStart, false);
  assert.match(m.label, /tomorrow or later/);
  assert.equal(m.nodes.find((n) => n.id === "LA").state, "done");
});

test("a 10-day gap says so once, kindly", () => {
  const m = homeModel(db({ sessions: [sess(11, "UA")] }), TODAY);
  assert.match(m.note, /Welcome back\. 10 days off/);
});

test("Busy mode: the Busy rotation leads, no suggestion while it's on", () => {
  const m = homeModel(db({ sessions: [sess(30, "UA"), sess(15, "LA")], settings: { modeLog: [{ date: addDays(TODAY, -2), busy: true }] } }), TODAY);
  assert.equal(m.busy, true);
  assert.equal(m.next, "FB1");
  assert.equal(m.nodes.length, 3);
  assert.equal(m.nudge, null);
});

test("Busy suggestion: two light 7-day blocks in a row, and Not now holds for the block", () => {
  const d = db({ sessions: [sess(22, "UA"), sess(12, "LA")] });
  const log = engineLog(d);
  const n = busyNudge(log, d.settings, TODAY);
  assert.ok(n?.block);
  assert.equal(busyNudge(log, { ...d.settings, busyNudgeDismissed: n.block }, TODAY), null);
  // a Minimum block in between: no suggestion
  const ok = db({ sessions: [sess(22, "UA"), sess(12, "LA"), sess(11, "UB")] });
  assert.equal(busyNudge(engineLog(ok), ok.settings, TODAY), null);
});

test("standout stat: pull-up max beats volume once there's a strict rep; never a run stat", () => {
  const vol = standoutStat(db({ sessions: [sess(2, "LA", [{ ex: "smith-machine-back-squat", sets: [{ kg: 60, reps: 5 }, { kg: 60, reps: 5 }] }])] }), TODAY);
  assert.equal(vol.kind, "volume");
  assert.equal(vol.value, 600);
  const pu = standoutStat(db({ sessions: [sess(2, "UB", [{ ex: "pull-up", sets: [{ reps: 3 }, { reps: 5 }, { kg: 5, reps: 7 }] }])] }), TODAY);
  assert.deepEqual([pu.kind, pu.value, pu.goal], ["pullups", 5, 10]);
  const runsOnly = standoutStat(db({ activities: [{ id: "r", date: TODAY, kind: "run", run: "tempo" }] }), TODAY);
  assert.equal(runsOnly.kind, "empty");
});

test("week line names what the next level needs", () => {
  assert.equal(weekLine({ nextLevel: "Minimum", missing: { Minimum: { lifts: 2, run: 0, cond: 0 } } }), "Two more lifts for a Minimum week.");
  assert.equal(weekLine({ nextLevel: "Full", missing: { Full: { lifts: 0, run: 1, cond: 0 } } }), "A run for a Full week.");
  assert.equal(weekLine({ nextLevel: null }), "Full week. Everything else is a bonus.");
  assert.equal(weekFilled({ lifts: 5, run: 2, cond: 0 }), 6);
});

test("rotation nodes use short codes", () => {
  assert.deepEqual(rotationNodes("LA", false, null).map((n) => n.short), ["UA", "LA", "UB", "LB"]);
  assert.deepEqual(rotationNodes("FB2", true, null).map((n) => n.short), ["FB1", "FB2", "FB3"]);
});
