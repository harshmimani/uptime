// Muscles, the muscle map, and the how-to card for one exercise.
// Content (muscles, steps, mistakes) lives in js/plan.js under `guide`; this file only draws it.
// The body outline is the earlier app's map (docs/HISTORY.md, "Kept on purpose"), front and back,
// with shins added for tibialis work. Colours are tokens (--c-map-*), checked for contrast in
// both themes by tests/contrast.test.js.

import PLAN from "./plan.js";

export const MUSCLE_NAMES = {
  chest: "chest", shoulders: "shoulders", reardelts: "rear shoulders", biceps: "biceps", triceps: "triceps",
  forearms: "forearms and grip", abs: "abs", obliques: "obliques", lats: "lats", upperback: "upper back",
  traps: "traps", lowerback: "lower back", glutes: "glutes", quads: "quads", hamstrings: "hamstrings",
  adductors: "inner thighs", calves: "calves", shins: "shins",
};

// [muscle key or 0 for body, tag, attributes]. Front and back share the outline.
const BASE = [
  [0, "ellipse", 'cx="50" cy="14" rx="8" ry="9.5"'],
  [0, "rect", 'x="46" y="22" width="8" height="9" rx="2"'],
  [0, "path", 'd="M28 33 Q50 27 72 33 L66 88 L34 88 Z"'],
  [0, "path", 'd="M35 86 H65 L67 101 Q50 109 33 101 Z"'],
  [0, "circle", 'cx="21.5" cy="96" r="4"'], [0, "circle", 'cx="78.5" cy="96" r="4"'],
  [0, "circle", 'cx="39.5" cy="145" r="4.5"'], [0, "circle", 'cx="60.5" cy="145" r="4.5"'],
  [0, "ellipse", 'cx="39" cy="186" rx="6" ry="3.5"'], [0, "ellipse", 'cx="61" cy="186" rx="6" ry="3.5"'],
];
const FRONT = BASE.concat([
  ["shins", "rect", 'x="35.5" y="150" width="8" height="31" rx="4"'], ["shins", "rect", 'x="56.5" y="150" width="8" height="31" rx="4"'],
  ["chest", "rect", 'x="34" y="32" width="15.5" height="17" rx="6"'], ["chest", "rect", 'x="50.5" y="32" width="15.5" height="17" rx="6"'],
  ["shoulders", "circle", 'cx="30.5" cy="38" r="7.5"'], ["shoulders", "circle", 'cx="69.5" cy="38" r="7.5"'],
  ["abs", "rect", 'x="41.5" y="51" width="17" height="34" rx="5"'],
  ["seam", "path", 'd="M50 53V83M43 62.5H57M43 73.5H57"'],
  ["obliques", "rect", 'x="34.5" y="52" width="6" height="28" rx="3"'], ["obliques", "rect", 'x="59.5" y="52" width="6" height="28" rx="3"'],
  ["biceps", "rect", 'x="20.5" y="45" width="9" height="21" rx="4.5"'], ["biceps", "rect", 'x="70.5" y="45" width="9" height="21" rx="4.5"'],
  ["forearms", "rect", 'x="17.5" y="68" width="8.5" height="24" rx="4.25"'], ["forearms", "rect", 'x="74" y="68" width="8.5" height="24" rx="4.25"'],
  ["quads", "rect", 'x="33" y="101" width="13" height="40" rx="6.5"'], ["quads", "rect", 'x="54" y="101" width="13" height="40" rx="6.5"'],
  ["adductors", "rect", 'x="46.3" y="103" width="3.4" height="22" rx="1.7"'], ["adductors", "rect", 'x="50.3" y="103" width="3.4" height="22" rx="1.7"'],
]);
const BACK = BASE.concat([
  [0, "rect", 'x="36.5" y="170" width="6" height="12" rx="3"'], [0, "rect", 'x="57.5" y="170" width="6" height="12" rx="3"'],
  ["upperback", "rect", 'x="35" y="33" width="14" height="15" rx="5"'], ["upperback", "rect", 'x="51" y="33" width="14" height="15" rx="5"'],
  ["traps", "path", 'd="M41 27 H59 L57 39 L50 51 L43 39 Z"'],
  ["reardelts", "circle", 'cx="30.5" cy="38" r="7.5"'], ["reardelts", "circle", 'cx="69.5" cy="38" r="7.5"'],
  ["lats", "path", 'd="M33.5 47 L45 50.5 L45 80 Q38 77 35.5 67 Z"'], ["lats", "path", 'd="M66.5 47 L55 50.5 L55 80 Q62 77 64.5 67 Z"'],
  ["lowerback", "rect", 'x="45.8" y="58" width="8.4" height="28" rx="3"'],
  ["triceps", "rect", 'x="20.5" y="45" width="9" height="21" rx="4.5"'], ["triceps", "rect", 'x="70.5" y="45" width="9" height="21" rx="4.5"'],
  ["forearms", "rect", 'x="17.5" y="68" width="8.5" height="24" rx="4.25"'], ["forearms", "rect", 'x="74" y="68" width="8.5" height="24" rx="4.25"'],
  ["glutes", "ellipse", 'cx="42" cy="97" rx="8.5" ry="9"'], ["glutes", "ellipse", 'cx="58" cy="97" rx="8.5" ry="9"'],
  ["hamstrings", "rect", 'x="33" y="107" width="13" height="35" rx="6.5"'], ["hamstrings", "rect", 'x="54" y="107" width="13" height="35" rx="6.5"'],
  ["adductors", "rect", 'x="46.3" y="108" width="3.4" height="18" rx="1.7"'], ["adductors", "rect", 'x="50.3" y="108" width="3.4" height="18" rx="1.7"'],
  ["calves", "ellipse", 'cx="39.5" cy="160" rx="5.5" ry="11"'], ["calves", "ellipse", 'cx="60.5" cy="160" rx="5.5" ry="11"'],
]);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The guide entry for an exercise: { m, s, steps, mistake, yt? } (empty lists if none). */
export function guideFor(ex, plan = PLAN) {
  return plan.guide?.[ex] || { m: [], s: [], steps: [], mistake: "" };
}

/** "quads, glutes" */
export const muscleList = (keys) => keys.map((k) => MUSCLE_NAMES[k] || k).join(", ");

/** One line for lists: "Quads, glutes · also inner thighs" */
export function muscleLine(ex, plan = PLAN) {
  const g = guideFor(ex, plan);
  if (!g.m.length) return "";
  const main = muscleList(g.m);
  return `${main.charAt(0).toUpperCase()}${main.slice(1)}${g.s.length ? ` · also ${muscleList(g.s)}` : ""}`;
}

/** A YouTube search for the exercise, so the link never goes dead. */
export function youtubeURL(ex, plan = PLAN) {
  const q = guideFor(ex, plan).yt || plan.exercises[ex]?.name || ex;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

function figure(list, main, also) {
  return list.map(([k, tag, a]) => {
    if (k === "seam") return `<${tag} ${a} fill="none" stroke="var(--c-map-body)" stroke-width="1.4" stroke-linecap="round"/>`;
    const cls = !k ? "mm-body" : main.includes(k) ? "mm-main" : also.includes(k) ? "mm-also" : "mm-idle";
    return `<${tag} ${a} class="${cls}"/>`;
  }).join("");
}

/**
 * Front and back figures with the main muscles bright and the secondary ones mid-tone.
 * size: "s" (list rows, no labels) or "l" (detail card, labelled).
 */
export function mapSVG(main = [], also = [], { size = "l", label } = {}) {
  const lab = size === "l"
    ? '<text x="35" y="201" text-anchor="middle" class="mm-lab">FRONT</text><text x="113" y="201" text-anchor="middle" class="mm-lab">BACK</text>'
    : "";
  const aria = label || (main.length ? `Works ${muscleList(main)}${also.length ? `; also ${muscleList(also)}` : ""}` : "Muscle map");
  return `<svg class="mmap mmap--${size}" viewBox="0 0 148 ${size === "l" ? 204 : 192}" role="img" aria-label="${esc(aria)}"><g transform="translate(-15 0)">${figure(FRONT, main, also)}</g><g transform="translate(63 0)">${figure(BACK, main, also)}</g>${lab}</svg>`;
}

/** Small map for an exercise row. Decorative there: the muscles are also written out. */
export function miniMap(ex, plan = PLAN) {
  const g = guideFor(ex, plan);
  return mapSVG(g.m, g.s, { size: "s" }).replace('role="img"', 'aria-hidden="true"');
}

/**
 * The how-to card: map, muscles, steps, the mistake to avoid and the YouTube link.
 * `name` and `cue` come from the caller (exName/exCue know about swaps and the sport name).
 */
export function howToHTML(ex, { name, cue, headingId = "howto-h", headingTag = "h2", plan = PLAN } = {}) {
  const g = guideFor(ex, plan);
  const title = name || plan.exercises[ex]?.name || ex;
  return `<div class="howto">
    <${headingTag} class="sheet__title" id="${esc(headingId)}">${esc(title)}</${headingTag}>
    ${cue ? `<p class="meta">${esc(cue)}</p>` : ""}
    <figure class="howto__map" style="margin:0">
      ${mapSVG(g.m, g.s, { size: "l" })}
      <dl class="howto__muscles">
        <div><dt><i class="mm-key mm-key--main" aria-hidden="true"></i>Main</dt><dd>${esc(muscleList(g.m)) || "–"}</dd></div>
        ${g.s.length ? `<div><dt><i class="mm-key mm-key--also" aria-hidden="true"></i>Also</dt><dd>${esc(muscleList(g.s))}</dd></div>` : ""}
      </dl>
    </figure>
    ${g.steps.length ? `<span class="label">How to</span><ol class="steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
    ${g.mistake ? `<div class="notice notice--avoid"><div><b>Main mistake</b> ${esc(g.mistake)}</div></div>` : ""}
    <a class="btn btn--secondary btn--wide" href="${esc(youtubeURL(ex, plan))}" target="_blank" rel="noopener noreferrer">Watch on YouTube<span class="sr-only"> (opens a search for ${esc(title)})</span></a>
  </div>`;
}

// Coverage: the groups the earlier app's matrix used.
export const GROUPS = [
  ["Chest", ["chest"]], ["Shoulders", ["shoulders", "reardelts"]], ["Triceps", ["triceps"]],
  ["Back", ["lats", "upperback", "traps"]], ["Biceps", ["biceps"]], ["Grip", ["forearms"]],
  ["Core", ["abs", "obliques", "lowerback"]], ["Quads", ["quads"]], ["Glutes", ["glutes"]],
  ["Hamstrings", ["hamstrings"]], ["Inner thighs", ["adductors"]], ["Calves and shins", ["calves", "shins"]],
];

/**
 * Working sets per muscle group per session, main muscles only (as the old matrix counted).
 * sessions: [{ id, name, items: [{ ex, sets }] }] → [{ label, cells: [sets per session] }]
 */
export function coverage(sessions, plan = PLAN) {
  return GROUPS.map(([label, keys]) => ({
    label,
    cells: sessions.map((s) => s.items.reduce((n, it) => n + (guideFor(it.ex, plan).m.some((k) => keys.includes(k)) ? it.sets : 0), 0)),
  }));
}
