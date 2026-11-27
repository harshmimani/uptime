import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, nextSession, planToday, returnAdjustment, prescribe, rollingProgress, streak,
  weekLevel, windowStats, deloadStatus, detectStall, progression, doubleAllowed, setBusy, isBusy,
  nextRunType, longRunKm, racePhase, runPick, longPick, intervalReps, longCapKm, repRange, shortItems,
  threeLiftBuild, liftCycle, FULL_THREE_LIFTS, gamesInRow, normalizeLog,
} from "../js/engine.js";

// Day 0 is a Monday, but nothing in the engine depends on that.
const BASE = "2026-11-02";
const d = (n) => addDays(BASE, n);
const lift = (n, session, extra = {}) => ({ date: d(n), session, ...extra });
const run = (n, kind = "interval", extra = {}) => ({ date: d(n), kind: "run", run: kind, ...extra });
const sport = (n, extra = {}) => ({ date: d(n), kind: "sport", ex: "basketball", ...extra });
const long = (n, km, extra = {}) => ({ date: d(n), kind: "run", run: "long", km, ...extra });
const lifts = (o) => [o.primary, ...o.options].filter((x) => x.type === "lift");

describe("Train 3 days, skip 4, come back", () => {
  // A full first week, then 3 days on, 4 off, back on day 14.
  const log = [
    lift(0, "UA"), lift(1, "LA"), run(2), lift(3, "UB"), lift(4, "LB"), run(5, "easy"),
    lift(7, "UA"), lift(8, "LA"), lift(9, "UB"),
  ];
  const today = d(14);
  const plan = planToday(log, {}, today);

  test("next session is the one in line (LB), not a reset or a skip", () => {
    assert.equal(plan.next, "LB");
    assert.equal(plan.primary.type, "lift");
    assert.equal(plan.primary.session, "LB");
  });

  test("no stacking: exactly one lift offered today", () => {
    assert.equal(lifts(plan).length, 1);
  });

  test("after LB the rotation simply continues to UA", () => {
    assert.equal(nextSession([...log, lift(14, "LB")]), "UA");
  });

  test("4 days off is not a gap: full weights", () => {
    const r = returnAdjustment(log, today);
    assert.equal(r.tier, null);
    assert.equal(r.loadFactor, 1);
    assert.equal(r.daysOff, 4);
  });

  test("streak stays intact because Minimum was hit", () => {
    // Block 1 (days 7-13) had 3 lifts: Minimum reached.
    assert.equal(weekLevel(windowStats(log, d(13))), "Minimum");
    const s = streak(log, {}, today);
    assert.equal(s.weeks, 2);
    assert.equal(s.currentMet, false); // new block just started, doesn't break it
  });

  test("streak breaks when Minimum was missed", () => {
    const thin = [lift(0, "UA"), lift(1, "LA"), lift(7, "UB")]; // block 1 has 1 lift
    assert.equal(streak(thin, {}, d(14)).weeks, 0);
  });
});

describe("Return after a gap", () => {
  const log = [lift(0, "UA"), lift(1, "LA"), lift(2, "UB")]; // last lift day 2

  test("10-day gap: first session at 90%, same sets", () => {
    const today = d(13); // days 3-12 off = 10 days
    const r = returnAdjustment(log, today);
    assert.equal(r.daysOff, 10);
    assert.equal(r.tier, "short");
    assert.equal(r.loadFactor, 0.9);
    assert.equal(r.setsDelta, 0);
    const p = planToday(log, {}, today);
    assert.equal(p.primary.session, "LB");
    assert.equal(p.primary.adjust.loadFactor, 0.9);
    const s = prescribe("LB", p.primary.adjust);
    assert.equal(s.items.find((i) => i.ex === "barbell-deadlift").sets, 3);
    assert.equal(s.items.find((i) => i.ex === "barbell-deadlift").loadFactor, 0.9);
  });

  test("10-day gap: only the first session is reduced", () => {
    const after = [...log, lift(13, "LB")];
    assert.equal(returnAdjustment(after, d(15)).loadFactor, 1);
  });

  test("16-day gap: first week at 80% with one fewer set", () => {
    const today = d(19); // days 3-18 off = 16 days
    const r = returnAdjustment(log, today);
    assert.equal(r.daysOff, 16);
    assert.equal(r.tier, "long");
    assert.equal(r.loadFactor, 0.8);
    assert.equal(r.setsDelta, -1);
    assert.equal(r.until, d(25));
    const s = prescribe("LB", { loadFactor: r.loadFactor, setsDelta: r.setsDelta });
    const dl = s.items.find((i) => i.ex === "barbell-deadlift");
    assert.equal(dl.sets, 2);
    assert.equal(dl.loadFactor, 0.8);
  });

  test("16-day gap: reduction holds for the whole first week, then ends", () => {
    const back = [...log, lift(19, "LB"), lift(21, "UA")];
    assert.equal(returnAdjustment(back, d(23)).loadFactor, 0.8); // still week one
    assert.equal(returnAdjustment(back, d(25)).loadFactor, 0.8); // last day of week one
    assert.equal(returnAdjustment(back, d(26)).loadFactor, 1); // resume normally
  });

  test("boundaries: 6 days off none, 7 and 13 short, 14 long", () => {
    assert.equal(returnAdjustment(log, d(9)).tier, null);
    assert.equal(returnAdjustment(log, d(10)).tier, "short");
    assert.equal(returnAdjustment(log, d(16)).tier, "short");
    assert.equal(returnAdjustment(log, d(17)).tier, "long");
  });

  test("runs during the gap don't cancel the lifting reduction", () => {
    const withRuns = [...log, run(6), run(9, "easy")];
    assert.equal(returnAdjustment(withRuns, d(13)).loadFactor, 0.9);
  });
});

describe("Sport on a day I didn't plan", () => {
  const base = [lift(0, "UA"), lift(1, "LA"), lift(3, "UB")];

  test("rotation is unaffected", () => {
    const withSport = [...base, sport(2), sport(4)];
    assert.equal(nextSession(withSport), nextSession(base));
    assert.equal(nextSession(withSport), "LB");
  });

  test("a game fills the Run slot: it replaces the quality run, never the long run", () => {
    const p = rollingProgress([...base, sport(4)], d(4));
    assert.equal(p.run, 1);
    assert.equal(p.cond, 0);
    assert.equal(p.lifts, 3);
    assert.equal(p.level, "Good");
    const today = planToday([...base, sport(4)], {}, d(6));
    const all = [today.primary, ...today.options];
    assert.equal(all.filter((o) => o.type === "run").length, 0); // no quality run due this week
    assert.ok(all.some((o) => o.ex === "long-run")); // the long run still is
  });

  test("next day: Lower is not the headline after sport, but is still offered", () => {
    const p = planToday([...base, sport(4)], {}, d(5));
    assert.equal(p.next, "LB");
    assert.notEqual(p.primary.type, "lift");
    const lb = lifts(p)[0];
    assert.equal(lb.session, "LB");
    assert.ok(lb.cautions.includes("lower-after-hard-cardio"));
  });

  test("next day: Upper is fine after sport", () => {
    const p = planToday([lift(0, "UA"), lift(1, "LA"), sport(3)], {}, d(4)); // rest on day 2
    assert.equal(p.primary.type, "lift");
    assert.equal(p.primary.session, "UB");
    assert.deepEqual(p.primary.cautions, []);
  });
});

describe("Same-day doubles", () => {
  test("Run + Upper on the same day is allowed", () => {
    const log = [lift(0, "LB"), run(2)]; // next is UA
    const p = planToday(log, {}, d(2));
    assert.equal(p.primary.type, "done");
    const ua = lifts(p)[0];
    assert.equal(ua.session, "UA");
    assert.equal(ua.double, true);
    assert.equal(doubleAllowed({ type: "run" }, { type: "lift", kind: "upper" }), true);
  });

  test("Upper then run is allowed too", () => {
    const p = planToday([lift(0, "LB"), lift(2, "UA")], {}, d(2));
    assert.ok(p.options.some((o) => o.type === "run" && o.double));
  });

  test("two lifts on the same day are never suggested", () => {
    const p = planToday([lift(0, "LB"), lift(2, "UA")], {}, d(2));
    assert.equal(p.next, "LA");
    assert.equal(lifts(p).length, 0);
    assert.equal(doubleAllowed({ type: "lift", kind: "upper" }, { type: "lift", kind: "lower" }), false);
  });

  test("Run + Lower on the same day is not suggested", () => {
    const p = planToday([lift(0, "UA"), run(2)], {}, d(2)); // next is LA
    assert.equal(lifts(p).length, 0);
    const p2 = planToday([lift(0, "UA"), lift(2, "LA")], {}, d(2));
    assert.equal(p2.options.filter((o) => o.type === "run").length, 0);
  });
});

describe("Busy mode for 2 weeks, then off", () => {
  let settings = setBusy({}, true, d(2));
  settings = setBusy(settings, false, d(16));
  const log = [
    lift(0, "UA"), lift(1, "LA"),
    lift(3, "FB1"), run(4, "easy"), lift(6, "FB2"),
    lift(9, "FB3"), run(11, "tempo"), lift(13, "FB1"),
  ];

  test("mode switches on and off by date", () => {
    assert.equal(isBusy(settings, d(1)), false);
    assert.equal(isBusy(settings, d(2)), true);
    assert.equal(isBusy(settings, d(15)), true);
    assert.equal(isBusy(settings, d(16)), false);
  });

  test("during Busy mode: full-body rotation, no sport slot", () => {
    const p = planToday(log.filter((e) => e.date <= d(8)), settings, d(8));
    assert.equal(p.mode, "busy");
    assert.equal(p.next, "FB3");
    assert.equal(p.nextMain, "UB"); // main rotation is parked, not lost
    assert.ok(![p.primary, ...p.options].some((o) => o.type === "conditioning"));
  });

  test("full-body back to back is not the headline", () => {
    const p = planToday(log.filter((e) => e.date <= d(9)), settings, d(10));
    assert.equal(p.next, "FB1");
    assert.notEqual(p.primary.type, "lift");
    assert.ok(lifts(p)[0].cautions.includes("full-body-back-to-back"));
  });

  test("when Busy mode is off the main rotation resumes where it stopped", () => {
    const p = planToday(log, settings, d(16));
    assert.equal(p.mode, "normal");
    assert.equal(p.next, "UB");
    assert.equal(p.primary.session, "UB");
    assert.equal(p.returnAdjustment.loadFactor, 1); // full-body kept lifting going
  });

  test("busy weeks keep the streak", () => {
    const s = streak(log, settings, d(16));
    assert.equal(s.weeks, 2);
  });

  test("turning Busy mode on again continues the full-body rotation", () => {
    const again = setBusy(settings, true, d(20));
    const p = planToday([...log, lift(16, "UB")], again, d(20));
    assert.equal(p.next, "FB2");
  });
});

describe("Rough check-ins", () => {
  const log = [
    lift(0, "UA", { checkIn: "Rough" }),
    lift(1, "LA", { checkIn: "Okay" }),
    run(2, "interval", { checkIn: "Rough" }),
    lift(4, "UB", { checkIn: "Rough" }),
  ];

  test("three Rough check-ins in one rotation: deload suggested", () => {
    const s = deloadStatus(log, {}, d(5));
    assert.equal(s.roughCount, 3);
    assert.equal(s.suggested, true);
    assert.ok(s.reasons.includes("rough"));
    assert.equal(s.setsFactor, 0.5);
  });

  test("two Rough plus a Rough check-in today also triggers it", () => {
    const two = log.slice(0, 3);
    assert.equal(deloadStatus(two, {}, d(4)).suggested, false);
    assert.equal(deloadStatus(two, {}, d(4), { pendingCheckIn: "Rough" }).suggested, true);
  });

  test("Rough check-in suggests the Short version", () => {
    const p = planToday(log.slice(0, 2), {}, d(3), { checkIn: "Rough" });
    assert.equal(p.primary.short, true);
    const s = prescribe(p.primary.session, { short: true });
    assert.equal(s.items.length, 3);
    assert.ok(s.items.every((i) => i.sets <= 2));
  });

  test("Rough check-ins spread over more than one rotation don't trigger it", () => {
    const spread = [
      lift(0, "UA", { checkIn: "Rough" }), lift(1, "LA"), run(2), lift(3, "UB"), lift(4, "LB"),
      run(5, "easy"), lift(7, "UA", { checkIn: "Rough" }), lift(8, "LA", { checkIn: "Rough" }),
    ];
    assert.equal(deloadStatus(spread, {}, d(9)).suggested, false);
  });

  test("once taken, the deload halves sets for a week and resets the count", () => {
    const settings = { deloads: [d(5)] };
    const s = deloadStatus(log, settings, d(6));
    assert.equal(s.active, true);
    const p = planToday(log, settings, d(6));
    assert.equal(p.primary.adjust.setsFactor, 0.5);
    const rx = prescribe("LB", p.primary.adjust);
    assert.equal(rx.items.find((i) => i.ex === "barbell-deadlift").sets, 2); // 3 → ~half
    assert.equal(deloadStatus(log, settings, d(12)).suggested, false);
  });
});

describe("Deload timing", () => {
  // Train steadily every other day.
  const steady = Array.from({ length: 40 }, (_, i) => lift(i * 2, ["UA", "LA", "UB", "LB"][i % 4]));

  test("suggested after 6 weeks, overdue after 8", () => {
    assert.equal(deloadStatus(steady, {}, d(41)).suggested, false);
    assert.deepEqual(deloadStatus(steady, {}, d(42)).reasons, ["time"]);
    assert.deepEqual(deloadStatus(steady, {}, d(56)).reasons, ["overdue"]);
  });

  test("a break of a week or more resets the clock", () => {
    const withBreak = [...steady.filter((e) => e.date <= d(30)), lift(40, "UA"), lift(42, "LA")];
    assert.equal(deloadStatus(withBreak, {}, d(44)).suggested, false);
  });
});

describe("Spacing and floating sessions", () => {
  test("after two hard days the headline is easy or rest, lift still offered", () => {
    const p = planToday([lift(0, "UA"), lift(1, "LA")], {}, d(2));
    assert.equal(p.primary.type, "conditioning");
    assert.equal(p.primary.ex, "easy-run");
    assert.ok(lifts(p)[0].cautions.includes("third-hard-day"));
  });

  test("Lower after a hard run is not the headline when something else fits", () => {
    const p = planToday([lift(0, "UA"), run(1)], {}, d(2)); // next LA, cond due
    assert.equal(p.primary.type, "conditioning");
    assert.equal(lifts(p)[0].session, "LA");
  });

  test("run suggested as a good slot next to Upper, flagged before Lower", () => {
    const beforeUpper = planToday([lift(0, "LB")], {}, d(2));
    assert.equal(beforeUpper.primary.session, "UA");
    assert.deepEqual(beforeUpper.options.find((o) => o.type === "run").cautions, []);
    const beforeLower = planToday([lift(0, "UA")], {}, d(2));
    assert.ok(beforeLower.options.find((o) => o.type === "run").cautions.includes("better-after-lower"));
  });

  test("once 4 lifts are in, the floating sessions come first", () => {
    const log = [lift(0, "UA"), lift(1, "LA"), lift(3, "UB"), lift(4, "LB")];
    const p = planToday(log, {}, d(6));
    assert.ok(["run", "conditioning"].includes(p.primary.type));
  });

  test("the quality run alternates tempo and intervals; games and long runs don't move it", () => {
    assert.equal(planToday([lift(0, "LB"), run(1, "interval")], {}, d(9)).options.find((o) => o.type === "run").run, "tempo");
    assert.equal(nextRunType([], d(0)), "tempo");
    assert.equal(nextRunType([run(1, "tempo")], d(9)), "interval");
    assert.equal(nextRunType([run(1, "interval"), long(3, 8)], d(9)), "tempo");
    assert.equal(nextRunType([run(1, "tempo"), sport(2)], d(9)), "interval"); // the game stood in; intervals still due
    assert.equal(nextRunType([run(1, "time-trial")], d(9)), "interval"); // old logs don't break the cycle
    assert.equal(nextRunType([run(1, "tempo"), run(2, "easy")], d(9)), "interval");
  });

  test("the long run fills the sport/conditioning slot, with its distance", () => {
    const p = planToday([lift(0, "UA"), lift(1, "LA"), run(2, "tempo"), lift(3, "UB")], {}, d(5));
    const l = [p.primary, ...p.options].find((o) => o.ex === "long-run");
    assert.equal(l.type, "conditioning");
    assert.equal(l.run, "long");
    assert.equal(l.km, 8);
    // an easy run or other cardio fills the slot too
    const q = planToday([lift(0, "UA"), run(1, "easy"), lift(2, "LA")], {}, d(4));
    assert.ok(![q.primary, ...q.options].some((o) => o.type === "conditioning"));
  });

  test("no basketball or intervals the day after Lower B: flagged, never blocked", () => {
    const p = planToday([run(-10, "tempo"), lift(0, "UB"), lift(2, "LB")], {}, d(3));
    assert.equal(p.primary.type, "lift");
    assert.equal(p.primary.session, "UA");
    const r = p.options.find((o) => o.type === "run");
    assert.equal(r.run, "interval");
    assert.ok(r.cautions.includes("interval-after-lower-b"));
    assert.ok(p.hints.includes("no-sprint-after-lower-b"));
    // after Lower A there's no such flag
    const q = planToday([run(-10, "tempo"), lift(0, "UA"), lift(2, "LA")], {}, d(3));
    assert.ok(!q.hints.includes("no-sprint-after-lower-b"));
    assert.ok(!(q.options.find((o) => o.type === "run")?.cautions || []).includes("interval-after-lower-b"));
  });

  test("usually-busy weekday suggests the Short version", () => {
    const p = planToday([lift(0, "UA")], { busyWeekdays: [3] }, d(2)); // day 2 is a Wednesday
    assert.equal(p.primary.short, true);
  });
});

describe("Week levels", () => {
  test("Full, Good, Minimum and none", () => {
    assert.equal(weekLevel({ lifts: 4, run: 1, cond: 1 }), "Full");
    assert.equal(weekLevel({ lifts: 4, run: 1, cond: 0 }), "Good");
    assert.equal(weekLevel({ lifts: 3, run: 0, cond: 1 }), "Good");
    assert.equal(weekLevel({ lifts: 3, run: 0, cond: 0 }), "Minimum");
    assert.equal(weekLevel({ lifts: 2, run: 0, cond: 0 }), "Minimum");
    assert.equal(weekLevel({ lifts: 1, run: 1, cond: 1 }), null);
  });

  test("rolling 7 days, not a calendar week", () => {
    const log = [lift(0, "UA"), lift(1, "LA"), run(2), lift(3, "UB"), lift(4, "LB"), long(5, 8)];
    assert.equal(rollingProgress(log, d(6)).level, "Full");
    assert.equal(rollingProgress(log, d(7)).level, "Good"); // day 0 dropped out
    assert.deepEqual(rollingProgress(log, d(7)).missing.Full, { lifts: 1, run: 0, cond: 0 });
  });

  test("Full needs the long-run slot: two hard runs or a run and a game make a Good week", () => {
    assert.equal(weekLevel({ lifts: 4, run: 2, cond: 0 }), "Good");
    const log = [lift(0, "UA"), lift(1, "LA"), run(2), lift(3, "UB"), lift(4, "LB"), sport(5)];
    assert.equal(rollingProgress(log, d(6)).level, "Good");
    assert.deepEqual(rollingProgress(log, d(6)).missing.Full, { lifts: 0, run: 0, cond: 1 });
  });

  test("a 21K build counts 3 lifts and 3 runs as Full", () => {
    assert.equal(weekLevel({ lifts: 3, run: 1, cond: 2 }, FULL_THREE_LIFTS), "Full");
    assert.equal(weekLevel({ lifts: 3, run: 1, cond: 1 }, FULL_THREE_LIFTS), "Good");
  });
});

describe("Stall detection and progression", () => {
  const item = { ex: "dumbbell-bench-press", role: "main", sets: 3, reps: [5, 8] };
  const s = (date, kg, reps, extra = {}) => ({ date: d(date), sets: reps.map((r) => ({ kg, reps: r })), ...extra });

  test("two sessions without progress = stalled, reset suggested", () => {
    const h = [s(0, 20, [7, 6, 6]), s(4, 20, [7, 6, 6]), s(8, 20, [6, 6, 6])];
    assert.equal(detectStall(h).stalled, true);
    const p = progression(h, item);
    assert.equal(p.action, "reset");
    assert.equal(p.kg, 17.5);
  });

  test("one flat session is not a stall", () => {
    const h = [s(0, 20, [6, 6, 5]), s(4, 20, [7, 6, 6]), s(8, 20, [7, 6, 6])];
    assert.equal(detectStall(h).stalled, false);
    assert.equal(progression(h, item).action, "hold");
  });

  test("short, deload and reduced sessions don't count toward a stall", () => {
    const h = [s(0, 20, [7, 6, 6]), s(4, 10, [8, 8], { deload: true }), s(8, 20, [7, 6, 7])];
    assert.equal(detectStall(h).stalled, false);
  });

  test("all sets at the top of the range: add weight", () => {
    const p = progression([s(0, 20, [8, 8, 8])], item);
    assert.equal(p.action, "increase");
    assert.equal(p.kg, 22.5);
    const squat = { ex: "smith-machine-back-squat", role: "main", sets: 3, reps: [5, 8] };
    assert.equal(progression([s(0, 40, [8, 8, 8])], squat).kg, 42.5);
  });
});

describe("Runs: intervals, the long run and race mode", () => {
  test("intervals start at 4 × 800 m and add a rep every second session, up to 6", () => {
    assert.equal(intervalReps([], d(0)), 4);
    const iv = (days) => days.map((n) => run(n, "interval"));
    assert.equal(intervalReps(iv([0]), d(10)), 4);
    assert.equal(intervalReps(iv([0, 10]), d(20)), 5);
    assert.equal(intervalReps(iv([0, 10, 20]), d(30)), 5);
    assert.equal(intervalReps(iv([0, 10, 20, 30]), d(40)), 6);
    assert.equal(intervalReps(iv([0, 10, 20, 30, 40, 50]), d(60)), 6);
    assert.equal(intervalReps(iv([0, 10, 20, 30]), d(75)), 4); // 45 days since a 5-rep session: one fewer
    assert.equal(intervalReps(iv([0, 50, 60]), d(70)), 5);
  });

  test("31–60 days without intervals: one rep fewer than last time (min 4); over 60: back to 4", () => {
    const iv = (days) => days.map((n) => run(n, "interval"));
    const six = iv([0, 10, 20, 30, 40, 50]); // 4, 4, 5, 5, 6, 6
    assert.equal(intervalReps(six, d(80)), 6); // 30 days: carries on
    assert.equal(intervalReps(six, d(81)), 5); // 31 days: one fewer
    assert.equal(intervalReps(six, d(110)), 5); // 60 days
    assert.equal(intervalReps(six, d(111)), 4); // 61 days: start again
    assert.equal(intervalReps(iv([0]), d(40)), 4); // never below 4
    // back after the step-back: two sessions at 5, then 6
    assert.equal(intervalReps([...six, run(81, "interval")], d(90)), 5);
    assert.equal(intervalReps([...six, run(81, "interval"), run(90, "interval")], d(100)), 6);
    // a logged rep count is what "last time" means
    assert.equal(intervalReps([run(0, "interval", { reps: 6 })], d(40)), 5);
    assert.equal(runPick(iv([0, 10]), d(15), {}).reps, undefined); // next is tempo
    assert.equal(runPick([...iv([0, 10]), run(12, "tempo")], d(20), {}).reps, 5);
  });

  test("the long-run cap: 10–12 km, about 70 min at easy pace", () => {
    assert.equal(longCapKm({}), 10); // 28:30 5K: easy ≈ 6:57/km
    assert.equal(longCapKm({ paceRef: { km: 5, sec: 1500 } }), 11); // 25:00
    assert.equal(longCapKm({ paceRef: { km: 5, sec: 1320 } }), 12); // 22:00
    assert.equal(longCapKm({ paceRef: { km: 5, sec: 1100 } }), 12); // never past 12
  });

  test("long runs: 8 km, then at most 10% over the longest of 30 days, then hold at the cap", () => {
    assert.deepEqual(longRunKm([], d(0)), { km: 8, cap: 10, hold: false });
    assert.equal(longRunKm([long(0, 8)], d(7)).km, 8.5);
    assert.equal(longRunKm([long(0, 8), long(7, 8.5)], d(14)).km, 9);
    assert.equal(longRunKm([long(0, 9)], d(7)).km, 9.5);
    assert.equal(longRunKm([long(0, 9.5)], d(7)).km, 10);
    assert.deepEqual(longRunKm([long(0, 10)], d(7)), { km: 10, cap: 10, hold: true });
    const fast = { paceRef: { km: 5, sec: 1320 } };
    assert.equal(longRunKm([long(0, 10)], d(7), fast).km, 11); // about +1 km once at 10
    assert.equal(longRunKm([long(0, 11)], d(7), fast).km, 12);
    assert.deepEqual(longRunKm([long(0, 12)], d(7), fast), { km: 12, cap: 12, hold: true });
  });

  test("long runs after a gap: 15–30 days repeat it, over 30 start 2 km lower", () => {
    const fast = { paceRef: { km: 5, sec: 1320 } };
    assert.equal(longRunKm([long(0, 11)], d(14), fast).km, 12);
    assert.equal(longRunKm([long(0, 11)], d(15), fast).km, 11);
    assert.equal(longRunKm([long(0, 11)], d(30), fast).km, 11);
    assert.equal(longRunKm([long(0, 11), run(20, "tempo")], d(31), fast).km, 9);
    assert.equal(longRunKm([long(0, 9), run(40, "tempo")], d(60)).km, 8); // never below 8
    assert.deepEqual(longRunKm([long(0, 18)], d(7)), { km: 10, cap: 10, hold: true }); // after a race build
  });

  test("no run of any kind for 30+ days: an easy run first, then 8 km", () => {
    const fast = { paceRef: { km: 5, sec: 1320 } };
    assert.deepEqual(longRunKm([long(0, 11)], d(31), fast), { km: null, cap: 12, hold: false, restart: true });
    assert.equal(longPick([long(0, 11)], d(31), fast).restart, true);
    const p = planToday([long(0, 11)], fast, d(31));
    const cond = [p.primary, ...p.options].find((o) => o.type === "conditioning");
    assert.equal(cond.ex, "easy-run");
    assert.equal(cond.restart, true);
    // the easy run is done: the long run starts again at 8 km, not 2 km below 11
    assert.equal(longRunKm([long(0, 11), run(31, "easy")], d(36), fast).km, 8);
    // basketball isn't a run: still a restart
    assert.equal(longRunKm([long(0, 11), sport(20)], d(35), fast).restart, true);
    // a brand-new user has no break to come back from
    assert.equal(longRunKm([], d(0)).km, 8);
  });

  const race = (distance, inDays, from = 100) => ({ race: { distance, date: d(from + inDays) } });

  test("race phases: none, build (8–12 weeks), taper (1–2 weeks), race week, race day", () => {
    assert.equal(racePhase({}, d(0)).kind, "none");
    assert.equal(racePhase(race("21k", 120), d(100)).kind, "none");
    assert.equal(racePhase(race("21k", 112), d(100)).kind, "build"); // a half's long-run build: 16 weeks
    assert.equal(racePhase(race("21k", 84), d(100)).kind, "build");
    assert.equal(racePhase(race("5k", 60), d(100)).kind, "none");
    assert.equal(racePhase(race("21k", 14), d(100)).kind, "taper");
    assert.equal(racePhase(race("10k", 10), d(100)).kind, "taper");
    assert.equal(racePhase(race("10k", 6), d(100)).kind, "race-week");
    assert.equal(racePhase(race("10k", 0), d(100)).kind, "race");
    assert.equal(racePhase(race("10k", -1), d(100)).kind, "none"); // past race: back to normal
  });

  test("a race build: quality runs still alternate; the long run builds 1 km at a time to 15 (10K) or 18 km (21K)", () => {
    const s = race("21k", 60);
    assert.equal(nextRunType([run(90, "interval")], d(100), s), "tempo");
    assert.equal(nextRunType([run(85, "interval"), long(90, 13)], d(100), s), "tempo");
    assert.equal(longRunKm([long(90, 13)], d(100), s).km, 14);
    assert.equal(longRunKm([long(90, 17)], d(100), s).km, 18);
    assert.deepEqual(longRunKm([long(90, 18)], d(100), s), { km: 18, cap: 18, hold: true }); // capped
    assert.equal(longRunKm([long(90, 15)], d(100), race("10k", 40)).km, 15);
    assert.equal(longRunKm([long(90, 12)], d(100), race("5k", 40)).km, 10); // a 5K keeps the normal cap
    assert.equal(runPick([run(90, "tempo")], d(100), s).reps, undefined); // 21K intervals are 3 × 2 km
    assert.equal(runPick([run(90, "tempo")], d(100), race("5k", 40)).reps, 4);
  });

  test("taper shortens the long run; race week is easy; race day is the race", () => {
    assert.deepEqual(longRunKm([long(90, 18)], d(100), race("21k", 12)), { km: 11, cap: 11, hold: false });
    assert.equal(nextRunType([run(90, "interval")], d(100), race("10k", 4)), "shakeout");
    const wk = planToday([lift(97, "UA"), run(98, "tempo")], race("10k", 4), d(100));
    assert.ok(![wk.primary, ...wk.options].some((o) => o.ex === "long-run")); // race week: no long run
    const p = planToday([lift(99, "UA")], race("10k", 0), d(100));
    assert.equal(p.primary.type, "run");
    assert.equal(p.primary.run, "race");
    assert.equal(runPick([], d(100), race("10k", 0)).distance, "10k");
  });

  test("no Lower the day before a race or a long run", () => {
    // next lift is LA; race tomorrow
    const p = planToday([lift(97, "UA"), run(98, "interval")], race("10k", 1), d(100));
    assert.notEqual(p.primary.type, "lift");
    assert.ok(lifts(p)[0].cautions.includes("lower-before-race"));
    // Lower yesterday: the long run is flagged, not headlined
    const q = planToday([run(80, "tempo"), lift(97, "UB"), lift(99, "LB")], {}, d(100));
    const r = [q.primary, ...q.options].find((o) => o.ex === "long-run");
    assert.equal(r.km, 8);
    assert.ok(r.cautions.includes("long-run-after-lower"));
    assert.notEqual(q.primary, r);
  });

  test("taper and race week suggest the Short version for lifts", () => {
    assert.equal(planToday([lift(97, "LB")], race("21k", 10), d(100)).primary.short, true);
    assert.equal(planToday([lift(97, "LB")], {}, d(100)).primary.short, undefined);
  });
});

describe("21K build: three lifts and three runs", () => {
  const s = { race: { distance: "21k", date: d(160) } }; // long-run build from day 48, three lifts from day 76
  test("only a 21K build's last 12 weeks, never in Busy mode", () => {
    assert.equal(racePhase(s, d(50)).kind, "build");
    assert.equal(threeLiftBuild(s, d(50)), false); // weeks 16–13: four lifts, the long run builds
    assert.equal(threeLiftBuild(s, d(70)), false);
    assert.equal(threeLiftBuild(s, d(80)), true);
    assert.equal(threeLiftBuild({ race: { distance: "10k", date: d(160) } }, d(100)), false);
    assert.equal(threeLiftBuild({ ...s, modeLog: [{ date: d(90), busy: true }] }, d(100)), false);
  });

  test("Upper A → the build Lower (squat and deadlift take turns) → Upper B → Upper A", () => {
    const o = { threeLifts: true };
    assert.equal(nextSession([], o), "UA");
    assert.equal(nextSession([lift(80, "UA")], o), "LS");
    assert.equal(nextSession([lift(80, "UA"), lift(81, "LS")], o), "UB");
    assert.equal(nextSession([lift(80, "UA"), lift(81, "LS"), lift(83, "UB")], o), "UA");
    assert.equal(nextSession([lift(80, "UA"), lift(81, "LS"), lift(83, "UB"), lift(85, "UA")], o), "LD");
    assert.equal(nextSession([lift(81, "LD"), lift(83, "UB"), lift(85, "UA")], o), "LS");
    // carries on from the normal rotation: Lower A squatted, so the deadlift turn is next
    assert.equal(nextSession([lift(78, "LA"), lift(79, "UB"), lift(80, "UA")], o), "LD");
    // mid-cycle of the normal rotation when the build starts: it carries on from there
    assert.equal(nextSession([lift(70, "UB")], o), "UA");
  });

  test("planToday follows it, offers the easy run, and Full means 3 lifts + 3 runs", () => {
    const log = [lift(80, "UA"), lift(81, "LS"), run(82, "tempo"), lift(83, "UB"), long(84, 10)];
    const p = planToday(log, s, d(85));
    assert.equal(p.threeLifts, true);
    assert.equal(p.next, "UA");
    assert.ok([p.primary, ...p.options].some((o) => o.ex === "easy-run"));
    assert.equal(p.progress.level, "Good");
    assert.deepEqual(p.progress.missing.Full, { lifts: 0, run: 0, cond: 1 });
    assert.equal(planToday([...log, run(85, "easy")], s, d(86)).progress.level, "Full");
    assert.deepEqual(liftCycle(log, s, d(85)), ["UA", "LD", "UB"]);
    assert.deepEqual(liftCycle(log.slice(0, 2), s, d(82)), ["UA", "LS", "UB"]);
  });

  test("the build Lower keeps Nordics and heavy slow calf raises every rotation", async () => {
    const { default: PLAN } = await import("../js/plan.js");
    for (const id of ["LS", "LD"]) {
      const ex = PLAN.sessions[id].items.map((i) => i.ex);
      assert.ok(ex.includes("nordic-hamstring-curl") && ex.includes("smith-calf-raise") && ex.includes("seated-dumbbell-calf-raise"), id);
      // the Short version still keeps the calf raises (third station)
      assert.ok(shortItems(PLAN.sessions[id].items).some((i) => i.ex === "smith-calf-raise"), id);
    }
    assert.ok(PLAN.sessions.LS.items.some((i) => i.ex === "dumbbell-romanian-deadlift"));
    assert.ok(PLAN.sessions.LD.items.some((i) => i.ex === "bulgarian-split-squat"));
    // no intervals or basketball the day after either: Nordics leave the hamstrings sore
    assert.ok(planToday([lift(80, "UA"), lift(81, "LD")], s, d(82)).hints.includes("no-sprint-after-lower-b"));
  });

  test("after race day the normal four-lift rotation is back", () => {
    assert.equal(threeLiftBuild(s, d(161)), false);
    assert.equal(planToday([lift(158, "UB")], s, d(162)).next, "LB");
  });
});

describe("Deload skip and the 6-week check", () => {
  const steady = Array.from({ length: 40 }, (_, i) => lift(i * 2, ["UA", "LA", "UB", "LB"][i % 4]));

  test("steady training: the deload is due at 6 weeks, with the checkpoint tests", () => {
    const s = deloadStatus(steady, {}, d(42));
    assert.deepEqual(s.reasons, ["time"]);
    assert.equal(s.checkpoint, true);
    assert.equal(deloadStatus(steady, {}, d(41)).checkpoint, false);
  });

  test("two Busy weeks in the 6 before: skipped, tests still due, clock restarts", () => {
    const settings = { modeLog: [{ date: d(14), busy: true }, { date: d(28), busy: false }] };
    const s = deloadStatus(steady, settings, d(42));
    assert.equal(s.suggested, false);
    assert.equal(s.skipped, d(42));
    assert.equal(s.checkpoint, true);
    assert.equal(deloadStatus(steady, settings, d(49)).checkpoint, false); // a week later
    assert.equal(deloadStatus(steady, settings, d(60)).suggested, false); // 6 weeks from the skip, not 6 + 2
  });

  test("two Minimum weeks (2 lifts or fewer) skip it too; one doesn't", () => {
    const thin = steady.filter((e) => !(e.date >= d(14) && e.date < d(28) && e.session.startsWith("L")));
    assert.equal(deloadStatus(thin, {}, d(42)).suggested, false);
    const oneThin = steady.filter((e) => !(e.date >= d(14) && e.date < d(21) && e.session.startsWith("L")));
    assert.equal(deloadStatus(oneThin, {}, d(42)).suggested, true);
  });

  test("Rough check-ins still trigger a deload in a light stretch", () => {
    const settings = { modeLog: [{ date: d(14), busy: true }, { date: d(28), busy: false }] };
    const rough = [...steady.filter((e) => e.date < d(40)), lift(40, "UA", { checkIn: "Rough" }), lift(41, "LA", { checkIn: "Rough" })];
    assert.ok(deloadStatus(rough, settings, d(42), { pendingCheckIn: "Rough" }).reasons.includes("rough"));
  });
});

describe("Rep ranges by dumbbell weight, slow lowers and the Short version", () => {
  const s = (date, kg, reps) => ({ date: d(date), sets: reps.map((r) => ({ kg, reps: r })) });
  const bench = { ex: "dumbbell-bench-press", role: "main", sets: 3, reps: [6, 10], byLoad: true };

  test("bands: up to 10 kg 8–15, 12.5–17.5 kg 6–10, from 20 kg 5–8", () => {
    assert.deepEqual(repRange(bench, 7.5), [8, 15]);
    assert.deepEqual(repRange(bench, 10), [8, 15]);
    assert.deepEqual(repRange(bench, 12.5), [6, 10]);
    assert.deepEqual(repRange(bench, 17.5), [6, 10]);
    assert.deepEqual(repRange(bench, 20), [5, 8]);
    assert.deepEqual(repRange({ ex: "x", reps: [8, 12] }, 30), [8, 12]); // not byLoad: its own range
  });

  test("double progression follows the band", () => {
    assert.equal(progression([s(0, 10, [10, 10, 10])], bench).action, "hold"); // 10 of 15
    const up = progression([s(0, 10, [15, 15, 15])], bench);
    assert.equal(up.action, "increase");
    assert.equal(up.kg, 12.5);
    assert.deepEqual(up.reps, [6, 10]);
    assert.equal(progression([s(0, 20, [8, 8, 8])], bench).kg, 22.5);
  });

  test("lateral raise: 12–20, then a session of 3-s lowers before the next dumbbell", () => {
    const raise = { ex: "dumbbell-lateral-raise", sets: 2, reps: [12, 20], slowFirst: true };
    const first = progression([s(0, 5, [20, 20])], raise);
    assert.equal(first.action, "hold");
    assert.equal(first.slow, true);
    assert.equal(first.kg, 5);
    const second = progression([s(0, 5, [20, 20]), s(4, 5, [20, 20])], raise);
    assert.equal(second.action, "increase");
    assert.equal(second.kg, 7.5);
  });

  test("Short keeps the first 3 stations: lower days keep their calf work", () => {
    const ex = (id) => prescribe(id, { short: true }).items.map((i) => i.ex || i.slot);
    assert.deepEqual(ex("LA"), ["jump", "smith-machine-back-squat", "smith-calf-raise", "copenhagen-side-plank"]);
    assert.deepEqual(ex("LB"), ["jump", "barbell-deadlift", "nordic-hamstring-curl", "seated-dumbbell-calf-raise"]);
    assert.deepEqual(ex("UA"), ["ladder", "dumbbell-bench-press", "smith-machine-inverted-row"]);
    assert.equal(shortItems([{ ex: "a" }, { ex: "b", pair: "x" }, { ex: "c" }, { ex: "d", pair: "x" }, { ex: "e" }]).length, 4);
  });
});

test("upcoming: one cycle from the next session; the runs never right before a lower session", async () => {
  const { upcoming } = await import("../js/engine.js");
  const order = (log, settings = {}) => upcoming(log, settings, "2026-11-27").map((x) => (x.type === "lift" ? x.id : x.type));
  assert.deepEqual(order([]), ["UA", "LA", "run", "UB", "LB", "long"]);
  const did = (session) => [{ date: "2026-11-26", type: "lift", session }];
  assert.deepEqual(order(did("UA")), ["LA", "run", "UB", "LB", "long", "UA"]);
  assert.deepEqual(order(did("LA")), ["UB", "LB", "run", "UA", "LA", "long"]);
  assert.deepEqual(order(did("UB")), ["LB", "run", "UA", "LA", "long", "UB"]);
  const busy = { modeLog: [{ date: "2026-11-20", busy: true }] };
  assert.deepEqual(order([], busy), ["FB1", "run", "FB2", "FB3"]);
  const half = { race: { distance: "21k", date: "2027-01-30" } };
  assert.deepEqual(order([], half), ["UA", "LS", "run", "UB", "long", "easy"]);
  assert.deepEqual(order([{ date: "2026-11-26", session: "LA" }, { date: "2026-11-26", session: "UB" }], half), ["UA", "LD", "run", "UB", "long", "easy"]);
});

describe("Basketball stands in for the quality run at most two rotations in a row", () => {
  test("two games in a row fill the Run slot; the third doesn't, and the tempo run is due", () => {
    const log = [run(0, "interval"), sport(7), sport(14)];
    assert.equal(gamesInRow(log, d(14)), 2);
    assert.equal(nextRunType(log, d(15)), "tempo");
    assert.equal(runPick(log, d(15)).gameLimit, true);
    const third = [...log, sport(21)];
    const L = normalizeLog(third);
    assert.equal(L[L.length - 1].c.slot, "extra"); // still a hard day, but fills no slot
    assert.equal(L[L.length - 1].c.hard, true);
    assert.equal(windowStats(third, d(22)).run, 0);
    const p = planToday(third, {}, d(22));
    const r = [p.primary, ...p.options].find((o) => o.type === "run");
    assert.equal(r.run, "tempo");
    assert.ok(p.hints.includes("quality-run-after-games"));
  });

  test("a second game in the same 7 days isn't another rotation; a run resets the count", () => {
    assert.equal(gamesInRow([sport(0), sport(3), sport(7)], d(8)), 2);
    assert.equal(gamesInRow([sport(0), sport(7), run(10, "tempo"), sport(17)], d(18)), 1);
    assert.equal(nextRunType([sport(0), sport(7), run(10, "tempo"), sport(17)], d(18)), "interval");
  });

  test("play as well on the third rotation: Lower B is the Short version", () => {
    const log = [run(0, "tempo"), sport(7), sport(14), lift(19, "UA"), lift(20, "LA"), sport(21), run(22, "tempo"), lift(23, "UB")];
    const p = planToday(log, {}, d(25));
    assert.equal(p.next, "LB");
    assert.equal(p.primary.short, true);
    assert.equal(p.primary.shortWhy, "extra-game");
    // once Lower B is done, the next one is Full again
    const after = [...log, lift(25, "LB"), lift(26, "UA"), lift(27, "LA"), lift(29, "UB")];
    assert.equal(planToday(after, {}, d(31)).primary.short, undefined);
  });
});
