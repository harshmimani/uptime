# Information architecture and key flows

Status: **draft for review** (26 Nov 2026). No visual design yet. The clickable low-fidelity wireframe is `docs/wireframes/index.html` (open it in any browser).

This is the structure the redesign will be built on. It follows `CLAUDE.md`. Where it makes a call `CLAUDE.md` doesn't, the call is marked **Decision** and listed again under "Open questions" at the end.

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
├─ Workout in progress? ── Workout (resumes at the exact set, timer correct)
└─ Otherwise ───────────── Home

Bottom tabs (hidden during a workout)
├─ Home        Next up + Start · rolling 7 days + streak · one stat
│              · Busy mode switch · "Log something else"
├─ Progress    Rolling-week history · lifts (trend per exercise) · pull-up ladder
│              · 5K and run paces · body (waist monthly, weight trend) · past sessions
└─ Plan        The rotation (UA → LA → UB → LB, run, sport) and where you are in it
               · modes (Busy, No-gym) · guidance (Fit not bulky, sleep, steps, Achilles)
               · exercise library · settings (busy weekdays, export/import JSON, about)

Workout (full screen, no tabs)
  Check-in → Warm-up → Exercise → Set → Rest → … → Summary
  Sheets on top: Swap · All exercises (reorder/jump) · Finish early
```

**Decision: three tabs, not four.** The old app had Train, Progress, Food and Learn. Train becomes Home. Food and Learn merge into **Plan**, because the plan's guidance (including food) is read a few times, not daily. Three tabs keep each target wide and the bar quiet.

**Decision: Workout is not a tab.** It is a mode you enter from Start and leave from Summary. While it runs, the tabs are hidden so nothing can be mis-tapped, and reopening the app goes straight back to it (`CLAUDE.md`: skip Home when a workout is in progress).

### Where each control lives, and why

| Control | Lives on | Taps from Home | Why there |
|---|---|---|---|
| Start next session | Home, bottom of the Next-up card | 1 | The one thing Home is for. Bottom third = thumb. |
| Check-in (Good / Okay / Rough) | First workout screen | 2 | Must happen before every session, and it changes what follows (Rough → Short). |
| Short version | Chosen by Rough; switchable from the check-in result and the All exercises sheet | 2 | Offered when it matters, never as a guilt-laden default. |
| Log a set | Workout, big bottom button | — | The most frequent action in the app. |
| Swap exercise | Workout, secondary row above the Log button | 2 (in session) | Common when a station is taken; needs to be one reach away, never in a menu. |
| Busy mode | Home header switch; also in Plan | 1 | `CLAUDE.md`: one tap on/off. Exam week starts on Home, not in settings. |
| No-gym today | Check-in screen link; also in Plan | 1 (in session) | Decided at the gym door (or not at it), per session. |
| Log something else (sport, run) | Home, under the Next-up card | 2 | Happens a few times a month; visible but quieter than Start. |
| Export / import | Plan → Settings | 3 | Rare and deliberate. |

## Screen states

Every screen is designed in all of these (wireframed where marked):

- **First run / empty**: Home with no history (wireframed), Progress with nothing yet ("Your first numbers show up after one session").
- **In progress**: Workout mid-set and mid-rest (wireframed), Home is skipped.
- **Completed**: Summary (wireframed); Home after today's session ("Done for today", next up shown smaller).
- **Rest day suggested**: Home leads with "Rest day" and still offers the lift under "Or".
- **Offline**: everything works; only "Saved offline" is ever mentioned, and only if a save fails.
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

No account, no goals screen (the goals are already in the plan), no starting weights (the first session calibrates them). Old `uptime1` logs are migrated silently and confirmed in one line on step 1: "Found your log from the earlier app. Everything is kept."

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
| 2 | Warm-up (5 min checklist, timer running) | **Warm-up done** | The checklist is read, not ticked. One tap ends it. | 2 |
| 3 | Set screen (exercise, target, last time) | **Log set · 8 reps** | Prefilled with today's target (from double progression), so most sets are one tap. Reps chips and kg stepper sit just above it. | 3 |
| 4 | Rest (timer over the same screen) | **Log set 2** (stays live), **+15 s** and **Skip rest** above | Rest starts by itself. The Log button never moves, so the thumb learns one spot. | — |
| 5 | Rest over → next set | **Log set 2 · 8 reps** | Same button, same place. | 4 |

Every logged set is saved immediately and shows "Set 1 logged · Undo" for a few seconds.

- Logging a set as prescribed: **1 tap**.
- Logging a different rep count: **2 taps** (tap the reps chip, then Log).
- Changing weight and reps: **3–4 taps**. **Flag** (see the tap audit).
- Home to first working set: **3 taps** (Start, check-in, Warm-up done). **Flag** (see the tap audit).

Supersets (items sharing a pair letter) alternate automatically: log A1, the screen moves to B1 with no rest, then rest after the round.

Timed sets (carries, planks, hangs): the primary is **Start 40 s**; when it ends, the set logs itself and rest begins. 1 tap.

### 4. Interruption: phone locks mid-rest, then reopen

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Rest, 1:30 left | — | The timer stores an end time, not a countdown. | 0 |
| 2 | Phone locked (calls, other apps, same thing) | — | Nothing runs while locked; nothing needs to. | 0 |
| 3 | Reopen: app skips Home, lands on the same set with the correct time left, or "Rest over 0:40 ago" | **Log set 2** | Exactly where they left, same button in the same place. | 0 |
| 3b | Reopen after 3+ hours: "Upper A is still open. 9 of 17 sets logged." | **Pick up where you left off**; **Finish with 9 sets** beside it | After a long gap they may have left the gym. Both choices keep every logged set. | 1 |

A web app can't promise a sound or vibration while the screen is locked, so the screen wake lock keeps it on during rest, and the reopen state is designed to need nothing.

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

Finishing early: All exercises → **Finish now** → Summary with "Resume" for a few seconds (undo, not a confirm dialog).

### 7. Returning after a 10-day gap

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Home: "Welcome back." Next up is still the next session in line (no catch-up). One line explains: "10 days off, so today starts at about 90% of last time. Back to normal next session." | **Start** | Nothing is "missed". The reduction is explained once, briefly, then applied to every prefilled weight. | 1 |
| 2 | Check-in and on as usual; weights already reduced | **Log set** | No extra steps for coming back; that is the point. | — |

The streak line reads "New streak starts this week · Best: 5 weeks", never "Streak lost". At 14+ days, the line is "First week back: about 80% and one set fewer per exercise."

### 8. Toggling Busy mode

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Home: **Busy mode** switch in the header | Tap the switch | Header, not thumb zone: it's set a few times a term, and mis-taps are harmless with undo. Still one tap from Home. | 1 |
| 2 | Home re-renders: Next up "Full body 1 · ~40 min", week target "Busy week: 2–3 full body + 1 run". Line: "Busy mode on. Lower A waits for when you're back · Undo" | **Start** | The mode changes what's next, so Home shows the new next immediately. | — |
| 3 | Tap the switch again: "Back to the rotation. Next up: Lower A." | — | Rotation resumes where it stopped. | 1 |

### 9. Logging an unplanned sport session

| # | Screen | Primary action | Why it sits there | Taps |
|---|---|---|---|---|
| 1 | Home: **Log something else** under the Next-up card | Tap it | Visible every day without competing with Start. | 1 |
| 2 | Sheet: Today / Yesterday (Today selected) and Basketball, Easy run, Bike or incline walk, Stair session, Other run | Tap **Basketball** | Tapping the activity saves it with sensible defaults (today, 60 min for basketball). No Save button. | 2 |
| 3 | Home: "Basketball logged · 60 min, today · Edit · Undo". The card updates: "Done for today. Next up: Lower A, better after a rest day." | — | The app applies spacing rules right away, as a suggestion. | — |

Changing duration or date adds 1–2 taps (Edit, or Yesterday first). That's fine: it's the exception.

---

## Tap audit

| Common action | Taps | Verdict |
|---|---|---|
| Start next session from Home | 1 | OK |
| Check in | 1 | OK |
| Log a set as prescribed | 1 | OK |
| Log a set with different reps | 2 | OK |
| Undo the last set | 1 | OK |
| Start a timed set | 1 | OK |
| Skip or extend rest | 1 | OK |
| Swap an exercise | 2 | OK |
| Do exercises out of order (station taken) | 2 (All exercises → pick) | OK |
| Resume after interruption | 0 | OK |
| Busy mode on / off | 1 | OK |
| Log basketball / easy run | 2 | OK |
| Finish and return Home | 2 (last set, Done) | OK |
| **Home → first working set** | **3** (Start, check-in, warm-up done) | **Flag** |
| **Log a set with different weight and reps** | **3–4** (kg ±, reps chip, Log) | **Flag** |
| Log an activity for yesterday | 3 | Uncommon, OK |
| Edit a set logged earlier | 3 (tap row, change, save) | Uncommon, OK (undo covers the last set) |
| Onboarding | 3 | One-time, OK |

### Flag 1: Home → first working set takes 3 taps

Start, check-in and warm-up are each required by `CLAUDE.md`, and each tap carries information. Options:

- **A (recommended): keep 3.** Check-in is the coach's most useful signal (Rough → Short, deloads), and a warm-up that needs a tap to end is a warm-up that actually happens, which matters for the Achilles. The transition makes Start → check-in feel like one motion.
- **B: 2 taps.** Fold "Warm-up done" into the first set: the warm-up checklist sits above the first exercise and disappears on the first Log. Faster, but the warm-up becomes easy to ignore.

### Flag 2: changing weight and reps on the same set takes 3–4 taps

Rare by design: the weight is prefilled from double progression and the return/deload adjustments, so it changes mostly when a dumbbell pair is taken. Options:

- **A (recommended): keep the stepper**, with the step size set per exercise (2.5 kg for lower-body main lifts, the next dumbbell for dumbbell work), so most changes are one ± tap.
- **B:** a "Same as last set" default after set 1, so a weight change carries forward to the remaining sets automatically (already planned either way).

## Open questions for you

1. **Three tabs** (Home, Progress, Plan, with food and learning inside Plan): OK?
2. **Flag 1**: keep check-in and warm-up as separate taps (A) or fold warm-up into the first set (B)?
3. **Reps chips**: tap a chip, then Log (2 taps, safer, current wireframe), or tap a chip to log instantly with undo (1 tap, faster, easier to mis-tap with sweaty hands)?
4. **Unplanned activity**: save instantly on tap with defaults and an Edit link (current), or always show a small form with a Save button?
5. **Long interruption threshold**: after how long should reopening ask "Pick up / Finish" instead of resuming silently? Proposed: 3 hours.
6. **Busy mode switch on Home**: header switch (current), or only inside Plan with Home showing a banner when it's on?
