// Workout section UI: check-in, one exercise in focus, rest timer, swaps, summary,
// plus today's run (one line, one tap: Strava records the run) and "log something else".
// Full screen, no tabs.
//
// Rendering: each screen is a template string painted into #app; clicks go through one
// delegated listener on [data-act]. Timers never count down in JS: they read end
// timestamps on each tick, so they're right after a lock, a call or an app switch.
// The workout is saved after every change (db.active) and restored on reopen.

import PLAN from "../plan.js";
import * as E from "../engine.js";
import { createStore, engineLog, exerciseHistory, isoDate, newId } from "../store.js";
import * as M from "./model.js";
import { startServiceWorker } from "../sw-client.js";
import * as R from "./run.js";
import { unlockAudio, sound, vibrate, setVibration, KeepAwake } from "./feedback.js";
import { setUnits, units, wu as unitLabel, fromUnit, weightStep } from "../units.js";
import { splitLetters, playIn, countTo, reducedMotion, wait } from "../motion.js";

const store = createStore();
const db = () => store.db;
const app = document.getElementById("app");
const live = document.getElementById("live");
const awake = new KeepAwake(new URL("../../assets/keep-awake.mp4", import.meta.url).href);
const now = () => Date.now();
const today = () => isoDate(new Date());
const hist = (ex) => exerciseHistory(db(), ex);

const ui = {
  view: "set",
  pending: null,     // check-in screen: { type: "lift", session, short, noGym, rough }
  summary: null,     // finish summary data
  finished: null,    // the workout just finished (for Resume)
  toast: null,       // { text, action, act, until }
  saveFailed: false,
  lock: false,       // ignore taps while the set-done animation plays
  other: null,       // log something else: { date, savedId, editing }
  sheet: null,       // "swap" | "all" | null
  alerted: {},       // rest/work end timestamps already announced
  run: null,         // today's run screen: { pick, t, raceOpen, raceDraft }
};

// ------------------------------------------------------------------ helpers

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtKg = M.fmtKg;
const clock = (ms) => R.mmss(ms / 1000);
const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>`;
const dayName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
/** The sport slot is named by the user (Settings › Sport); stored as "basketball" so old logs still match. */
const actName = (ex) => (ex === "basketball" && db().settings.sportName ? db().settings.sportName : M.exName(ex));
const say = (text) => { live.textContent = ""; setTimeout(() => (live.textContent = text), 30); };

function persist() {
  const r = store.save();
  ui.saveFailed = !r.ok;
  if (!r.ok) {
    const box = document.getElementById("save-error");
    if (box) box.hidden = false;
  }
  return r.ok;
}

function go(view, { vt = false } = {}) {
  ui.sheet = null;
  ui.toast = null; // a toast belongs to the screen it was raised on
  clearTimeout(toast.t);
  const paint = () => {
    ui.view = view;
    render({ focus: true });
  };
  if (vt && document.startViewTransition && !reducedMotion()) document.startViewTransition(paint);
  else paint();
}

function toast(text, action = null, act = null, ms = 5000) {
  ui.toast = { text, action, act, until: now() + ms };
  paintToast(true);
  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    ui.toast = null;
    const el = document.querySelector(".toast-slot .toast");
    if (el) { el.classList.add("leave"); setTimeout(() => paintToast(), 260); }
  }, ms);
}
function paintToast(enter = false) {
  const slot = document.getElementById("toast-slot");
  if (!slot) return;
  const t = ui.toast && ui.toast.until > now() ? ui.toast : null;
  slot.innerHTML = t
    ? `<div class="toast${enter ? " enter" : ""}"><span>${esc(t.text)}</span>${t.action ? `<button class="btn btn--text" data-act="${t.act}">${esc(t.action)}</button>` : ""}</div>`
    : "";
}

const saveErrorBox = () => `<div class="notice notice--warn" id="save-error" ${ui.saveFailed ? "" : "hidden"} role="alert">
  <div><b>Couldn't save to this phone.</b> Your sets are still here on screen. Storage may be full or blocked (private browsing).
  <div><button class="btn btn--text" data-act="retry-save">Try again</button></div></div></div>`;

// ------------------------------------------------------------------ what's next (engine)

function todayPlan(checkIn) {
  return E.planToday(engineLog(db()), db().settings, today(), { checkIn });
}

function liftAdjust(p) {
  const a = p.primary?.type === "lift" ? p.primary : p.options.find((o) => o.type === "lift");
  return a?.adjust || {
    loadFactor: p.returnAdjustment.loadFactor, setsDelta: p.returnAdjustment.setsDelta,
    setsFactor: p.deload.active ? p.deload.setsFactor : 1, deload: p.deload.active, returnTier: p.returnAdjustment.tier,
  };
}

// ------------------------------------------------------------------ screens

function render({ focus = false } = {}) {
  const v = ui.view;
  const html =
    v === "checkin" ? viewCheckin()
    : v === "set" ? viewSet()
    : v === "resume" ? viewResume()
    : v === "summary" ? viewSummary()
    : v === "run" ? viewRun()
    : viewOther();
  app.innerHTML = html + (ui.sheet ? viewSheet() : "");
  paintToast();
  afterRender(focus);
}

function afterRender(focus) {
  for (const el of app.querySelectorAll("[data-kt]")) { splitLetters(el); playIn(el); }
  for (const el of app.querySelectorAll("[data-count]")) {
    const to = Number(el.dataset.count);
    countTo(el, to, { format: (v) => Math.round(v).toLocaleString("en-GB") });
  }
  const segs = app.querySelectorAll(".week .seg--done");
  segs.forEach((s, i) => setTimeout(() => s.classList.add("on"), reducedMotion() ? 0 : 200 + i * 90));
  const mark = app.querySelector(".done-mark");
  if (mark) requestAnimationFrame(() => mark.classList.add("play"));
  syncRing();
  tick();
  if (ui.sheet) {
    app.querySelector(".sheet")?.focus();
  } else if (focus) {
    const h = app.querySelector("h1, .ex-name");
    h?.setAttribute("tabindex", "-1");
    h?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

// ---------------------------------------------------------------- back to Home (index.html)
// Home is its own page. A toast meant for Home (Undo on a run, "Back to it") travels in
// sessionStorage and is shown there; js/home/app.js carries out its Undo.

function goHome(flash = null, { replace = false } = {}) {
  if (flash) { try { sessionStorage.setItem("uptime-flash", JSON.stringify(flash)); } catch { /* the toast is a nicety */ } }
  awake.off();
  if (replace) location.replace("index.html");
  else location.href = "index.html";
}

// ---------------------------------------------------------------- check-in

function runInfo() {
  const pick = E.runPick(engineLog(db()), today(), db().settings);
  return { pick, t: R.runTarget(pick, R.fiveKSec(db().activities, db().settings)) };
}
function startRun() {
  ui.run = { ...runInfo(), raceOpen: false, raceDraft: null };
  go("run", { vt: true });
}

function viewCheckin() {
  const pd = ui.pending;
  let label, full, short, list, notes = [];
  {
    const def = E.sessionDef(pd.session);
    const f = M.buildItems(pd.session, { short: false, noGym: pd.noGym, adjust: pd.adjust, settings: db().settings });
    const s = M.buildItems(pd.session, { short: true, noGym: pd.noGym, adjust: pd.adjust, settings: db().settings });
    const cur = pd.short ? s : f;
    label = `${def.name} · about ${M.estimateMin(cur)} min`;
    full = `${f.length} exercises · about ${M.estimateMin(f)} min`;
    short = `${s.length} exercises · ${s.every((x) => x.sets <= PLAN.short.sets) ? "2 sets each" : "fewer sets"}`;
    list = f.map((it, i) => `<li class="${pd.short && i >= s.length ? "out" : ""}"><b>${esc(M.exName(it.ex))}</b><span class="num">${pd.short && i < s.length ? s[i].sets : it.sets} × ${esc(M.rangeText(it).replace(" reps", ""))}</span></li>`).join("");
    if (pd.adjust.loadFactor < 1) notes.push(`Weights today: about ${Math.round(pd.adjust.loadFactor * 100)}% of last time${pd.adjust.setsDelta ? ", one set fewer per exercise" : ""}.`);
    if (pd.adjust.deload) notes.push("Deload week: same exercises, about half the sets.");
    else if (pd.deload?.suggested) notes.push("A deload is due: same exercises, about half the sets, for a week.");
    if (pd.noGym) notes.push(PLAN.noGym.loadTip);
  }
  return `<main class="scr vt-card" data-screen="checkin">
    <header class="scr__head">
      <div class="row between"><span class="label">${esc(label)}</span><button class="btn btn--text" data-act="home">Not now</button></div>
      <h1 class="h1">How do you feel today?</h1>
      <p class="meta" style="margin:0">Rough switches to the Short version. You can change it any time.</p>
    </header>
    <div class="scr__body">
      ${notes.map((n) => `<div class="notice"><div>${esc(n)}</div></div>`).join("")}
      ${pd.type === "lift" && pd.deload?.suggested && !pd.adjust.deload ? `<button class="btn btn--secondary btn--wide" data-act="take-deload">Make this a deload week</button>` : ""}
      <div class="seg-ctl" role="group" aria-label="Session length">
        <button type="button" data-act="pick-length" data-short="0" aria-pressed="${!pd.short}"><b>Full</b><span>${esc(full)}</span></button>
        <button type="button" data-act="pick-length" data-short="1" aria-pressed="${!!pd.short}"><b>Short</b><span>${esc(short)}</span></button>
      </div>
      <ol class="exlist" aria-label="Today's exercises">${list}</ol>
      ${pd.type === "lift" ? `<button class="btn btn--text" style="justify-self:start" data-act="toggle-nogym">${pd.noGym ? "Back to the gym version" : "No gym today? Use the no-gym version"}</button>` : ""}
    </div>
    <div class="scr__foot">
      <div class="toast-slot" id="toast-slot" aria-live="polite"></div>
      <div class="foot-actions" role="group" aria-label="How do you feel?">
        <button class="btn btn--primary" data-act="checkin" data-v="Good"><span class="btn__label">Good</span></button>
        <button class="btn btn--primary" data-act="checkin" data-v="Okay"><span class="btn__label">Okay</span></button>
        <button class="btn btn--secondary btn--tall" data-act="checkin" data-v="Rough"><span class="btn__label">Rough</span></button>
      </div>
    </div>
  </main>`;
}

function checkIn(v) {
  unlockAudio();
  const pd = ui.pending;
  const rough = v === "Rough" && !pd.short;
  const short = pd.short || v === "Rough";
  const id = newId("s");
  db().active = M.newWorkout({ id, sessionId: pd.session, date: today(), now: now(), checkIn: v, short, noGym: pd.noGym, adjust: pd.adjust, settings: db().settings });
  persist();
  awake.on();
  go("set");
  if (rough) toast("Short version on: first 3 exercises, 2 sets each.", "Switch to full", "to-full", 8000);
}

// ---------------------------------------------------------------- set screen

function headerFor(w, it) {
  const pos = w.items.indexOf(it) + 1;
  const segs = w.items.map((x) => {
    const d = M.doneCount(w, x.key);
    const cls = d >= x.sets ? "done" : x.key === it.key ? "cur" : "";
    return `<i class="${cls}" style="--fill:${(d / x.sets).toFixed(2)}"></i>`;
  }).join("");
  return `<header class="scr__head vt-card">
    <div class="row between"><span class="label">${esc(w.name)}${w.short ? " · Short" : ""} · ${pos} of ${w.items.length}</span><span class="meta num" id="elapsed" aria-label="Time in session"></span></div>
    <div class="segs" aria-hidden="true">${segs}</div>
  </header>`;
}

function targetLine(p, it) {
  const t = p.target;
  const last = p.last ? `<span class="meta">Last time: ${esc(M.lastTimeText(p.last))}</span>` : "";
  let goal = "";
  if (t.kind === "beat" && t.last) {
    const lr = t.last.sec ?? t.last.reps;
    const unit = t.last.sec != null ? " s" : " reps";
    goal = t.last.kg > 0 ? `Beat ${fmtKg(t.last.kg)} ${unitLabel()} × ${lr}: ${lr + 1}${unit}, or more weight` : `Beat ${lr}${unit}: go for ${lr + 1}`;
  } else if (t.kind === "up") goal = `Up from ${fmtKg(t.fromKg)} ${unitLabel()}. Any set in range beats last time.`;
  else if (t.kind === "easy") goal = t.lighter ? "Lighter day: about 90% of last time. Just move well." : ui.view === "set" && db().active?.adjust?.deload ? "Deload: same weights, fewer sets." : "Short version: no target, just get it done.";
  else goal = p.weighted ? "First time: pick a weight that leaves 1–3 reps in the tank." : it.role === "main" ? "First time: clean reps, stop 1–3 short of failure." : "First time: note what you can do with good form.";
  const beatable = t.kind === "beat" || t.kind === "up";
  return `<div class="target">${last}<span class="beat" id="beat" data-beatable="${beatable}" data-goal="${esc(goal)}">${beatable ? CHECK : ""}<span>${esc(goal)}</span></span></div>`;
}

function stepper({ id, value, unit, label, step, input = false, min = 0 }) {
  const v = id === "kg" ? fmtKg(value) : String(value);
  const stepName = id === "kg" ? `${units() === "lb" ? 5 : 2.5} ${unitLabel()}` : step;
  return `<div class="stepper" role="group" aria-label="${esc(label)}">
    <button class="stepper__key" type="button" data-act="step" data-f="${id}" data-d="-${step}" aria-label="${esc(`${stepName} less`)}" ${value <= min ? "disabled" : ""}>−</button>
    <div class="stepper__value">
      ${input
        ? `<input class="stepper__num num" id="v-${id}" inputmode="decimal" enterkeyhint="done" aria-label="${esc(label)} in ${unitLabel()}" value="${esc(v)}">`
        : `<span class="stepper__num display num" id="v-${id}" aria-live="polite">${esc(v)}</span>`}
      <span class="stepper__unit">${esc(unit)}</span>
    </div>
    <button class="stepper__key" type="button" data-act="step" data-f="${id}" data-d="${step}" aria-label="${esc(`${stepName} more`)}">+</button>
  </div>`;
}

function currentValues(w, p) {
  const d = w.draft && w.draft.key === w.cur && w.draft.n === p.n ? w.draft : {};
  return { kg: p.weighted ? (d.kg ?? p.kg) : null, reps: p.reps != null ? (d.reps ?? p.reps) : null, sec: p.sec != null ? (d.sec ?? p.sec) : null };
}

function logLabel(w, p, v, it) {
  const last = M.totalSets(w) - w.log.length === 1;
  const what = last ? "Log last set" : `Log set ${p.n}`;
  if (v.sec != null) return w.work ? `Stop · log ${Math.max(1, Math.round((now() - w.work.startAt) / 1000))} s` : `Start ${v.sec * (it.perSide ? 2 : 1)} s${it.perSide ? ` · ${v.sec} per side` : ""}`;
  const reps = `${v.reps}${it.perSide ? " per side" : ""}`;
  return v.kg != null && v.kg > 0 ? `${what} · ${reps} × ${fmtKg(v.kg)} ${unitLabel()}` : `${what} · ${reps} reps`;
}

function viewSet() {
  const w = db().active;
  const it = M.item(w, w.cur);
  if (!it) return viewResume(); // nothing left in focus: offer Finish rather than a blank screen
  const p = M.prefill(w, w.cur, hist);
  const v = currentValues(w, p);
  const mine = w.log.filter((l) => l.key === it.key);
  const tags = [];
  if (it.swapped === "today") tags.push("Swapped for today");
  if (it.swapped === "always") tags.push("Your usual swap");
  if (it.swapped === "nogym") tags.push("No-gym version");
  if ((w.adjust.loadFactor ?? 1) < 1 && p.weighted) tags.push(`About ${Math.round(w.adjust.loadFactor * 100)}% today`);
  if (w.adjust.deload) tags.push("Deload");
  if (it.tempo) tags.push(it.tempo);
  if (it.ladder) tags.push(`Pull-up ladder · level ${it.ladder}`);
  const partner = it.pair ? w.items.filter((x) => x.pair === it.pair && x.key !== it.key) : [];
  const wu = w.log.length === 0 ? M.warmup(w, hist) : null;
  // The ramp-up belongs to the first loaded main lift. When that lift isn't first (Upper A opens
  // with pull-ups), the card is gone by the time it comes up, so the ramp-up shows again there.
  const rampHere = !wu && mine.length === 0 && !w.rest && !w.adjust.deload ? M.warmup(w, hist).ramp : null;
  const rampText = (r) => r.sets.map((s) => `${fmtKg(s.kg)} ${unitLabel()} × ${s.reps}`).join(", ");
  const warmEnd = w.startedAt + PLAN.warmup.minutes * 60000;
  const steppers = [];
  if (p.weighted) steppers.push(stepper({ id: "kg", value: v.kg, unit: p.unit, label: "Weight", step: weightStep(), input: true }));
  if (v.sec != null) steppers.push(stepper({ id: "sec", value: v.sec, unit: it.perSide ? "seconds per side" : "seconds", label: "Seconds", step: M.SEC_STEP, min: 5 }));
  else steppers.push(stepper({ id: "reps", value: v.reps, unit: it.perSide ? "reps per side" : "reps", label: "Reps", step: 1, min: 1 }));
  const timerBox = w.work
    ? timerBoxHTML({ kind: "work", label: it.perSide ? "Work · switch sides halfway" : "Work", next: M.exName(it.ex) })
    : w.rest
      ? timerBoxHTML({ kind: "rest", label: "Rest", next: `Next: ${M.exName(it.ex)} · set ${p.n} of ${it.sets}` })
      : "";
  return `<main class="scr" data-screen="set">
    ${headerFor(w, it)}
    <div class="scr__body">
      ${saveErrorBox()}
      ${timerBox}
      ${wu ? `<section class="card" aria-labelledby="wu-h">
        <div class="row between"><h2 class="label" id="wu-h">Warm-up · ${wu.minutes} min</h2><span class="warm__time num" id="warm-left" data-end="${warmEnd}"></span></div>
        <ul class="checklist">${wu.general.map((g) => `<li>${esc(g)}</li>`).join("")}
          ${!wu.ramp ? `<li><b>Ramp-up:</b> ${esc(PLAN.warmup.ramp)}</li>`
            : wu.ramp.ex === it.ex ? `<li><b>Ramp-up on ${esc(wu.ramp.name)}:</b> ${rampText(wu.ramp)}</li>`
            : `<li><b>Ramp-up sets for ${esc(wu.ramp.name)}</b> show up when you get there.</li>`}
        </ul>
        <p class="quiet">Stays here until you log set 1.</p>
      </section>` : ""}
      ${rampHere && rampHere.ex === it.ex ? `<div class="notice"><div><b>Ramp-up first:</b> ${rampText(rampHere)}. No rest needed between them.</div></div>` : ""}
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      <div>
        <h1 class="ex-name" id="ex-name">${esc(M.exName(it.ex))}</h1>
        <p class="meta cue">${esc(M.exCue(it.ex))}${p.setup ? ` · ${esc(p.setup)}` : ""}</p>
        ${partner.length ? `<p class="quiet" style="margin-top:4px">Superset with ${esc(partner.map((x) => M.exName(x.ex)).join(" and "))}: alternate, rest after both.</p>` : ""}
        ${it.note ? `<p class="quiet" style="margin-top:4px">${esc(it.note)}</p>` : ""}
      </div>
      <div class="setline"><b>Set ${p.n} of ${it.sets}</b><span class="meta">${esc(M.rangeText(it))}</span></div>
      ${targetLine(p, it)}
      ${p.prog.action === "reset" ? `<div class="notice"><div>${esc(PLAN.rules.stallAdvice)}</div></div>` : ""}
      ${mine.length ? `<ul class="logged" aria-label="Logged sets">${mine.map((l, i) => `<li class="${i === mine.length - 1 && ui.justLogged ? "enter" : ""}"><span>Set ${l.n}${l.ex !== it.ex ? ` · ${esc(M.exName(l.ex))}` : ""}</span><b class="num">${l.sec != null ? `${l.sec} s` : `${l.reps}`}${l.kg ? ` × ${fmtKg(l.kg)} ${unitLabel()}` : l.sec != null ? "" : " reps"}</b></li>`).join("")}</ul>` : ""}
    </div>
    <div class="scr__foot">
      <div class="toast-slot" id="toast-slot" aria-live="polite"></div>
      <div class="steppers">${steppers.join("")}</div>
      <div class="row"><button class="btn btn--secondary grow" data-act="open-swap" ${w.work ? "disabled" : ""}>Swap</button><button class="btn btn--secondary grow" data-act="open-all">All exercises</button></div>
      <button class="btn btn--primary" id="log-btn" data-act="log">
        <span class="btn__label" id="log-label">${esc(logLabel(w, p, v, it))}</span>
        <span class="btn__done" aria-hidden="true">${CHECK.replace("<svg", '<svg class="check"')}<span id="done-label">Logged</span></span>
      </button>
    </div>
  </main>`;
}

function timerBoxHTML({ kind, label, next }) {
  return `<section class="timerbox${ui.timerEnter ? " enter" : ""}" aria-label="${esc(label)} timer">
    <div class="row between"><span class="label" id="timer-label">${esc(label)}</span><span class="meta">${esc(next)}</span></div>
    <div class="ring" id="ring" data-kind="${kind}" role="timer" aria-label="${esc(label)}">
      <div class="ring__track"></div>
      <div class="ring__half ring__half--r"><div class="ring__fill"></div></div>
      <div class="ring__half ring__half--l"><div class="ring__fill"></div></div>
      <div class="ring__pulse"></div>
      <div class="ring__center"><span class="ring__time display num" id="ring-time"></span><span class="ring__ago" id="ring-sub"></span></div>
    </div>
    ${kind === "rest" ? `<div class="row" role="group" aria-label="Adjust rest">
      <button class="btn btn--secondary" data-act="rest-add" data-d="-15" aria-label="15 seconds less rest">−15 s</button>
      <button class="btn btn--secondary" data-act="rest-add" data-d="15" aria-label="15 seconds more rest">+15 s</button>
      <button class="btn btn--secondary" data-act="rest-skip">Skip</button>
    </div>` : ""}
  </section>`;
}

/** Point the ring's single CSS sweep at the stored timestamps. */
function syncRing() {
  const ring = document.getElementById("ring");
  if (!ring) return;
  const a = db().active;
  const t = ring.dataset.kind === "work" ? a?.work : a?.rest;
  if (!t || !t.endAt) return;
  const total = t.endAt - t.startAt;
  ring.style.setProperty("--dur", `${total}ms`);
  ring.style.setProperty("--delay", `${-(now() - t.startAt)}ms`);
  ring.classList.remove("run", "over");
  void ring.offsetWidth;
  if (now() < t.endAt) ring.classList.add("run");
  else ring.classList.add("over");
}

// ---------------------------------------------------------------- the 4-per-second tick

function tick() {
  const a = db().active;
  const t = now();
  const el = document.getElementById("elapsed");
  if (el && a) el.textContent = clock(t - a.startedAt);
  const warm = document.getElementById("warm-left");
  if (warm) {
    const left = Number(warm.dataset.end) - t;
    warm.textContent = left > 0 ? clock(left) : "Done";
    warm.classList.toggle("over", left <= 0);
  }
  if (!a) return;
  const soundOn = db().settings.sound !== false;
  const ring = document.getElementById("ring");
  const time = document.getElementById("ring-time");
  const sub = document.getElementById("ring-sub");

  // a timed set or a tempo block that ran out: log it at its end time
  if (a.work?.endAt && t >= a.work.endAt) {
    finishTimedSet(a.work.endAt);
    return;
  }
  if (a.work && ring && time) {
    if (a.work.endAt) {
      const left = a.work.endAt - t;
      time.textContent = clock(left + 999);
      const it = M.item(a, a.work.key);
      const half = a.work.startAt + (a.work.endAt - a.work.startAt) / 2;
      if (it?.perSide && t >= half && !ui.alerted[`h${half}`]) { ui.alerted[`h${half}`] = 1; sound("tick", soundOn); vibrate(40); }
      if (sub) sub.textContent = it?.perSide ? (t >= half ? "Second side" : "First side") : "";
      beepCountdown(a.work.endAt, left, soundOn);
    }
  }
  const logLbl = document.getElementById("log-label");
  if (logLbl && a.work) {
    logLbl.textContent = `Stop · log ${Math.max(1, Math.round((t - a.work.startAt) / 1000))} s`;
  }

  if (a.rest && !a.work && time) {
    const left = a.rest.endAt - t;
    if (left > 0) {
      time.textContent = clock(left + 999);
      if (sub) sub.textContent = "";
      beepCountdown(a.rest.endAt, left, soundOn);
    } else {
      time.textContent = "Go";
      const ago = -left;
      if (sub) sub.textContent = ago > 5000 ? `Rest over · ${clock(ago)} ago` : "Rest over";
      if (ring && !ring.classList.contains("over")) { ring.classList.remove("run"); ring.classList.add("over"); }
      if (!ui.alerted[a.rest.endAt]) {
        ui.alerted[a.rest.endAt] = 1;
        // only make noise if it ended just now, not while the phone was in a pocket
        if (ago < 3000 && !document.hidden) { sound("go", soundOn); vibrate([30, 60, 30]); }
        say("Rest over");
      }
    }
  }
}

function beepCountdown(endAt, left, soundOn) {
  const s = Math.ceil(left / 1000);
  if (s >= 1 && s <= 3 && !ui.alerted[`${endAt}:${s}`] && !document.hidden) {
    ui.alerted[`${endAt}:${s}`] = 1;
    sound("tick", soundOn);
  }
}

setInterval(tick, 250);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (ui.view === "set") { syncRing(); tick(); }
});

// ---------------------------------------------------------------- set actions

function readValues() {
  const w = db().active;
  const p = M.prefill(w, w.cur, hist);
  return { p, v: currentValues(w, p) };
}

function setDraft(field, value) {
  const w = db().active;
  const { p, v } = readValues();
  w.draft = { key: w.cur, n: p.n, kg: v.kg, reps: v.reps, sec: v.sec, [field]: value };
  persist();
  updateControls(field, value > (v[field] ?? 0) ? "up" : "down");
}

/** Update steppers, Log label and the beat badge in place (no repaint, so nothing jumps). */
function updateControls(changed, dir) {
  const w = db().active;
  const it = M.item(w, w.cur);
  const { p, v } = readValues();
  for (const f of ["kg", "reps", "sec"]) {
    const el = document.getElementById(`v-${f}`);
    if (!el || v[f] == null) continue;
    const text = f === "kg" ? fmtKg(v[f]) : String(v[f]);
    if (el.tagName === "INPUT") { if (document.activeElement !== el) el.value = text; }
    else if (el.textContent !== text) {
      el.textContent = text;
      if (f === changed) { el.classList.remove("up", "down"); void el.offsetWidth; el.classList.add(dir); }
    }
    const minus = el.closest(".stepper")?.querySelector('[data-d^="-"]');
    if (minus) minus.disabled = v[f] <= (f === "sec" ? 5 : f === "reps" ? 1 : 0);
  }
  const lbl = document.getElementById("log-label");
  if (lbl) lbl.textContent = logLabel(w, p, v, it);
  const beat = document.getElementById("beat");
  if (beat && beat.dataset.beatable === "true") {
    const on = M.beats(v, p.target.last);
    if (on !== beat.classList.contains("on")) {
      beat.classList.toggle("on", on);
      if (on) { vibrate(12); }
    }
    const span = beat.querySelector("span");
    if (on) span.textContent = v.kg > (p.target.last?.kg ?? 0) ? "Beats last time: more weight" : "Beats last time";
    else span.textContent = beat.dataset.goal || span.textContent;
  }
}

function step(field, d) {
  const { v } = readValues();
  const min = field === "sec" ? 5 : field === "reps" ? 1 : 0;
  const next = Math.max(min, Math.round(((v[field] ?? 0) + d) * 100) / 100);
  setDraft(field, next);
}

async function logTap(btn, ev) {
  const w = db().active;
  if (ui.lock || !w) return;
  unlockAudio();
  const it = M.item(w, w.cur);
  const { p, v } = readValues();
  // timed sets: the first tap starts the clock
  if (v.sec != null && !w.work) {
    const secs = v.sec * (it.perSide ? 2 : 1);
    w.work = { key: w.cur, startAt: now(), endAt: now() + secs * 1000 };
    w.rest = null;
    persist();
    ui.timerEnter = true;
    render();
    ui.timerEnter = false;
    return;
  }
  const values = v.sec != null ? { kg: v.kg, sec: Math.max(1, Math.round((now() - w.work.startAt) / 1000 / (it.perSide ? 2 : 1))) } : v;
  commitSet(values, now(), btn, ev);
}

function finishTimedSet(endAt) {
  const w = db().active;
  if (!w?.work) return;
  const it = M.item(w, w.work.key);
  const { v } = readValues();
  w.cur = w.work.key;
  commitSet({ kg: v.kg, sec: v.sec ?? it.sec?.[0] }, endAt, document.getElementById("log-btn"));
  if (!document.hidden) { sound("go", db().settings.sound !== false); vibrate([30, 60, 30]); }
}

async function commitSet(values, t, btn, ev) {
  const w = db().active;
  ui.lock = true;
  const n = M.doneCount(w, w.cur) + 1;
  const res = M.logSet(w, { kg: values.kg && values.kg > 0 ? values.kg : null, reps: values.reps, sec: values.sec }, t);
  persist(); // saved before anything animates
  vibrate(18);
  say(`Set ${n} logged`);
  if (btn) {
    if (ev && ev.clientX) {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--tap-x", `${ev.clientX - r.left}px`);
      btn.style.setProperty("--tap-y", `${ev.clientY - r.top}px`);
    }
    const dl = document.getElementById("done-label");
    if (dl) dl.textContent = res.finished ? "Session done" : `Set ${n} logged`;
    btn.classList.add("is-done");
    await wait(reducedMotion() ? 250 : 560);
  }
  ui.lock = false;
  if (res.finished) return finishWorkout(false);
  ui.justLogged = true;
  ui.timerEnter = true;
  render({ focus: false });
  ui.justLogged = false;
  ui.timerEnter = false;
  toast(`Set ${n} logged`, "Undo", "undo");
}

function undo() {
  const w = db().active;
  if (!w || !w.log.length) return;
  const l = M.undoLast(w);
  persist();
  ui.toast = null;
  render();
  say(`Set ${l.n} removed`);
}

function restAdd(d) {
  const w = db().active;
  if (!w?.rest) return;
  const t = now();
  if (w.rest.endAt <= t) {
    if (d < 0) return;
    w.rest = { startAt: t, endAt: t + d * 1000 };
  } else {
    w.rest.endAt = Math.max(t, w.rest.endAt + d * 1000);
  }
  persist();
  syncRing();
  tick();
}

function restSkip() {
  const w = db().active;
  w.rest = null;
  persist();
  render();
  document.getElementById("log-btn")?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- sheets

function viewSheet() {
  const w = db().active;
  if (ui.sheet === "swap") {
    const it = M.item(w, w.cur);
    const base = PLAN.exercises[it.planEx];
    const opts = [["Easier", base?.swaps?.easier], ["Harder", base?.swaps?.harder], ["No equipment", base?.swaps?.none]]
      .filter(([, ex]) => ex && ex !== it.planEx);
    const list = opts.map(([k, ex]) => `<button class="opt" data-act="swap-to" data-ex="${esc(ex)}" ${ex === it.ex ? 'aria-current="true"' : ""}>
        <span class="label">${k}</span><b>${esc(M.exName(ex))}</b><span>${esc(M.exCue(ex))}</span></button>`).join("");
    return `<div class="scrim" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" tabindex="-1">
      <h2 class="sheet__title" id="sheet-h">Swap ${esc(M.exName(it.ex))}</h2>
      ${list || `<p class="meta">This one has no swaps.</p>`}
      ${it.ex !== it.planEx ? `<button class="opt" data-act="swap-to" data-ex="${esc(it.planEx)}"><span class="label">Back to the plan</span><b>${esc(M.exName(it.planEx))}</b><span>${esc(M.exCue(it.planEx))}</span></button>` : ""}
      <div class="setting"><span id="always-l">Use this every time</span>
        <button class="switch" type="button" data-act="toggle-always" role="switch" aria-checked="${!!ui.swapAlways}" aria-labelledby="always-l"><span class="switch__track"><span class="switch__knob"></span></span><span aria-hidden="true">${ui.swapAlways ? "On" : "Off"}</span></button></div>
      <button class="btn btn--secondary btn--wide" data-act="close-sheet">Keep ${esc(M.exName(it.ex))}</button>
    </div>`;
  }
  if (ui.sheet === "all") {
    const rows = w.items.map((it) => {
      const d = M.doneCount(w, it.key);
      const done = d >= it.sets;
      return `<button class="opt opt--row ${done ? "done" : ""}" data-act="jump" data-key="${esc(it.key)}" ${it.key === w.cur ? 'aria-current="true"' : ""} ${done ? "disabled" : ""}>
        <span><b>${esc(M.exName(it.ex))}</b><br><span>${esc(M.rangeText(it))}${it.pair ? " · superset" : ""}</span></span><span class="num">${d}/${it.sets}</span></button>`;
    }).join("");
    return `<div class="scrim" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" tabindex="-1">
      <h2 class="sheet__title" id="sheet-h">All exercises</h2>
      <p class="quiet">Station taken? Tap any exercise to do it now.</p>
      <div class="seg-ctl seg-ctl--small" role="group" aria-label="Session length">
        <button type="button" data-act="set-length" data-short="0" aria-pressed="${!w.short}"><b>Full</b></button>
        <button type="button" data-act="set-length" data-short="1" aria-pressed="${!!w.short}"><b>Short</b></button>
      </div>
      ${rows}
      <div class="setting"><span id="sound-l">Sound at the end of rest</span>
        <button class="switch" type="button" data-act="toggle-sound" role="switch" aria-checked="${db().settings.sound !== false}" aria-labelledby="sound-l"><span class="switch__track"><span class="switch__knob"></span></span><span aria-hidden="true">${db().settings.sound !== false ? "On" : "Off"}</span></button></div>
      <button class="btn btn--secondary btn--wide" data-act="finish-now">${w.log.length ? `Finish now · ${w.log.length} of ${M.totalSets(w)} sets` : "Leave without saving"}</button>
      <button class="btn btn--text" style="justify-self:center" data-act="close-sheet">Back to the workout</button>
    </div>`;
  }
  return "";
}

function openSheet(name, trigger) {
  ui.sheet = name;
  ui.sheetTrigger = trigger?.dataset.act;
  ui.swapAlways = false;
  render();
}
function closeSheet() {
  const back = ui.sheetTrigger;
  ui.sheet = null;
  render();
  if (back) document.querySelector(`[data-act="${back}"]`)?.focus({ preventScroll: true });
}

function swapTo(ex) {
  const w = db().active;
  const key = w.cur;
  const { v } = readValues();
  const always = !!ui.swapAlways;
  const before = M.swapExercise(w, key, ex, { always, kg: v.kg });
  const it = M.item(w, key);
  const prevAlways = db().settings.swapsAlways[it.planEx];
  if (always) {
    if (ex === it.planEx) delete db().settings.swapsAlways[it.planEx];
    else db().settings.swapsAlways[it.planEx] = ex;
  }
  persist();
  ui.sheet = null;
  ui.undoSwap = { key, before, always, planEx: it.planEx, prevAlways };
  render({ focus: true });
  toast(ex === it.planEx ? `Back to ${M.exName(ex)}` : `Swapped for ${M.exName(ex)}${always ? " every time" : ""}`, "Undo", "undo-swap");
}
function undoSwap() {
  const u = ui.undoSwap;
  const w = db().active;
  if (!u || !w) return;
  M.restoreSwap(w, u.key, u.before);
  if (u.always) {
    if (u.prevAlways) db().settings.swapsAlways[u.planEx] = u.prevAlways;
    else delete db().settings.swapsAlways[u.planEx];
  }
  ui.undoSwap = null;
  persist();
  ui.toast = null;
  render();
}

function setLength(short) {
  const w = db().active;
  if (!!w.short === short) return;
  M.setShort(w, short, db().settings);
  persist();
  render();
  toast(short ? "Short version on: first 3 exercises, 2 sets each." : "Full session back on.", short ? "Switch to full" : null, short ? "to-full" : null);
}

// ---------------------------------------------------------------- finishing

function finishWorkout(early) {
  const w = db().active;
  const partial = early || !M.isFinished(w);
  const rec = M.toSession(w, { partial, end: w.lastSetAt });
  const mine = (h) => h.date === w.date && h.t === w.startedAt;
  const before = (ex) => hist(ex).filter((h) => !mine(h));
  db().sessions.push(rec);
  db().active = null;
  persist();
  awake.off();
  const after = (ex) => hist(ex);
  ui.finished = w;
  ui.summary = { ...M.summarize(w, before, after), name: w.name, date: w.date, partial, early };
  sound("done", db().settings.sound !== false && !early);
  if (!early) vibrate([20, 40, 20, 40, 60]);
  go("summary");
  if (early) toast(`Saved as partial · ${w.log.length} of ${M.totalSets(w)} sets`, "Resume", "resume", 10000);
}

function finishNow() {
  const w = db().active;
  if (!w.log.length) {
    db().active = null;
    persist();
    awake.off();
    goHome({ text: "Nothing logged, so nothing saved.", action: "Back to it", kind: "undo-leave", data: w });
    return;
  }
  finishWorkout(true);
}

function resumeFinished() {
  const w = ui.finished;
  if (!w) return;
  db().sessions = db().sessions.filter((s) => s.id !== w.id);
  db().active = w;
  ui.finished = null;
  persist();
  awake.on();
  ui.toast = null;
  go("set");
}

function weekBlock() {
  const L = engineLog(db());
  const pr = E.rollingProgress(L, today());
  const st = E.streak(L, db().settings, today());
  const busy = E.isBusy(db().settings, today());
  const filled = Math.min(4, pr.lifts) + Math.min(1, pr.run) + Math.min(1, pr.cond + Math.max(0, pr.run - 1));
  const r = 30, c = 2 * Math.PI * r, segLen = c / 6, gap = 5;
  const seg = (i, cls) => `<circle class="seg ${cls}" cx="38" cy="38" r="${r}" stroke-dasharray="${segLen - gap} ${c - segLen + gap}" stroke-dashoffset="${-i * segLen}"/>`;
  const ring = `<svg viewBox="0 0 76 76" aria-hidden="true">${[0, 1, 2, 3, 4, 5].map((i) => seg(i, "seg--empty")).join("")}${[...Array(filled).keys()].map((i) => seg(i, "seg--done")).join("")}</svg>`;
  let line = "";
  if (pr.nextLevel) {
    const m = pr.missing[pr.nextLevel];
    const bits = [];
    if (m.lifts) bits.push(`${m.lifts} more ${m.lifts > 1 ? "lifts" : "lift"}`);
    if (m.run) bits.push("a run");
    if (m.cond) bits.push("a sport or conditioning session");
    line = `${bits.join(" and ")} makes it ${pr.nextLevel === "Minimum" ? "a Minimum" : `a ${pr.nextLevel}`} week.`;
  } else line = "Full week. Everything else is a bonus.";
  const next = E.sessionDef(E.nextSession(L, { busy }));
  return `<section class="card" aria-label="Your rolling week">
    <div class="week">${ring}<div><p class="week__level">${pr.level ? `${pr.level} week` : "Week under way"}</p><div class="week__count num">${filled}<small> of 6 · last 7 days</small></div></div></div>
    <p class="meta" style="margin:0">${esc(line[0].toUpperCase() + line.slice(1))}</p>
    <div class="streak-line"><span>Next up: ${esc(next?.name)}</span>${st.weeks ? `<span>Streak <b>${st.weeks} ${st.weeks === 1 ? "week" : "weeks"}</b></span>` : `<span>Streak starts this week</span>`}</div>
  </section>`;
}

function viewSummary() {
  const s = ui.summary;
  const t = s.partial ? `${s.name} saved` : `${s.name} done`;
  return `<main class="scr" data-screen="summary">
    <header class="scr__head"><span class="label">${esc(shortDate(s.date))} · ${s.minutes} min · ${s.sets} ${s.sets === 1 ? "set" : "sets"}</span></header>
    <div class="scr__body">
      <svg class="done-mark ${s.partial ? "done-mark--partial" : ""}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27"/><path d="M20 33l8 8 16-17"/></svg>
      <h1 class="h1" data-kt>${esc(t)}</h1>
      ${s.partial ? `<p class="meta" style="margin:0">Partial session · ${s.sets} of ${s.planned} sets. It counts toward your week, and the rotation moves on.</p>` : ""}
      <div class="stats">
        <div class="stat rise" style="--d:1"><span class="label">Sets</span><span class="stat__num num" data-count="${s.sets}">0</span></div>
        <div class="stat rise" style="--d:2"><span class="label">kg lifted</span><span class="stat__num num" data-count="${s.volume}">0</span></div>
        <div class="stat rise" style="--d:3"><span class="label">Beat last time</span><span class="stat__num num ${s.beat ? "green" : ""}" data-count="${s.beat}">0</span></div>
      </div>
      ${s.next.length ? `<section aria-labelledby="nt-h" class="rise" style="--d:4"><h2 class="label" id="nt-h" style="margin:0 0 var(--sp-3)">Next time</h2>
        <ul class="nextlist">${s.next.map((n) => `<li class="${n.up ? "up" : ""}"><b>${esc(n.title)}</b>${n.detail ? `<span>${esc(n.detail)}</span>` : ""}</li>`).join("")}</ul></section>` : ""}
      <div class="rise" style="--d:5">${weekBlock()}</div>
      <p class="disclaimer">${esc(PLAN.disclaimer)}</p>
    </div>
    <div class="scr__foot">
      <div class="toast-slot" id="toast-slot" aria-live="polite"></div>
      <button class="btn btn--primary" data-act="home"><span class="btn__label">Done</span></button>
    </div>
  </main>`;
}

// ---------------------------------------------------------------- resume (> 90 min) and partial saves

function viewResume() {
  const w = db().active;
  const name = w.name;
  const total = M.totalSets(w);
  const last = M.exName(w.log[w.log.length - 1]?.ex);
  const ago = now() - w.lastSetAt;
  const h = Math.floor(ago / 3600000), m = Math.round((ago % 3600000) / 60000);
  return `<main class="scr" data-screen="resume">
    <header class="scr__head"><span class="label">${esc(name)} · started ${new Date(w.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      <h1 class="h1">${esc(name)} is still open</h1></header>
    <div class="scr__body">
      <section class="card"><b>${w.log.length} of ${total} sets logged</b>
        <p class="meta" style="margin:0">Last: ${esc(last)}, ${h ? `${h} h ` : ""}${m} min ago</p></section>
      <p class="meta" style="margin:0">Pick up and the session continues as planned. Finish and it's saved as a partial session that counts toward your week.</p>
    </div>
    <div class="scr__foot"><div class="toast-slot" id="toast-slot" aria-live="polite"></div><div class="foot-actions">
      <button class="btn btn--secondary btn--tall" data-act="finish-now">Finish with ${w.log.length} set${w.log.length === 1 ? "" : "s"}</button>
      <button class="btn btn--primary" data-act="pick-up"><span class="btn__label">Pick up where you left off</span></button>
    </div></div>
  </main>`;
}

// ---------------------------------------------------------------- today's run
// Strava records the run. Here: what it is, one line, one tap. The optional time line
// ("10k 52:30") only updates the target paces.

const RACE_LABEL = { "5k": "5K", "10k": "10K", "21k": "Half marathon" };

function raceLine() {
  const ph = E.racePhase(db().settings, today());
  const r = db().settings.race;
  if (!r?.date || r.date < today()) return "";
  const days = E.daysBetween(today(), r.date);
  const when = days === 0 ? "today" : days < 14 ? `in ${days} ${days === 1 ? "day" : "days"}` : `in ${Math.floor(days / 7)} weeks`;
  const what = { build: `Runs lean toward the ${r.distance === "21k" ? "half" : RACE_LABEL[r.distance]}.`, taper: "Taper: shorter runs, stay sharp.", "race-week": "Race week: easy runs only.", race: "Good luck.", none: "The race build starts closer to the day." }[ph.kind];
  return `${RACE_LABEL[r.distance]} race ${when} (${shortDate(r.date)}). ${what}`;
}

function viewRun() {
  const { t, pick } = ui.run;
  const race = db().settings.race;
  const rl = raceLine();
  const d = ui.run.raceDraft || { distance: race?.distance || "10k", date: race?.date || E.addDays(today(), 70) };
  const raceCard = ui.run.raceOpen ? `<section class="card race" aria-labelledby="race-h">
      <h2 class="label" id="race-h">Race mode</h2>
      <p class="meta" style="margin:0">The last 8–12 weeks lean toward the distance, then a 1–2 week taper. Optional.</p>
      <div class="chips" role="group" aria-label="Race distance">${Object.entries(RACE_LABEL).map(([k, v]) => `<button type="button" class="chip" data-act="race-dist" data-d="${k}" aria-pressed="${d.distance === k}">${k === "21k" ? "21K" : esc(v)}</button>`).join("")}</div>
      <div class="field"><label class="label" for="race-date">Race date</label><input id="race-date" type="date" min="${today()}" value="${esc(d.date)}"></div>
      <div class="row"><button class="btn btn--secondary grow" data-act="race-save">Save race</button>${race ? `<button class="btn btn--secondary grow" data-act="race-clear">No race</button>` : ""}</div>
    </section>` : "";
  return `<main class="scr vt-card" data-screen="run">
    <header class="scr__head">
      <div class="row between"><span class="label">${esc(shortDate(today()))} · Today's run</span><button class="btn btn--text" data-act="home">Not now</button></div>
      <h1 class="h1" data-kt>${esc(t.name)}</h1>
    </header>
    <div class="scr__body">
      ${saveErrorBox()}
      <p class="run-target">${esc(t.target)}</p>
      ${t.note ? `<p class="meta" style="margin:0">${esc(t.note)}</p>` : ""}
      ${pick.run === "long" && !pick.hold ? `<p class="quiet">Each long run adds a little until ${PLAN.run.long.holdKm[0]}–${PLAN.run.long.holdKm[1]} km, then it holds.</p>` : ""}
      <div class="field">
        <label class="label" for="run-time">Your time (optional)</label>
        <input id="run-time" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="10k 52:30" aria-describedby="time-hint">
        <p class="quiet" id="time-hint" aria-live="polite">Only used to update your paces. Strava keeps the rest.</p>
      </div>
      ${rl ? `<p class="meta" style="margin:0">${esc(rl)} <button class="btn btn--text" data-act="race-open" aria-expanded="${ui.run.raceOpen}">Change</button></p>`
        : `<button class="btn btn--text" style="justify-self:start" data-act="race-open" aria-expanded="${ui.run.raceOpen}">Training for a race?</button>`}
      ${raceCard}
      <p class="disclaimer">${esc(PLAN.disclaimer)}</p>
    </div>
    <div class="scr__foot">
      <div class="toast-slot" id="toast-slot" aria-live="polite"></div>
      <button class="btn btn--primary" data-act="run-done"><span class="btn__label">Done</span></button>
    </div>
  </main>`;
}

function timeHint(text) {
  const p = R.parseTimeLine(text);
  if (!text.trim()) return "Only used to update your paces. Strava keeps the rest.";
  if (!p) return 'Not sure what that is. Try "10k 52:30" or "half 1:55:00".';
  return `${p.km} km in ${R.mmss(p.sec)} · ${R.mmss(p.sec / p.km)}/km. Paces update when you tap Done.`;
}

function runDone() {
  const { pick, t } = ui.run;
  const text = (document.getElementById("run-time")?.value || "").trim();
  const parsed = R.parseTimeLine(text);
  const a = { id: newId("r"), date: today(), t: now(), kind: "run", run: pick.run };
  if (pick.km) a.km = pick.km;
  if (text) a.time = text;
  const undoData = { id: a.id, paceRef: db().settings.paceRef ?? null };
  db().activities.push(a);
  if (parsed) db().settings.paceRef = { ...parsed, date: today(), text };
  persist();
  vibrate(18);
  sound("done", db().settings.sound !== false);
  ui.run = null;
  const extra = parsed ? " Paces updated." : text ? " Couldn't read the time, so paces stay the same." : "";
  goHome({ text: `${t.name} done.${extra}`, action: "Undo", kind: "undo-run", data: undoData });
}

function saveRace(clear) {
  if (clear) db().settings.race = null;
  else {
    const d = ui.run.raceDraft || {};
    const date = document.getElementById("race-date")?.value || d.date;
    if (!date || date < today()) { toast("Pick a date from today on."); return; }
    db().settings.race = { distance: d.distance || db().settings.race?.distance || "10k", date };
  }
  persist();
  ui.run = { ...runInfo(), raceOpen: false, raceDraft: null };
  render();
  toast(clear ? "Race mode off." : "Race saved. Your runs follow it.");
}

// ---------------------------------------------------------------- log something else (sport, easy run, conditioning)

function viewOther() {
  const o = ui.other;
  const saved = o.savedId ? db().activities.find((a) => a.id === o.savedId) : null;
  const opts = PLAN.conditioning.options.map((c) => `<button class="opt opt--row" data-act="log-activity" data-ex="${esc(c.ex)}">
      <span><b>${esc(actName(c.ex))}</b><br><span>${esc(c.note || M.exCue(c.ex))}</span></span><span class="num">${c.minutes[0]} min</span></button>`).join("");
  const when = (d, label) => `<button class="chip" type="button" data-act="${saved ? "edit-date" : "pick-date"}" data-d="${d}" aria-pressed="${(saved ? saved.date : o.date) === d}">${label}</button>`;
  const dates = `<div class="when" role="group" aria-label="When">${when(today(), "Today")}${when(E.addDays(today(), -1), "Yesterday")}</div>`;
  return `<main class="scr" data-screen="other">
    <header class="scr__head"><div class="row between"><span class="label">Unplanned session</span><button class="btn btn--text" data-act="home">Close</button></div>
      <h1 class="h1">Log something else</h1></header>
    <div class="scr__body">
      ${saveErrorBox()}
      ${saved ? `<div class="notice notice--done${o.justSaved ? " rise" : ""}"><div><b>${esc(actName(saved.ex))} logged</b> · ${saved.min} min, ${saved.date === today() ? "today" : "yesterday"}. It counts toward your week.
          <div class="row" style="margin-top:4px"><button class="btn btn--text" data-act="edit-activity" aria-expanded="${!!o.editing}">Edit</button><button class="btn btn--text" data-act="undo-activity">Undo</button></div></div></div>
        ${o.editing ? `<section class="card" aria-label="Edit">${stepper({ id: "min", value: saved.min, unit: "minutes", label: "Minutes", step: 5, min: 5 })}${dates}<p class="quiet">Changes save as you make them.</p></section>` : ""}`
      : `${dates}<div class="act-list">${opts}
          <button class="opt opt--row" data-act="start-run"><span><b>Today's planned run</b><br><span>${esc(runInfo().t.name)}: ${esc(runInfo().t.target)}</span></span><span></span></button></div>
        <p class="quiet">Tap one and it's saved straight away with the usual time. You can edit it after.</p>`}
    </div>
    <div class="scr__foot"><div class="toast-slot" id="toast-slot" aria-live="polite"></div>
      ${saved ? `<button class="btn btn--primary" data-act="home"><span class="btn__label">Done</span></button>` : ""}</div>
  </main>`;
}

function logActivity(ex) {
  const c = PLAN.conditioning.options.find((x) => x.ex === ex);
  const kind = ex === "easy-run" ? "run" : ex === "basketball" ? "sport" : "conditioning";
  const a = { id: newId("a"), date: ui.other.date, t: now(), kind, ex, min: c.minutes[0] };
  if (kind === "run") a.run = "easy";
  db().activities.push(a);
  persist();
  vibrate(18);
  ui.other.savedId = a.id;
  ui.other.justSaved = true;
  render({ focus: false });
  ui.other.justSaved = false;
  say(`${actName(ex)} logged`);
}

function editActivity(field, value) {
  const a = db().activities.find((x) => x.id === ui.other.savedId);
  if (!a) return;
  a[field] = value;
  persist();
  render();
}

// ------------------------------------------------------------------ events

app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const w = db().active;
  switch (act) {
    case "home": goHome(); break;
    case "start-run": startRun(); break;
    case "open-other": ui.other = { date: today(), savedId: null, editing: false }; go("other"); break;
    case "pick-length": ui.pending.short = el.dataset.short === "1"; render(); break;
    case "toggle-nogym": ui.pending.noGym = !ui.pending.noGym; render(); break;
    case "take-deload":
      db().settings.deloads = [...(db().settings.deloads || []), today()];
      persist();
      ui.pending.adjust = { ...ui.pending.adjust, setsFactor: PLAN.rules.deload.setsFactor, deload: true };
      render();
      break;
    case "checkin": checkIn(el.dataset.v); break;
    case "to-full":
      if (w?.kind === "lift") setLength(false);
      break;
    case "step":
      if (el.dataset.f === "min") {
        const a = db().activities.find((x) => x.id === ui.other?.savedId);
        if (a) editActivity("min", Math.max(5, a.min + Number(el.dataset.d)));
      } else step(el.dataset.f, Number(el.dataset.d));
      break;
    case "log": logTap(el, ev); break;
    case "undo": undo(); break;
    case "rest-add": restAdd(Number(el.dataset.d)); break;
    case "rest-skip": restSkip(); break;
    case "open-swap": openSheet("swap", el); break;
    case "open-all": openSheet("all", el); break;
    case "close-sheet": closeSheet(); break;
    case "toggle-always": ui.swapAlways = !ui.swapAlways; render(); break;
    case "swap-to": swapTo(el.dataset.ex); break;
    case "undo-swap": undoSwap(); break;
    case "jump": M.jumpTo(w, el.dataset.key); persist(); ui.sheet = null; render({ focus: true }); break;
    case "set-length": ui.sheet = null; setLength(el.dataset.short === "1"); break;
    case "toggle-sound": db().settings.sound = db().settings.sound === false; persist(); render(); if (db().settings.sound) { unlockAudio(); sound("tick"); } break;
    case "finish-now": ui.sheet = null; finishNow(); break;
    case "resume": resumeFinished(); break;
    case "pick-up": awake.on(); go("set"); break;
    case "retry-save": if (persist()) { const b = document.getElementById("save-error"); if (b) b.hidden = true; } break;
    case "run-done": runDone(); break;
    case "race-open": ui.run.raceOpen = !ui.run.raceOpen; render(); break;
    case "race-dist": {
      const date = document.getElementById("race-date")?.value;
      ui.run.raceDraft = { ...(ui.run.raceDraft || { date: db().settings.race?.date || E.addDays(today(), 70) }), distance: el.dataset.d, ...(date ? { date } : {}) };
      render();
      break;
    }
    case "race-save": saveRace(false); break;
    case "race-clear": saveRace(true); break;
    case "log-activity": logActivity(el.dataset.ex); break;
    case "pick-date": ui.other.date = el.dataset.d; render(); break;
    case "edit-activity": ui.other.editing = !ui.other.editing; render(); break;
    case "edit-date": editActivity("date", el.dataset.d); break;
    case "undo-activity":
      db().activities = db().activities.filter((a) => a.id !== ui.other.savedId);
      persist();
      ui.other = { date: today(), savedId: null, editing: false };
      render();
      toast("Removed. Nothing was logged.");
      break;
  }
});

// typing a weight: commit on change, never log
app.addEventListener("change", (ev) => {
  if (ev.target.id !== "v-kg") return;
  const v = parseFloat(String(ev.target.value).replace(",", "."));
  if (Number.isFinite(v) && v >= 0 && v < (units() === "lb" ? 2200 : 1000)) setDraft("kg", units() === "lb" ? fromUnit(v) : Math.round(v * 4) / 4);
  else updateControls();
});
app.addEventListener("keydown", (ev) => {
  if (ev.target.id === "v-kg" && ev.key === "Enter") ev.target.blur();
  if (ev.target.id === "run-time" && ev.key === "Enter") ev.target.blur();
});
app.addEventListener("input", (ev) => {
  if (ev.target.id !== "run-time") return;
  const h = document.getElementById("time-hint");
  if (h) h.textContent = timeHint(ev.target.value);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && ui.sheet) closeSheet();
  if (ev.key === "Tab" && ui.sheet) { // keep focus inside the sheet
    const f = [...app.querySelectorAll(".sheet button:not([disabled])")];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

// ------------------------------------------------------------------ boot

function boot() {
  setUnits(db().settings.units);
  setVibration(db().settings.vibrate);
  const a = db().active;
  if (a) {
    if (a.date < today()) {
      // never finished: saved as partial under its own date (CLAUDE.md, Partial sessions)
      if (a.log.length) {
        db().sessions.push(M.toSession(a, { partial: true }));
        ui.bootToast = `Saved ${dayName(a.date)}'s ${a.name} as partial (${a.log.length} of ${M.totalSets(a)} sets).`;
      }
      db().active = null;
      persist();
    } else if (a.lastSetAt && now() - a.lastSetAt > M.RESUME_AFTER_MS) {
      ui.view = "resume";
    } else {
      ui.view = "set";
      awake.on();
    }
  }
  if (store.readOnly) ui.saveFailed = true;
  if (store.migrated && !ui.bootToast) ui.bootToast = store.migrated.from === 1 ? "Found your log from the earlier app. Everything is kept, with a backup copy." : "Your data moved to the new format. A backup copy is kept.";
  // Started from Home (?start=lift|run|other): render that screen in the very first frame,
  // so the cross-document view transition has its target. The query is dropped so a reload
  // or the back button never starts something twice.
  const start = new URLSearchParams(location.search).get("start");
  if (start) {
    // changing the URL while the incoming transition runs would cancel it: wait for it to end
    const clean = () => history.replaceState(history.state, "", location.pathname);
    let done = false;
    const once = () => { if (!done) { done = true; clean(); } };
    addEventListener("pagereveal", (e) => (e.viewTransition ? e.viewTransition.finished.then(once, once) : once()), { once: true });
    setTimeout(once, 2000);
  }
  if (!db().active) {
    if (start === "lift") {
      const p = todayPlan();
      ui.pending = { type: "lift", session: p.next, short: !!(p.primary?.short || p.hints.includes("busy-weekday")), noGym: false, adjust: liftAdjust(p), deload: p.deload };
      ui.view = "checkin";
    } else if (start === "run") {
      ui.run = { ...runInfo(), raceOpen: false, raceDraft: null };
      ui.view = "run";
    } else if (start === "other") {
      ui.other = { date: today(), savedId: null, editing: false };
      ui.view = "other";
    } else {
      // nothing to do here: Home is the front door
      goHome(ui.bootToast ? { text: ui.bootToast, ms: 8000 } : null, { replace: true });
      return;
    }
  }
  render({ focus: false });
  if (ui.bootToast) toast(ui.bootToast, null, null, 8000);
}

boot();

// offline + updates; the update prompt waits until no workout is running
startServiceWorker({ quiet: () => !!db().active });
