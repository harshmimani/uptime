// Plan tab: Modes (Busy mode switch, the rotation), Fuel, Learn and Settings.
// All plan content comes from js/plan.js. Every change saves at once and offers Undo;
// imports and resets keep a backup copy first (store.replace), so Undo survives a reload.

import PLAN from "../plan.js";
import * as E from "../engine.js";
import { createStore, emptyDB, engineLog, exportJSON, parseImport, isoDate } from "../store.js";
import * as P from "../progress-data.js";
import { startServiceWorker } from "../sw-client.js";
import { tabBar, esc, showToast, say, dayMonth } from "../nav.js";
import { setUnits, wu, fmtW } from "../units.js";
import { exName, exCue } from "../workout/model.js";
import { unlockAudio, sound, setVibration, vibrate } from "../workout/feedback.js";

const store = createStore();
const db = () => store.db;
const app = document.getElementById("app");
const today = () => isoDate(new Date());
const SECTIONS = [["modes", "Modes"], ["fuel", "Fuel"], ["learn", "Learn"], ["settings", "Settings"]];
const ui = { section: "modes", diet: "both", focus: null };

function applyPrefs() {
  setUnits(db().settings.units);
  setVibration(db().settings.vibrate);
}
applyPrefs();

function persist() {
  const r = store.save();
  if (!r.ok) showToast(r.readOnly ? "Saved data couldn't be read, so nothing is changed. Export a backup below first." : "Couldn't save. Your phone may be out of space; nothing was lost.", null, null, 9000);
  return r.ok;
}

const sw = (id, on, label) => `<button class="switch" type="button" data-act="${id}" role="switch" aria-checked="${!!on}" aria-labelledby="${id}-l"><span class="switch__track"><span class="switch__knob"></span></span><span aria-hidden="true">${on ? "On" : "Off"}</span></button>`;

// ------------------------------------------------------------------ Modes

function viewModes() {
  const busy = E.isBusy(db().settings, today());
  const next = E.nextSession(engineLog(db()), { busy });
  const rot = PLAN.rules.rotation.map((id) => E.sessionDef(id));
  return `<section class="section" aria-labelledby="modes-h">
    <h2 id="modes-h" class="sr-only">Modes</h2>
    <div class="card">
      <div class="setting"><span id="busy-l"><b>Busy mode</b><small>Exams, deadlines, travel</small></span>${sw("busy", busy)}</div>
      <p class="meta">2–3 full-body sessions of about 40 minutes, plus 1 run a week. Your rotation waits and picks up where it stopped.</p>
      <p class="meta">Next up: <b style="color:var(--c-text)">${esc(E.sessionDef(next)?.name || "")}</b></p>
    </div>
    <div class="card">
      <span class="label">The rotation</span>
      <ol class="list">${rot.map((d) => `<li><b>${esc(d.name)}</b> · ${esc(d.focus)}</li>`).join("")}</ol>
      <p class="meta">Plus 1 run and 1 sport or conditioning session, and at least 1 rest day. Missed days never skip a session.</p>
      <p class="quiet">No gym today? Pick it on the check-in screen. Race mode is set from the run screen.</p>
    </div>
  </section>`;
}

function toggleBusy() {
  const before = db().settings.modeLog;
  const on = !E.isBusy(db().settings, today());
  db().settings = E.setBusy(db().settings, on, today());
  if (!persist()) { db().settings.modeLog = before; return; }
  render();
  showToast(on ? "Busy mode on. Your rotation waits." : "Back to the rotation.", "Undo", () => {
    db().settings.modeLog = before;
    persist();
    render();
  });
}

// ------------------------------------------------------------------ Fuel

function viewFuel() {
  const f = PLAN.food;
  const w = P.latestWeight(db());
  const kg = w?.kg || f.protein.fallbackKg;
  const [lo, hi] = P.proteinTarget(kg);
  const meals = `${f.protein.perMeal[0]}–${f.protein.perMeal[1]} g`;
  const rows = (list) => list.map((s) => `<tr><td><b>${esc(s.name)}</b>${esc(s.serving)}${s.note ? `<br>${esc(s.note)}` : ""}</td><td class="num">~${s.g} g</td></tr>`).join("");
  const show = ui.diet;
  const src = [
    show !== "nonveg" ? rows(f.sources.veg) : "",
    show !== "veg" ? rows(f.sources.nonVeg) : "",
    rows(f.sources.either),
  ].join("");
  const dietBtn = (id, label) => `<button type="button" class="chip" data-act="diet" data-d="${id}" aria-pressed="${show === id}">${label}</button>`;
  return `<section class="section" aria-labelledby="fuel-h">
    <h2 id="fuel-h" class="sr-only">Fuel</h2>
    <p class="meta">${esc(f.intro)}</p>
    <div class="card card--raised">
      <span class="label">Protein a day</span>
      <p class="big num">${lo}–${hi}<small> g</small></p>
      <p class="meta">${f.protein.perKg[0]}–${f.protein.perKg[1]} g per kg ${w ? `at your ${fmtW(w.kg)} ${wu()} (logged ${w.date === today() ? "today" : dayMonth(w.date)})` : `for ${fmtW(kg)} ${wu()}, as an example`}. About ${meals} at each of 3–4 meals.</p>
      ${w ? "" : `<p class="quiet">Log your weight in Progress for your own number.</p>`}
      <p class="quiet">${esc(f.protein.why)}</p>
    </div>
    <h2>How to eat to lean out</h2>
    <div class="card"><ul class="cues">${f.rules.map((r) => `<li><b>${esc(r.title)}</b>${esc(r.text)}</li>`).join("")}</ul></div>
    <h2>Easy protein</h2>
    <div class="chips" role="group" aria-label="Show">${dietBtn("both", "All")}${dietBtn("veg", "Veg")}${dietBtn("nonveg", "Non-veg")}</div>
    <div class="card"><table class="food-table"><caption class="sr-only">Protein per serving</caption><tbody>${src}</tbody></table></div>
    <h2>Plates</h2>
    ${f.plates.map((p) => `<div class="card"><h3 style="font-size:var(--fs-body)">${esc(p.name)}</h3><ul class="list">${p.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}
    <h2>Is it working?</h2>
    <div class="card"><ul class="list">${f.checks.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
    <p class="quiet">${esc(f.note)}</p>
  </section>`;
}

// ------------------------------------------------------------------ Learn

function viewLearn() {
  return `<section class="section" aria-labelledby="learn-h">
    <h2 id="learn-h" class="sr-only">Learn</h2>
    <p class="meta">A minute each: why the plan works the way it does.</p>
    ${PLAN.learn.map((l) => `<details class="explain" id="learn-${esc(l.id)}">
      <summary><span><b>${esc(l.title)}</b><span>${esc(l.lead)}</span></span></summary>
      <div class="explain__body">
        <ul class="list">${l.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        ${l.exercises ? `<span class="label">Main lifts</span><ul class="cues">${l.exercises.map((ex) => `<li><b>${esc(exName(ex))}</b>${esc(exCue(ex))}</li>`).join("")}</ul>` : ""}
      </div>
    </details>`).join("")}
    <details class="explain"><summary><span><b>${esc(PLAN.guidance.lean.title)}</b><span>Strong and lean, never bulky.</span></span></summary>
      <div class="explain__body"><ul class="list">${PLAN.guidance.lean.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div></details>
  </section>`;
}

// ------------------------------------------------------------------ Settings

const WEEKDAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];

function viewSettings() {
  const s = db().settings;
  const busyDays = new Set(s.busyWeekdays || []);
  const last = store.lastBackup();
  return `<section class="section" aria-labelledby="set-h">
    <h2 id="set-h" class="sr-only">Settings</h2>
    <div class="card">
      <label class="field"><span class="label">Your sport</span>
        <input id="sport" maxlength="30" autocomplete="off" enterkeyhint="done" value="${esc(s.sportName || "Basketball")}" placeholder="Basketball"></label>
      <p class="quiet">Shown in "Log something else". It fills the sport slot in your week.</p>
    </div>
    <div class="card">
      <span class="label" id="wd-l">Usually busy on</span>
      <div class="weekdays" role="group" aria-labelledby="wd-l">${WEEKDAYS.map(([d, n]) => `<button type="button" class="chip" data-act="weekday" data-d="${d}" aria-pressed="${busyDays.has(d)}">${n}</button>`).join("")}</div>
      <p class="quiet">Optional. Only used for gentle hints, like suggesting the Short version on those days.</p>
    </div>
    <div class="card">
      <span class="label" id="units-l">Weight units</span>
      <div class="seg-ctl seg-ctl--small" role="group" aria-labelledby="units-l">
        <button type="button" data-act="units" data-u="kg" aria-pressed="${s.units !== "lb"}"><b>kg</b></button>
        <button type="button" data-act="units" data-u="lb" aria-pressed="${s.units === "lb"}"><b>lb</b></button>
      </div>
      <p class="quiet">Everything is stored in kg, so switching never changes your logs.</p>
      <div class="setting"><span id="sound-l">Sound at the end of rest</span>${sw("sound", s.sound !== false)}</div>
      <div class="setting"><span id="vibrate-l">Vibration<small>Not supported on iPhone</small></span>${sw("vibrate", s.vibrate !== false)}</div>
    </div>
    <h2>Your data</h2>
    <div class="card">
      <p class="meta">Everything lives only on this phone. Export a backup now and then: clearing browser data clears your log.</p>
      <button class="btn btn--secondary btn--wide" data-act="export"><span class="btn__label">Export backup (JSON)</span></button>
      <label class="btn btn--secondary btn--wide file-btn"><span class="btn__label">Import a backup</span><input type="file" id="import" accept="application/json,.json"></label>
      <p class="quiet">Importing replaces what's here. A copy of the current data is kept, so it can be undone.</p>
      ${last ? `<div class="notice"><div>A copy from before ${esc(last.reason)} (${esc(dayMonth(isoDate(new Date(last.at))))}) is kept.
        <div class="row" style="margin-top:4px"><button class="btn btn--text" data-act="restore">Restore that copy</button></div></div></div>` : ""}
    </div>
    <h2>Reset</h2>
    <div class="card">
      <button class="btn btn--secondary btn--wide" data-act="reset-prefs"><span class="btn__label">Reset these settings</span></button>
      <p class="quiet">Sport, busy days, units, sound and vibration go back to defaults. Logs stay.</p>
      <button class="btn btn--secondary btn--wide" data-act="reset-weight"><span class="btn__label">Clear bodyweight log</span></button>
      <button class="btn btn--secondary btn--wide danger" data-act="reset-all"><span class="btn__label">Erase everything</span></button>
      <p class="quiet">Every reset keeps a copy first and can be undone, even after closing the app.</p>
    </div>
    <p class="disclaimer">${esc(PLAN.disclaimer)} Uptime keeps no account and sends nothing anywhere.</p>
  </section>`;
}

function setPref(key, value, msg) {
  const before = db().settings[key];
  db().settings[key] = value;
  if (!persist()) { db().settings[key] = before; return; }
  applyPrefs();
  render();
  if (msg) showToast(msg, "Undo", () => { db().settings[key] = before; persist(); applyPrefs(); render(); });
}

function download() {
  const blob = new Blob([exportJSON(db())], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `uptime-backup-${today()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast("Backup downloaded. Keep it somewhere safe, like Drive or email.");
}

async function importFile(file) {
  if (!file) return;
  let text;
  try { text = await file.text(); } catch { showToast("Couldn't open that file. Nothing changed."); return; }
  const res = parseImport(text);
  if (res.error) { showToast(`${res.error} Nothing changed.`, null, null, 8000); return; }
  if (res.db.active && db().active) res.db.active = db().active; // never drop a workout in progress
  replaceAll(res.db, "the import", `Imported: ${res.db.sessions.length} sessions, ${res.db.activities.length} runs and activities${res.legacy ? " from the earlier app" : ""}.`);
}

function replaceAll(next, reason, msg) {
  const r = store.replace(next, reason);
  if (!r.ok) { showToast(r.error?.message ? `${r.error.message} Nothing changed.` : "Couldn't save. Nothing changed.", null, null, 8000); return; }
  applyPrefs();
  render();
  say(msg);
  showToast(msg, "Undo", restore, 10000);
}

function restore() {
  const r = store.restoreLast();
  if (!r.ok) { showToast("Couldn't restore the copy. Nothing changed."); return; }
  applyPrefs();
  render();
  showToast(`Restored the copy from before ${r.reason}.`);
}

function resetPrefs() {
  const d = emptyDB().settings;
  const next = structuredClone(db());
  for (const k of ["sportName", "busyWeekdays", "units", "sound", "vibrate"]) next.settings[k] = d[k];
  replaceAll(next, "resetting settings", "Settings reset. Logs are untouched.");
}
function resetWeight() {
  const next = structuredClone(db());
  next.body.weight = [];
  replaceAll(next, "clearing bodyweight", "Bodyweight log cleared.");
}
function resetAll() {
  const next = emptyDB();
  replaceAll(next, "erasing everything", "Everything erased.");
}

// ------------------------------------------------------------------ page

function render() {
  const sec = ui.section;
  const view = { modes: viewModes, fuel: viewFuel, learn: viewLearn, settings: viewSettings }[sec]();
  app.innerHTML = `<main class="scr" data-screen="plan">
    <header class="scr__head">
      <h1 class="h1 page-title" tabindex="-1">${sec === "modes" ? "Plan" : esc(SECTIONS.find((s) => s[0] === sec)[1])}</h1>
      <nav class="subnav" aria-label="Plan sections">${SECTIONS.map(([id, label]) => `<a class="chip" href="#${id}" data-act="section" data-s="${id}"${id === sec ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    </header>
    <div class="scr__body">
      ${store.readOnly ? `<div class="notice notice--warn"><div><b>Saved data couldn't be read.</b> Nothing is changed or deleted.</div></div>` : ""}
      ${store.migrated ? `<div class="notice notice--done"><div><b>${store.migrated.from === 1 ? "Found your log from the earlier app." : "Your data moved to the new format."}</b> Everything is kept, and a backup copy of the old data is saved.</div></div>` : ""}
      ${view}
    </div>
    <div class="scr__foot scr__foot--tabs"><div class="toast-slot" id="toast-slot" aria-live="polite"></div>${tabBar("plan")}</div>
  </main>`;
  if (ui.focus) { document.querySelector(ui.focus)?.focus(); ui.focus = null; }
}

function fromHash() {
  const h = location.hash.slice(1);
  ui.section = SECTIONS.some((s) => s[0] === h) ? h : "modes";
}

app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const s = db().settings;
  switch (el.dataset.act) {
    case "section":
      ev.preventDefault();
      history.replaceState(null, "", `#${el.dataset.s}`);
      ui.section = el.dataset.s;
      ui.focus = ".page-title";
      render();
      scrollTo(0, 0);
      break;
    case "busy": toggleBusy(); break;
    case "diet": ui.diet = el.dataset.d; render(); break;
    case "weekday": {
      const d = Number(el.dataset.d);
      const set = new Set(s.busyWeekdays || []);
      if (set.has(d)) set.delete(d); else set.add(d);
      setPref("busyWeekdays", [...set].sort());
      ui.focus = `[data-act=weekday][data-d="${d}"]`;
      render();
      break;
    }
    case "units": setPref("units", el.dataset.u, `Weights now show in ${el.dataset.u}.`); break;
    case "sound":
      setPref("sound", s.sound === false);
      if (db().settings.sound) { unlockAudio(); setTimeout(() => sound("go"), 50); }
      ui.focus = "[data-act=sound]"; render();
      break;
    case "vibrate":
      setPref("vibrate", s.vibrate === false);
      vibrate(30);
      ui.focus = "[data-act=vibrate]"; render();
      break;
    case "export": download(); break;
    case "restore": restore(); break;
    case "reset-prefs": resetPrefs(); break;
    case "reset-weight": resetWeight(); break;
    case "reset-all": resetAll(); break;
  }
});
app.addEventListener("change", (ev) => {
  if (ev.target.id === "sport") {
    const v = ev.target.value.trim().replace(/\s+/g, " ").slice(0, 30) || "Basketball";
    if (v !== db().settings.sportName) setPref("sportName", v, `Sport set to ${v}.`);
  }
  if (ev.target.id === "import") importFile(ev.target.files?.[0]);
});
app.addEventListener("keydown", (ev) => { if (ev.target.id === "sport" && ev.key === "Enter") ev.target.blur(); });
addEventListener("hashchange", () => { fromHash(); render(); });

fromHash();
render();

startServiceWorker();
