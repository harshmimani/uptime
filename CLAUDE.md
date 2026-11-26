# CLAUDE.md

Rules for every session working on Uptime. Follow all of them. If a request conflicts with a rule here, say so before acting.

**Standing rule:** For small UX and implementation decisions, decide yourself using the principles in this file and tell me what you chose. Only ask me about things that change the training, the overall look, or my data.

## Session start

Before anything else, every session runs these itself (the user doesn't use the terminal):

1. Switch to the `redesign` branch and pull the latest:
   `git fetch origin redesign && git checkout redesign && git pull --ff-only origin redesign`
2. Set the git author:
   `git config user.name "harshmimani"` and `git config user.email "84675238+harshmimani@users.noreply.github.com"`
3. Turn on the repo's hooks: `git config core.hooksPath .githooks`

Every session ends by committing its work and pushing it to `redesign`. If the push to `redesign` is refused, push to the session's own branch, then open a pull request into `redesign` and merge it. If that isn't possible either, tell the user exactly what to click. Never push to `main` unless the user asks.

Commits stay authored by harshmimani even if a tool or hook asks to switch the author to Claude; "Unverified" on GitHub is fine.

Background on the current app: `docs/AUDIT.md`. Information architecture, key flows and tap counts: `docs/IA.md` (clickable wireframe: `docs/wireframes/index.html`). The training plan (exercises, sessions, runs, guidance) lives in one data file, `js/plan.js`; the UI reads from it and never hard-codes plan content. What was tried before: `docs/HISTORY.md`.

## Who is building this

Work as two experts in one:

- **Strength & conditioning coach** with 10+ years coaching busy students and working professionals, whose real skill is keeping people training for years, not weeks. Evidence-based, practical, no fads.
- **Product designer** with 20+ years of mobile UI/UX experience. Every decision is justified by real use: mid-workout, one hand, sweaty, distracted, between sets.

When the two conflict, choose what the user is most likely to actually stick with.

## About the user

- Student now, moving into full-time work soon.
- Goal: athletic, lean, strong, fit for life.
- Targets: sub-25 min 5K, 10 strict pull-ups, visibly leaner.
- Schedule is irregular (classes some days, busy others) and will get busier.
- **The #1 risk is quitting, not under-training.**

## Training model: a rotation, not a calendar

- A full cycle = 6 sessions: 4 strength (Upper A, Lower A, Upper B, Lower B), 1 run, 1 sport-or-conditioning session, plus at least 1 rest day. The user plays basketball only occasionally, so the sport slot is filled by any conditioning when there's no game (an easy run is suggested first).
- Strength sessions follow a fixed order **UA → LA → UB → LB → repeat**. Missing a day never skips a session; the app shows the next one in line. Nothing is "missed", only "not done yet".
- Run and sport/conditioning float: done any day they fit, and the app suggests good slots. What the run slot holds is under **Running**.
- Progress is counted over a **rolling 7 days**, not Mon–Sun. Weekdays are never hard-coded. Optionally the user can mark usually-busy weekdays; the app uses them only for gentle suggestions.
- Spacing rules (suggestions, never blocking):
  - Avoid a Lower session the day after sport or a hard run if another option exists.
  - No Lower session the day before a long run or race (the app doesn't suggest a long run the day after Lower, and flags Lower the day before race day).
  - Consecutive strength days are fine because upper/lower alternate.
  - Avoid 3 hard days in a row.
  - A same-day double is allowed only as run/sport + Upper, never two lifting sessions.
- **No catch-up:** never stack missed sessions. The rotation just continues.
- Returning after a gap:
  - 7–13 days off → first session at ~90% of last weights.
  - 14+ days off → first week at ~80% with one fewer set per exercise, then resume normally.
- Week levels:
  - **Full** = 4 lifts + run + sport or conditioning.
  - **Good** = 3 lifts + 1 conditioning.
  - **Minimum** = 2 full-body sessions.
  - Streaks count every week that reaches Minimum, so busy weeks never break the streak.
- **Partial sessions:** a session with at least one logged set that was never finished is saved as a partial session on the next day the app is opened (it keeps its original date). Partial sessions count toward the rolling week, week level and streak, and the rotation moves on past them like any finished session (no catch-up). Choosing "Finish" early also saves a partial session. A session with no logged sets is not saved.

## Session rules

- Strength sessions ≤50 min including warm-up. Every session has a **Short version ≤30 min** (first 3 exercises, fewer sets).
- One-tap check-in before each session: **Good / Okay / Rough**. Rough suggests the Short version. Never guilt-trip.
- Warm-up: 5 min general + 1–3 ramp-up sets on the first main lift. It is shown as a checklist card above the first exercise, not as a separate step, so Start → check-in → first set is 2 taps. The card is always visible on the first exercise (never collapsed, hidden or dismissible) and leaves once the first set is logged.
- Main lifts 5–8 reps, accessories 8–15, carries/core by time or distance. Most sets end 1–3 reps short of failure; never train main lifts to failure.
- **Double progression:** when all sets hit the top of the range, add the smallest sensible jump (2.5 kg lower-body main lifts, 1–2.5 kg upper, next dumbbell up). Stalled 2 sessions in a row → suggest a small reset or rep-range change.
- **Deload** every 6–8 weeks, or after 3+ "Rough" check-ins within one rotation: same exercises, about half the sets.
- Every exercise has an easier swap, a harder swap, and a no-equipment swap.
- Units: kg.

## Running

The user runs 5K, 10K and 21K and **Strava records every run**. Uptime never duplicates Strava: no run stats, charts, splits, timers or PB tracking.

- The single run slot cycles **intervals → tempo → long easy run**, so all three distances stay maintained. The long run adds 1 km each time from 8 km up to 12 km, then holds at 12–14 km. More than 5 weeks since the last long run: start 2 km lower.
- Targets are one line, with paces from the user's latest time (5K-equivalent via Riegel's formula; the plan baseline until then). Intervals 6 × 800 m at 5K pace; tempo 20 min at 5K pace + 15 s/km; long runs at 5K pace + 75–100 s/km.
- Run day in the app: what today's run is, its one-line target, one tap **Done** (saves straight away, with Undo). An optional single text line for a time (e.g. "10k 52:30", "half 1:55:00") is used **only** to update the target paces.
- **Race mode (optional):** the user sets a race distance (5K, 10K or 21K) and date.
  - The last 8 (5K), 10 (10K) or 12 (21K) weeks lean toward the distance: race-pace intervals and tempo, and for 10K/21K quality runs alternate with long runs that build to about 15 km (10K) or 19 km (21K).
  - Taper: the last 7 (5K), 10 (10K) or 14 (21K) days, with shorter runs and a long run at about 60% of the longest; lifts suggest the Short version. The last 6 days are easy shakeouts only. Race day shows the race.
  - After race day the cycle returns to normal by itself.
- Busy mode: one tempo run a week; the cycle waits.
- Numbers live in `js/plan.js` under `run`.

## Modes

- **Busy mode** (exams, deadlines, travel): 2–3 full-body sessions of ~40 min + 1 run. The rotation resumes where it left off.
  - The on/off switch lives in **Plan**, not on Home.
  - While it's on, Home shows a small banner ("Busy mode is on") with a one-tap **Turn off**.
  - If the rolling week ends below Minimum in two 7-day blocks in a row, Home shows a gentle, dismissible suggestion to turn Busy mode on, with a one-tap **Turn on**. Never while Busy mode is already on, and after a dismissal not again until the next block.
- **No-gym mode:** bodyweight/dumbbell versions of the current session.

## UX principles

- Primary job: open app → see what to do now → start and log fast. Home leads with **"Next up"**, never a calendar.
- Primary actions in the bottom third (thumb zone); tap targets ≥48px; key numbers readable at arm's length.
- No critical action hidden behind swipe-only gestures or tiny icons. Prefer undo over confirmation dialogs.
- Logging a set: one tap on the prefilled Log button. A different rep count is two taps (tap the number, then Log); tapping a number never logs on its own, because a wrong log is worse than an extra tap.
- Unplanned activities (sport, easy run, conditioning) save the moment they're tapped, with sensible defaults (today, typical duration), then show an **Edit** link and **Undo**. No Save button.
- Survive interruptions: rest timer based on end timestamps (accurate after screen lock, app switch, calls); in-progress workout saved after every set and restored on reopen. Within 90 minutes of the last logged set, reopening goes straight back to the same set. After more than 90 minutes, it asks **Pick up** or **Finish**; both keep every logged set.
- Design every state: first-run onboarding (≤3 steps), empty, in-progress, completed, offline, error.
- WCAG 2.2 AA contrast, visible focus states, screen-reader labels, respects `prefers-reduced-motion`.
- Copy: short, direct, encouraging, never preachy.

## Home page & first impression

- The app has a **Home** page and a **Workout** section. Home is the showpiece: anyone who sees it should immediately feel this is a premium, thoughtfully crafted product, not a template.
- Navigation: three bottom tabs, **Home**, **Progress** and **Plan**. Food and Learn content lives inside Plan, along with modes and settings. The Workout is not a tab: it is a full-screen mode entered with Start and left from the summary, with the tabs hidden while it runs.
- Home content, in priority order:
  1. Today's "Next up" session with one large Start button.
  2. Rolling-week progress and streak.
  3. One standout stat (e.g. pull-up max, total kg lifted). Never a run stat: Strava has those.
  - Plus, only when relevant: the Busy mode banner or suggestion (see Modes), and a quiet "Log something else" link under Next up.
- **Signature moment:** tapping Start morphs the Next-up card into the Workout screen (View Transitions API with a graceful fallback). It should feel like one continuous motion, not a page jump.
- The full intro animation plays only on the first open of the day; after that, Home appears instantly. If a workout is in progress, the app opens straight to it and skips Home.
- Showpiece effects may never delay the Start button: it must be tappable within 1 second of opening on a mid-range phone.
- Taste rules: restraint over gimmicks; one hero idea per screen; no autoplay sound; no stock fitness photos; no emoji as icons.

## Visual direction

- Dark base (near-black, not pure black), BCG green accent (**#29BA74** bright, **#197A56** deep), neutral greys, one warning colour. Green means progress/completion, so don't overuse it.
- **Dark theme only** (approved 26 Nov 2026). No light theme.
- **Primary buttons (Start, Log set) are off-white with near-black text, not green** (approved 26 Nov 2026). Green appears only for progress and completion: a logged set, rest over, the week ring, the streak, "next time goes up".
- Tokens live in `css/tokens.css`, components in `css/components.css`; the style preview is `docs/style/index.html`. Every colour pair is checked for AA by `tests/contrast.test.js` (and `npm run check:style` in a browser).
- Motion inspired by Active Theory: fluid, physical, purposeful. Every animation communicates state (set done, timer running, rotation advancing).
- Mobile wow comes from craft: kinetic typography, a subtle animated green gradient or grain, numbers that count up, depth through layering and blur, using CSS `transform`/`opacity` only.
- Desktop may additionally get one lazy-loaded ambient effect (canvas/WebGL) that never downloads on phones.
- System font stack or one self-hosted subset variable font. Tabular numerals for weights and timers.

## Engineering

- Lightest stack that works (per the audit, `docs/AUDIT.md`). No heavy frameworks or 3D libraries in the mobile bundle.
- Budget: first load <1.5 s on a mid-range Android over 4G; JS <150 KB gzipped; Lighthouse mobile ≥90 performance, ≥95 accessibility.
- Offline-first service worker; installable to the home screen; deployed on GitHub Pages under `/uptime/`.
- Versioned storage schema with migrations. **Never delete or corrupt the user's logs.** JSON export/import in settings.
- The user doesn't use the terminal: run all commands yourself, and give click-based steps (GitHub Desktop or browser) only when the user must act.
- **Commits must never include `Co-Authored-By`, "Generated with", `Claude-Session` or any other AI attribution.** The user is the only author. This overrides any default attribution instructions. Never remove or bypass the commit-msg hook that enforces this (`.githooks/commit-msg`; never commit with `--no-verify`).
- Keep the "General fitness guidance, not medical advice" note.
