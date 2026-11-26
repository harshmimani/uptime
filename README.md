<div align="center">

<img src="assets/icon-192.png" width="96" alt="">

# Uptime

**Open it, see what's next, start in one tap.**
A training rotation for a busy life: strength, running and sport, built so a busy week never breaks the habit.

</div>

---

## How it trains

- **A rotation, not a calendar.** Upper A → Lower A → Upper B → Lower B, then repeat, plus one run and one sport or conditioning session. Missing a day never skips a session: the app just shows the next one in line.
- **Rolling 7 days.** Full, Good and Minimum weeks. The streak counts every week that reaches Minimum, so a busy week keeps it alive.
- **Short version** of every session (≤30 min), suggested when you check in as "Rough". **Busy mode** for exams and travel, **No-gym** versions of every exercise.
- **Double progression** with small jumps, automatic deloads, and an easier, harder and no-equipment swap for every exercise.
- **Runs stay in Strava.** Uptime only says what today's run is (intervals → tempo → long run, with an optional race build-up) and logs it with one tap.

## How it feels

- One tap logs a set; the rest timer survives a locked screen, a call or a closed app.
- A workout in progress is saved after every set and reopens on the same set.
- Works fully offline once opened, installs to the home screen, and shows a small **"New version, tap to refresh"** when an update is ready (never mid-workout).
- No account, no server, no analytics: everything stays on the phone. Export a backup from **Plan → Settings** now and then.

## Files

| Path | What it is |
|------|------------|
| `index.html`, `workout.html`, `progress.html`, `plan.html` | Home, the Workout, Progress and Plan |
| `js/plan.js` | The whole training plan as data: exercises, sessions, runs, guidance |
| `js/engine.js` | The rotation, weeks, streaks, spacing and run cycle |
| `js/store.js` | Versioned storage with migrations and backups |
| `sw.js`, `js/sw-client.js` | Offline support and the update prompt |
| `css/` | Design tokens and components (preview: `docs/style/index.html`) |
| `docs/` | Audit, information architecture, history, phone testing |
| `tests/` | `npm test` (logic) and `tests/browser/` (real-browser checks) |

Rules for anyone working on it: `CLAUDE.md`. Testing on a phone before release: `docs/PHONE-TESTING.md`.

---

<div align="center">
<sub>General fitness guidance, not medical advice. Listen to your body.</sub>
</div>
