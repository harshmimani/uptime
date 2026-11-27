import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, nextSession, planToday, returnAdjustment, prescribe, rollingProgress, streak,
  weekLevel, windowStats, deloadStatus, detectStall, progression, doubleAllowed, setBusy, isBusy,
  nextRunType, longRunKm, racePhase, runPick,
} from "../js/engine.js";

// Day 0 is a Monday, but nothing in the engine depends on that.
const BASE = "2026-11-02";
const d = (n) => addDays(BASE, n);
const lift = (n, session, extra = {}) => ({ date: d(n), session, ...extra });
const run = (n, kind = "interval", extra = {}) => ({ date: d(n), kind: "run", run: kind, ...extra });
const sport = (n, extra = {}) => ({ date: d(n), kind: "sport", ex: "basketball", ...extra });
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

  test("it fills the sport/conditioning slot", () => {
    const p = rollingProgress([...base, sport(4)], d(4));
    assert.equal(p.cond, 1);
    assert.equal(p.lifts, 3);
    assert.equal(p.level, "Good");
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

  test("the run slot cycles interval → tempo → long", () => {
    assert.equal(planToday([lift(0, "LB"), run(1, "interval")], {}, d(9)).options.find((o) => o.type === "run").run, "tempo");
    assert.equal(nextRunType([], d(0)), "interval");
    assert.equal(nextRunType([run(1, "tempo")], d(9)), "long");
    assert.equal(nextRunType([run(1, "long", { km: 8 })], d(9)), "interval");
    assert.equal(nextRunType([run(1, "time-trial")], d(9)), "interval"); // old logs don't break the cycle
    assert.equal(nextRunType([run(1, "tempo"), run(2, "easy")], d(9)), "long"); // easy runs fill the conditioning slot
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
    const log = [lift(0, "UA"), lift(1, "LA"), run(2), lift(3, "UB"), lift(4, "LB"), sport(5)];
    assert.equal(rollingProgress(log, d(6)).level, "Full");
    assert.equal(rollingProgress(log, d(7)).level, "Good"); // day 0 dropped out
    assert.deepEqual(rollingProgress(log, d(7)).missing.Full, { lifts: 1, run: 0, cond: 0 });
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

describe("Runs: long run build and race mode", () => {
  test("long runs build 1 km at a time from 8 km, then hold at 12–14 km", () => {
    assert.deepEqual(longRunKm([], d(0)), { km: 8, hold: false });
    assert.deepEqual(longRunKm([run(0, "long", { km: 8 })], d(21)), { km: 9, hold: false });
    assert.deepEqual(longRunKm([run(0, "long", { km: 12 })], d(21)), { km: 12, hold: true });
    assert.deepEqual(longRunKm([run(0, "long", { km: 11 })], d(60)), { km: 9, hold: false }); // long gap: 2 km lower
    assert.deepEqual(longRunKm([run(0, "long", { km: 19 })], d(21)), { km: 12, hold: true }); // after a race build
  });

  const race = (distance, inDays, from = 100) => ({ race: { distance, date: d(from + inDays) } });

  test("race phases: none, build (8–12 weeks), taper (1–2 weeks), race week, race day", () => {
    assert.equal(racePhase({}, d(0)).kind, "none");
    assert.equal(racePhase(race("21k", 120), d(100)).kind, "none");
    assert.equal(racePhase(race("21k", 84), d(100)).kind, "build");
    assert.equal(racePhase(race("5k", 60), d(100)).kind, "none");
    assert.equal(racePhase(race("21k", 14), d(100)).kind, "taper");
    assert.equal(racePhase(race("10k", 10), d(100)).kind, "taper");
    assert.equal(racePhase(race("10k", 6), d(100)).kind, "race-week");
    assert.equal(racePhase(race("10k", 0), d(100)).kind, "race");
    assert.equal(racePhase(race("10k", -1), d(100)).kind, "none"); // past race: back to normal
  });

  test("a 10K/21K build alternates quality and long runs, with longer long runs", () => {
    const s = race("21k", 60);
    assert.equal(nextRunType([run(90, "interval")], d(100), s), "long");
    assert.equal(nextRunType([run(85, "interval"), run(90, "long", { km: 13 })], d(100), s), "tempo");
    assert.equal(nextRunType([run(85, "tempo"), run(90, "long", { km: 13 })], d(100), s), "interval");
    assert.deepEqual(longRunKm([run(90, "long", { km: 13 })], d(100), s), { km: 15, hold: false });
    assert.deepEqual(longRunKm([run(90, "long", { km: 19 })], d(100), s), { km: 19, hold: false }); // capped
    assert.equal(nextRunType([run(90, "interval")], d(100), race("5k", 40)), "tempo"); // 5K keeps the cycle
  });

  test("taper shortens the long run; race week is easy; race day is the race", () => {
    assert.deepEqual(longRunKm([run(90, "long", { km: 19 })], d(100), race("21k", 12)), { km: 11, hold: false });
    assert.equal(nextRunType([run(90, "interval")], d(100), race("10k", 4)), "shakeout");
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
    // Lower yesterday, long run next: the long run is flagged, not headlined
    const q = planToday([run(80, "tempo"), lift(98, "UB"), lift(99, "LB")], {}, d(100));
    const r = [q.primary, ...q.options].find((o) => o.type === "run");
    assert.equal(r.run, "long");
    assert.ok(r.cautions.includes("long-run-after-lower"));
    assert.notEqual(q.primary.type, "run");
  });

  test("taper and race week suggest the Short version for lifts", () => {
    assert.equal(planToday([lift(97, "LB")], race("21k", 10), d(100)).primary.short, true);
    assert.equal(planToday([lift(97, "LB")], {}, d(100)).primary.short, undefined);
  });
});

test("upcoming: one cycle from the next session; run and sport never right before a lower session", async () => {
  const { upcoming } = await import("../js/engine.js");
  const order = (log, settings = {}) => upcoming(log, settings, "2026-11-27").map((x) => (x.type === "lift" ? x.id : x.type));
  assert.deepEqual(order([]), ["UA", "LA", "run", "UB", "LB", "sport"]);
  const did = (session) => [{ date: "2026-11-26", type: "lift", session }];
  assert.deepEqual(order(did("UA")), ["LA", "run", "UB", "LB", "sport", "UA"]);
  assert.deepEqual(order(did("LA")), ["UB", "LB", "run", "UA", "LA", "sport"]);
  assert.deepEqual(order(did("UB")), ["LB", "run", "UA", "LA", "sport", "UB"]);
  const busy = { modeLog: [{ date: "2026-11-20", busy: true }] };
  assert.deepEqual(order([], busy), ["FB1", "run", "FB2", "FB3"]);
});
