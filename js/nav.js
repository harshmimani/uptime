// Shared bits for the tab pages (Home, Progress, Plan): the bottom tab bar, escaping,
// and an undo toast. The Workout itself has no tabs (CLAUDE.md, Home page).
//
// Home is index.html (built in its own session; until it lands, index.html is the old app).

export const TABS = [
  { id: "home", label: "Home", href: "index.html", icon: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>' },
  { id: "progress", label: "Progress", href: "progress.html", icon: '<path d="M4 19h16M6.5 15l4-4.5 3 3L19 7.5"/>' },
  { id: "plan", label: "Plan", href: "plan.html", icon: '<path d="M6 5h12M6 12h12M6 19h7"/>' },
];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function tabBar(active) {
  return `<nav class="tabs" aria-label="Main">${TABS.map((t) => `<a class="tabs__tab" href="${t.href}"${t.id === active ? ' aria-current="page"' : ""}>
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg><span>${t.label}</span></a>`).join("")}</nav>`;
}

/**
 * Undo toast in #toast-slot. `onAction` runs when the action is tapped.
 * Returns a function that hides it.
 */
export function showToast(text, action = null, onAction = null, ms = 6000) {
  const slot = document.getElementById("toast-slot");
  if (!slot) return () => {};
  clearTimeout(showToast.t);
  slot.innerHTML = `<div class="toast enter" role="status"><span>${esc(text)}</span>${action ? `<button class="btn btn--text" type="button">${esc(action)}</button>` : ""}</div>`;
  const hide = () => { clearTimeout(showToast.t); slot.innerHTML = ""; };
  slot.querySelector("button")?.addEventListener("click", () => { hide(); onAction?.(); });
  showToast.t = setTimeout(hide, ms);
  return hide;
}

/** Visually hidden live region announcement. */
export function say(text) {
  const live = document.getElementById("live");
  if (!live) return;
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 30);
}

/** "26 Nov" from "2026-11-26". */
export const dayMonth = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
