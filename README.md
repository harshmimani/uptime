<div align="center">

# 🔴 Five Mornings

**Four lifts. One engine day. Weekends off.**

A complete athletic training plan in a single HTML file.
Open it on your phone and it's already on today's session.

![Single file](https://img.shields.io/badge/single_file-index.html-E5483A?style=for-the-badge)
![No build](https://img.shields.io/badge/build_step-none-16191C?style=for-the-badge)
![No accounts](https://img.shields.io/badge/accounts-none-34B470?style=for-the-badge)
![Mobile first](https://img.shields.io/badge/mobile-first-4686EC?style=for-the-badge)

</div>

---

## The week

|    | Day     | Session                     |
|----|---------|-----------------------------|
| 🔴 | Mon     | **Lower A**: squat & jump   |
| 🔵 | Tue     | **Push**                    |
| 🟡 | Wed     | **Engine**: run & agility   |
| 🟢 | Thu     | **Pull**                    |
| 🔴 | Fri     | **Lower B**: hinge & bound  |
| ⚪ | Sat–Sun | Off. Walk, stretch, reset.  |

Power first, heavy lift next, finisher last. Every sixth week is a deload.

## What it does

- **Tap a set, start your rest.** Logging takes two seconds, and the timer beeps and buzzes when it's time to go again.
- **Knows when you've earned more weight.** Each lift shows what you did last time and tells you when to go heavier.
- **Clocks for the hard stuff.** EMOM, 21-15-9 and AMRAP finishers each run their own timer, and your scores are saved so next week has something to beat.
- **Form you can feel.** Step-by-step cues, a breathing cue, a muscle map and a demo link for every exercise.
- **Progress you can see.** A trend line for every lift, plus a CSV export.
- **Fuel, sorted.** Simple pre- and post-workout guidance built into every training day.
- **Light and dark.** It follows your phone, or you can flip it yourself.

## Private by design

No sign-up, no server, no analytics. Your log lives only in your browser on your device. Download the CSV now and then, because clearing your browser data clears your log.

## Run it

Open `index.html` in any browser. That's it.

To host it, push to GitHub, then go to **Settings → Pages → Deploy from a branch → `main` / `(root)`**. It will be live in a minute or two.

## Make it yours

The week count starts from one line near the top of the script:

```js
const START = new Date(2026, 9, 12); // 12 October 2026 (months are 0-indexed)
```

Exercises, sets and reps all live in the `DAYS` array in the same file.

---

<div align="center">
<sub>General fitness guidance, not medical advice. Listen to your body.</sub>
</div>
