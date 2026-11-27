// Every colour pair the components use, with the WCAG 2.2 AA minimum it must meet.
// Used by tests/contrast.test.js (reads css/tokens.css) and by the style preview (reads live CSS).
// text  = normal text, 4.5:1 (1.4.3)
// large = text ≥24px, or ≥18.66px bold, 3:1 (1.4.3)
// ui    = control boundaries, focus rings, rings and progress marks, 3:1 (1.4.11)

export const PAIRS = [
  // Body text on every surface
  ...["--c-bg", "--c-surface-1", "--c-surface-2", "--c-surface-3"].flatMap(bg => [
    { fg: "--c-text", bg, kind: "text", use: "Primary text" },
    { fg: "--c-text-2", bg, kind: "text", use: "Secondary text: meta, cues" },
    { fg: "--c-text-3", bg, kind: "text", use: "Labels, hints" },
  ]),
  // Worst-case backgrounds under the moving glows
  { fg: "--c-text", bg: "--c-bg-glow-max", kind: "text", use: "Text over the ambient/desktop glow" },
  { fg: "--c-text-2", bg: "--c-bg-glow-max", kind: "text", use: "Secondary text over the glow" },
  { fg: "--c-text-3", bg: "--c-bg-glow-max", kind: "text", use: "Labels over the glow" },
  { fg: "--c-text", bg: "--c-card-glow-max", kind: "text", use: "Next-up title at the card's brightest point" },
  { fg: "--c-text-2", bg: "--c-card-glow-max", kind: "text", use: "Next-up meta at the card's brightest point" },
  { fg: "--c-text-3", bg: "--c-card-glow-max", kind: "text", use: "Next-up label at the card's brightest point" },
  // Actions
  { fg: "--c-on-action", bg: "--c-action", kind: "text", use: "Primary button label" },
  { fg: "--c-on-green", bg: "--c-green", kind: "text", use: "Text on a bright-green fill" },
  { fg: "--c-on-green-deep", bg: "--c-green-deep", kind: "text", use: "Log button after a set is logged" },
  { fg: "--c-green", bg: "--c-toast", on: "--c-bg", kind: "text", use: "Active tab label on the tab bar" },
  ...["--c-bg", "--c-surface-1", "--c-surface-2"].map(bg => ({ fg: "--c-action", bg, kind: "ui", use: "Green buttons, selected chips and switches against the page" })),
  { fg: "--c-bg", bg: "--c-text", kind: "text", use: "Selected reps chip, rotation 'next' step" },
  { fg: "--c-text-3", bg: "--c-surface-3", kind: "text", use: "Disabled primary button (exempt, kept readable)" },
  // Green as text
  ...["--c-bg", "--c-surface-1", "--c-surface-2", "--c-surface-3"].map(bg =>
    ({ fg: "--c-green", bg, kind: "text", use: "Green progress text: ticks, 'Go', streak" })),
  { fg: "--c-on-green-deep", bg: "--c-green-deep", kind: "text", use: "Text on a deep-green fill" },
  // Warning
  { fg: "--c-warn", bg: "--c-warn-surface", kind: "text", use: "Warning title" },
  { fg: "--c-text", bg: "--c-warn-surface", kind: "text", use: "Warning body" },
  { fg: "--c-warn", bg: "--c-bg", kind: "text", use: "Warning text on the page" },
  { fg: "--c-text", bg: "--c-toast", on: "--c-action", kind: "text", use: "Toast text, worst case: over a primary button" },
  // Non-text UI
  ...["--c-bg", "--c-surface-1", "--c-surface-2"].map(bg =>
    ({ fg: "--c-line-strong", bg, kind: "ui", use: "Secondary button, chip and switch borders" })),
  ...["--c-bg", "--c-surface-1", "--c-surface-2", "--c-surface-3"].map(bg =>
    ({ fg: "--c-focus", bg, kind: "ui", use: "Focus ring" })),
  { fg: "--c-text-2", bg: "--c-surface-3", kind: "ui", use: "Rest ring arc against its track" },
  { fg: "--c-green", bg: "--c-surface-3", kind: "ui", use: "Finished ring and week segments against the track" },
  { fg: "--c-green", bg: "--c-surface-2", kind: "ui", use: "Done segment on the card" },
  { fg: "--c-text", bg: "--c-surface-1", kind: "ui", use: "Rotation highlight against unvisited steps" },
  // Muscle map (the muscles are also written out, so this is a courtesy, held to the UI bar anyway)
  // Main muscles are green and helpers a grey-green, so the two are told apart by hue as well as
  // lightness (and both are written out next to every map): the helper pairs use lower minimums.
  ...["--c-surface-1", "--c-surface-2"].map(bg => ({ fg: "--c-map-main", bg, kind: "ui", use: "Main muscle on the card" })),
  { fg: "--c-map-main", bg: "--c-map-idle", kind: "ui", use: "Main muscle against an idle one" },
  { fg: "--c-map-also", bg: "--c-map-idle", kind: "ui", use: "Secondary muscle against an idle one", min: 1.8 },
  { fg: "--c-map-main", bg: "--c-map-also", kind: "ui", use: "Main muscle against a secondary one", min: 1.4 },
  { fg: "--c-map-idle", bg: "--c-map-body", kind: "ui", use: "Idle muscle against the body outline", min: 1.2 },
];

export const MIN = { text: 4.5, large: 3, ui: 3 };

export function hexToRgb(h) {
  const s = h.trim().replace("#", "");
  const n = parseInt(s.length === 3 ? [...s].map(c => c + c).join("") : s, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export function luminance([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Composite an rgba colour over an opaque one. */
export function over([r, g, b, a], [R, G, B]) {
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)].map(Math.round);
}

/** Parse "#hex" or "rgba(r, g, b, a)" into [r, g, b, a]. */
export function parseColor(v) {
  v = v.trim();
  if (v.startsWith("#")) return [...hexToRgb(v), 1];
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Can't parse colour: ${v}`);
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
}

/** Check every pair against a lookup (token name -> colour string).
    Translucent colours are composited on the pair's `on` token (default --c-bg). */
export function checkAll(get) {
  const solid = (name, on = "--c-bg") => {
    const c = parseColor(get(name));
    return c[3] < 1 ? over(c, parseColor(get(on)).slice(0, 3)) : c.slice(0, 3);
  };
  return PAIRS.map(p => {
    const bg = solid(p.bg, p.on);
    const r = ratio(solid(p.fg), bg);
    const min = p.min ?? MIN[p.kind];
    return { ...p, ratio: r, min, pass: r >= min };
  });
}
