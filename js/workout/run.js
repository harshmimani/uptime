// Run model: the planned run (interval, tempo or 5K time trial) as pure functions.
// Paces come from the latest 5K (plan.run.paces); levels from plan.run.interval/tempo.
//
// A run in progress (saved as `db.active`, like a lift):
//   {
//     kind: "run", id, run: "interval" | "tempo" | "time-trial", level, date, startedAt, checkIn, short,
//     steps: [{ label, distM?, sec?, targetSec?, recoverySec }],
//     phase: "warmup" | "main",
//     log: [{ i, sec, t }],                    // one per finished rep / block / trial
//     work: { i, startAt, endAt|null } | null, // endAt null = stopwatch (reps, trial); set = countdown (tempo block)
//     rest: { startAt, endAt } | null,
//     lastSetAt
//   }

import PLAN from "../plan.js";

export const RUN_NAMES = { interval: "Intervals", tempo: "Tempo run", "time-trial": "5K time trial", easy: "Easy run" };

/** Latest 5K in seconds: the last time trial, else onboarding, else the plan baseline. */
export function fiveKSec(activities = [], settings = {}, plan = PLAN) {
  for (let i = activities.length - 1; i >= 0; i--) {
    const a = activities[i];
    if (a.kind === "run" && a.run === "time-trial" && a.sec > 0 && !a.partial) return a.sec;
  }
  return settings.fiveKSec || plan.baseline.fiveKSec;
}

/** Seconds per km for each effort, from a 5K time. */
export function paces(fiveK, plan = PLAN) {
  const p = fiveK / 5;
  const c = plan.run.paces;
  return { base: p, easy: c.easy.offsetSecPerKm.map((o) => p + o), tempo: p + c.tempo.offsetSecPerKm, interval: p + c.interval.offsetSecPerKm };
}

export const mmss = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

/** The run as steps. Short: fewer reps, or the first tempo block only. */
export function buildRun(type, { level = 1, short = false, fiveK = PLAN.baseline.fiveKSec } = {}, plan = PLAN) {
  const pc = paces(fiveK, plan);
  if (type === "interval") {
    const lv = plan.run.interval.levels.find((l) => l.level === level) || plan.run.interval.levels[0];
    const reps = short ? Math.max(3, Math.ceil(lv.reps * 0.6)) : lv.reps;
    const targetSec = Math.round((pc.interval * lv.distM) / 1000);
    return {
      type, level: lv.level, ex: lv.ex, name: RUN_NAMES.interval,
      summary: `${reps} × ${lv.distM} m · ${lv.recoverySec} s easy jog between`,
      effort: plan.run.paces.interval.effort, pace: pc.interval,
      steps: Array.from({ length: reps }, (_, i) => ({ label: `Rep ${i + 1} of ${reps}`, distM: lv.distM, targetSec, recoverySec: i < reps - 1 ? lv.recoverySec : 0 })),
    };
  }
  if (type === "tempo") {
    const lv = plan.run.tempo.levels.find((l) => l.level === level) || plan.run.tempo.levels[0];
    const blocks = short ? lv.blocksMin.slice(0, 1) : lv.blocksMin;
    return {
      type, level: lv.level, ex: plan.run.tempo.ex, name: RUN_NAMES.tempo,
      summary: blocks.length > 1 ? `${blocks.length} × ${blocks[0]} min · ${lv.recoverySec / 60} min easy between` : `${blocks[0]} min steady`,
      effort: plan.run.paces.tempo.effort, pace: pc.tempo,
      steps: blocks.map((m, i) => ({ label: blocks.length > 1 ? `Block ${i + 1} of ${blocks.length}` : "Tempo", sec: m * 60, recoverySec: i < blocks.length - 1 ? lv.recoverySec : 0 })),
    };
  }
  return {
    type: "time-trial", level: null, ex: plan.run.timeTrial.ex, name: RUN_NAMES["time-trial"],
    summary: "5 km, as fast as you can hold", effort: "Start controlled, push the last kilometre.", pace: pc.base,
    steps: [{ label: "5K", distM: 5000, targetSec: fiveK, recoverySec: 0 }],
  };
}

export function newRun({ id, type, date, now, checkIn, short = false, settings = {}, activities = [] }, plan = PLAN) {
  const level = type === "time-trial" ? null : settings.runLevels?.[type] ?? 1;
  const r = buildRun(type, { level, short, fiveK: fiveKSec(activities, settings, plan) }, plan);
  return {
    kind: "run", id, run: r.type, level: r.level, name: r.name, date, startedAt: now, checkIn, short,
    steps: r.steps, phase: "warmup", log: [], work: null, rest: null, lastSetAt: null,
  };
}

export const runCursor = (r) => r.log.length; // index of the next step
export const runFinished = (r) => r.log.length >= r.steps.length;

/** Start the next rep / block / trial. Blocks count down; reps and the trial are stopwatches. */
export function startStep(r, now) {
  const i = runCursor(r);
  const s = r.steps[i];
  if (!s) return;
  r.phase = "main";
  r.rest = null;
  r.work = { i, startAt: now, endAt: s.sec ? now + s.sec * 1000 : null };
}

/** Finish the running step (tap, or the countdown ending at `now`). Starts recovery. */
export function finishStep(r, now) {
  if (!r.work) return { finished: runFinished(r) };
  const s = r.steps[r.work.i];
  const end = r.work.endAt ? Math.min(now, r.work.endAt) : now;
  const sec = Math.max(1, Math.round((end - r.work.startAt) / 1000));
  r.log.push({ i: r.work.i, sec, t: end });
  r.lastSetAt = end;
  r.work = null;
  r.rest = s.recoverySec ? { startAt: end, endAt: end + s.recoverySec * 1000 } : null;
  return { finished: runFinished(r) };
}

export function undoStep(r) {
  const l = r.log.pop();
  if (!l) return null;
  r.rest = null;
  r.work = null;
  r.lastSetAt = r.log.length ? r.log[r.log.length - 1].t : null;
  return l;
}

/** On pace = within 2 s of the target for reps; blocks are by effort, so any full block counts. */
export const onPace = (step, sec) => (step.targetSec ? sec <= step.targetSec + 2 : sec >= (step.sec ?? 0) - 5);

export function toActivity(r, { partial = false } = {}) {
  const total = r.log.reduce((a, l) => a + l.sec, 0);
  const a = {
    id: r.id, date: r.date, t: r.startedAt, kind: "run", run: r.run, level: r.level ?? undefined, checkIn: r.checkIn,
    short: r.short || undefined, partial: partial || undefined,
    min: Math.max(1, Math.round(((r.lastSetAt ?? r.startedAt) - r.startedAt) / 60000)),
    reps: r.log.map((l) => ({ sec: l.sec })),
  };
  if (r.run === "time-trial" && r.log[0]) a.sec = r.log[0].sec;
  if (!total) delete a.reps;
  return a;
}

/** The run summary, against the last run of the same type and level. */
export function summarizeRun(r, last) {
  const hits = r.log.filter((l) => onPace(r.steps[l.i], l.sec)).length;
  const avg = r.log.length ? r.log.reduce((a, l) => a + l.sec, 0) / r.log.length : 0;
  let vsLast = null;
  if (last?.reps?.length) {
    const lastAvg = last.reps.reduce((a, x) => a + x.sec, 0) / last.reps.length;
    if (r.run === "time-trial") vsLast = { last: last.sec, delta: (r.log[0]?.sec ?? 0) - last.sec };
    else if (r.run === "interval" && last.level === r.level) vsLast = { last: lastAvg, delta: avg - lastAvg };
  }
  const allOnPace = r.log.length === r.steps.length && hits === r.steps.length;
  return { reps: r.log.length, planned: r.steps.length, hits, avg, vsLast, allOnPace, partial: r.log.length < r.steps.length };
}

/** Level for next time, from the plan's rule: every rep on pace and the last one felt 8/10 or easier. */
export function nextLevel(type, level, { allOnPace, feltOk }, plan = PLAN) {
  if (type === "time-trial" || level == null) return level;
  const max = plan.run[type].levels.length;
  return allOnPace && feltOk ? Math.min(max, level + 1) : level;
}
