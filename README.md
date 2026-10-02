# Six Mornings

A six-day training and nutrition plan for a basic gym: strength work, an easy run, an outdoor session, and simple vegetarian eating built around a campus mess.

**Open `index.html` in any browser.** On your phone it opens to today's session.

## What's inside

- **Training:** a day-by-day plan (Mon–Sun) with sets, reps, rest times and short how-to notes for every exercise
- **Progress:** tick off exercises as you go and log the weight you lifted; saved in your browser
- **Food:** daily portions, a meal timeline, the plate rule and a protein reference table
- **How it works:** progression rules, deload weeks, training in humidity, and when to back off

## Host it with GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Your plan will be live at `https://<your-username>.github.io/<repo-name>/` in a minute or two.

## Customise

The plan's week count starts from the date set near the top of the script in `index.html`:

```js
var START = new Date(2026, 9, 5); // months are 0-indexed, so 9 = October
```

Change it to restart the count. Exercises, sets and reps live in the `DAYS` array in the same file.

---

General fitness guidance, not medical advice.
