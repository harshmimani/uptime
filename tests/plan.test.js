// The 27 Nov 2026 exercise changes: what each session holds now, the guide every new or changed
// exercise needs, the history that carries across, and the split squat's heavier first session.
import { test } from "node:test";
import assert from "node:assert/strict";
import PLAN from "../js/plan.js";
import { emptyDB, exerciseHistory, legacyTarget, carriedTo, migrate, combineOld } from "../js/store.js";
import { progression } from "../js/engine.js";
import * as P from "../js/progress-data.js";
import * as M from "../js/workout/model.js";
import { guideFor, howToHTML } from "../js/muscles.js";

const ids = (id) => PLAN.sessions[id].items.map((i) => i.ex || i.slot);
const item = (id, ex) => PLAN.sessions[id].items.find((i) => i.ex === ex);
const allSessions = { ...PLAN.sessions, ...PLAN.busy.sessions };

test("Upper A: cross-body hammer curl + overhead cable triceps extension replace the pulldown, pushdown and hammer curl", () => {
  assert.deepEqual(ids("UA"), ["ladder", "dumbbell-bench-press", "smith-machine-inverted-row", "cross-body-hammer-curl", "overhead-cable-extension", "pallof-press"]);
  assert.equal(item("UA", "cross-body-hammer-curl").pair, item("UA", "overhead-cable-extension").pair, "a superset");
  assert.equal(item("UA", "pallof-press").pair, undefined);
});

test("Lower A: the Bulgarian split squat is the main leg lift; no squat of any other kind", () => {
  assert.deepEqual(ids("LA"), ["jump", "bulgarian-split-squat", "smith-calf-raise", "copenhagen-side-plank", "dumbbell-romanian-deadlift", "farmer-carry"]);
  const bss = item("LA", "bulgarian-split-squat");
  assert.deepEqual([bss.role, bss.sets, bss.reps, bss.perSide, bss.rest], ["main", 3, [6, 10], true, 120]);
  assert.ok(bss.start.kg > 7.5, "heavier than its accessory start");
  assert.equal(PLAN.sessions.LA.items.filter((i) => PLAN.exercises[i.ex]?.kind === "squat").length, 0);
  // the Smith squat is gone from every session, but kept as an exercise for its logs
  for (const [id, s] of Object.entries(allSessions)) assert.ok(!s.items.some((i) => i.ex === "smith-machine-back-squat"), id);
  assert.ok(PLAN.exercises["smith-machine-back-squat"]);
});

test("Upper B rows two dumbbells; Lower B lunges walking", () => {
  const row = item("UB", "dumbbell-bent-over-row");
  assert.deepEqual([row.sets, row.reps, row.perSide, ids("UB").indexOf("dumbbell-bent-over-row")], [3, [8, 12], undefined, 2]);
  assert.equal(ids("LB").indexOf("dumbbell-walking-lunge"), 4, "the lateral lunge's slot");
  for (const [id, s] of Object.entries(allSessions)) {
    for (const old of ["one-arm-dumbbell-row", "dumbbell-lateral-lunge", "hammer-curl", "cable-rope-pushdown", "kneeling-cable-lat-pulldown"]) {
      assert.ok(!s.items.some((i) => i.ex === old), `${id} still has ${old}`);
    }
  }
});

test("the half build and Busy mode follow: split squat main lift, walking lunges, two-arm rows", () => {
  assert.equal(PLAN.sessions.LS.items.find((i) => i.role === "main").ex, "bulgarian-split-squat");
  assert.ok(ids("LD").includes("dumbbell-walking-lunge") && !ids("LD").includes("bulgarian-split-squat"));
  assert.equal(PLAN.busy.sessions.FB1.items.find((i) => i.role === "main" && i.ex).ex, "bulgarian-split-squat");
  assert.ok(PLAN.busy.sessions.FB2.items.some((i) => i.ex === "dumbbell-bent-over-row"));
  assert.ok(PLAN.busy.sessions.FB3.items.some((i) => i.ex === "dumbbell-walking-lunge"));
});

test("every new or changed exercise has muscles, steps, a mistake, a breathing cue, a form cue, a start weight and three swaps", () => {
  const changed = { "cross-body-hammer-curl": "UA", "overhead-cable-extension": "UA", "dumbbell-bent-over-row": "UB", "dumbbell-walking-lunge": "LB", "bulgarian-split-squat": "LA" };
  for (const [ex, session] of Object.entries(changed)) {
    const e = PLAN.exercises[ex], g = guideFor(ex);
    assert.ok(g.m.length && g.steps.length >= 3 && g.steps.length <= 4 && g.mistake, ex);
    assert.ok(g.breath && g.breath.length > 10, `${ex}: breathing cue`);
    assert.ok(e.cue, `${ex}: form cue`);
    assert.ok(item(session, ex).start?.kg > 0, `${ex}: starting weight`);
    for (const k of ["easier", "harder", "none"]) {
      assert.ok(PLAN.exercises[e.swaps[k]], `${ex}: ${k} swap ${e.swaps[k]} exists`);
      assert.ok(guideFor(e.swaps[k]).breath, `${ex}: ${k} swap has a breathing cue`);
    }
    assert.match(howToHTML(ex), /<b>Breathing<\/b>/);
  }
  assert.doesNotMatch(howToHTML("dumbbell-bench-press"), /Breathing/, "only where one is set");
});

test("history carries across: hammer curl → cross-body hammer curl, one-arm row → two-arm row; old logs untouched", () => {
  assert.equal(carriedTo("hammer-curl"), "cross-body-hammer-curl");
  assert.equal(carriedTo("one-arm-dumbbell-row"), "dumbbell-bent-over-row");
  assert.equal(carriedTo("dumbbell-lateral-lunge"), "dumbbell-lateral-lunge", "a different movement: not carried");
  assert.equal(carriedTo("smith-machine-back-squat"), "smith-machine-back-squat");
  const db = emptyDB();
  db.sessions.push({ id: "a", date: "2026-11-20", t: 1, session: "UA", items: [{ key: "4", ex: "hammer-curl", sets: [{ kg: 7.5, reps: 15 }, { kg: 7.5, reps: 15 }] }] });
  db.sessions.push({ id: "b", date: "2026-11-22", t: 2, session: "UB", items: [{ key: "2", ex: "one-arm-dumbbell-row", sets: [{ kg: 15, reps: 10 }] }] });
  const before = JSON.stringify(db);
  assert.equal(exerciseHistory(db, "cross-body-hammer-curl")[0].sets[0].kg, 7.5);
  assert.equal(exerciseHistory(db, "dumbbell-bent-over-row")[0].sets[0].kg, 15, "per hand");
  assert.equal(exerciseHistory(db, "hammer-curl").length, 0, "counted once, under the new exercise");
  assert.equal(JSON.stringify(db), before, "logs keep their own ids");
  // Progress lists it once, under the new name
  const other = P.otherLifts(db).map((o) => o.ex);
  assert.ok(other.includes("cross-body-hammer-curl") && !other.includes("hammer-curl"));
  // the workout prefills from it: 7.5 × 15 at the top earns the 3-s lowers first (slowFirst)
  const w = M.newWorkout({ id: "w", sessionId: "UA", date: "2026-11-28", now: 0, checkIn: "Good" });
  const curl = w.items.find((i) => i.ex === "cross-body-hammer-curl");
  M.jumpTo(w, curl.key);
  const p = M.prefill(w, curl.key, (ex) => exerciseHistory(db, ex));
  assert.equal(p.kg, 7.5);
  assert.equal(p.target.kind, "slow");
});

test("the earlier app's walking lunges and hammer curls map to the new exercises", () => {
  assert.equal(legacyTarget("dumbbell-walking-lunges"), "dumbbell-walking-lunge");
  assert.equal(legacyTarget("hammer-curl"), "cross-body-hammer-curl");
  const db = migrate(null, combineOld({ uptime1: { v: 1, sets: { "2026-11-10|dumbbell-walking-lunges": [{ t: 1, kg: 10, r: 10 }] } } }));
  assert.equal(exerciseHistory(db, "dumbbell-walking-lunge")[0].sets[0].kg, 10);
});

test("the split squat's first session as the main lift starts heavier, then normal double progression", () => {
  const bss = { ...item("LA", "bulgarian-split-squat"), ex: "bulgarian-split-squat" };
  const old = [{ date: "2026-11-20", sets: [{ kg: 7.5, reps: 8 }, { kg: 7.5, reps: 8 }] }];
  assert.deepEqual([progression([], bss).action, progression([], bss).kg], ["start", 12.5]);
  const first = progression(old, bss);
  assert.deepEqual([first.action, first.kg, first.reps], ["increase", 12.5, [6, 10]]);
  // heavier old weights are kept
  assert.equal(progression([{ date: "2026-11-20", sets: [{ kg: 15, reps: 8 }, { kg: 15, reps: 8 }, { kg: 15, reps: 8 }] }], bss).kg, 15);
  // once logged as the main lift (even lighter), its own logs lead
  const after = [...old, { date: "2026-11-29", sets: [{ kg: 10, reps: 8 }, { kg: 10, reps: 8 }, { kg: 10, reps: 7 }] }];
  assert.deepEqual([progression(after, bss).action, progression(after, bss).kg], ["hold", 10]);
  const top = [...old, { date: "2026-11-29", sets: [{ kg: 12.5, reps: 10 }, { kg: 12.5, reps: 10 }, { kg: 12.5, reps: 10 }] }];
  assert.equal(progression(top, bss).kg, 15, "the next dumbbell up");
});
