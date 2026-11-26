// Feedback during a workout: sound, vibration and keeping the screen awake.
// Each one is optional and fails quietly: the screen always shows the same thing.

// ------------------------------------------------------------------ sound
// Short synthesized tones (no audio files to download). The AudioContext is created
// on the first tap, because browsers only allow sound after a user gesture.
let ctx = null;

export function unlockAudio() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* no audio */ }
}

function tone(freq, start, dur, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** "tick": last 3 seconds of rest. "go": rest over. "done": session finished. */
export function sound(kind, enabled = true) {
  if (!enabled || !ctx || ctx.state !== "running") return;
  try {
    if (kind === "tick") tone(660, 0, 0.09, 0.12);
    else if (kind === "go") { tone(880, 0, 0.14, 0.22); tone(1175, 0.16, 0.22, 0.22); }
    else if (kind === "done") { tone(660, 0, 0.12, 0.16); tone(880, 0.12, 0.12, 0.16); tone(1320, 0.24, 0.3, 0.18); }
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------ vibration
// Settings › Vibration turns every buzz off at once.
let vibrationOn = true;
export const setVibration = (on) => { vibrationOn = on !== false; };
export const vibrate = (pattern = 18) => {
  if (!vibrationOn) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported (iOS) */ }
};

// ------------------------------------------------------------------ screen awake
// The Screen Wake Lock API where it exists. It's dropped whenever the page is hidden,
// so it's asked for again when the page comes back. Without it (older iOS, some
// in-app browsers), a tiny silent muted video plays in a loop, which keeps most
// phones awake. The video needs a tap to start, so it's retried on the next tap.
export class KeepAwake {
  constructor(videoSrc) {
    this.src = videoSrc;
    this.want = false;
    this.lock = null;
    this.video = null;
    this.mode = "off"; // "lock" | "video" | "off"
    this.onVis = () => { if (this.want && document.visibilityState === "visible") this.acquire(); };
    this.onTap = () => { if (this.want && this.mode !== "lock") this.playVideo(); };
    document.addEventListener("visibilitychange", this.onVis);
    document.addEventListener("pointerdown", this.onTap, { capture: true, passive: true });
  }
  on() {
    this.want = true;
    return this.acquire();
  }
  off() {
    this.want = false;
    this.lock?.release?.().catch?.(() => {});
    this.lock = null;
    if (this.video) this.video.pause();
    this.mode = "off";
  }
  async acquire() {
    if (this.lock && !this.lock.released) return this.mode;
    if ("wakeLock" in navigator) {
      try {
        this.lock = await navigator.wakeLock.request("screen");
        this.lock.addEventListener?.("release", () => { this.lock = null; });
        this.mode = "lock";
        if (this.video) this.video.pause();
        return this.mode;
      } catch { /* denied (battery saver, not visible): fall back */ }
    }
    return this.playVideo();
  }
  playVideo() {
    if (!this.video) {
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("aria-hidden", "true");
      v.src = this.src;
      v.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;bottom:0";
      document.body.append(v);
      this.video = v;
    }
    return this.video.play().then(() => (this.mode = "video"), () => (this.mode = "off"));
  }
}
