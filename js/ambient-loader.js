// Desktop-only ambient effect, loaded on demand.
// This file is tiny and safe to include everywhere. It never imports js/ambient.js
// statically: the effect is fetched with a dynamic import() only when every gate passes,
// so phones and tablets never download it (checked by tests/ambient.test.js and
// tests/browser/check-style.mjs). The service worker must not precache js/ambient.js.

const DESKTOP = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";

export function ambientAllowed(win = globalThis) {
  const mm = q => !!win.matchMedia?.(q).matches;
  if (!mm(DESKTOP)) return false;                                  // phones and tablets: never
  if (mm("(prefers-reduced-motion: reduce)")) return false;        // the user asked for less motion
  const nav = win.navigator || {};
  if (nav.connection?.saveData) return false;                      // data saver on
  if (nav.deviceMemory && nav.deviceMemory < 4) return false;      // low-memory machine
  return true;
}

/** Start the effect after the page is idle, so it can never delay Start. Returns a stop function. */
export function loadAmbient(target, win = globalThis) {
  if (!ambientAllowed(win)) return () => {};
  let stop = () => {};
  let cancelled = false;
  const go = () => import("./ambient.js")
    .then(m => { if (!cancelled) stop = m.startAmbient(target); })
    .catch(() => { /* decoration only: fail silently */ });
  const idle = win.requestIdleCallback || (cb => setTimeout(cb, 1200));
  const later = () => idle(go, { timeout: 3000 });
  if (document.readyState === "complete") later(); else win.addEventListener("load", later, { once: true });
  return () => { cancelled = true; stop(); };
}
