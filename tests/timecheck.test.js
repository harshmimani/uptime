// Session time check by the coach's method (CLAUDE.md, Session rules): about 4.5 s per rep
// (6 s for 3 s up / 3 s down; a negative's slow lower adds to it), the rest as written after
// every set or superset round, 45 s per station, the 5-minute warm-up and the ramp-up sets
// (1 under 20 kg, 2 under 50 kg, else 3; 4 reps and 60 s each), mid-range reps.
// Lower days do their balance work inside the 5 minutes, and Lower B's pull-up practice sits
// in the deadlift ramp-up rests, so neither adds time.
import { test } from "node:test";
import assert from "node:assert/strict";
import PLAN from "../js/plan.js";
import { buildItems } from "../js/workout/model.js";

const mid = (r) => (r[0] + r[1]) / 2;
const perRep = (it) => {
  if (/3 s up/.test(it.tempo || "")) return 6;
  const lower = (it.tempo || "").match(/^(\d+)(?:–\d+)?-s lower/);
  return lower ? 2.5 + Number(lower[1]) : 4.5; // a slow lower replaces the usual ~2 s down
};
const work = (it) => (it.perSide ? 2 : 1) * (it.sec ? mid(it.sec) : mid(it.reps) * perRep(it));

export function sessionMinutes(id, { short = false, optional = false, ladderLevel = 1, jumpBlock = 1 } = {}) {
  let items = buildItems(id, { short, settings: { ladderLevel, jumpBlock } }, PLAN);
  if (!optional) items = items.filter((i) => !i.optional);
  let s = PLAN.warmup.minutes * 60;
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.key)) continue;
    const group = it.pair ? items.filter((x) => x.pair === it.pair) : [it];
    group.forEach((g) => seen.add(g.key));
    const rounds = Math.max(...group.map((g) => g.sets));
    for (let r = 0; r < rounds; r++) s += group.reduce((a, g) => a + (r < g.sets ? work(g) : 0), 0) + (group[group.length - 1].rest || 0);
    s += 45;
  }
  const main = items.find((i) => i.role === "main" && i.start?.kg);
  const kg = main ? main.start.kg : 0;
  const ramps = !main ? 0 : short ? 1 : kg < 20 ? 1 : kg < 50 ? 2 : 3;
  s += ramps * (4 * 4.5 + 60);
  return Math.round(s / 60);
}

test("every full session fits 50 minutes and every Short version 30, at every ladder level", () => {
  const ids = [...Object.keys(PLAN.sessions), ...Object.keys(PLAN.busy.sessions)];
  for (const ladderLevel of PLAN.ladder.map((l) => l.level)) {
    for (const id of ids) {
      assert.ok(sessionMinutes(id, { ladderLevel }) <= PLAN.rules.sessionMaxMin, `${id} at ladder ${ladderLevel}: ${sessionMinutes(id, { ladderLevel })} min`);
      assert.ok(sessionMinutes(id, { short: true, ladderLevel }) <= PLAN.rules.shortMaxMin, `${id} Short at ladder ${ladderLevel}`);
    }
  }
});

test("Lower A's optional carry still fits with it", () => {
  assert.ok(sessionMinutes("LA", { optional: true }) <= PLAN.rules.sessionMaxMin);
});

test("lower-day warm-ups stay 5 minutes: balance replaces the arm circles, practice sits in the ramp-up rests", () => {
  assert.equal(PLAN.warmup.lower.length, PLAN.warmup.general.length);
  assert.ok(PLAN.warmup.lower.some((l) => /balance/i.test(l)));
  assert.ok(!PLAN.warmup.lower.some((l) => /arm circles/i.test(l)));
  assert.match(PLAN.warmup.extra.LB, /ramp-up/);
});

if (process.env.TIMECHECK) {
  for (const id of [...Object.keys(PLAN.sessions), ...Object.keys(PLAN.busy.sessions)]) {
    console.log(id, sessionMinutes(id), "opt", sessionMinutes(id, { optional: true }), "short", sessionMinutes(id, { short: true }),
      "L3", sessionMinutes(id, { ladderLevel: 3 }));
  }
}
