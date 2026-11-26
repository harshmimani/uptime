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
import { splitLetters, playIn, countTo, reducedMotion, buzz } from "../motion.js";

const SEEN_KEY = "uptime-home";    // { day, next }: when the intro last played, which session was last shown
const FLASH_KEY = "uptime-flash";  // one toast handed over from the Workout section (sessionStorage)

const store = createStore();
const db = () => store.db;
const app = document.getElementById("app");
const live = document.getElementById("live");
const today = () => isoDate(new Date());
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nf = new Intl.NumberFormat("en-GB");
const ui = { toast: null, saveFailed: store.readOnly, undo: null };

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

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "Late one" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

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

function statTile(st) {
  if (st.kind === "empty") {
    return `<section class="tile tile--stat tile--empty" aria-label="Standout stat">
      <span class="label">Standout stat</span>
      <svg class="tile__art" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true"><path d="M2 32 C 30 31, 44 22, 62 20 S 98 8, 118 4"/><circle cx="2" cy="32" r="2.5"/></svg>
      <p class="tile__note">${esc(st.note)}</p>
    </section>`;
  }
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

// ------------------------------------------------------------------ render

let model = null;

function render({ intro = false, advanceFrom = null } = {}) {
  model = homeModel(db(), today());
  const m = model;
  const d = new Date();
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  app.className = `home${intro ? " is-intro" : ""}${advanceFrom != null ? " is-advance" : ""}`;
  app.innerHTML = `
    <header class="hm-head"><span class="label">${esc(date)}</span><span class="hm-greet">${greeting(d)}</span></header>
    ${banners(m)}
    <div class="hm-glance">${nudge(m)}${weekTile(m)}${statTile(m.stat)}</div>
    ${card(m, { fromIndex: intro || advanceFrom != null ? advanceFrom ?? -1 : null })}
    <p class="disclaimer">${esc(PLAN.disclaimer)}</p>
    <div class="toast-slot" id="toast-slot" aria-live="polite"></div>`;
  paintToast();
  if (intro || advanceFrom != null) animate(intro);
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
  render({ intro, advanceFrom });
  writeJSON(localStorage, SEEN_KEY, { day: today(), next: m.next });
  if (ui.bootToast) toast(ui.bootToast, null, null, 8000);
  takeFlash();
}

boot();

// Back from the Workout section through the browser's back button: the page may come from
// the back/forward cache, so read the data again (a session may have been logged meanwhile).
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  store.load();
  app.querySelectorAll(".is-leaving, .vt-off, .vt-take").forEach((el) => el.classList.remove("is-leaving", "vt-off", "vt-take"));
  const seen = readJSON(localStorage, SEEN_KEY) || {};
  const m = homeModel(db(), today());
  const i = m.nodes.findIndex((x) => x.id === seen.next);
  render({ advanceFrom: seen.next && seen.next !== m.next ? (i >= 0 ? i : -1) : null });
  writeJSON(localStorage, SEEN_KEY, { day: today(), next: m.next });
  takeFlash();
});

// After first paint: warm the Workout section so Start → Workout is instant, register the
// service worker, and (desktop only, idle, never on phones) the ambient light.
function later() {
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
  idle(() => {
    for (const [rel, href] of [["prefetch", "workout.html"], ["prefetch", "css/workout.css"], ["modulepreload", "js/workout/app.js"]]) {
      const l = document.createElement("link");
      l.rel = rel; l.href = href;
      document.head.append(l);
    }
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  });
  // desktop-only light; the loader decides, and phones never fetch the effect itself
  if (matchMedia("(min-width: 1024px)").matches) import("../ambient-loader.js").then((a) => a.loadAmbient(document.body)).catch(() => {});
}
if (document.readyState === "complete") later(); else addEventListener("load", later, { once: true });
