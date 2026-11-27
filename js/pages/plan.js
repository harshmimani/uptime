// Plan tab: the whole week first (every session, exercise and muscle, with videos),
// then Modes (Busy mode switch, the rotation), Fuel, Learn and Settings.
// All plan content comes from js/plan.js. Every change saves at once and offers Undo;
// imports and resets keep a backup copy first (store.replace), so Undo survives a reload.

import { sheetChrome, installSheetSwipe } from "../sheet.js";
import PLAN from "../plan.js";
import * as E from "../engine.js";
import { createStore, emptyDB, engineLog, exportJSON, parseImport, isoDate, importLegacy, legacyReport } from "../store.js";
import * as P from "../progress-data.js";
import { startServiceWorker } from "../sw-client.js";
import { tabBar, esc, showToast, say, dayMonth } from "../nav.js";
import { setUnits, wu, fmtW } from "../units.js";
import { exName, exCue, buildItems, estimateMin } from "../workout/model.js";
import { howToHTML, coverage, guideFor, mapSVG, muscleList } from "../muscles.js";
import { exerciseList } from "../session-view.js";
import * as R from "../workout/run.js";
import { getTheme, setTheme } from "../theme.js";
import { unlockAudio, sound, setVibration, vibrate } from "../workout/feedback.js";
import { installPressGlow, staggerIn } from "../motion.js";

const store = createStore();
const db = () => store.db;
const app = document.getElementById("app");
const today = () => isoDate(new Date());
// Coming up is the default (it replaced Week, which showed the same six sessions; old #week links land here)
const SECTIONS = [["next", "Coming up"], ["modes", "Modes"], ["fuel", "Fuel"], ["learn", "Learn"], ["settings", "Settings"]];
const migNote = store.takeMigrationNotice(); // once, inline (never over content)
const ui = { open: new Set(), section: "next", diet: "both", focus: null, info: null, infoTrigger: null };

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

// ------------------------------------------------------------------ Coming up: the next sessions, to show someone
// One cycle from the next session, in the order it's likely to happen: lifts in rotation order,
// the quality run and the long run where the spacing rules like them (E.upcoming). Each card opens
// in place to its exercises, sets × reps and muscles. Plain and calm, phone or laptop.

const WHEN = ["Next", "Then", "After that"];

/**
 * One session as a card that opens in place. Two sub-lines by design (what it focuses on, then
 * "7 exercises · about 50 min") so a wrap never strands a dot. Positions 4 on carry no label:
 * the number already gives the order.
 */
function upCard({ k, n, when, name, meta, meta2 = "", body, kind, next = false }) {
  return `<li><details class="up up--${kind}${next ? " up--next" : ""}" data-k="${esc(k)}"${ui.open.has(k) ? " open" : ""}>
      <summary><span class="up__n num" aria-hidden="true">${n}</span>
        <span class="up__text">${when ? `<span class="up__when">${esc(when)}</span>` : ""}<b class="up__name">${esc(name)}</b><span class="up__meta">${esc(meta)}</span>${meta2 ? `<span class="up__meta up__meta--2">${esc(meta2)}</span>` : ""}</span>
        <span class="up__chev" aria-hidden="true"></span></summary>
      <div class="up__body">${body}</div>
    </details></li>`;
}

/** A lift's card body: the combined muscle map, then every exercise with sets × reps and a video. */
function liftBody(def, items) {
  const mus = sessionMuscles(items);
  return `<div class="up__map">${mapSVG(mus.main, mus.also, { size: "l", label: `${def.name} works ${muscleList(mus.main)}${mus.also.length ? `; also ${muscleList(mus.also)}` : ""}` })}
          <p class="meta"><b>Works</b> ${esc(muscleList(mus.main))}${mus.also.length ? `<br><b>Helps</b> ${esc(muscleList(mus.also))}` : ""}</p></div>
        ${exerciseList(items, { video: true, label: `${def.name} exercises` })}`;
}

function sessionMuscles(items) {
  const main = new Set(), also = new Set();
  for (const it of items) { const g = guideFor(it.ex); g.m.forEach((m) => main.add(m)); g.s.forEach((m) => also.add(m)); }
  return { main: [...main], also: [...also].filter((m) => !main.has(m)) };
}

function viewNext() {
  const log = engineLog(db());
  const settings = db().settings;
  const list = E.upcoming(log, settings, today());
  const busy = E.isBusy(settings, today());
  const three = E.threeLiftBuild(settings, today());
  const fiveK = R.fiveKSec(db().activities, settings);
  const sport = settings.sportName || "Basketball";
  const cond = PLAN.conditioning.options.filter((c) => c.fills !== "run").map((c) => `<li><b>${esc(exName(c.ex))}</b>${c.minutes[0]}–${c.minutes[1]} min${c.note ? ` · ${esc(c.note)}` : ""}</li>`).join("");
  const cards = list.map((x, i) => {
    const when = WHEN[i] || "";
    let name, meta, meta2 = "", body, kind, start = null;
    if (x.type === "lift") {
      const def = E.sessionDef(x.id);
      const items = buildItems(x.id, { settings });
      kind = "lift";
      name = def.name;
      meta = def.focus || "Full body";
      meta2 = `${items.length} exercises · about ${estimateMin(items)} min`;
      body = liftBody(def, items);
      start = { href: "workout.html?start=lift", label: `Start ${def.name}` };
    } else if (x.type === "run") {
      const t = R.runTarget(x.pick, fiveK);
      kind = "run";
      name = t.name;
      meta = "Quality run";
      meta2 = x.pick.gameLimit ? "Two games stood in already: this one's a run" : `A game of ${sport.toLowerCase()} counts instead`;
      body = `<p class="run-line">${esc(t.target)}</p>${t.note ? `<p class="meta">${esc(t.note)}</p>` : ""}
        <p class="quiet">Tempo and intervals take turns; the long run keeps the 10K and 21K going. Strava records it.</p>`;
      start = { href: "workout.html?start=run", label: `Start ${t.name}` };
    } else if (x.type === "long") {
      const t = R.runTarget(x.pick, fiveK);
      kind = "long";
      name = t.name;
      meta = x.pick.restart ? "Easy run first" : `${x.pick.km} km`;
      meta2 = x.pick.restart ? "After a month off running" : three ? "Long easy run" : "Or other easy cardio";
      body = `<p class="run-line">${esc(t.target)}</p><p class="meta">${esc(t.note)}</p>
        ${three ? "" : `<p class="quiet">No time for it? Any of these fills the slot instead; a game never does.</p><ul class="cues">${cond}</ul>`}`;
      start = { href: "workout.html?start=long", label: `Start ${t.name}` };
    } else {
      const t = R.runTarget({ run: "easy" }, fiveK);
      kind = "easy";
      name = t.name;
      meta = "Easy run";
      meta2 = "Half-marathon build: the third run";
      body = `<p class="run-line">${esc(t.target)}</p>`;
    }
    // the first card can start straight from here (no trip back to Home)
    if (i === 0 && start) body += `<a class="btn btn--primary up__start" href="${start.href}" data-act="go"><span class="btn__label">${esc(start.label)}</span></a>`;
    return upCard({ k: `n${i}`, n: i + 1, when, name, meta, meta2, body, kind, next: i === 0 });
  }).join("");
  const explain = busy ? "Busy mode is on: full-body sessions of about 40 minutes, plus one run. The main rotation waits."
    : three ? "Half-marathon build: three lifts (Upper A, the build Lower, Upper B) and three runs a rotation, plus at least one rest day."
    : "Four lifts in a fixed order, a quality run and a long run, plus at least one rest day.";
  return `<section class="section coming" aria-labelledby="next-h">
    <h2 id="next-h" class="sr-only">Coming up</h2>
    <p class="meta">${explain} Missed days never skip a session: each waits its turn. Tap any for its exercises, muscles and videos.</p>
    <ol class="ups">${cards}</ol>
    <p class="quiet">Rest: at least one full day per rotation, and never three hard days in a row. No ${esc(sport.toLowerCase())} or intervals the day after Lower B. Runs fit any day. ${esc(PLAN.run.timeNote)}</p>
  </section>`;
}

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
      <p class="meta">Plus a quality run and a long run, and at least 1 rest day. Missed days never skip a session.</p>
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

function rotationSessions() {
  return PLAN.rules.rotation.map((id) => ({ id, name: E.sessionDef(id).name, items: buildItems(id, { settings: db().settings }) }));
}

function coverageTable(sessions) {
  const rows = coverage(sessions);
  const dot = (n) => (n === 0 ? `<em aria-hidden="true">–</em>` : `<i aria-hidden="true" style="width:${n <= 3 ? 8 : n <= 6 ? 12 : 17}px;height:${n <= 3 ? 8 : n <= 6 ? 12 : 17}px"></i>`);
  return `<div class="card">
    <div class="cov-wrap"><table class="cov">
      <caption class="sr-only">Working sets per muscle group in each session</caption>
      <thead><tr><th scope="col">Muscle</th>${sessions.map((s) => `<th scope="col"><abbr title="${esc(s.name)}" style="text-decoration:none">${esc(s.id)}</abbr></th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row" style="font-weight:inherit;text-align:left;color:var(--c-text-2)">${esc(r.label)}</th>${r.cells.map((n, i) => `<td><span class="sr-only">${esc(sessions[i].name)}: ${n} ${n === 1 ? "set" : "sets"}</span>${dot(n)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>
    <div class="cov-legend" aria-hidden="true"><span><i style="width:8px;height:8px"></i>1–3 sets</span><span><i style="width:12px;height:12px"></i>4–6</span><span><i style="width:17px;height:17px"></i>7+</span></div>
    <p class="quiet">Sets where the muscle is a main mover, in the full version of each session. Runs and sport add legs and lungs on top.</p>
  </div>`;
}

function viewLearn() {
  const sessions = rotationSessions();
  return `<section class="section" aria-labelledby="learn-h">
    <h2 id="learn-h" class="sr-only">Learn</h2>
    <p class="meta">Every exercise, with its muscles, steps and a video, is under <a href="#next" data-act="section" data-s="next">Coming up</a>.</p>
    <h2>Where the work lands</h2>
    ${coverageTable(sessions)}
    <h2>Why it works</h2>
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
      <p class="quiet">Shown in "Log something else". A game counts as that rotation's quality run.</p>
    </div>
    <div class="card">
      <span class="label" id="wd-l">Usually busy on</span>
      <div class="weekdays" role="group" aria-labelledby="wd-l">${WEEKDAYS.map(([d, n]) => `<button type="button" class="chip" data-act="weekday" data-d="${d}" aria-pressed="${busyDays.has(d)}">${n}</button>`).join("")}</div>
      <p class="quiet">Optional. Only used for gentle hints, like suggesting the Short version on those days.</p>
    </div>
    <div class="card">
      <span class="label" id="theme-l">Theme</span>
      <div class="seg-ctl seg-ctl--small" role="group" aria-labelledby="theme-l" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        ${[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([t, n]) => `<button type="button" data-act="theme" data-t="${t}" aria-pressed="${getTheme() === t}"><b>${n}</b></button>`).join("")}
      </div>
      <p class="quiet">System follows your phone's light or dark setting.</p>
    </div>
    <div class="card">
      <span class="label" id="units-l">Weight units</span>
      <div class="seg-ctl seg-ctl--small" role="group" aria-labelledby="units-l">
        <button type="button" data-act="units" data-u="kg" aria-pressed="${s.units !== "lb"}"><b>kg</b></button>
        <button type="button" data-act="units" data-u="lb" aria-pressed="${s.units === "lb"}"><b>lb</b></button>
      </div>
      <p class="quiet">Everything is stored in kg, so switching never changes your logs.</p>
      <div class="setting"><span id="sound-l">Sounds (logged sets, end of rest)</span>${sw("sound", s.sound !== false)}</div>
      <div class="setting"><span id="vibrate-l">Vibration<small>Not supported on iPhone</small></span>${sw("vibrate", s.vibrate !== false)}</div>
    </div>
    <h2>Your data</h2>
    ${oldDataCard()}
    <div class="card">
      <p class="meta">Everything lives only on this phone. Export a backup now and then: clearing browser data clears your log.</p>
      <button class="btn btn--secondary btn--wide" data-act="export"><span class="btn__label">Export backup (JSON)</span></button>
      <label class="btn btn--secondary btn--wide file-btn"><span class="btn__label">Import a backup</span><input type="file" id="import" accept="application/json,.json,text/csv,.csv"></label>
      <p class="quiet">An Uptime backup replaces what's here. A backup or CSV from the earlier app is added to what's here instead. Either way a copy of the current data is kept, so it can be undone.</p>
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

/** What came across from the earlier app, matched to this plan or not. */
function oldDataCard() {
  const rows = legacyReport(db());
  const kg = (v) => `${fmtW(v)} ${wu()}`;
  const lastText = (r) => r.last ? `${r.last.kg ? kg(r.last.kg) : ""}${r.last.kg && r.last.reps ? " × " : ""}${r.last.reps ?? ""} on ${dayMonth(r.last.date)}${r.sessions > 1 ? ` · ${r.sessions} sessions` : ""}`
    : r.lastKg ? `last weight ${kg(r.lastKg)}, no dates` : "";
  if (!rows.length) {
    return `<div class="card" id="old-data">
      <span class="label">From the earlier app</span>
      <p class="meta">Nothing from the earlier app on this phone${db().legacy ? " except bodyweight and runs" : ""}.</p>
      <p class="quiet">Used it in another browser, or on the home-screen app instead of the browser (or the other way round)? Open this site there, go to Plan › Settings and tap Export backup, then import that file here. A backup (.json) or lift log (.csv) saved from the earlier app imports too.</p>
    </div>`;
  }
  const matched = rows.filter((r) => r.to), kept = rows.filter((r) => !r.to);
  return `<div class="card" id="old-data">
    <span class="label">From the earlier app</span>
    <p class="meta">${matched.length} ${matched.length === 1 ? "exercise counts" : "exercises count"} toward this plan: their last weights fill in your workouts and show in Progress.${kept.length ? ` ${kept.length} more ${kept.length === 1 ? "is" : "are"} kept but not part of this plan.` : ""}</p>
    ${matched.length ? `<ul class="oldmap" aria-label="Matched">${matched.map((r) => `<li><b>${esc(r.name)}${r.to !== r.id ? ` → ${esc(exName(r.to))}` : ""}</b><span>${esc(lastText(r))}</span></li>`).join("")}</ul>` : ""}
    ${kept.length ? `<details class="explain"><summary><span><b>Kept, not in this plan</b><span>${kept.length} ${kept.length === 1 ? "exercise" : "exercises"}</span></span></summary>
      <div class="explain__body"><ul class="oldmap">${kept.map((r) => `<li><b>${esc(r.name)}</b><span>${esc(lastText(r))}</span>${r.why ? `<span>${esc(r.why)}</span>` : ""}</li>`).join("")}</ul></div></details>` : ""}
  </div>`;
}

// ------------------------------------------------------------------ how-to sheet (Learn)

function infoSheet() {
  if (!ui.info) return "";
  return `<div class="scrim" data-act="close-info"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" tabindex="-1">
      ${sheetChrome("close-info")}
      ${howToHTML(ui.info, { name: exName(ui.info), cue: exCue(ui.info), headingId: "sheet-h" })}
      <button class="btn btn--text" style="justify-self:center" data-act="close-info">Back</button>
    </div>`;
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
  if (res.legacy) {
    // the earlier app's data joins what's here; nothing in the new log is replaced
    const next = importLegacy(structuredClone(db()), res.old);
    const n = Object.keys(next.legacy?.sets || {}).length - Object.keys(db().legacy?.sets || {}).length;
    replaceAll(next, "the import", n > 0 ? `Added ${n} ${n === 1 ? "day" : "days"} of lifts from the earlier app.` : "Nothing new: that log is already here.");
    document.getElementById("old-data")?.scrollIntoView({ block: "start" });
    return;
  }
  if (res.db.active && db().active) res.db.active = db().active; // never drop a workout in progress
  replaceAll(res.db, "the import", `Imported: ${res.db.sessions.length} sessions, ${res.db.activities.length} runs and activities.`);
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
  const view = { next: viewNext, modes: viewModes, fuel: viewFuel, learn: viewLearn, settings: viewSettings }[sec]();
  app.innerHTML = `<main class="scr" data-screen="plan">
    <header class="scr__head">
      <h1 class="h1 page-title" tabindex="-1">${esc(SECTIONS.find((s) => s[0] === sec)[1])}</h1>
      <nav class="subnav" aria-label="Plan sections">${SECTIONS.map(([id, label]) => `<a class="chip" href="#${id}" data-act="section" data-s="${id}"${id === sec ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    </header>
    <div class="scr__body">
      ${store.readOnly ? `<div class="notice notice--warn"><div><b>Saved data couldn't be read.</b> Nothing is changed or deleted.</div></div>` : ""}
      ${migNote ? `<div class="notice notice--done"><div>${esc(migNote)}</div></div>` : ""}
      ${view}
    </div>
    <div class="scr__foot scr__foot--tabs"><div class="toast-slot" id="toast-slot" aria-live="polite"></div>${tabBar("plan")}</div>
  </main>${infoSheet()}`;
  // the strip is rebuilt at its start: bring the selected section into view (Settings sits off the edge on a phone)
  app.querySelector('.subnav [aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  if (ui.info) app.querySelector(".sheet")?.focus();
  else if (ui.focus) { document.querySelector(ui.focus)?.focus(); ui.focus = null; }
}

function fromHash() {
  const h = location.hash.slice(1);
  ui.section = SECTIONS.some((s) => s[0] === h) ? h : "next"; // #week (the old default) lands on Coming up
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
      staggerIn(app.querySelector(".scr__body > .section, .scr__body > section"));
      scrollTo(0, 0);
      break;
    case "busy": toggleBusy(); break;
    case "info":
      ui.info = el.dataset.ex;
      ui.infoTrigger = `[data-act="info"][data-ex="${CSS.escape(el.dataset.ex)}"]`;
      keepOpen(() => render());
      break;
    case "close-info": closeInfo(); break;
    case "theme": {
      const t = el.dataset.t;
      if (!setTheme(t)) showToast("Couldn't save the theme, so it's only for now.");
      ui.focus = `[data-act=theme][data-t="${t}"]`;
      render();
      break;
    }
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
document.addEventListener("keydown", (ev) => {
  if (!ui.info) return;
  if (ev.key === "Escape") closeInfo();
  if (ev.key === "Tab") { // keep focus inside the sheet
    const f = [...app.querySelectorAll(".sheet button, .sheet a[href]")];
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

/** Re-render without collapsing the <details> the user had open, or losing the scroll. */
function keepOpen(fn) {
  const open = [...app.querySelectorAll("details[open] > summary")].map((s) => s.textContent);
  const y = scrollY;
  fn();
  for (const sum of app.querySelectorAll("details > summary")) if (open.includes(sum.textContent)) sum.parentElement.open = true;
  scrollTo(0, y);
}
function closeInfo() {
  const back = ui.infoTrigger;
  ui.info = null;
  keepOpen(() => render());
  if (back) document.querySelector(back)?.focus({ preventScroll: true });
}
addEventListener("hashchange", () => { fromHash(); render(); });
// Week and Coming up: remember which cards are open, so opening a how-to and coming back keeps them
app.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (!d.matches?.("details.up")) return;
  if (d.open) ui.open.add(d.dataset.k); else ui.open.delete(d.dataset.k);
}, true);

fromHash();
render();
staggerIn(app.querySelector(".scr__body > .section, .scr__body > section"));
installPressGlow(document);
installSheetSwipe();

startServiceWorker();
