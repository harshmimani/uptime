// One exercise list, drawn the same way everywhere: the check-in, Home's session sheet,
// Plan › Week and Learn. Each row: number, a front/back muscle map big enough to read,
// the name, sets × reps, the muscles in words, and (optionally) a YouTube link.
// Tapping the row opens the how-to (data-act="info"); the page decides where it opens.

import PLAN from "./plan.js";
import { miniMap, mapSVG, muscleLine, muscleList, youtubeURL } from "./muscles.js";
import { sessionDetail, dayLabel } from "./history.js";
import { fmtW, wu } from "./units.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const name = (ex, plan) => plan.exercises[ex]?.name || ex;

/** "3 × 5–8", "2 × 30–45 s per side" */
export function doseText(it) {
  const side = it.perSide ? " per side" : "";
  const r = it.sec ? (it.sec[0] === it.sec[1] ? `${it.sec[0]} s` : `${it.sec[0]}–${it.sec[1]} s`)
    : it.reps ? (it.reps[0] === it.reps[1] ? `${it.reps[0]}` : `${it.reps[0]}–${it.reps[1]}`) : "";
  return `${it.sets} × ${r}${side}`;
}

const PLAY = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>`;

/**
 * items: [{ ex, sets, reps?, sec?, perSide?, out? }]
 * opts.video: add a "Video" link per row; opts.label: aria-label for the list.
 */
export function exerciseList(items, { video = false, label = "Exercises", plan = PLAN } = {}) {
  const rows = items.map((it) => {
    const n = name(it.ex, plan);
    const dose = it.doseText || doseText(it);
    return `<li class="exrow${it.out ? " out" : ""}${video ? " exrow--video" : ""}">
      <button type="button" data-act="info" data-ex="${esc(it.ex)}" aria-label="${esc(`${n}, ${dose}${it.out ? ", not in the Short version" : ""}. How to do it`)}">
        ${miniMap(it.ex, plan)}<span class="exrow__text"><b>${esc(n)}</b><span class="exrow__dose num">${esc(dose)}</span><span>${esc(muscleLine(it.ex, plan))}</span></span>
      </button>
      ${video ? `<a class="exrow__video" href="${esc(youtubeURL(it.ex, plan))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(`Video: ${n}`)}" title="Watch on YouTube">${PLAY}</a>` : ""}
    </li>`;
  }).join("");
  return `<ol class="exrows" aria-label="${esc(label)}">${rows}</ol>`;
}

// ------------------------------------------------------------------ history (Home and Progress)

const fullDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** One row of the Past sessions list. Lift sessions open their detail (data-act="past"). */
export function pastRow(e, today) {
  const when = `${dayLabel(e.date, today)}${e.date >= addDaysISO(today, -6) ? "" : ` · ${fullDate(e.date).replace(/^\w+ /, "")}`}`;
  const bits = e.type === "lift"
    ? [`${e.exercises} ${e.exercises === 1 ? "exercise" : "exercises"}`, `${e.sets} ${e.sets === 1 ? "set" : "sets"}`, e.minutes ? `${e.minutes} min` : ""]
    : [e.type === "run" ? "Run" : e.type === "sport" ? "Sport" : "Conditioning", e.minutes ? `${e.minutes} min` : "", e.km ? `${e.km} km` : "", e.time || ""];
  const tag = e.partial ? `<span class="tag tag--quiet">Partial</span>` : "";
  return `<li><button type="button" class="past" data-act="past" data-id="${esc(e.id)}">
    <span class="past__when">${esc(when)}</span>
    <span class="past__what"><b>${esc(e.name)}</b>${tag}<span>${esc(bits.filter(Boolean).join(" · "))}</span></span>
    <svg class="past__go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></li>`;
}
function addDaysISO(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** What one past session held: every exercise with its sets and weights. */
export function pastDetail(e, { plan = PLAN } = {}) {
  if (e.type !== "lift") {
    return `<p class="meta" style="margin:0">${esc(fullDate(e.date))}${e.minutes ? ` · ${e.minutes} min` : ""}${e.km ? ` · ${e.km} km` : ""}${e.time ? ` · your time: ${esc(e.time)}` : ""}</p>
      <p class="quiet">Strava has the details of runs. It counts toward your week here.</p>`;
  }
  const rows = sessionDetail(e.ref, plan);
  const set = (x) => x.sec != null ? `${x.kg ? `${fmtW(x.kg)} ${wu()} × ` : ""}${x.sec} s` : `${x.kg ? `${fmtW(x.kg)} ${wu()} × ` : ""}${x.reps ?? "–"}${x.kg ? "" : " reps"}`;
  return `<p class="meta" style="margin:0">${esc(fullDate(e.date))}${e.minutes ? ` · ${e.minutes} min` : ""} · ${e.sets} ${e.sets === 1 ? "set" : "sets"}${e.partial ? " · partial session" : ""}${e.short ? " · Short version" : ""}</p>
    ${rows.length ? `<ol class="done-list">${rows.map((r) => `<li>${miniMap(r.ex, plan)}<div><b>${esc(r.name)}</b>
      <ol class="done-sets">${r.sets.map((x, i) => `<li><span>Set ${i + 1}</span><b class="num">${esc(set(x))}</b></li>`).join("")}</ol></div></li>`).join("")}</ol>`
      : `<p class="quiet">No sets were logged in this one.</p>`}`;
}

/** The last 7 days: four numbers and one map of everything that was worked. */
export function lastWeekHTML(sum, { headingId = "l7-h", heading = "Last 7 days", tag = "h2" } = {}) {
  const stat = (n, label) => `<div class="l7__stat"><span class="l7__num num">${n}</span><span class="label">${label}</span></div>`;
  const main = sum.muscles.main, also = sum.muscles.also;
  return `<section class="card l7" aria-labelledby="${headingId}">
    <${tag} class="l7__h" id="${headingId}">${esc(heading)}</${tag}>
    <div class="l7__stats">${stat(sum.sessions, sum.sessions === 1 ? "Session" : "Sessions")}${stat(sum.exercises, sum.exercises === 1 ? "Exercise" : "Exercises")}${stat(sum.sets, "Sets")}</div>
    ${sum.sets ? `<div class="l7__map">${mapSVG(main, also, { size: "l", label: `Worked in the last 7 days: ${muscleList(main)}${also.length ? `; also ${muscleList(also)}` : ""}` })}
      <dl class="howto__muscles">
        <div><dt><i class="mm-key mm-key--main" aria-hidden="true"></i>Worked</dt><dd>${esc(muscleList(main)) || "–"}</dd></div>
        ${also.length ? `<div><dt><i class="mm-key mm-key--also" aria-hidden="true"></i>Helped</dt><dd>${esc(muscleList(also))}</dd></div>` : ""}
      </dl></div>`
      : `<p class="meta">${sum.sessions ? "Runs and sport count toward your week. The muscle map fills in with your next lift." : "Nothing in the last 7 days yet. Your next session starts it."}</p>`}
  </section>`;
}
