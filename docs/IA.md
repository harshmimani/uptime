# Information architecture and key flows

Status: **approved** (26 Nov 2026), with the decisions listed at the end. No visual design yet. The clickable low-fidelity wireframe is `docs/wireframes/index.html` (open it in any browser).

This is the structure the redesign is built on. It follows `CLAUDE.md`; where the two ever disagree, `CLAUDE.md` wins and this file gets fixed.

## What the app is for

One job: **open the app, see what to do now, start, log fast.** Everything else (history, guidance, settings) is reached on purpose and never sits between the user and the next set.

Two contexts, designed differently:

| Context | Where the user is | What the screen must do |
|---|---|---|
| **Home** | Anywhere: bed, class, bus, gym door. Calm. | Answer "what now?" in one look. One Start button. |
| **Workout** | Gym floor, one hand, sweaty, breathing hard, distracted between sets. | Show one set at a time. One big Log button. Survive anything. |

## Map

```
App opens
├─ First run? ──────────── Onboarding (3 steps) ──► Home
├─ Workout in progress?
│    ├─ last set ≤ 90 min ago ── Workout (same set, timer correct)
│    └─ last set > 90 min ago ── "Pick up or finish?"
├─ Unfinished session from an earlier day? ── saved as partial, then Home
└─ Otherwise ───────────── Home

Bottom tabs (hidden during a workout)
├─ Home        Next up + Start · rolling 7 days + streak · one stat
│              · Busy mode banner (only when on) or suggestion (only when due)
│              · "Log something else"
├─ Progress    Rolling-week history · lifts (trend per exercise) · pull-up ladder
│              · 5K and run paces · body (waist monthly, weight trend) · past sessions
└─ Plan        Modes: Busy mode switch, No-gym · the rotation and where you are in it
               · Food · Learn (Fit not bulky, sleep, steps, Achilles, exercise library)
               · Settings (busy weekdays, export/import JSON, about)

Workout (full screen, no tabs)
  Check-in → first exercise (warm-up card on top) → Set → Rest → … → Summary
  Sheets on top: Swap · All exercises (reorder/jump, Finish now)
```

- **Three tabs.** Train becomes Home; Food and Learn move inside Plan, because they're read a few times, not daily.
- **Workout is not a tab.** It is a mode you enter from Start and leave from Summary. While it runs, the tabs are hidden so nothing can be mis-tapped.

### Where each control lives, and why

| Control | Lives on | Taps from Home | Why there |
|---|---|---|---|
| Start next session | Home, bottom of the Next-up card | 1 | The one thing Home is for. Bottom third = thumb. |
| Check-in (Good / Okay / Rough) | First workout screen | 2 | Must happen before every session, and it changes what follows (Rough → Short). |
| Warm-up | Checklist card above the first exercise | (no tap) | Always visible on the first exercise, never a separate step to tap through. |
| Short version | Chosen by Rough; switchable from the undo line and the All exercises sheet | 2 | Offered when it matters, never as a guilt-laden default. |
| Log a set | Workout, big bottom button | — | The most frequent action in the app. |
| Swap exercise | Workout, secondary row above the Log button | 2 (in session) | Common when a station is taken; one reach away, never in a menu. |
| Busy mode on | Plan → Modes switch (or the Home suggestion when it's due) | 2 | Set a few times a term; Home stays about today. |
| Busy mode off | Home banner **Turn off** (or Plan) | 1 | Getting back to the full rotation should be effortless. |
| No-gym today | Check-in screen link; also in Plan | 1 (in session) | Decided at the gym door, per session. |
| Log something else (sport, run) | Home, under the Next-up card | 2 | Happens a few times a month; visible but quieter than Start. |
| Export / import | Plan → Settings | 3 | Rare and deliberate. |

## Screen states

Every screen is designed in all of these:

- **First run / empty**: Home with no history, Progress with nothing yet ("Your first numbers show up after one session").
- **In progress**: Workout mid-set and mid-rest; Home is skipped on open.
- **Completed**: Summary; Home after today's session ("Next up · tomorrow or later").
- **Partial**: a session saved unfinished. Shown in history as "Upper A · partial · 9 of 17 sets"; counts toward the week like any session.
- **Busy mode on**: Home banner. **Busy mode suggested**: Home suggestion card.
- **Rest day suggested**: Home leads with "Rest day" and still offers the lift under "Or".
- **Offline**: everything works; nothing is said unless a save fails.
- **Error**: a save that fails says so in plain words and keeps the set on screen until it saves.

---

## Flows

Tap counts start from the first screen of the flow. **Flag** = a common action that takes more than 2 taps.

### 1. First-run onboarding (3 steps)

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Welcome + where you train | **At a gym** / **No gym** (two large buttons, bottom) | The answer is the Continue button: one decision, one tap. | 1 |
| 2 | Starting point (pull-ups now, 5K time) | **Continue** (bottom) | Prefilled from the plan's baseline (0 pull-ups, 28:30). Most people just confirm. | 2 |
| 3 | Usually-busy weekdays (optional) | **Done** (bottom), **Skip** beside it | Optional, so Skip is equal weight. Only used for gentle hints. | 3 |
| — | Home, first-run state: Next up Upper A | **Start** | Onboarding ends on the first workout, not a tour. | — |

No account, no goals screen (the goals are in the plan), no starting weights (the first session calibrates them). Old `uptime1` logs are migrated silently and confirmed in one line on step 1: "Found your log from the earlier app. Everything is kept."

### 2. Home → Start → signature transition

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Home | **Start** on the Next-up card | Largest element, bottom half, under the thumb. Progress and stat sit above it because they're glanced at, never tapped. | 1 |
| 2 | Card morphs into the Workout's check-in screen | (motion) | The card's title becomes the workout header; the Start button becomes the check-in buttons. One continuous movement. | — |

The intro animation plays on the first open of the day only. Start is tappable within 1 s regardless.

### 3. Check-in → log a set → rest → next set

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Check-in | **Good / Okay / Rough** (three stacked full-width buttons, bottom) | One tap answers and continues. Rough switches to the Short version with an undo line ("Short version on · Switch to full"), never a dialog. | 1 |
| 2 | First exercise, with the **warm-up card** on top: 5-min checklist, a running 5:00 timer, and the ramp-up sets with real weights | **Log set 1 · 8 × 15 kg** | The warm-up is read, not tapped through, so it costs no tap; it sits first on the screen so it can't be missed. Logging set 1 is the signal that the warm-up is over: the card folds away and rest begins. | 2 |
| 3 | Rest (timer over the same screen) | **Log set 2** (stays live), **+15 s** and **Skip rest** in the timer card | Rest starts by itself. The Log button never moves, so the thumb learns one spot. | — |
| 4 | Rest over → next set | **Log set 2 · 8 × 15 kg** | Same button, same place. | 3 |

Every logged set is saved immediately and shows "Set 1 logged · Undo" for a few seconds.

- Home to the first working set: **2 taps** after Start (check-in, Log set 1), 3 including Start.
- Logging a set as prescribed: **1 tap**.
- Logging a different rep count: **2 taps**. Tap the number to select it, then Log. A number never logs on its own.
- Changing weight and reps: **3–4 taps**. Rare by design (see the tap audit).

The warm-up card stays on the first exercise screen until set 1 is logged. It can't be collapsed or dismissed. If the user swaps or reorders the first exercise, the card moves with them to whatever they do first. On the Short version it stays the same 5 minutes.

Supersets (items sharing a pair letter) alternate automatically: log A1, the screen moves to B1 with no rest, then rest after the round.

Timed sets (carries, planks, hangs): the primary is **Start 40 s**; when it ends, the set logs itself and rest begins. 1 tap.

### 4. Interruption: phone locks mid-rest, then reopen

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Rest, 1:30 left | — | The timer stores an end time, not a countdown. | 0 |
| 2 | Phone locked (calls, other apps, same thing) | — | Nothing runs while locked; nothing needs to. | 0 |
| 3 | Reopen within 90 min of the last logged set: app skips Home, lands on the same set with the correct time left, or "Rest over · 0:40 ago" | **Log set 2** | Exactly where they left, same button in the same place. | 0 |
| 3b | Reopen more than 90 min after the last logged set: "Upper A is still open. 9 of 17 sets logged." | **Pick up where you left off**; **Finish with 9 sets** above it | After 90 minutes they've probably left the gym. Both choices keep every logged set; Finish saves a partial session. | 1 |
| 3c | Never finished, app opened on a later day | (none) | The session is saved as partial under its own date, and Home opens normally with one line: "Saved Tuesday's Upper A as partial (9 of 17 sets)." | 0 |

A web app can't promise a sound or vibration while the screen is locked, so the screen wake lock keeps it on during rest, and the reopen state needs nothing.

Partial sessions count toward the rolling week, week level and streak, and the rotation moves on past them (see `CLAUDE.md`, "Partial sessions").

### 5. Swap an exercise

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Set screen | **Swap** (secondary row above Log) | Station taken is common, so Swap is visible and ≥48 px, but lighter than Log so it isn't hit by accident. | 1 |
| 2 | Swap sheet: Easier / Harder / No equipment, each with its name and one-line cue | Tap an option | Three choices with what each one is; no second screen. | 2 |
| 3 | Set screen with the new exercise; "Swapped for today · Undo" | **Log set** | Today only by default. History stays with each exercise id. | — |

A "Use this every time" switch in the sheet makes it permanent.

### 6. Finish the session and see the summary

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Last set of the last exercise | **Log last set** | Logging the last set finishes the session. No separate Finish tap. | 1 |
| 2 | Summary: time, sets, what progressed, next time's targets, the rolling week, next up | **Done** (bottom) | One button back to Home. The summary is read standing up, so the key line ("Bench: next time 17.5 kg") comes first. | 2 |
| 3 | Home: rotation advances (Next up: Lower A), week progress counts up | — | Motion shows the rotation moving forward. | — |

Finishing early: All exercises → **Finish now** → Summary (marked partial) with **Resume** for a few seconds. Undo, not a confirm dialog.

### 7. Returning after a 10-day gap

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Home: "Welcome back." Next up is still the next session in line (no catch-up). One line explains: "10 days off, so today starts at about 90% of last time. Back to normal next session." | **Start** | Nothing is "missed". The reduction is explained once, briefly, then applied to every prefilled weight. | 1 |
| 2 | Check-in, then the first exercise with the warm-up card; weights already reduced and labelled "About 90% today" | **Log set** | No extra steps for coming back; that is the point. | — |

The streak line reads "New streak starts this week · best 5 weeks", never "Streak lost". At 14+ days, the line is "First week back: about 80% and one set fewer per exercise."

### 8. Busy mode

**Turning it on (Plan)**

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Home | **Plan** tab | Busy mode is a weekly decision, not a daily one, so it lives with the other modes. | 1 |
| 2 | Plan, Modes section at the top: **Busy mode** switch with one line on what it does ("2–3 full-body sessions of about 40 min, plus 1 run. Your rotation waits.") | Tap the switch | Modes sit first in Plan so the switch is the first thing there. | 2 |
| 3 | Line under the switch: "Busy mode on. Upper A waits for when you're back · Undo". Home now leads with Full body 1. | — | Undo, not a confirm. | — |

**Suggested on Home**: if the rolling week ended below Minimum in two 7-day blocks in a row, Home shows a small card above the stat: "Last two weeks were packed. Busy mode keeps things going with 2–3 shorter sessions." with **Turn on** and **Not now**. **Turn on** is 1 tap from Home. Never shown while Busy mode is on; after **Not now**, not again until the next 7-day block.

**Turning it off (Home)**

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Home with a small banner at the top: "Busy mode is on · Turn off" | **Turn off** | Getting back to the full rotation should be effortless and visible. | 1 |
| 2 | Home re-renders: "Back to the rotation. Next up: Upper A · Undo" | **Start** | The rotation resumes exactly where it stopped. | — |

### 9. Logging an unplanned sport session

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Home: **Log something else** under the Next-up card | Tap it | Visible every day without competing with Start. | 1 |
| 2 | Sheet: Today / Yesterday (Today selected) and Basketball, Easy run, Bike or incline walk, Stair session, A run from the plan | Tap **Basketball** | Tapping the activity saves it straight away with defaults (today, 60 min for basketball). No Save button. | 2 |
| 3 | Home: "Basketball logged · 60 min, today · Edit · Undo". The card updates with the spacing rules as a suggestion. | — | Edit fixes duration or date; Undo removes it. | — |

---

## Tap audit

| Common action | Taps | Verdict |
|---|---|---|
| Start next session from Home | 1 | OK |
| Check in | 1 | OK |
| Home → first working set logged | 3 (Start, check-in, Log set 1) | OK: 2 after Start, warm-up costs none |
| Log a set as prescribed | 1 | OK |
| Log a set with different reps | 2 (number, Log) | OK |
| Undo the last set | 1 | OK |
| Start a timed set | 1 | OK |
| Skip or extend rest | 1 | OK |
| Swap an exercise | 2 | OK |
| Do exercises out of order (station taken) | 2 (All exercises → pick) | OK |
| Resume after an interruption (≤ 90 min) | 0 | OK |
| Resume or finish after > 90 min | 1 | OK |
| Busy mode on | 2 (Plan, switch), or 1 from the Home suggestion | OK |
| Busy mode off | 1 (Home banner) | OK |
| Log basketball / easy run | 2 | OK |
| Finish and return Home | 2 (last set, Done) | OK |
| **Log a set with different weight and reps** | **3–4** (kg ±, number, Log) | **Flag, accepted**: rare, because weights are prefilled from progression and return/deload adjustments. Step size is set per exercise (2.5 kg lower-body main lifts, next dumbbell up for dumbbells) so most changes are one ± tap, and a changed weight carries forward to the remaining sets. |
| Log an activity for yesterday | 3 | Uncommon, OK |
| Edit a set logged earlier | 3 (tap row, change, save) | Uncommon, OK (undo covers the last set) |
| Onboarding | 3 | One-time, OK |

## Decisions (26 Nov 2026)

1. **Three tabs**: Home, Progress, Plan. Food and Learn live inside Plan.
2. **Warm-up folded into the first exercise** as an always-visible checklist card. Check-in stays its own tap. Start → check-in → first set = 2 taps after Start.
3. **Changing reps**: tap the number, then Log. A number never logs on its own.
4. **Unplanned activity**: saves straight away with defaults, then Edit and Undo.
5. **Reopening**: more than 90 minutes since the last logged set → "Pick up or finish?". An unfinished session is saved as partial on the next day the app is opened; partial sessions count toward the week.
6. **Busy mode**: switch in Plan; Home banner with one-tap Turn off while it's on; a gentle Home suggestion after two 7-day blocks in a row below Minimum.

### Details decided under the standing rule

- A partial session moves the rotation on, like a finished one. Repeating it would be a catch-up, which `CLAUDE.md` rules out.
- A session with no logged sets (check-in only) is not saved.
- "Finish now" and "Finish with N sets" also save a partial session.
- The partial save keeps the session's own date, so the week it counts toward is the week it happened.
- The Busy mode suggestion is a dismissible card with **Turn on** and **Not now**; after Not now it waits for the next 7-day block.
- The warm-up card moves with the user if the first exercise is swapped or reordered.
