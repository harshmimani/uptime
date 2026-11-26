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
