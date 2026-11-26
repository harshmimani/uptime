// Ambient light field for desktop screens. Loaded only by js/ambient-loader.js.
// A few soft green lights drift on slow, unrelated paths and lean gently towards the pointer.
// Drawn on a tiny canvas (1/10 of the screen) and scaled up by CSS: the blur comes for free,
// the cost stays near zero. Pauses when the tab is hidden. Never sits above content.

const SCALE = 0.1;
const LIGHTS = [
  { r: 0.55, a: 0.05, sx: 0.00011, sy: 0.00007, px: 0.2, py: 0.1 },
  { r: 0.45, a: 0.04, sx: 0.00008, sy: 0.00013, px: 0.8, py: 0.6 },
  { r: 0.38, a: 0.035, sx: 0.00015, sy: 0.00009, px: 0.5, py: 0.9 },
];

export function startAmbient(target = document.body) {
  const c = document.createElement("canvas");
  c.setAttribute("aria-hidden", "true");
  c.className = "ambient";
  Object.assign(c.style, {
    position: "fixed", inset: "0", width: "100vw", height: "100vh", zIndex: "-1",
    pointerEvents: "none", opacity: "0", transition: "opacity 1.6s cubic-bezier(.2,.8,.2,1)",
  });
  target.prepend(c);
  const ctx = c.getContext("2d", { alpha: true });
  let w = 0, h = 0, raf = 0, mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5;

  const size = () => {
    w = c.width = Math.max(32, Math.round(innerWidth * SCALE));
    h = c.height = Math.max(32, Math.round(innerHeight * SCALE));
  };
  const onMove = e => { tx = e.clientX / innerWidth; ty = e.clientY / innerHeight; };
  const frame = t => {
    mx += (tx - mx) * 0.02; my += (ty - my) * 0.02;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const L of LIGHTS) {
      const x = (0.5 + 0.38 * Math.sin(t * L.sx + L.px * 6) + (mx - 0.5) * 0.12) * w;
      const y = (0.5 + 0.38 * Math.cos(t * L.sy + L.py * 6) + (my - 0.5) * 0.12) * h;
      const r = L.r * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(41,186,116,${L.a})`);
      g.addColorStop(1, "rgba(41,186,116,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    raf = requestAnimationFrame(frame);
  };
  const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); };

  size();
  addEventListener("resize", size);
  addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("visibilitychange", onVis);
  raf = requestAnimationFrame(frame);
  requestAnimationFrame(() => { c.style.opacity = "1"; });

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("resize", size);
    removeEventListener("pointermove", onMove);
    document.removeEventListener("visibilitychange", onVis);
    c.remove();
  };
}
