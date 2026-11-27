// Muscles, the muscle map, and the how-to card for one exercise.
// Content (muscles, steps, mistakes) lives in js/plan.js under `guide`; this file only draws it.
// The map keeps the earlier app's idea (docs/HISTORY.md, "Kept on purpose"): a front and a back
// figure with the worked muscles coloured. Redrawn Nov 2026 as anatomical shapes (pecs, delts,
// lats, glutes, two calf heads…) that still read at 64 px. Colours are tokens (--c-map-*),
// checked for contrast in both themes by tests/contrast.test.js.

import PLAN from "./plan.js";

export const MUSCLE_NAMES = {
  chest: "chest", shoulders: "shoulders", reardelts: "rear shoulders", biceps: "biceps", triceps: "triceps",
  forearms: "forearms and grip", abs: "abs", obliques: "obliques", lats: "lats", upperback: "upper back",
  traps: "traps", lowerback: "lower back", glutes: "glutes", quads: "quads", hamstrings: "hamstrings",
  adductors: "inner thighs", calves: "calves", shins: "shins",
};

// The figure: front and back, drawn in a 100 × 200 box per side. Each muscle is one path for the
// left side of the body, mirrored for the right (m = 1), so the whole map stays a few kB.
// [muscle key, or 0 for the body outline; path; mirror]. Muscles sit on the outline with a hairline
// of body colour between them, which is what makes the figure read as anatomy, not pills.
const BODY = [
  [0, "M50 3.5c5.2 0 8.6 4.3 8.6 10 0 5.4-3.3 10.3-8.6 10.3s-8.6-4.9-8.6-10.3c0-5.7 3.4-10 8.6-10z", 0],
  [0, "M44.5 21.5h11l1.2 7.5h-13.4z", 0],
  // torso: shoulders, a gentle taper to the waist, hips
  [0, "M50 26.5c-8 0-14.5 1.3-19 3.6-3.8 2-5.6 5.2-6.2 9.4L33.5 46c.8 6.5 2.6 12 3.4 18.5.6 5.3.2 11-.8 16.5-1.2 6.5-2.6 13-2.4 20.5L50 104l16.3-2.5c.2-7.5-1.2-14-2.4-20.5-1-5.5-1.4-11.2-.8-16.5.8-6.5 2.6-12 3.4-18.5l8.7-6.5c-.6-4.2-2.4-7.4-6.2-9.4-4.5-2.3-11-3.6-19-3.6z", 0],
  // arm, forearm, hand
  [0, "M25 35.5c-3.2 3.5-3.6 9-3.9 14.5l-1.2 15.5c-.6 6.6-2.4 13.2-3.4 20.2-.4 3 .2 6.5 1.4 9.6l3.6.2c.4-3.8 1.4-7.2 2.7-10.6 2.5-6.5 4.5-13.2 5.4-20l1.6-11.6c.7-5.4 1.6-10.2 3.6-14.6z", 1],
  [0, "M17.6 94.5c-1.6 2.3-2.4 5.3-2 8.2.3 2.4 1.7 3.6 3.4 3.3 1.8-.3 2.8-2 3-4.4l.3-6.8z", 1],
  // leg: thigh, knee, shin and calf, foot
  [0, "M33.6 99.5c-1.8 9-2.4 18.5-1.4 28 .7 6.6 2.3 12.4 2.6 18.5.3 6-1.3 12-1.6 18.5-.3 6.3.8 12.3 2.4 18.4h7.3c.5-6.4.8-12.6 1.6-18.8.8-6.4 2.4-12.6 2.6-19 .2-6-.8-11.8-.3-17.8.6-8.4 2.6-16.8 3.2-24.8z", 1],
  [0, "M36 182.5c-2 1.2-3.6 3.4-3.6 5.4 0 1.6 1.2 2.6 3 2.6h8.4c1.2 0 1.8-1 1.4-2.2l-1.4-5.8z", 1],
];
const FRONT = BODY.concat([
  ["shoulders", "M31.5 30.6c-3.6 1.6-6.2 4.4-6.6 9.2-.2 2.6.4 5 1.4 6.8 1.6-2.4 3.4-4.4 5.6-5.8 1.4-3.6 3-6.6 5-8.8-1.6-.8-3.4-1.4-5.4-1.4z", 1],
  ["chest", "M49.2 31.2c-4.6-.2-8.6.2-11.6 1.4-2.4 2.6-4 5.8-5 9.2 1.6 3.6 4.6 6 8.6 6.8 3 .6 5.8.2 8-1z", 1],
  ["biceps", "M25.8 48c-1.6 2.4-2.6 5.2-3 8.4-.4 3.4-.2 6.8.4 9.6 1.8-.4 3.4-1.6 4.4-3.4 1.4-2.6 2-5.8 2.4-9.2.2-2.2.4-4.2.8-6.2-1.8-.2-3.6.2-5 .8z", 1],
  ["forearms", "M21.5 69.5c-1 5.2-2.6 10.4-3.6 15.8-.4 2.4-.4 4.6.2 6.6l2.4.2c1.6-4.6 3.4-9 4.8-13.6 1-3.2 1.6-6.4 2-9.6-1.8-.6-4-.4-5.8.6z", 1],
  ["abs", "M44.6 49.8c1.8-.8 3.6-1.2 5.4-1.2s3.6.4 5.4 1.2l-.6 31c-1.4 1.6-3 2.4-4.8 2.4s-3.4-.8-4.8-2.4z", 0],
  ["seam", "M50 50.5v31M44.9 59.6h10.2M45 68.6h10M45.2 76.4h9.6", 0],
  ["obliques", "M37.4 50.8c1.6.8 3.4 1.4 5.4 1.6l.2 27.4c-1.8-.6-3.4-1.8-4.4-3.4-.4-4-.4-8.4-.6-12.8-.2-4.4-.4-8.8-.6-12.8z", 1],
  ["quads", "M35.4 104c-1.8 7.4-2.4 15-1.6 22.6.6 5 1.8 9.6 2.8 14.2 1.4 1.6 3.6 2.4 5.8 2.2 1.6-1.2 2.6-3 2.8-5 .4-4.4.2-8.8.4-13.2.2-5 1.2-10 2.2-14.8-2.4-3.2-7.6-5.6-12.4-6z", 1],
  ["adductors", "M47.2 108c-1 4.6-1.6 9.4-1.4 14 .2 2.4.8 4.4 1.8 6 .8-1.6 1.4-3.6 1.6-5.8l.2-12.8c-.6-.6-1.4-1.2-2.2-1.4z", 1],
  ["shins", "M37 150.5c-.8 4.8-1 9.8-.4 14.6.4 3.2 1.2 6.2 2.4 9 1-3.2 1.6-6.4 1.8-9.8.2-4.4-.2-8.8-1.2-13-.8-.4-1.8-.6-2.6-.8z", 1],
  ["calves", "M42.4 150.6c1.6 3.2 2.4 6.8 2.2 10.4-.2 3.2-1 6.2-2.2 9-.6-3-.8-6-.8-9.2s.2-6.8.8-10.2z", 1],
]);
const BACK = BODY.concat([
  ["traps", "M50 23.6c-2.6 0-4.8 1-6.2 2.6-3.6 1.8-7.2 3-10.6 4 3.2.8 6.2 2 8.8 3.8 2.6 3.6 5.2 7.8 8 12.6 2.8-4.8 5.4-9 8-12.6 2.6-1.8 5.6-3 8.8-3.8-3.4-1-7-2.2-10.6-4-1.4-1.6-3.6-2.6-6.2-2.6z", 0],
  ["reardelts", "M31.2 31c-3.4 1.6-5.8 4.4-6.2 8.8-.2 2.6.4 5 1.4 6.8 2.2-2.6 4.6-4.6 7.4-5.8.6-2.8 1.6-5.4 3-7.8-1.8-1.2-3.6-2-5.6-2z", 1],
  ["upperback", "M37.8 34.6c-1.2 2.6-2 5.4-2.2 8.4 3 1.4 6.4 2.4 9.8 3 1.4.2 2.6.6 3.8 1.2l-.2-1.6c-2.2-3.8-4.6-7.4-7.2-10.6-1.4-.4-2.6-.6-4-.4z", 1],
  ["lats", "M35.6 45.6c.2 6.2 1.4 12.2 3.4 18 1 2.8 2.6 5 4.6 6.6 1.6-3.4 3-7 4-10.6.6-2.8.8-5.6.6-8.4-1.4-1.2-3-2-4.8-2.4-2.8-.6-5.4-1.6-7.8-3.2z", 1],
  ["lowerback", "M46.8 57.4c1-.6 2.2-.8 3.2-.8s2.2.2 3.2.8l.8 24.4c-1.2 1.2-2.6 1.8-4 1.8s-2.8-.6-4-1.8z", 0],
  ["triceps", "M25.6 47.4c-1.8 2.6-2.8 5.6-3.2 8.8-.4 3.2 0 6.4.8 9.2 1.6-.8 3-2 3.8-3.6 1.4-2.8 2-6 2.4-9.4.2-2 .4-3.8.8-5.6-1.6-.2-3.2 0-4.6.6z", 1],
  ["forearms", "M21.5 69.5c-1 5.2-2.6 10.4-3.6 15.8-.4 2.4-.4 4.6.2 6.6l2.4.2c1.6-4.6 3.4-9 4.8-13.6 1-3.2 1.6-6.4 2-9.6-1.8-.6-4-.4-5.8.6z", 1],
  ["glutes", "M49.2 86.6c-4-1.6-8.4-1.8-12.4-.6-1.6 3.6-2.4 7.6-2.2 11.6 2.4 2.8 5.8 4.4 9.4 4.6 2 .2 3.8-.4 5.2-1.4z", 1],
  ["hamstrings", "M35 105.8c-1.4 7-1.8 14.2-1 21.4.6 4.8 1.8 9.2 2.8 13.6 1.4 1.4 3.4 2 5.4 1.8 1.4-1.4 2.2-3.2 2.4-5.2.4-4.6.4-9.2.8-13.8.4-5.4 1.4-10.6 2.4-15.6-3.8-2.2-8.4-3-12.8-2.2z", 1],
  ["adductors", "M47.6 108.4c-.8 4-1.2 8-1 12 .2 2 .6 3.8 1.4 5.2.8-1.6 1.2-3.4 1.4-5.4l.2-10.6c-.6-.6-1.2-1-2-1.2z", 1],
  ["calves", "M37.6 147.4c-1.6 3.6-2.2 7.6-1.8 11.6.4 3.2 1.4 6 3 8.4 1.2-1.8 1.8-4 2-6.2.4-4.4.2-8.8-.6-13.2-.8-.4-1.6-.6-2.6-.6zM42.8 147.6c1.6 3.4 2.6 7.2 2.6 11 0 3.2-.8 6.2-2.2 8.8-.8-2.4-1-4.8-1-7.4 0-4.2.2-8.4.6-12.4z", 1],
]);
const MIRROR = ' transform="matrix(-1 0 0 1 100 0)"';
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
  return list.map(([k, d, m]) => {
    if (k === "seam") return `<path d="${d}" class="mm-seam"/>`;
    const cls = !k ? "mm-body" : main.includes(k) ? "mm-main" : also.includes(k) ? "mm-also" : "mm-idle";
    const one = `<path d="${d}" class="${cls}"/>`;
    return m ? one + `<path d="${d}" class="${cls}"${MIRROR}/>` : one;
  }).join("");
}

/**
 * Front and back figures with the main muscles bright and the secondary ones mid-tone.
 * size: "s" (list rows: a plain silhouette with the worked muscles lit, so it reads at 64 px)
 * or "l" (detail card: every muscle drawn, labelled FRONT and BACK).
 */
export function mapSVG(main = [], also = [], { size = "l", label } = {}) {
  const lab = size === "l"
    ? '<text x="36" y="205" text-anchor="middle" class="mm-lab">FRONT</text><text x="112" y="205" text-anchor="middle" class="mm-lab">BACK</text>'
    : "";
  const aria = label || (main.length ? `Works ${muscleList(main)}${also.length ? `; also ${muscleList(also)}` : ""}` : "Muscle map");
  return `<svg class="mmap mmap--${size}" viewBox="0 0 148 ${size === "l" ? 208 : 194}" role="img" aria-label="${esc(aria)}"><g transform="translate(-14 1)">${figure(FRONT, main, also)}</g><g transform="translate(62 1)">${figure(BACK, main, also)}</g>${lab}</svg>`;
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
