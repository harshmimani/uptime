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
- Runs 5K, 10K and 21K (every run tracked on Strava) and plays basketball regularly.
- Left Achilles was sore earlier and settled with physio.
- Targets: sub-25 min 5K, 10 strict pull-ups, visibly leaner.
- Schedule is irregular (classes some days, busy others) and will get busier.
- **The #1 risk is quitting, not under-training.**

## Training model: a rotation, not a calendar

- A full cycle = 6 sessions: 4 strength (Upper A, Lower A, Upper B, Lower B), 1 run (the **quality run**), 1 sport-or-conditioning session, plus at least 1 rest day. In normal weeks the sport/conditioning slot **defaults to a long easy run** (other easy cardio fills it when a long run doesn't fit). **Basketball replaces the quality run that rotation, never the long run** (coach review, approved 27 Nov 2026), at most two rotations in a row (follow-up review, approved 27 Nov 2026). See **Running**.
- Strength sessions follow a fixed order **UA → LA → UB → LB → repeat**. Missing a day never skips a session; the app shows the next one in line. Nothing is "missed", only "not done yet". The one exception is a 21K race build's last 12 weeks (see **Running**), which runs UA → the build Lower (its split squat and deadlift versions take turns) → UB.
- Run and sport/conditioning float: done any day they fit, and the app suggests good slots. What the run slot holds is under **Running**.
- Progress is counted over a **rolling 7 days**, not Mon–Sun. Weekdays are never hard-coded. Optionally the user can mark usually-busy weekdays; the app uses them only for gentle suggestions.
- Spacing rules (suggestions, never blocking):
  - Avoid a Lower session the day after sport or a hard run if another option exists.
  - No basketball or interval run the day after Lower B or a half build's Lower (Nordics and deadlifts leave the hamstrings sore for 24–48 h): choose Upper or an easy run. Flagged, never blocked (`soreHamstrings` in `js/plan.js`).
  - No Lower session the day before a long run or race (the app doesn't suggest a long run the day after Lower, and flags Lower the day before race day).
  - Consecutive strength days are fine because upper/lower alternate.
  - Avoid 3 hard days in a row.
  - A same-day double is allowed only as run/sport + Upper, never two lifting sessions.
- **No catch-up:** never stack missed sessions. The rotation just continues.
- Returning after a gap:
  - 7–13 days off → first session at ~90% of last weights.
  - 14+ days off → first week at ~80% with one fewer set per exercise, then resume normally.
- Week levels:
  - **Full** = 4 lifts + the quality run (or a game) + the long run (or other conditioning). Two hard runs, or a run and a game, without the long-run slot make a Good week. In a 21K build, Full = 3 lifts + 3 runs.
  - **Good** = 3 lifts + 1 conditioning.
  - **Minimum** = 2 full-body sessions.
  - Streaks count every week that reaches Minimum, so busy weeks never break the streak.
- **Partial sessions:** a session with at least one logged set that was never finished is saved as a partial session on the next day the app is opened (it keeps its original date). Partial sessions count toward the rolling week, week level and streak, and the rotation moves on past them like any finished session (no catch-up). Choosing "Finish" early also saves a partial session. A session with no logged sets is not saved.
  - **Under half the planned sets** (design review, approved 27 Nov 2026): the sets are kept in history and count for each exercise's progress, but it doesn't count as the session: the rotation stays on it and it doesn't fill a slot of the week, week level or streak (`isStub` in `js/store.js`). The exit sheet and the summary say so plainly.

## Session rules

- Strength sessions ≤50 min including warm-up. Every session has a **Short version ≤30 min** (first 3 exercises, fewer sets; a superset pair counts as one exercise).
- Time caps are checked with the coach's method: about 4.5 s per rep (6 s for 3 s up / 3 s down; a negative's slow lower adds to it), rest as written after every set or superset round, 45 s per station, warm-up and ramp sets included (1 under 20 kg, 2 under 50 kg, else 3), mid-range reps. `tests/timecheck.test.js` does the sums and fails if any session at any ladder level goes over 50 (Short over 30). Last check (27 Nov 2026, after the exercise changes): Upper A 44 (45 at ladder level 3), Upper B 47, Lower A 37 (41 with the optional carry), Lower B 43, the half build's Lowers 40–43; Short versions 22–25; Busy sessions 38–42. Lower days' balance work replaces the arm circles inside the 5-minute warm-up and Lower B's pull-up practice sits in the deadlift ramp-up rests, so neither adds time (the earlier check added them on top: Lower A 48, Lower B 50).
- **Sessions** (exercise changes approved 27 Nov 2026; full detail in `js/plan.js`):
  - **Upper A:** pull-up ladder → dumbbell bench press → Smith inverted row → superset of cross-body hammer curl 2 × 10–15 per arm + overhead cable triceps extension 2 × 10–15 (rest 60 s) → Pallof press 2 × 10 per side. No lat pulldown, rope pushdown or hammer curl (removed 27 Nov 2026).
  - **Lower A:** jump → **Bulgarian split squat, the main leg lift**: 3 × 6–10 per side, rest 2 min, start 12.5 kg per hand, a main lift's double progression (next dumbbell up), never to failure → Smith calf raise + Copenhagen plank → dumbbell Romanian deadlift → optional farmer carry. The Smith squat is gone and no other squat replaces it. Its first session as the main lift starts at least at 12.5 kg per hand, whatever its lighter accessory logs say (`start.atLeastFrom`); after that its own logs lead.
  - **Upper B:** pull-up ladder → standing dumbbell overhead press → **two-arm dumbbell bent-over row** 3 × 8–12 (rest 90 s; replaced the one-arm row) → incline press + hanging knee raise, lateral raise + face pull.
  - **Lower B:** jump → deadlift → Nordic curl + seated calf raise → **dumbbell walking lunges** 2 × 8–12 per side (replaced the lateral lunge) → suitcase carry.
  - Busy mode: Full body 1's main lift is the Bulgarian split squat, Full body 2 rows two dumbbells, Full body 3 does walking lunges (so the split squat isn't in two of three).
- **Lower-day order:** jump → main lift → calf-raise superset (Lower A: heavy slow Smith calf raise + Copenhagen plank; Lower B: Nordic curl + seated calf raise) → the rest. The calf work sits third so the Short version always keeps it. Lower A's farmer carry is optional (only if under about 42 min).
- One-tap check-in before each session: **Good / Okay / Rough**, one row of three equal 64 px buttons with Good the one green primary. Rough suggests the Short version. Never guilt-trip.
- Warm-up: 5 min general + 1–3 ramp-up sets on the first main lift. On lower and full-body days single-leg balance (2 × 30 s per side, eyes closed once easy, for ankle sprains) replaces the arm circles and pull-aparts inside the same 5 minutes (`warmup.lower`). Lower B adds pull-up practice (2 × 2 of the current ladder move) in the rests between the deadlift ramp-up sets, so it adds no time; left out of the Short version. It sits above the first exercise, not as a separate step, so Start → check-in → first set is 2 taps. It starts **folded to one 56 px line** ("Warm-up · 5 min · 4:59 left · Show"), so the exercise is on the first screen even on a 640 px phone (design review, 27 Nov 2026). **Show** opens the checklist with a 48 px **Done** button; once Done is tapped or set 1 is logged it reads "Warm-up done" (plus the ramp-up when it's on this exercise), can be tapped open again, and goes once the first exercise is finished.
- Main lifts 5–8 reps (the Bulgarian split squat 6–10 per side), accessories 8–15, carries/core by time or distance. Most sets end 1–3 reps short of failure; never train main lifts to failure.
- **Dumbbell rep ranges follow the weight** (per hand) for the bench, overhead and incline presses: up to 10 kg 8–15 reps, 12.5–17.5 kg 6–10, 20 kg and up 5–8. Lateral raises 12–20; at the top of the range, one session of 3-second lowers at the same weight before the next dumbbell. Cross-body hammer curls too (7.5 → 10 kg is the same 33% jump), and expect 6–8 reps at first on the new dumbbell (`newWeight`). (`rules.dumbbellBands`, `byLoad`, `slowFirst` in `js/plan.js`.)
- **Double progression:** when all sets hit the top of the range, add the smallest sensible jump (2.5 kg on the deadlift, the next dumbbell up (2.5 kg per hand) on the Bulgarian split squat, 1–2.5 kg upper, next dumbbell up). Stalled 2 sessions in a row → suggest a small reset or rep-range change.
- **Pull-ups:** the ladder in `js/plan.js`. At levels 1–2 Upper B does scap pull-ups 1 × 6–8, then foot-assisted pull-ups 3 × 5–8 with a 3 s lower (feet flat → heels only → feet on a bench). At level 3 ("First rep") Upper B keeps the concentric work: foot-assisted pull-ups with feet on a bench 3 × 5–8 (3 s lower, rest 90 s), then negatives 1 × 3 at 5 s (follow-up review, 27 Nov 2026). Upper A's vertical pull is the ladder alone (the lat pulldown was removed 27 Nov 2026).
- **Deload** every 6–8 weeks, or after 3+ "Rough" check-ins within one rotation: same exercises, about half the sets. **Skip the scheduled deload** if the 42 days before it included a 7+ day gap or two light 7-day blocks (Minimum-level lifting, 2 lifts or fewer, or Busy mode on); its clock restarts from the day it fell due. Rough check-ins always count.
- **6-week check** (with the deload, or when it's skipped): pull-up max test and single-leg heel raises to fatigue on each side, done the same way every time so 10% means something: one rep every 2 seconds, full height off a step, fingertips on a wall, stop when the height drops. A note only, never blocking: if the left is more than 10% behind, do Lower A's calf raise single-leg (its harder swap), 3 × 6–10 slow, left first. Physio clearance before jump block 3 (pogo hops) and before a 21K build.
- Every exercise has an easier swap, a harder swap, and a no-equipment swap. Rows without equipment use the backpack row with a 3 s lower (not the towel door row: it depends on door hardware).
- Every exercise shows the muscles it works (main and secondary) on a front/back muscle map, 3–4 short how-to steps, the main mistake to avoid, a breathing cue where one is set (`breath`; every exercise added or changed from 27 Nov 2026 has one, and so do its swaps), and a **Watch on YouTube** link that is a YouTube *search* for the exercise (so it never goes dead). Content lives in `js/plan.js` under `guide`; the map is drawn by `js/muscles.js`. Plan › Coming up has every session's exercises; Learn has the muscle coverage matrix ("Where the work lands").
- Before starting, the check-in screen lists today's exercises with sets, reps and muscles; tapping one opens its how-to. During rest the timer always shows **Up next** (the next set, and the next exercise after it).
- **Rest is a takeover** (design review, approved 27 Nov 2026): digits 56–80 px (`clamp(56px, 18vw, 80px)`); a green arc while it runs; at zero the card shrinks to one block of about 120 px, labelled **Rest over**: "Go" at 56 px with "Rest over · 0:18 ago" beside it and a single **+15 s** button; Up next, −15 s and Skip rest go, since the header and the dock already show the exercise, set and load (follow-up review, 27 Nov 2026). Below 760 px of height the ring becomes a 6 px full-width bar under the digits. While the rest runs the dock folds to one line ("Set 2 of 3 · 15 kg × 8 · Edit") and Log set (about 120 px), the exercise name moves into the header in place of the session label, and the Undo toast sits at the top, under the header (right under it, 56 px down, below 760 px of height, so it never clips the digits). Edit, or the rest ending, opens the full dock again (so a different rep count stays two taps); while the rest still runs, Edit becomes **Done**, which folds it back. The two skips are labelled **Skip rest** and **Skip set**. In the last 10 s the digits turn green and beat once a second (1 → 1.06); at zero the whole rest card wipes green from "Go" outward (a 400 ms expanding circle: a round element scaled with `transform`, never `clip-path`; a plain fade under Reduce Motion), everything on it in the on-green ink (enjoyment pass, 27 Nov 2026).
- **The exercise name is always on screen:** the Workout header shows it during rest and whenever the big name has scrolled out of view (or sits under the dock). **Previous/Next** (and moving on after an exercise's last set) slide the new exercise in 24 px from its side with a 200 ms fade.
- **Beating last time is rewarded:** a logged set that beats last time's same set gets a bigger burst, a two-note tone and a toast "Beat last time · 15 kg × 9"; it says **"New best · 15 kg × 9"** only when no earlier set of that exercise (history and today) is as good (`rewardFor` in `js/workout/model.js`). Not on Short, deload or lighter days. Every other logged set plays a 60 ms 520 Hz tap (iPhones have no vibration); Settings › Sound turns all sounds off.
- Weights and reps read weight first everywhere: "15 kg × 8".
- Units: stored in kg. Settings can show weights in lb (requested 26 Nov 2026); switching never changes stored logs.

## Running

The user runs 5K, 10K and 21K and **Strava records every run**. Uptime never duplicates Strava: no run stats, charts, splits, timers or PB tracking. One exception (requested 26 Nov 2026): Progress shows a **5K trend** built only from the optional time lines the user types (as 5K-equivalents) and old time trials. Nothing else about runs is charted.

Two runs per rotation (coach review, approved 27 Nov 2026):

- **Quality run** (the Run slot): tempo and intervals take turns. Tempo 20 min at 5K pace + 15 s/km. Intervals start at **4 × 800 m** at 5K pace with 2 min jog, and add one rep every second interval session up to 6. 31–60 days since the last interval session: one rep fewer than last time (never below 4); more than 60 days: back to 4. **Basketball replaces the quality run** that rotation (it's already a hard day); the next quality run is still the one that was due. **At most two rotations in a row** (follow-up review, approved 27 Nov 2026: the user plays regularly): on the third the quality run is the tempo run, and a game that rotation fills no slot; play as well, and that rotation's Lower B (or the half build's Lower) is the Short version (`gameStandInMax` in `js/plan.js`, `gamesInRow` in `js/engine.js`).
- **Long easy run** (the sport/conditioning slot's default) at 5K pace + 75–100 s/km. Starts at 8 km and never goes more than **10% beyond the longest run of the last 30 days**, rounded down to the half km and at most 1 km at a time (8 → 8.5 → 9 → 9.5 → 10 → 11…). Last long run 15–30 days ago: repeat it. No long run in 30 days: 2 km lower (never below 8). **No run of any kind in 30 days** (a full running break; games don't count as runs): the slot is a 30–40 min easy run first, then the long run starts again at 8 km. **Normal weeks cap it at 10–12 km, about 70 min**: as many whole km as fit in 70 min at the faster end of easy pace, kept within 10–12. Only race mode goes beyond. A game never replaces it.
- Long runs go past the 50-minute cap; that's accepted and said plainly (18 km in a half build is about 2 h 05 to 2 h 15 at easy pace).
- Targets are one line, with paces from the user's latest time (5K-equivalent via Riegel's formula; the plan baseline until then). Riegel's 21K pace assumes big mileage, so it's shown as a ceiling, not a target: half-build sessions show "Riegel 21K pace to 15 s/km slower" (a rule of thumb, `paces.halfSlack`).
- Run day in the app: what today's run is, its one-line target, one tap **Done** (saves straight away, with Undo; a long run saves its km). An optional single text line for a time (e.g. "10k 52:30", "half 1:55:00") is used **only** to update the target paces.
- **Race mode (optional):** the user sets a race distance (5K, 10K or 21K) and date.
  - The last 8 (5K), 10 (10K) or 16 (21K) weeks lean toward the distance: quality runs at race pace (10K: 5 × 1 km, 2 × 12 min; 21K: 3 × 2 km, 30 min at half pace) and the long run builds in 1 km steps (still within the 10% rule) to about 15 km (10K) or **18 km (21K)**. A 21K's build starts 16 weeks out so four missed or repeated weeks still reach 18 km (10 → 18 km takes nine 1 km steps). A 5K keeps the normal cap.
  - **21K build (last 12 weeks only): three lifts and three runs** — Upper A, the **build Lower**, Upper B, plus the quality run, the long run and an easy 30–40 min run. The build Lower comes every rotation so Nordics and heavy slow calf raises never drop to every other rotation while running load peaks (follow-up review, approved 27 Nov 2026). Its main lift takes turns (`LS` "Lower · split squat" and `LD` "Lower · deadlift" in `js/plan.js`): jump; Bulgarian split squat 3 × 6–10 per side (rest 120 s) or deadlift 3 × 5–6 (rest 150 s); Smith calf raise 3 × 6–10 slow + Copenhagen plank 2 × 15–20 s per side (rest 60 s); Nordic curl 2 × 3–5 + seated calf raise 2 × 10–15 (rest 75 s); then dumbbell Romanian deadlift 2 × 8–12 (rest 90 s) on split-squat turns or dumbbell walking lunges 2 × 8–12 per side (rest 75 s) on deadlift turns (as in Lower A and Lower B). One strength session a week maintains strength and power, so this holds for 12 weeks. If the user won't run three times a week for those 12 weeks, race a 10K instead.
  - Taper: the last 7 (5K), 10 (10K) or 14 (21K) days, with shorter runs and a long run at about 60% of the longest; lifts suggest the Short version. The last 6 days are easy shakeouts only (no long run). Race day shows the race.
  - After race day the cycle returns to normal by itself (the long run drops back to the normal cap).
- Busy mode: one tempo run a week; the cycle waits.
- Numbers live in `js/plan.js` under `run`; the long-run and interval rules are in `js/engine.js` (`longRunKm`, `intervalReps`).

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
- Sheets (how-to, swap, skip, all exercises, session details) have a 36 × 4 px grab handle, swipe down to close, and a 48 px close button that stays top right however far the sheet scrolls (`js/sheet.js`). Scrim tap, Escape and the back gesture close them too.
- Logging a set: one tap on the prefilled Log button. A different rep count is two taps (tap the number, then Log); tapping a number never logs on its own, because a wrong log is worse than an extra tap.
- Unplanned activities (sport, easy run, conditioning) save the moment they're tapped, with sensible defaults (today, typical duration), then show an **Edit** link and **Undo**. No Save button.
- **Ways out, on every Workout screen:** a back/Exit button at the top left. Exit offers **Pause, keep it open** first (back to Home, which offers Resume; nothing saved or lost), then **Save and finish** (saved as a partial session, with Resume to undo; under half the sets it doesn't count as the session, see Partial sessions) and **Discard** (nothing saved, with Undo on Home). The phone's back gesture and browser back always work: an open sheet closes first; otherwise back goes Home, which offers Resume, and the workout is never lost. Leaving goes *back* to Home when Home opened the Workout, so history stays one clean step.
- **Skip and fix mid-session:** Skip opens "Skip this set" or "Skip the rest of <exercise>"; skipped sets are not logged and never count against progress. Each logged set has Remove. Previous/Next move between exercises without dropping anything; a finished exercise can be reopened to remove a set or add one. All of these have Undo.
- Survive interruptions: rest timer based on end timestamps (accurate after screen lock, app switch, calls); in-progress workout saved after every set and restored on reopen. Within 90 minutes of the last activity (a logged set, any tap, or the start if nothing is logged), reopening goes straight back to the same set. After more than 90 minutes it asks **Pick up** or **Finish** (with nothing logged: **Pick up** or **Leave without saving**); both keep every logged set. This is checked on open, on returning to the app and every few seconds while it's open, so a tab left open overnight asks too.
- The Workout header clock is session time counted **only while the app is open and in front**; it stops at the last activity when the 90-minute prompt appears, so it never shows hours of idle time.
- Design every state: first-run onboarding (≤3 steps), empty, in-progress, completed, offline, error.
- WCAG 2.2 AA contrast, visible focus states, screen-reader labels, respects `prefers-reduced-motion`.
- Copy: short, direct, encouraging, never preachy.

## Home page & first impression

- The app has a **Home** page and a **Workout** section. Home is the showpiece: anyone who sees it should immediately feel this is a premium, thoughtfully crafted product, not a template.
- Navigation: three tabs, **Home**, **Progress** and **Plan**: a solid bottom bar on phones and tablets (no blur, so nothing shows through), a top bar with the brand at 1024 px and up. Plan's section strip fits all five on a 360 px phone, and the selected one scrolls into view. Plan opens on **Coming up** (the Week section was removed in the follow-up review, 27 Nov 2026: it showed the same six cards; its explainer now sits at the top of Coming up and old `#week` links land there), then Modes, Fuel, Learn and Settings. **Coming up** (`plan.html#next`, linked from Home under This week) is the presentable "what I'm doing next" view: one cycle from the next session, lifts in rotation order with the quality run and long run placed before an upper session (`E.upcoming`), each opening in place to its exercises, sets × reps, a combined muscle map and videos. Only the first three carry a label (Next, Then, After that; the number gives the order after that). Each card has two sub-lines by design (focus, then "7 exercises · about 50 min"). The first card ends with a 48 px **Start <session>** button. In exercise lists, Video is a 48 × 48 icon-only button labelled "Video: <exercise>" for screen readers. Progress starts with **Last 7 days** (sessions, exercises, sets and a combined muscle map; on a laptop the numbers and words on the left, the map on the right) and **Past sessions** (each opens its exercises, sets and weights). The Workout is not a tab: it is a full-screen mode entered with Start and left from the summary, with the tabs hidden while it runs.
- Home is the hub (approved 27 Nov 2026). Content, in priority order:
  1. Today's "Next up" session with one large green Start button. The card ends with its buttons (no empty band), so on a phone 800 px or taller the first row of This week shows whole above the tab bar and Start sits in the lower half (design review, 27 Nov 2026; before, the card filled the first screen). The dial has one ring (the rotation; the week is right below it), a 64 px session name at 70% width, 13 px bold labels (drawn larger on phones 700 px tall or less, where the dial is 200 px, so they still render at 13 px), and a subtitle at most 200 px wide. Under 760 px of height the dial is 240 px wide and "Log something else" moves below This week, so the first row of This week clears the tab bar.
  2. **This week**: the six slots (Upper A, Lower A, Upper B, Lower B, Run, Long run; Busy mode shows its full-body sessions and the run; a 21K build shows its three lifts and three runs) over the rolling 7 days, each done (with the day), next, or not yet. Tapping a slot opens its exercises with muscle maps, how-to and YouTube links.
  3. Rolling-week progress and streak.
  4. One standout stat (e.g. pull-up max, total kg lifted), shown only once there is a real number. Never a run stat: Strava has those.
  5. The most recent past sessions, each opening its sets and weights, with "See all" to Progress.
  - Plus, only when relevant: the Busy mode banner or suggestion (see Modes), and a quiet "Log something else" link under Next up.
  - After a data migration, "Your data moved to the new format. A backup copy is kept." shows **once** (`store.takeMigrationNotice`, remembered in `uptime-notice-migrated`), in the flow right under This week with a 48 px close button: never a toast over This week or the tab bar, and never pushing Start or This week's first row down.
  - No time-of-day greeting. On desktop Home uses two columns: the session on the left, the week, numbers and history on the right.
- **Signature moment:** tapping Start morphs the Next-up card into the Workout screen (View Transitions API with a graceful fallback). It should feel like one continuous motion, not a page jump. Finishing a whole session is the closing beat: a green circle grows from the button to fill the screen (a round element scaled with `transform`), the summary appears under it as it fades, the check draws and a two-wave burst fires (nothing but the summary under Reduce Motion; never for a partial save).
- The full intro animation plays only on the first open of the day; every other open gets a quick version (about 0.5 s: the session name sets itself, the cards below rise in a stagger) while the Next-up card and Start stay still (changed 27 Nov 2026).
- **Living background** (27 Nov 2026): a slow green WebGL flow behind the Next-up card on every device (`js/field.js`), drawn at a fifth of the card's size, at most 30 fps, loaded with a dynamic import after the page is idle, paused when hidden or off screen, one still frame under Reduce Motion, nothing without WebGL. A touch (or the mouse) on the card pulls a soft green light that follows the thumb and fades when it lifts (not under Reduce Motion).
- Every button has a tactile press (quick squeeze, springy release; primary buttons glow from the finger). A logged set gives a small green burst from the Log button; a finished session a big one on the summary. Tabs slide in the direction they sit (Home → Progress → Plan), and Progress and Plan cards rise in a short stagger on open and on a new Plan section (`staggerIn` in `js/motion.js`). All of it is transform/opacity and calm under Reduce Motion. If a workout is in progress, the app opens straight to it and skips Home.
- Showpiece effects may never delay the Start button: it must be tappable within 1 second of opening on a mid-range phone.
- Taste rules: restraint over gimmicks; one hero idea per screen; no autoplay sound; no stock fitness photos; no emoji as icons.

## Visual direction

- Near-black dark base (not pure black) and a light theme, **BCG green as the brand colour** (**#29BA74** bright, **#197A56** deep), neutral greys, one warning colour.
- **Themes: Light, Dark and System** (requested 26 Nov 2026, replacing the earlier dark-only decision). Settings › Theme; the default is **System**, which follows the phone. The choice is stored per device in `uptime-theme` and applied in each page's `<head>` before the first paint. Light meets the same AA contrast rules as dark; in light, green text and fills use the deep green because the bright one is too pale on white. In light the toast is inverse (dark fill, light text) so it never disappears on a white card, and stepper keys have a 1 px edge.
- **Green is the brand** (approved 27 Nov 2026; this reverses the 26 Nov "green only for progress / neutral primary buttons" decision): Start, Log set and the other primary buttons are green, the Rotation Dial's progress is green, and the active tab, selected chips, switches and highlights use it. Dark uses the bright green with near-black text on it; light uses the deep green with white text. A logged set turns the button the deeper green with a check. Text and surfaces stay neutral so the green stays the one loud thing on a screen.
- Muscle maps: the earlier app's idea, a front and a back figure with the worked muscles coloured, redrawn 27 Nov 2026 as anatomical shapes (pecs, delts, lats, glutes, two calf heads) in one small SVG. Main muscles in green, helper muscles in a grey-green, the rest neutral. Labelled front/back and capped at 220 px tall on every exercise's how-to (so step 1 shows); 64 px wide in lists, where it's a plain silhouette with only the worked muscles lit.
- Tokens live in `css/tokens.css` (dark in `:root`, light written twice: `[data-theme="light"]` and the System media query; a test keeps the copies identical), components in `css/components.css`; the style preview is `docs/style/index.html`. Every colour pair is checked for AA in both themes by `tests/contrast.test.js` (and `npm run check:style` in a browser).
- Motion inspired by Active Theory: fluid, physical, purposeful. Every animation communicates state (set done, timer running, rotation advancing).
- Mobile wow comes from craft: kinetic typography, a subtle animated green gradient or grain, numbers that count up, depth through layering and blur, using CSS `transform`/`opacity` only.
- Desktop may additionally get one lazy-loaded ambient effect (canvas/WebGL) that never downloads on phones. The Home field (above) is the one effect phones get.
- System font stack or one self-hosted subset variable font. Tabular numerals for weights and timers.

## Engineering

- Lightest stack that works (per the audit, `docs/AUDIT.md`). No heavy frameworks or 3D libraries in the mobile bundle.
- Budget: first load <1.5 s on a mid-range Android over 4G; JS <150 KB gzipped; Lighthouse mobile ≥90 performance, ≥95 accessibility.
- Offline-first service worker; installable to the home screen; deployed on GitHub Pages under `/uptime/`.
  - Each release is one complete versioned cache (`sw.js`). A new version waits and is offered with a small "New version, tap to refresh" prompt (`js/sw-client.js`), never while a workout is running.
  - `.githooks/pre-commit` stamps `VERSION` in `sw.js` from the app files, so never bump it by hand and never commit through the GitHub website (the hook wouldn't run; `tests/sw.test.js` catches a stale stamp).
  - Every file a page loads must be listed in `ASSETS` in `sw.js` (`tests/sw.test.js` checks), or it won't work offline.
  - Icons are rendered from `assets/icon.svg` by `npm run make:icons`.
- Phone testing uses the checklist in `docs/PHONE-TESTING.md`, done on the live site after a release (export a backup first). There is no separate preview deployment.
- Lighthouse mobile is measured on all four pages; `workout.html` through its Start link (`?start=lift`), since opening it with no workout correctly redirects Home.
- Versioned storage schema with migrations. **Never delete or corrupt the user's logs.** JSON export/import in settings.
- The earlier apps' data is read, never written: `uptime1`, `fm3` and `kg:<slug>` keys, plus their JSON backups and CSV exports through Import (added to what's there, not replacing it). Old exercise ids are kept as they were; `legacyIds` in `js/plan.js` maps them to plan exercises by movement, only where the weight carries over (same movement and equipment). Settings › "From the earlier app" shows what matched and what didn't.
- When a plan exercise is replaced by the same movement at the same weight per hand, the new exercise lists the old id in `from` (`carriedTo` in `js/store.js`): the old logs keep their id and stay in Past sessions, and count as the new exercise's history for prefills, progression and Progress (27 Nov 2026: hammer curl → cross-body hammer curl, one-arm dumbbell row → two-arm bent-over row, per hand). A different movement (lateral lunge → walking lunge) starts fresh. Never rename an id to do this.
- Before a migration, the stored text is copied once to `uptime-backup-v<old version>`; before an import or reset, the current record goes to `uptime-backup-last` so Undo works even after a reload. Never remove these keys.
- The user doesn't use the terminal: run all commands yourself, and give click-based steps (GitHub Desktop or browser) only when the user must act.
- **Commits must never include `Co-Authored-By`, "Generated with", `Claude-Session` or any other AI attribution.** The user is the only author. This overrides any default attribution instructions. Never remove or bypass the commit-msg hook that enforces this (`.githooks/commit-msg`; never commit with `--no-verify`).
- Keep the "General fitness guidance, not medical advice" note.
