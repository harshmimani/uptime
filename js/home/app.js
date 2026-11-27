// Home: the Rotation Dial.
//
// The rotation (UA → LA → UB → LB, or Busy mode's full-body sessions) is drawn as an
// arc; today's session is lit and its name sets itself in big kinetic type inside it.
// A thin outer ring is the rolling 7 days. Under it: one Start button in the thumb zone.
//
// Speed rules (CLAUDE.md): the page is painted in one go from local data, and the Start
// button is a plain link that works from the first frame. Animation is decoration on top:
// the full intro plays on the first open of the day only; later opens are instant, except
// for a short "rotation moves on" when a session was finished since the last look.
// Tapping Start navigates to workout.html; the cross-document view transition in
// css/home.css + css/workout.css morphs the card into the Workout screen.

import PLAN from "../plan.js";
import * as E from "../engine.js";
import { createStore, isoDate } from "../store.js";
import * as M from "../workout/model.js";
import { homeModel } from "./model.js";
import { splitLetters, playIn, countTo, reducedMotion, buzz as rawBuzz, installPressGlow } from "../motion.js";
import { tabBar } from "../nav.js";
import { startServiceWorker } from "../sw-client.js";
import { setUnits, units, toUnit, wu } from "../units.js";
import { howToHTML } from "../muscles.js";
import { exerciseList, pastRow, pastDetail, lastWeekHTML } from "../session-view.js";

const SEEN_KEY = "uptime-home";    // { day, next }: when the intro last played, which session was last shown
const FLASH_KEY = "uptime-flash";  // one toast handed over from the Workout section (sessionStorage)

const store = createStore();
const db = () => store.db;
const app = document.getElementById("app");
const live = document.getElementById("live");
const today = () => isoDate(new Date());
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nf = new Intl.NumberFormat("en-GB");
const ui = { toast: null, saveFailed: store.readOnly, undo: null, sheet: null, sheetEntry: false, trigger: null };
/** A short tap, unless vibration is off in Settings. */
const buzz = (ms) => { if (db().settings.vibrate !== false) rawBuzz(ms); };

const readJSON = (s, k) => { try { return JSON.parse(s.getItem(k) || "null"); } catch { return null; } };
const writeJSON = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch { /* a preference, not data */ } };

function persist() {
  const r = store.save();
  ui.saveFailed = !r.ok;
  return r.ok;
}

// ------------------------------------------------------------------ dial geometry
// viewBox 320 × 240, centre (160, 160). The arc runs 240°, open at the bottom
// (150° → 390°, clockwise, 0° = 3 o'clock), so the name sits inside it.
const CX = 160, CY = 160, R_ROT = 126, R_WEEK = 147, R_LABEL = 104;
const A0 = 150, SPAN = 240;
const pt = (r, a) => [CX + r * Math.cos((a * Math.PI) / 180), CY + r * Math.sin((a * Math.PI) / 180)];
function arc(r, a0, a1) {
  const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const nodeAngle = (i, n) => A0 + (SPAN / n) * (i + 0.5);

function dialSVG(m, { fromIndex }) {
  const n = m.nodes.length, each = SPAN / n, gap = 5;
  const cur = Math.max(0, m.nodes.findIndex((x) => x.state === "current"));
  const curA = nodeAngle(cur, n);
  const fromA = fromIndex == null ? curA : fromIndex < 0 ? A0 - 12 : nodeAngle(fromIndex, n);
  const segs = m.nodes.map((x, i) => {
    const a = A0 + each * i;
    const [lx, ly] = pt(R_LABEL, a + each / 2);
    return `<path class="dial__seg dial__seg--${x.state}" style="--i:${i}" d="${arc(R_ROT, a + gap / 2, a + each - gap / 2)}"/>
      <text class="dial__code dial__code--${x.state}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${esc(x.short)}</text>`;
  }).join("");
  const wEach = SPAN / 6, wGap = 3;
  const week = [...Array(6).keys()].map((i) => {
    const a = A0 + wEach * i;
    return `<path class="dial__wk${i < m.week.filled ? " dial__wk--on" : ""}" style="--i:${i}" d="${arc(R_WEEK, a + wGap / 2, a + wEach - wGap / 2)}"/>`;
  }).join("");
  // the marker is drawn at 0° and turned into place by CSS, so the intro can sweep it (transform only)
  return `<svg class="dial__svg" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
    <g class="dial__week">${week}</g>
    <g class="dial__rot">${segs}</g>
    <g class="dial__marker" style="--a:${curA}deg;--from:${fromA}deg">
      <circle class="dial__halo" cx="${CX + R_ROT}" cy="${CY}" r="15"/>
      <circle class="dial__dot" cx="${CX + R_ROT}" cy="${CY}" r="6.5"/>
    </g>
  </svg>`;
}

// ------------------------------------------------------------------ pieces

const ICON = {
  arrow: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`,
  check: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>`,
};

function weekTile(m) {
  const w = m.week, s = m.streak;
  const head = w.filled ? `<span class="tile__num num" data-count="${w.filled}">${w.filled}</span><span class="tile__of"> of 6</span>` : `<span class="tile__num num">0</span><span class="tile__of"> of 6</span>`;
  return `<section class="tile tile--week" aria-label="Your last 7 days">
    <span class="label">Last 7 days</span>
    <div class="tile__big">${head}${w.level ? `<span class="pill">${esc(w.level)} week</span>` : ""}</div>
    <p class="tile__note">${esc(w.empty && !w.filled ? "Your week starts with your next session." : w.line)}</p>
    <p class="streak ${s.weeks ? "streak--on" : ""}">${s.weeks
      ? `<span class="num" data-count="${s.weeks}">${s.weeks}</span>-week streak`
      : "Streak starts this week"}</p>
  </section>`;
}

/** The standout stat. Shown only once there's a real number behind it. */
function statTile(st) {
  if (st.kind === "empty") return "";
  if (st.unit === "kg" && units() === "lb") st = { ...st, value: Math.round(toUnit(st.value)), unit: wu() };
  const goal = st.goal ? `<div class="ladder" role="img" aria-label="${st.value} of ${st.goal}">${[...Array(st.goal).keys()].map((i) => `<i class="${i < st.value ? "on" : ""}" style="--i:${i}"></i>`).join("")}</div>` : "";
  return `<section class="tile tile--stat" aria-label="Standout stat">
    <span class="label">${esc(st.label)}</span>
    <div class="tile__big"><span class="tile__num num" data-count="${st.value}">${nf.format(st.value)}</span>${st.unit ? `<span class="tile__of"> ${esc(st.unit)}</span>` : ""}</div>
    ${goal}
    <p class="tile__note ${st.up ? "green" : ""}">${esc(st.note)}</p>
  </section>`;
}

function banners(m) {
  let out = "";
  if (ui.saveFailed) {
    out += `<div class="notice notice--warn" role="alert"><div><b>Couldn't save to this phone.</b> Storage may be full or blocked (private browsing). <button class="btn btn--text" data-act="retry-save">Try again</button></div></div>`;
  }
  if (m.busy) {
    out += `<div class="notice hm-banner"><span><b>Busy mode is on.</b> 2–3 full-body sessions and a run.</span><button class="btn btn--text hm-banner__act" data-act="busy-off">Turn off</button></div>`;
  }
  return out;
}

function nudge(m) {
  if (!m.nudge) return "";
  return `<div class="notice hm-banner hm-nudge"><span>Last two weeks were packed. Busy mode keeps things going with 2–3 shorter sessions.</span>
    <span class="row"><button class="btn btn--text hm-banner__act" data-act="busy-on">Turn on</button><button class="btn btn--text" data-act="nudge-dismiss">Not now</button></span></div>`;
}

function resumeInfo() {
  const a = db().active;
  if (!a || a.date !== today()) return null;
  return { name: a.name, done: a.log.length, total: M.totalSets(a) };
}

function card(m, opts) {
  const res = resumeInfo();
  const len = Math.max(5, [...m.name].length);
  let actions;
  if (res) {
    actions = `<a class="btn btn--primary hm-start" href="workout.html" data-act="start"><span class="btn__label">Resume · ${res.done} of ${res.total} sets</span></a>`;
  } else if (m.canStart) {
    actions = `<a class="btn btn--primary hm-start" href="workout.html?start=lift" data-act="start" aria-describedby="next-title"><span class="btn__label">Start</span></a>`;
  } else actions = "";
  const float = m.float && !res ? `<a class="float" href="${m.float.href}" data-act="float">
      <span class="float__text"><span class="float__lead">${esc(m.float.lead)}</span> <b class="float__name">${esc(m.float.name)}</b><span class="float__detail">${esc(m.float.detail)}</span></span>${ICON.arrow}</a>` : "";
  return `<section class="dial-card" aria-labelledby="next-title">
    <div class="next__glow" aria-hidden="true"></div>
    <div class="grain" aria-hidden="true"></div>
    <span class="label dial__label">${res ? "In progress" : esc(m.label)}</span>
    <div class="dial" style="--len:${len}">
      ${dialSVG(m, opts)}
      <div class="dial__center">
        <h1 class="dial__name display" id="next-title" data-name="${esc(m.name)}">${esc(m.name)}</h1>
        <p class="dial__meta">${res ? `${res.done} of ${res.total} sets logged` : `${esc(m.focus)} · ${m.minutes} min`}</p>
      </div>
    </div>
    <div class="dial-card__foot">
      ${m.note && !res ? `<p class="dial-card__note">${esc(m.note)}</p>` : ""}
      ${float}
      ${actions}
      ${res ? "" : `<a class="btn btn--text hm-other" href="workout.html?start=other" data-act="other">Log something else</a>`}
    </div>
  </section>`;
}

// ------------------------------------------------------------------ This week: the six slots

const TICK = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

function weekSection(m) {
  const done = m.slots.filter((x) => x.state === "done").length;
  const slot = (x) => {
    const state = x.state === "done" ? `<span class="slot__state slot__state--done">${TICK}${esc(x.day)}</span>`
      : x.state === "next" ? `<span class="slot__state slot__state--next">Next</span>`
      : `<span class="slot__state">Not yet</span>`;
    const name = x.kind === "run" ? (x.what || m.run.name) : x.kind === "sport" ? (x.what || "Sport or conditioning") : x.name;
    const sub = x.kind === "lift" ? x.focus : x.kind === "run" ? "Run slot" : "Any game or cardio";
    const said = `${name}: ${x.state === "done" ? `done ${x.day}` : x.state === "next" ? "next up" : "not yet"}. ${sub}. Show details`;
    return `<li><button type="button" class="slot slot--${x.state}" data-act="slot" data-id="${esc(x.id)}" aria-label="${esc(said)}">
      <span class="slot__code">${esc(x.short)}</span><span class="slot__name">${esc(name)}</span><span class="slot__sub">${esc(sub)}</span>${state}</button></li>`;
  };
  return `<section class="hm-week" aria-labelledby="wk-h">
    <div class="hm-sec__head"><h2 class="hm-sec__title" id="wk-h">This week</h2><span class="meta">${done} of ${m.slots.length} done · last 7 days</span></div>
    <ol class="slots slots--${m.slots.length}">${m.slots.map(slot).join("")}</ol>
    <a class="hm-more" href="plan.html#next"><span>Coming up: the next ${m.slots.length} sessions in order</span>${ICON.arrow}</a>
  </section>`;
}

function recentSection(m) {
  if (!m.recent.length) return "";
  return `<section class="hm-recent" aria-labelledby="past-h">
    <div class="hm-sec__head"><h2 class="hm-sec__title" id="past-h">Past sessions</h2><a class="btn btn--text" href="progress.html#history">See all</a></div>
    <ol class="pasts">${m.recent.map((e) => pastRow(e, m.today)).join("")}</ol>
  </section>`;
}

// ------------------------------------------------------------------ sheets: a session's exercises, how-to, a past session
// Each sheet is its own history entry, so the phone's back gesture closes it.

function sheetHTML() {
  const sh = ui.sheet;
  if (!sh) return "";
  let body = "";
  if (sh.kind === "info") {
    const back = sh.from ? slotTitle(sh.from) : null;
    body = `${howToHTML(sh.ex, { name: PLAN.exercises[sh.ex]?.name, cue: PLAN.exercises[sh.ex]?.cue, headingId: "sheet-h" })}
      ${back ? `<button class="btn btn--secondary btn--wide" data-act="slot" data-id="${esc(sh.from)}">Back to ${esc(back)}</button>` : ""}`;
  } else if (sh.kind === "past") {
    const e = model.recent.find((x) => x.id === sh.id);
    body = e ? `<h2 class="sheet__title" id="sheet-h">${esc(e.name)}</h2>${pastDetail(e)}` : "";
  } else body = slotSheet(sh.id);
  return `<div class="scrim" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" tabindex="-1">
      ${body}
      <button class="btn btn--text" style="justify-self:center" data-act="close-sheet">Close</button>
    </div>`;
}

function slotTitle(id) {
  return model.slots.find((x) => x.id === id)?.name || id;
}

function slotSheet(id) {
  const m = model;
  const x = m.slots.find((s) => s.id === id);
  if (!x) return "";
  const status = x.state === "done" ? `<span class="pill">Done ${esc(x.day)}</span>` : x.state === "next" ? `<span class="pill">Next up</span>` : "";
  if (x.kind === "run") {
    return `<div class="sheet__head"><h2 class="sheet__title" id="sheet-h">${esc(m.run.name)}</h2>${status}</div>
      <p class="run-line">${esc(m.run.target)}</p>
      ${m.run.note ? `<p class="meta" style="margin:0">${esc(m.run.note)}</p>` : ""}
      <p class="quiet">One run a week, cycling intervals → tempo → long easy run. Strava records it; here it's one tap.</p>
      <a class="btn btn--primary" href="workout.html?start=run" data-act="go"><span class="btn__label">Open today's run</span></a>`;
  }
  if (x.kind === "sport") {
    const opts = PLAN.conditioning.options.map((c) => {
      const n = c.ex === "basketball" && db().settings.sportName ? db().settings.sportName : PLAN.exercises[c.ex]?.name || c.ex;
      return `<li><b>${esc(n)}</b><span>${c.minutes[0]}–${c.minutes[1]} min${c.note ? ` · ${esc(c.note)}` : ""}</span></li>`;
    }).join("");
    return `<div class="sheet__head"><h2 class="sheet__title" id="sheet-h">Sport or conditioning</h2>${status}</div>
      <p class="meta" style="margin:0">A game when there is one; otherwise any of these. An easy run is the best pick for the 5K goal.</p>
      <ul class="cues">${opts}</ul>
      <a class="btn btn--secondary btn--wide" href="workout.html?start=other" data-act="go">Log something</a>`;
  }
  const def = E.sessionDef(id);
  const items = M.buildItems(id, { settings: db().settings });
  const start = x.state === "next" && m.canStart && !resumeInfo()
    ? `<a class="btn btn--primary" href="workout.html?start=lift" data-act="go"><span class="btn__label">Start ${esc(def.name)}</span></a>` : "";
  return `<div class="sheet__head"><h2 class="sheet__title" id="sheet-h">${esc(def.name)}</h2>${status}</div>
    <p class="meta" style="margin:0">${esc(def.focus || "Full body")} · ${items.length} exercises · about ${M.estimateMin(items)} min. Tap one for how-to.</p>
    ${exerciseList(items, { video: true, label: `${def.name} exercises` })}
    ${start}`;
}

function openSheet(sheet, trigger) {
  if (!ui.sheetEntry) { history.pushState({ sheet: true }, ""); ui.sheetEntry = true; }
  if (trigger && !ui.sheet) ui.trigger = trigger.dataset.act === "slot" ? `[data-act=slot][data-id="${trigger.dataset.id}"]` : trigger.dataset.act === "past" ? `[data-act=past][data-id="${trigger.dataset.id}"]` : null;
  ui.sheet = sheet;
  paintSheet();
}
function closeSheet() {
  if (ui.sheetEntry) { history.back(); return; } // popstate closes it
  closeSheetNow();
}
function closeSheetNow() {
  ui.sheet = null;
  paintSheet();
  if (ui.trigger) app.querySelector(ui.trigger)?.focus({ preventScroll: true });
  ui.trigger = null;
}
function paintSheet() {
  const root = document.getElementById("sheet-root");
  if (!root) return;
  root.innerHTML = sheetHTML();
  root.querySelector(".sheet")?.focus();
  document.documentElement.classList.toggle("has-sheet", !!ui.sheet);
}
addEventListener("popstate", () => {
  if (ui.goTo) { const href = ui.goTo; ui.goTo = null; ui.sheetEntry = false; location.href = href; return; }
  if (ui.sheetEntry && !history.state?.sheet) { ui.sheetEntry = false; if (ui.sheet) closeSheetNow(); }
});
document.addEventListener("keydown", (ev) => {
  if (!ui.sheet) return;
  if (ev.key === "Escape") closeSheet();
  if (ev.key === "Tab") { // keep focus inside the sheet
    const f = [...app.querySelectorAll(".sheet button, .sheet a[href]")];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

// ------------------------------------------------------------------ render

let model = null;
let field = null; // the living background (js/field.js), once it has loaded

function render({ intro = false, advanceFrom = null, enter = false } = {}) {
  model = homeModel(db(), today());
  const m = model;
  const d = new Date();
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  // is-intro: the full intro (first open of the day). is-enter: every other open gets a quick
  // version: the name sets itself and the cards below arrive in a stagger. Start never moves.
  app.className = `home${intro ? " is-intro" : enter ? " is-enter" : ""}${advanceFrom != null ? " is-advance" : ""}`;
  app.innerHTML = `
    <header class="hm-head"><span class="hm-brand" aria-hidden="true"><i></i>Uptime</span><span class="label">${esc(date)}</span></header>
    <div class="hm-notes">${banners(m)}${nudge(m)}</div>
    ${card(m, { fromIndex: intro || advanceFrom != null ? advanceFrom ?? -1 : null })}
    ${weekSection(m)}
    <div class="hm-glance${m.stat.kind === "empty" ? " hm-glance--one" : ""}">${weekTile(m)}${statTile(m.stat)}</div>
    ${recentSection(m)}
    <p class="disclaimer">${esc(PLAN.disclaimer)}</p>
    <div class="toast-slot" id="toast-slot" aria-live="polite"></div>
    <div id="sheet-root"></div>`;
  if (ui.sheet) paintSheet();
  paintToast();
  field?.mount(app.querySelector(".dial-card"));
  if (intro || enter || advanceFrom != null) animate(intro);
}

function animate(intro) {
  const name = app.querySelector(".dial__name");
  if (name) { splitLetters(name); name.classList.add("kt--stretch"); playIn(name); }
  if (!intro) return;
  for (const el of app.querySelectorAll("[data-count]")) {
    const to = Number(el.dataset.count);
    el.textContent = "0";
    countTo(el, to, { format: (v) => nf.format(Math.round(v)) });
  }
}

// ------------------------------------------------------------------ toast + undo

function toast(text, action = null, act = null, ms = 6000) {
  ui.toast = { text, action, act, until: Date.now() + ms };
  paintToast(true);
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { ui.toast = null; paintToast(); }, ms);
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 30);
}
function paintToast(enter = false) {
  const slot = document.getElementById("toast-slot");
  if (!slot) return;
  const t = ui.toast && ui.toast.until > Date.now() ? ui.toast : null;
  slot.innerHTML = t ? `<div class="toast${enter ? " enter" : ""}"><span>${esc(t.text)}</span>${t.action ? `<button class="btn btn--text" data-act="${t.act}">${esc(t.action)}</button>` : ""}</div>` : "";
}

// ------------------------------------------------------------------ actions

function setBusy(on) {
  const s = db().settings;
  const before = s.modeLog?.length || 0;
  db().settings = E.setBusy(s, on, today());
  ui.undo = { kind: "busy", len: before };
  persist();
  render({ advanceFrom: -1 });
  const name = model.name;
  if (on) toast(`Busy mode on. Next up: ${name}. The rotation waits.`, "Undo", "undo");
  else toast(`Back to the rotation. Next up: ${name}.`, "Undo", "undo");
  buzz();
}

function undo() {
  const u = ui.undo;
  ui.undo = null;
  if (!u) return;
  if (u.kind === "busy") db().settings.modeLog = db().settings.modeLog.slice(0, u.len);
  else if (u.kind === "undo-run") {
    db().activities = db().activities.filter((x) => x.id !== u.data.id);
    db().settings.paceRef = u.data.paceRef ?? null;
  } else if (u.kind === "undo-leave") {
    // "Back to it": the session left with nothing logged comes back as it was
    db().active = u.data;
    persist();
    location.href = "workout.html";
    return;
  }
  persist();
  render();
  toast("Undone.");
}

app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  switch (el.dataset.act) {
    case "start":
    case "other":
    case "float": leave(el); break;
    case "slot": openSheet({ kind: "slot", id: el.dataset.id }, el); break;
    case "past": openSheet({ kind: "past", id: el.dataset.id }, el); break;
    case "info": openSheet({ kind: "info", ex: el.dataset.ex, from: ui.sheet?.kind === "slot" ? ui.sheet.id : null }, el); break;
    case "close-sheet": closeSheet(); break;
    case "go": // leave from inside a sheet: drop the sheet's history entry first, then go
      if (ui.sheetEntry) { ev.preventDefault(); ui.goTo = el.getAttribute("href"); history.back(); }
      break;
    case "busy-off": setBusy(false); break;
    case "busy-on": setBusy(true); break;
    case "nudge-dismiss":
      db().settings.busyNudgeDismissed = model.nudge.block;
      persist();
      render();
      toast("Okay. It won't ask again this week.");
      break;
    case "undo": undo(); break;
    case "retry-save": if (persist()) render(); break;
  }
});

/**
 * Leaving for the Workout section. The browser runs the morph (cross-document view
 * transition) when it can; the card is the shared element, so for the run line the
 * name moves to that line first. Without view transitions the card gives a quick lift
 * while the next page loads: no waiting, the link navigates straight away.
 */
function leave(el) {
  const cardEl = app.querySelector(".dial-card");
  if (el.dataset.act !== "start") {
    cardEl?.classList.add("vt-off");
    el.classList.add("vt-take");
  }
  const crossDoc = "onpagereveal" in window;
  if (!crossDoc && !reducedMotion()) (el.dataset.act === "start" ? cardEl : el)?.classList.add("is-leaving");
  buzz(12);
}

// a toast handed over from the Workout section (Done on a run, leaving with nothing logged)
function takeFlash() {
  const f = readJSON(sessionStorage, FLASH_KEY);
  if (!f) return;
  try { sessionStorage.removeItem(FLASH_KEY); } catch { /* ignore */ }
  if (f.kind) ui.undo = { kind: f.kind, data: f.data };
  toast(f.text, f.action || null, f.kind ? "undo" : null, f.ms || 8000);
}

// ------------------------------------------------------------------ boot

function boot() {
  setUnits(db().settings.units);
  document.getElementById("tabbar").innerHTML = tabBar("home");
  const a = db().active;
  // An unfinished session from an earlier day is saved as partial on the next open (CLAUDE.md).
  if (a && a.date < today()) {
    if (a.log.length) db().sessions.push(M.toSession(a, { partial: true }));
    db().active = null;
    persist();
    if (a.log.length) ui.bootToast = `Saved ${a.name} from ${new Date(`${a.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" })} as partial (${a.log.length} of ${M.totalSets(a)} sets).`;
  }
  const seen = readJSON(localStorage, SEEN_KEY) || {};
  const m = homeModel(db(), today());
  const intro = seen.day !== today();
  let advanceFrom = null;
  if (!intro && seen.next && seen.next !== m.next) {
    const i = m.nodes.findIndex((x) => x.id === seen.next);
    advanceFrom = i >= 0 ? i : -1;
  } else if (intro && seen.next) {
    const i = m.nodes.findIndex((x) => x.id === seen.next);
    advanceFrom = i >= 0 && seen.next !== m.next ? i : null;
  }
  render({ intro, advanceFrom, enter: !intro });
  writeJSON(localStorage, SEEN_KEY, { day: today(), next: m.next });
  if (store.migrated && !ui.bootToast) ui.bootToast = store.migrated.from === 1 ? "Found your log from the earlier app. Everything is kept, with a backup copy." : "Your data moved to the new format. A backup copy is kept.";
  if (ui.bootToast) toast(ui.bootToast, null, null, 8000);
  takeFlash();
}

boot();
installPressGlow(document);

// Back from the Workout section through the browser's back button: the page may come from
// the back/forward cache, so read the data again (a session may have been logged meanwhile).
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  store.load();
  app.querySelectorAll(".is-leaving, .vt-off, .vt-take").forEach((el) => el.classList.remove("is-leaving", "vt-off", "vt-take"));
  const seen = readJSON(localStorage, SEEN_KEY) || {};
  const m = homeModel(db(), today());
  const i = m.nodes.findIndex((x) => x.id === seen.next);
  render({ advanceFrom: seen.next && seen.next !== m.next ? (i >= 0 ? i : -1) : null, enter: true });
  writeJSON(localStorage, SEEN_KEY, { day: today(), next: m.next });
  takeFlash();
});

// After first paint: warm the Workout section so Start → Workout is instant, start the
// service worker (offline + update prompt), and (desktop only, idle, never on phones) the ambient light.
function later() {
  startServiceWorker();
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
  idle(() => {
    for (const [rel, href] of [["prefetch", "workout.html"], ["prefetch", "css/workout.css"], ["modulepreload", "js/workout/app.js"]]) {
      const l = document.createElement("link");
      l.rel = rel; l.href = href;
      document.head.append(l);
    }
  });
  // the living green field behind Next up: fetched only after the page is idle, never delaying Start
  idle(() => import("../field.js").then((f) => { field = f.startField(); field.mount(app.querySelector(".dial-card")); }).catch(() => {}), { timeout: 2500 });
  // desktop-only light; the loader decides, and phones never fetch the effect itself
  if (matchMedia("(min-width: 1024px)").matches) import("../ambient-loader.js").then((a) => a.loadAmbient(document.body)).catch(() => {});
}
if (document.readyState === "complete") later(); else addEventListener("load", later, { once: true });
