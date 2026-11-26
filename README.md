<div align="center">

# 🔴 Uptime

**Four days a week. Lean, quick and strong. Showing up is the whole game.**

A complete athletic training plan in one page.
Open it on your phone and it's already on today's session.

![One page](https://img.shields.io/badge/one_page-index.html-FF6141?style=for-the-badge)
![No build](https://img.shields.io/badge/build_step-none-0C0E10?style=for-the-badge)
![No accounts](https://img.shields.io/badge/accounts-none-3DCB86?style=for-the-badge)
![Works offline](https://img.shields.io/badge/works-offline-D6FF3D?style=for-the-badge)

</div>

---

## The week

|    | Day | Session |
|----|-----|---------|
| 🔵 | Mon | **Strength A**: jump, squat, push, core |
| 🔴 | Tue | **Track**: 5K intervals, then court footwork |
| ⚪ | Wed | Rest. Walk and stretch. |
| 🔵 | Thu | **Strength B**: pull-up ladder, deadlift, press, carry |
| 🟠 | Fri | Optional: basketball, football or an easy run |
| 🟢 | Sat | **Long run**: easy, then strides |
| ⚪ | Sun | Rest, or the optional play day |

Six-week blocks: a baseline week to start, five weeks of building, then an easy week that ends in tests (5K, pull-up level, broad jump).

## What it does

- **One tap, next set.** A bar above the navigation always shows what's next and logs it in one tap, following supersets. Built for one hand, mid-workout.
- **A rest timer you can read across the gym.** Huge digits, ±15 s, beeps for the last three seconds, buzzes, then flashes when it's time to go.
- **Track timers.** Rep timer with target splits and automatic recovery, tempo blocks, a 5K stopwatch with laps, and a run clock. Every pace comes from your latest 5K.
- **Clocks that survive.** Every timer works from timestamps and is saved, so a locked screen or a reload doesn't lose it.
- **A pull-up ladder.** Five levels from negatives to ten in a row, each with a pass test that unlocks the next.
- **Knows when you've earned more weight.** Each lift shows last time and tells you when to go heavier.
- **Finishers with a score to beat.** EMOM, AMRAP and 21-15-9 clocks save your result.
- **Teaches as you go.** A muscle map, what to feel, how to breathe, why it's there, a common mistake and a demo link for every exercise.
- **Progress beyond the scale.** Uptime (the share of planned sessions you turn up for), a 7-day weight trend, waist, photo dates, tests and lift trends, plus a weekly verdict on whether to change anything.
- **Break mode.** A busy week becomes the minimum dose that holds your strength and fitness.
- **Fuel for a hostel mess.** Protein tally, five rules, the plate and a worked 120 g vegetarian day.
- **Light and dark.** Follows your phone, or flip it yourself.

## Private by design

No sign-up, no server, no analytics. Your data lives only in your browser on your phone. Download a backup now and then from the Progress tab, because clearing your browser data clears your log. A backup restores in one tap.

Logs from the earlier Five Mornings version are carried over automatically the first time Uptime opens.

## Run it

Open `index.html` in any browser. That's it.

To host it, push to GitHub, then go to **Settings → Pages → Deploy from a branch → `main` / `(root)`**. Once it's live, use your browser's **Add to Home Screen** and it runs full screen and offline.

## Make it yours

Every date comes from one line near the top of the script:

```js
const START=new Date(2026,10,23); // Monday 23 November 2026 (months are 0-indexed)
```

- Exercises live in the `EX` library. Their ids are also the storage keys, so keep them stable.
- Sessions are built by `strengthA`, `track`, `strengthB` and `longRun` from the week number, so blocks, easy weeks and tests take care of themselves.
- The pull-up ladder is the `LADDER` table.

## Files

| File | What it is |
|------|------------|
| `index.html` | The whole app: markup, styles and script |
| `sw.js` | Offline support |
| `manifest.webmanifest` | Home-screen install |
| `assets/` | The Archivo variable font (subset, self-hosted) and icons |
| `docs/HISTORY.md` | How the site evolved, and what was tried and dropped |

---

<div align="center">
<sub>General fitness guidance, not medical advice. Listen to your body.</sub>
</div>
