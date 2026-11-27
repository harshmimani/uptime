// Motion helpers shared by the style preview and, once approved, the app.
// All movement is CSS transform/opacity; this file only toggles classes, sets CSS
// variables and updates text. Nothing here is required for the app to work.

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Read a duration token (e.g. "--dur-slow") in ms, so JS waits match CSS. */
export function token(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v.endsWith("ms") ? parseFloat(v) : v.endsWith("s") ? parseFloat(v) * 1000 : v;
}

/** Split an element's text into letters for kinetic type. Screen readers get the whole word. */
export function splitLetters(el, text = el.textContent) {
  el.classList.add("kt");
  el.textContent = "";
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  const vis = document.createElement("span");
  vis.setAttribute("aria-hidden", "true");
  [...text].forEach((c, i) => {
    const s = document.createElement("span");
    s.className = "ch";
    s.style.setProperty("--i", i);
    s.textContent = c;
    vis.append(s);
  });
  el.append(sr, vis);
  return el;
}

/** Play letters in. Restarts if already played. */
export function playIn(el) {
  el.classList.remove("play", "leave");
  void el.offsetWidth; // restart the animation
  el.classList.add("play");
}

/** Letters out, swap the text, letters in. Resolves when the new text has landed. */
export async function swapText(el, next) {
  if (reducedMotion()) { splitLetters(el, next); return; }
  el.classList.remove("play");
  el.classList.add("leave");
  const n = el.querySelectorAll(".ch").length;
  await wait(token("--dur-base") + n * token("--stagger") * 0.5);
  splitLetters(el, next);
  el.classList.remove("leave");
  playIn(el);
  await wait(token("--dur-hero") + next.length * token("--stagger"));
}

/** Count a number up (or down). Tabular numerals keep the width still. */
export function countTo(el, to, { from = 0, format = v => v.toFixed(0), dur = token("--dur-count") } = {}) {
  if (!dur || reducedMotion()) { el.textContent = format(to); return Promise.resolve(); }
  return new Promise(done => {
    const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = format(from + (to - from) * ease(t));
      t < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  });
}

export const wait = ms => new Promise(r => setTimeout(r, ms));

/** A short tap on supporting phones. Never the only signal. */
export const buzz = (ms = 18) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Rest timer built on an end timestamp, so it is right after a screen lock or app switch.
 * The ring sweep is one CSS animation; its negative delay places it at the true elapsed time.
 */
export class RestTimer {
  constructor(ring, { onOver } = {}) {
    this.ring = ring;
    this.time = ring.querySelector(".ring__time");
    this.sub = ring.querySelector(".ring__sub");
    this.onOver = onOver;
    this.iv = null;
    document.addEventListener("visibilitychange", () => { if (!document.hidden && this.endAt) this.sync(); });
  }
  start(seconds, { startAt = Date.now() } = {}) {
    this.startAt = startAt;
    this.endAt = startAt + seconds * 1000;
    this.sync();
  }
  add(seconds) {
    if (!this.endAt) return;
    this.endAt += seconds * 1000;
    this.sync();
  }
  skip() { this.endAt = Date.now(); this.sync(); }
  stop() { clearInterval(this.iv); this.iv = null; this.endAt = null; this.ring.classList.remove("run", "over"); }
  sync() {
    const r = this.ring;
    const total = this.endAt - this.startAt;
    const elapsed = Date.now() - this.startAt;
    r.classList.remove("over", "run");
    r.style.setProperty("--dur", `${total}ms`);
    r.style.setProperty("--delay", `${-elapsed}ms`);
    void r.offsetWidth;
    r.classList.add("run");
    clearInterval(this.iv);
    this.tick();
    this.iv = setInterval(() => this.tick(), 250);
  }
  tick() {
    const left = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
    if (left > 0) {
      this.time.textContent = fmt(left);
      if (this.sub) this.sub.textContent = "Rest";
      return;
    }
    clearInterval(this.iv);
    this.iv = null;
    this.time.textContent = "Go";
    if (this.sub) this.sub.textContent = "Rest over";
    this.ring.classList.remove("run");
    this.ring.classList.add("over");
    buzz([30, 60, 30]);
    this.onOver?.();
  }
}

/**
 * A burst of green from a point (a logged set, a finished session). Decoration only:
 * nothing under reduced motion, and the nodes remove themselves.
 * opts.best: a set that beat last time (bigger, a second ring).
 * opts.big: the session-done version (more sparks, further, two rings and a second wave).
 */
export function celebrate(x, y, { big = false, best = false, wave = false } = {}) {
  if (reducedMotion() || typeof document === "undefined") return;
  const box = document.createElement("div");
  box.className = "burst";
  box.setAttribute("aria-hidden", "true");
  box.style.transform = `translate(${x}px, ${y}px)`;
  const n = big ? (wave ? 22 : 44) : best ? 26 : 14, reach = big ? (wave ? 260 : 210) : best ? 140 : 90;
  const colors = ["var(--c-green)", "var(--c-action)", "var(--c-green-deep)", "var(--c-text)"];
  let html = big ? (wave ? `<b style="--ring:320px"></b>` : `<b></b><b style="--ring:200px;animation-delay:120ms"></b>`)
    : best ? `<b style="--ring:110px"></b><b style="--ring:170px;animation-delay:90ms"></b>` : `<b style="--ring:90px"></b>`;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const d = reach * (0.55 + Math.random() * 0.6);
    const s = (big || best ? 6 : 5) + Math.random() * (big ? 8 : best ? 6 : 5);
    const bar = Math.random() < 0.4;
    html += `<i style="--x:${(Math.cos(a) * d).toFixed(1)}px;--y:${(Math.sin(a) * d - (big ? 40 : best ? 24 : 10)).toFixed(1)}px;--s:${s.toFixed(1)}px;--c:${colors[i % (big || best ? 4 : 2)]};--t:${Math.round((big ? 900 : best ? 760 : 620) + Math.random() * 300)}ms;--d:${Math.round(Math.random() * (big ? 160 : 60))}ms;--rot:${Math.round(Math.random() * 360)}deg${bar ? ";--r:2px" : ""}"></i>`;
  }
  box.innerHTML = html;
  document.body.append(box);
  setTimeout(() => box.remove(), big ? 1600 : 1300);
  if (big && !wave) setTimeout(() => celebrate(x, y, { big: true, wave: true }), 280);
}

/**
 * A full-screen green circle grows from an element (a session just finished), then fades to
 * reveal what's underneath. Resolves once the screen is covered, so the caller can swap the
 * view behind it. Reduced motion: resolves at once and nothing is drawn.
 */
export function wipeFrom(el) {
  if (reducedMotion() || typeof document === "undefined" || !el) return Promise.resolve(() => {});
  const r = el.getBoundingClientRect();
  const w = document.createElement("div");
  w.className = "finish-wipe";
  w.setAttribute("aria-hidden", "true");
  w.style.setProperty("--x", `${Math.round(r.left + r.width / 2)}px`);
  w.style.setProperty("--y", `${Math.round(r.top + r.height / 2)}px`);
  document.body.append(w);
  const reveal = () => { w.classList.add("out"); setTimeout(() => w.remove(), 600); };
  return wait(440).then(() => reveal);
}

/** Primary buttons light up under the finger: a soft glow from the press point. One listener for the page. */
export function installPressGlow(root = document) {
  if (typeof document === "undefined") return;
  root.addEventListener("pointerdown", (e) => {
    const b = e.target.closest?.(".btn--primary");
    if (!b || b.disabled || reducedMotion()) return;
    const r = b.getBoundingClientRect();
    const g = document.createElement("span");
    g.className = "press-glow";
    g.setAttribute("aria-hidden", "true");
    g.style.setProperty("--px", `${e.clientX - r.left}px`);
    g.style.setProperty("--py", `${e.clientY - r.top}px`);
    b.append(g);
    setTimeout(() => g.remove(), 600);
  }, { passive: true });
}

/**
 * Cards rise in one after another (Progress, Plan): each direct child of `root` that matches
 * gets its place in line as --i, and the CSS (.stagger in components.css) does the rest.
 * Only for a page's first paint or a new section, never a repaint the user caused in place.
 */
export function staggerIn(root, selector = ":scope > *, :scope .ups > li") {
  if (!root || reducedMotion()) return;
  [...root.querySelectorAll(selector)].forEach((el, i) => el.style.setProperty("--i", Math.min(i, 10)));
  root.classList.add("stagger");
  setTimeout(() => root.classList.remove("stagger"), 1200);
}
