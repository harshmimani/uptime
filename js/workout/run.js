// Runs, kept light: Strava records them, Uptime only says what today's run is.
//
// - runTarget(): the one-line target for a run the engine picked (js/engine.js nextRunType).
// - parseTimeLine(): reads an optional "10k 52:30" so the target paces stay current.
// - Paces come from a 5K-equivalent time (Riegel), from that line or the plan baseline.
// Pure functions: no DOM, no storage, no clock.

import PLAN from "../plan.js";

export const mmss = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

export const runName = (type, plan = PLAN) => plan.run.names[type] || (type === "easy" ? "Easy run" : type === "time-trial" ? "5K time trial" : "Run");

const DIST_WORDS = { half: 21.1, hm: 21.1, "half-marathon": 21.1, halfmarathon: 21.1, marathon: 42.2 };

/**
 * "10k 52:30", "5 km 24:10", "21.1k 1:55:00", "half 1:52:10", "52:30 10k".
 * Returns { km, sec } or null. Distance 1–43 km, time h:mm:ss or mm:ss.
 */
export function parseTimeLine(text) {
  if (!text) return null;
  const s = String(text).toLowerCase().replace(",", ".").trim();
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!t) return null;
  const sec = t[3] != null ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : Number(t[1]) * 60 + Number(t[2]);
  const rest = s.replace(t[0], " ");
  let km = null;
  const d = rest.match(/(\d+(?:\.\d+)?)\s*(k|km)\b/);
  if (d) km = Number(d[1]);
  else for (const [w, v] of Object.entries(DIST_WORDS)) if (new RegExp(`\\b${w}\\b`).test(rest)) km = v;
  if (km === 21) km = 21.1;
  if (!km || km < 1 || km > 43 || sec < 120) return null;
  const pace = sec / km;
  if (pace < 150 || pace > 720) return null; // 2:30–12:00 per km
  return { km, sec };
}

/** Time for `toKm` predicted from a result over `fromKm` (Riegel). */
export const riegel = (sec, fromKm, toKm, plan = PLAN) => sec * (toKm / fromKm) ** plan.run.paces.riegel;

/** The 5K-equivalent time in seconds: latest time line, else an old time trial, else onboarding, else baseline. */
export function fiveKSec(activities = [], settings = {}, plan = PLAN) {
  if (settings.paceRef?.sec && settings.paceRef?.km) return Math.round(riegel(settings.paceRef.sec, settings.paceRef.km, 5, plan));
  for (let i = activities.length - 1; i >= 0; i--) {
    const a = activities[i];
    if (a.kind === "run" && a.run === "time-trial" && a.sec > 0 && !a.partial) return a.sec;
  }
  return settings.fiveKSec || plan.baseline.fiveKSec;
}

/** Seconds per km for each target. */
export function paces(fiveK, plan = PLAN) {
  const c = plan.run.paces;
  const per = (km) => riegel(fiveK, 5, km, plan) / km;
  const p5 = fiveK / 5;
  return { "5k": p5, "10k": per(10), "21k": per(21.1), tempo: p5 + c.tempoOffset, easy: c.easyOffset.map((o) => p5 + o) };
}

const pace = (s) => `${mmss(s)}/km`;

/**
 * The run as one line. `pick` comes from the engine: { run, km?, phase?, distance? }.
 * Returns { type, name, target, note }.
 */
export function runTarget(pick, fiveK = PLAN.baseline.fiveKSec, plan = PLAN) {
  const type = pick.run;
  const pc = paces(fiveK, plan);
  const R = plan.run;
  const taper = pick.phase === "taper";
  const focus = pick.phase === "build" || taper ? pick.distance : "base";
  const racePace = pick.distance ? pc[pick.distance] : pc["5k"];
  const out = { type, name: runName(type, plan), target: "", note: "" };
  if (type === "interval") {
    const v = taper ? { ...R.interval.taper, at: pick.distance } : R.interval[focus] || R.interval.base;
    out.target = `${v.text} at ${pace(pc[v.at])}, ${v.jog}`;
    out.note = R.warmup;
  } else if (type === "tempo") {
    const v = taper ? { ...R.tempo.taper, at: pick.distance } : R.tempo[focus] || R.tempo.base;
    out.target = `${v.text} at ${pace(pc[v.at])}${v.jog ? `, ${v.jog}` : ""}`;
    out.note = R.warmup;
  } else if (type === "long") {
    const [lo, hi] = R.long.holdKm;
    const km = pick.hold ? `${lo}–${hi} km` : `${pick.km} km`;
    out.target = `${km} easy at ${mmss(pc.easy[0])}–${pace(pc.easy[1])}`;
    out.note = "Conversational the whole way. Walk breaks are fine.";
  } else if (type === "shakeout") {
    out.target = R.shakeout;
    out.note = "Race week: stay fresh.";
  } else if (type === "race") {
    const label = { "5k": "5K", "10k": "10K", "21k": "Half marathon" }[pick.distance];
    if (label) out.name = `${label} race`;
    out.target = `Goal pace about ${pace(racePace)}. Start a little slower.`;
    out.note = "Add your time below and the paces update.";
  } else {
    out.target = "Easy, conversational.";
  }
  return out;
}
