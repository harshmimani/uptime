// Sheet chrome shared by every page: a grab handle, a sticky 48 px close button top right, and
// swipe-down to close (touch). Each page keeps its own open/close logic: the close button
// carries that page's close action, and a swipe simply presses it, so the back gesture,
// Escape and the scrim keep working exactly as before.

const X = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>`;

/** The handle and the close button; put them first inside `.sheet`. */
export const sheetChrome = (act = "close-sheet", label = "Close") =>
  `<div class="sheet__grab" aria-hidden="true"></div><button type="button" class="sheet__x" data-act="${act}" aria-label="${label}">${X}</button>`;

/**
 * Swipe a sheet down to close it. Starts only when the sheet is scrolled to the top (or on the
 * handle) and the finger moves down, so scrolling a long sheet is never hijacked.
 * Transform only: the sheet follows the finger through --drag.
 */
export function installSheetSwipe(doc = document) {
  let s = null;
  doc.addEventListener("touchstart", (e) => {
    const el = e.target.closest?.(".sheet");
    if (!el || e.touches.length !== 1) { s = null; return; }
    if (el.scrollTop > 0 && !e.target.closest(".sheet__grab")) { s = null; return; }
    s = { el, y0: e.touches[0].clientY, x0: e.touches[0].clientX, dy: 0, t0: performance.now(), on: false };
  }, { passive: true });
  doc.addEventListener("touchmove", (e) => {
    if (!s) return;
    const dy = e.touches[0].clientY - s.y0, dx = e.touches[0].clientX - s.x0;
    if (!s.on) {
      if (dy > 8 && dy > Math.abs(dx) && s.el.scrollTop <= 0) { s.on = true; s.el.classList.add("is-dragging"); }
      else if (dy < -4 || Math.abs(dx) > 12) { s = null; return; }
      else return;
    }
    e.preventDefault();
    s.dy = Math.max(0, dy);
    s.el.style.setProperty("--drag", `${s.dy}px`);
  }, { passive: false });
  const end = () => {
    if (!s) return;
    const { el, dy, t0, on } = s;
    s = null;
    if (!on) return;
    el.classList.remove("is-dragging");
    const fast = dy / Math.max(1, performance.now() - t0) > 0.6;
    if (dy > 96 || (fast && dy > 32)) el.querySelector(".sheet__x")?.click();
    else el.style.removeProperty("--drag");
  };
  doc.addEventListener("touchend", end);
  doc.addEventListener("touchcancel", end);
}
