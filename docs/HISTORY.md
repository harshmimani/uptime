# How the site got here

A review of every commit before the Uptime redesign, so the next upgrade builds on what worked and doesn't repeat what was tried and dropped.

## Timeline

| Commit | Date | What changed |
|---|---|---|
| `0dab833` | 2 Oct 2026 | **Six Mornings.** Six training days: upper/lower split plus a Saturday outdoor session that alternated between a steps circuit and a long run. Checkbox per exercise, a kg box, Food and Rules tabs, sticky tabs at the top. |
| `e800c71` | 2 Oct 2026 | Food tweaks. Whey moved into breakfast within an hour of training. ORS and electrolytes replaced by salted buttermilk or nimbu paani. Peanut butter, makhana and roasted chana dropped. |
| `52b03bb` | 3 Oct 2026 | **Five Mornings.** Six days cut to five, weekends off. The Saturday toggle was removed. Dead bug, bird dog, goblet squat and barbell row dropped; incline dumbbell press added. Logs keyed by exercise name instead of list position. |
| `e65c948` | 11 Oct 2026 | README rewrite with badges and the week table. |
| `5b6c87a` | 11 Oct 2026 | **Full rebuild.** Lower A, Push, Engine, Pull, Lower B. Bottom navigation, bumper-plate day buttons, muscle maps, Feel it and Breathe cues, tap-a-set rest timer (beep, vibration, screen wake lock), EMOM, AMRAP and 21-15-9 clocks with saved scores, progression hints, lift trend lines, CSV export, light and dark themes, fuel cards with a breakfast toggle, a muscle coverage matrix and equipment notes. |
| `0a71478`, `16ad8ee` | 11 Oct 2026 | Start date moved from 5 to 12 October, edited in two separate places. |

## Direction of travel

- **Checklist to coach.** Each version added more feedback during the session: timers, scores, "go heavier" hints and trends.
- **Generic to personal.** The plan learned the gym (no free squat rack, a crooked bench station, no medicine ball, a small floor) and the hostel mess.
- **Thumb-first.** Navigation moved from the top of the screen to the bottom.
- **Teaching more.** Every exercise gained cues for what to feel, how to breathe and why it is there.
- **Running shrank.** From a long run plus an easy run down to one 4 to 5 km jog, even though running is the owner's strongest sport.
- **Running grew back (27 Nov 2026).** A senior coach's review (6.5/10) found one run per rotation couldn't carry a 10K or 21K. Each rotation now has a quality run and a long run (10% / 30-day rule, 10–12 km cap), basketball replaces the quality run, a 21K build trades a lift for a third run, lower days were trimmed to fit 50 min with the calf work kept in the Short version, and Upper B got a concentric pull-up progression.
- **Design review (27 Nov 2026).** An external senior designer scored it 7 / 6 / 5 (look, ease, fun): Home looked premium but the rest screen, the one watched most, was the least finished. Fixed: rest became a takeover (56–80 px digits, green arc, green "Go", a bar on short screens, the dock folded to one line, the exercise name in the header, the toast at the top), the warm-up starts folded, "Skip rest" / "Skip set", Up next's figure no longer overlaps, a one-row check-in, "Pause, keep it open" on Exit (and a save under half the sets no longer moves the rotation), weight-first numbers, sheets with a handle, swipe-down and a sticky close, a solid tab bar (top bar on laptops), a tighter Home dial with one ring, an inverse toast in light, and a redrawn anatomical muscle figure.

## Tried, then dropped

Don't bring these back without a new reason.

- **Choice toggles on a session** (Saturday steps circuit or long run). One clear session per day works better.
- **Six training days.** Too many to sustain; the plan now has four fixed days.
- **Electrolyte sachets.** Salted buttermilk or nimbu paani does the job with mess food.
- **Peanut butter and makhana** as staples.
- **Dead bug, bird dog and goblet squat.**
- **Logs keyed by list position or by weekday.** Both break as soon as the plan changes. Key logs by date and exercise.
- **Dates written into text.** The start date had to be edited twice. Derive every date string from one constant.

## Kept on purpose

- Squats on the Smith machine, presses with dumbbells, a dumbbell snatch instead of a medicine ball, and finishers that fit one spot on a small floor.
- Muscle maps on every exercise.
- Light and dark themes.
- Local-only storage: no accounts, no server, no analytics.
