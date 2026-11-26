// Service worker registration and the "New version, tap to refresh" prompt, shared by every
// page. How updates work is described at the top of sw.js.
//
// - The prompt is a small pill at the top of the screen, away from the thumb-zone actions.
// - It never appears while `quiet()` is true (the Workout passes "a workout is running"):
//   it waits and shows once the session is over. Reloading mid-workout would be safe (every
//   set is saved), but an interruption between sets isn't.
// - The page reloads only after a tap, never on its own.

export function startServiceWorker(opts = {}) {
  // after the page has loaded and gone idle: registering must never slow the first paint
  const go = () => (window.requestIdleCallback || ((cb) => setTimeout(cb, 300)))(() => start(opts));
  if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
}

function start({ quiet = () => false }) {
  if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
  const sw = navigator.serviceWorker;
  let tapped = false;
  sw.addEventListener("controllerchange", () => {
    if (tapped) location.reload();
    else document.getElementById("update")?.remove(); // took over on its own (see sw.js install)
  });

  sw.register(new URL("../sw.js", import.meta.url).href, { updateViaCache: "none" }).then((reg) => {
    let timer = 0;
    const offer = () => {
      clearTimeout(timer);
      if (!reg.waiting || !sw.controller) return; // first install: nothing to replace
      if (quiet()) { timer = setTimeout(offer, 20000); return; }
      // A worker that takes over on its own passes through "waiting" for a moment; only a
      // version still waiting a second later needs the prompt.
      timer = setTimeout(() => {
        const waiting = reg.waiting;
        if (waiting && !quiet()) showPrompt(() => {
          tapped = true;
          (reg.waiting || waiting).postMessage("skip-waiting"); // the newest, if another landed meanwhile
          setTimeout(() => location.reload(), 4000); // never leave the button stuck on "Updating…"
        });
      }, 1000);
    };
    offer();
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => { if (nw.state === "installed") offer(); });
    });
    // An installed app is resumed from the background far more often than it's reopened,
    // and the browser only checks for updates on a fresh open; check on resume too.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().then(offer, () => {});
    });
  }).catch(() => {});
}

function showPrompt(onTap) {
  if (document.getElementById("update")) return;
  const b = document.createElement("button");
  b.id = "update";
  b.type = "button";
  b.className = "update";
  b.innerHTML = '<span class="update__dot" aria-hidden="true"></span>New version, tap to refresh';
  b.addEventListener("click", () => { b.disabled = true; b.textContent = "Updating…"; onTap(); });
  document.body.append(b);
}
