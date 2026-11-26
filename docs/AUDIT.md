# Audit of the current app

A snapshot of the app on `main` as of commit `3318436` (26 Nov 2026), checked against the code, before the redesign described in `CLAUDE.md`.

## Stack

- **One file.** `index.html` (2,528 lines, ~191 KB raw, ~57 KB gzipped) holds all markup, CSS and script. The CSS and markup come to about 18 KB gzipped, the script about 40 KB gzipped.
- **No build, no framework, no dependencies.** Plain ES2017+ inside one `"use strict"` IIFE. HTML is built with string templates and `innerHTML`; clicks go through delegated listeners on `data-*` attributes.
- **Font:** self-hosted Archivo variable font, subset (`assets/archivo.woff2`, 33 KB).
- **Service worker** (`sw.js`): cache `uptime-v1`. Pages are network-first with the cached `index.html` as fallback; other same-origin GETs are cache-first.
- **Manifest:** standalone, portrait, relative `start_url`/`scope` (`./`), so it already works under `/uptime/` on GitHub Pages.
- **Navigation:** four bottom tabs, Train, Progress, Food and Learn. The app opens on Train.
- **Theme:** light and dark, following the system unless toggled. Accents are volt yellow-green, track red, iron blue, court orange and grass green.

## Storage

Everything is in `localStorage`. There's no server, no account and no analytics.

| Key | What it holds |
|---|---|
| `uptime1` | The whole log (the `DB` object below), rewritten in full on every save. |
| `uptime-timer` | The running timer's state, so it survives a reload. Removed when the timer finishes. |
| `fm-theme` | `"light"` or `"dark"` if the user toggled the theme. |
| `fm3` | Legacy log from the Five Mornings version. Read once to migrate into `uptime1`, never written or deleted. |

### `uptime1` shape

```js
{
  v: 1,                       // set on creation, never read
  migrated: "fm3",            // only if fm3 data was carried over
  sets: {                     // key: "YYYY-MM-DD|exerciseId"
    "2026-11-23|smith-squat": [ { t: 1763884800000, kg: 40, r: 8 }, ... ], // strength set
    // other entry shapes under the same map:
    //   interval or tempo rep  { t, sec }
    //   AMRAP or for-time      { t, score, capped? }
    //   EMOM done              { t }
    //   timed run              { t, sec }
    //   5K time trial          "iso|five-k-time-trial": [ { t, sec } ]
  },
  kg:    { exerciseId: "42.5" },    // last weight typed, stored as the input's string
  reps:  { exerciseId: 8 | null },  // last reps typed
  ladder:{ level: 1-5, goal?: "iso", log: [ { d: "iso", level, act } ] },
  play:  { "iso": "basketball" | "football" | "run" | "none" },
  tests: { fivek: [ { d: "iso", sec } ], broad: { "iso": cm } },
  body:  { w: { "iso": kg }, waist: { "iso": cm }, photos: { "iso": true } },
  brk:   { "mondayIso": true },     // break weeks, keyed by that week's Monday
  protein: { "iso": [ { n: "Whey scoop", g: 24 } ] }, // last 14 days only
  bf:    { d: "iso", v: "reg" | "skip" } // today's breakfast toggle
}
```

`t` is a millisecond timestamp. `iso` is a local date, `YYYY-MM-DD`. Exercise ids come from the `EX` library and double as storage keys.

### Export and import

- CSV export of sets, body weight, waist, 5K and broad jump.
- JSON backup: the raw `uptime1` object.
- Restore: accepts any JSON object with a `sets` field, asks for a second tap within 8 s, then replaces everything and reloads. There's no version check and no migration on import.

## What's worth keeping

- Timers built on timestamps (`end`, `start`, `phaseEnd`), saved to `uptime-timer` and restored on reopen. Screen wake lock while timing.
- A save after every set tap.
- Logs keyed by date and exercise id, never by weekday or list position (see `docs/HISTORY.md`).
- The `EX` exercise library: cues, muscle maps, "feel it" and "breathe" notes, demo links.
- The pull-up ladder (`LADDER`), double-progression hints, 5K-based paces.
- Local-only data, the self-hosted subset font, relative paths, and the "general fitness guidance, not medical advice" note.

## Known problems

Measured against `CLAUDE.md`:

1. **It's a calendar, not a rotation.** Every date comes from a fixed `START` (23 Nov 2026). `sessionFor(date)` picks the session by weekday (Mon Strength A, Tue track, Thu Strength B, Sat long run, Fri/Sun play). Weeks are Mon–Sun, and six-week blocks, deloads and tests are tied to calendar weeks. A missed Monday means Strength A is skipped, which is the opposite of "not done yet".
2. **Wrong split.** Two full-body strength days plus a track day and a long run, instead of UA → LA → UB → LB plus one run and one sport.
3. **Missing session features.** No Good/Okay/Rough check-in, no Short version, no return-after-gap reduction, no deload triggered by Rough check-ins, no easier, harder or no-equipment swaps, no no-gym mode. Break mode exists but is a flag on a calendar week, not a one-tap mode that pauses the rotation.
4. **No Home page.** The app opens on the Train tab's day view. There's no "Next up" hero, rolling-week progress, streak or signature transition.
5. **Schema isn't really versioned.** `v: 1` is written but never checked. Defaults are patched inline on every load, and the whole DB is saved on startup even when nothing changed. Restore skips validation and migration. A failed save (storage full, private mode) is swallowed silently, so the user can lose logs without knowing.
6. **Off-brand visuals.** A multi-colour palette (volt, red, blue, orange, green) and a light theme, instead of the near-black base with BCG green. The README uses emoji as markers.
7. **Service worker never refreshes assets.** The cache name is fixed and non-page assets are cache-first, so a changed font, icon or manifest is never fetched again.
8. **One 2,500-line file.** Hard to review, diff and change safely, and every screen's code is parsed on first load. The JS is within budget today (~40 KB gzipped against 150 KB), but there's no room to grow cleanly.
9. **Thin motion accessibility.** One `prefers-reduced-motion` rule. There's no system for state-communicating motion yet.

## Recommendation

**Rebuild in place, build-free, in plain JS.** Same repo, same GitHub Pages URL (`/uptime/`), no framework, no bundler, no npm step.

- Split `index.html` into a small HTML shell, one CSS file and native ES modules (`<script type="module">`): storage, rotation engine, progression, timers, and one module per screen. Browsers load these directly, so there's still nothing to build or install.
- Replace the calendar with the rotation engine from `CLAUDE.md`. It derives "next up", rolling 7-day progress, week level, streak, gap returns and deload prompts from the log itself, never from weekdays or a start date.
- Introduce storage schema v2 under a new key with a step-by-step migration from `uptime1`. Keep `uptime1` untouched as a fallback, version every backup file, run imports through the same migrations, and tell the user when a save fails.
- Keep the exercise ids from `EX` so existing logs stay attached to the right exercises.
- Version the service-worker cache per release and precache the module files, so updates arrive and the app keeps working offline.
- Build Home first: Next up, rolling-week progress and streak, one standout stat, and the Start → Workout transition.
