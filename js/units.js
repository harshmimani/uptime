// Display units. Everything is stored in kg; only what's shown (and what's typed) changes.
// One module-level setting so model text ("Last time: 15 kg × 8") and the screens agree.

export const LB_PER_KG = 2.2046226218;
let current = "kg";

export const units = () => current;
export function setUnits(u) { current = u === "lb" ? "lb" : "kg"; }

/** Unit label: "kg" or "lb". */
export const wu = (u = current) => (u === "lb" ? "lb" : "kg");

/** kg → number in the display unit (lb rounded to 0.5, kg to 0.01). */
export function toUnit(kg, u = current) {
  if (kg == null || !Number.isFinite(Number(kg))) return null;
  return u === "lb" ? Math.round(kg * LB_PER_KG * 2) / 2 : Math.round(kg * 100) / 100;
}

/** Number typed in the display unit → kg. */
export function fromUnit(v, u = current) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return u === "lb" ? v / LB_PER_KG : v;
}

/** "17.5" (kg) or "38.5" (lb); empty for null. */
export const fmtW = (kg, u = current) => (kg == null ? "" : String(toUnit(kg, u)));

/** Stepper jump in kg: 2.5 kg, or 5 lb. */
export const weightStep = (u = current) => (u === "lb" ? 5 / LB_PER_KG : 2.5);
