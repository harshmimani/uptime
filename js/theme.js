// Theme: System (follows the phone), Light or Dark. Settings › Theme.
// The choice lives in its own key so each page can apply it in <head> before the first paint
// (the inline snippet in every HTML file does the same as applyTheme). No key = System.

export const THEME_KEY = "uptime-theme";
const BAR = { dark: "#0B0D0C", light: "#EEF1EF" }; // --c-bg of each theme, for the browser bar

export function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t = getTheme(), doc = document) {
  const root = doc.documentElement;
  if (t === "light" || t === "dark") root.dataset.theme = t;
  else delete root.dataset.theme;
  for (const m of doc.querySelectorAll('meta[name="theme-color"]')) {
    const own = (m.media || "").includes("light") ? "light" : "dark";
    m.content = BAR[t === "system" ? own : t];
  }
}

/** Save and apply. Returns false if storage refused (the theme still applies for now). */
export function setTheme(t) {
  let ok = true;
  try {
    if (t === "light" || t === "dark") localStorage.setItem(THEME_KEY, t);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    ok = false;
  }
  applyTheme(t);
  return ok;
}
