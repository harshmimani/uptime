# Testing on your phone before the live site changes

The live site (`harshmimani.github.io/uptime`) only changes when `redesign` is merged into `main`. Until then, test the redesign on a **separate preview address** that updates itself every time `redesign` is pushed.

## Why a separate address (and not the other options)

| Option | Problem |
|---|---|
| Your laptop over Wi-Fi (`http://192.168…`) | No HTTPS, so the phone refuses the offline mode and keeping the screen awake. Half the app can't be tested. |
| A second GitHub Pages repo (`harshmimani.github.io/uptime-preview`) | Same address as the live app, so it **shares storage with your real logs**. A test build could change them. |
| **Netlify preview connected to `redesign`** | HTTPS, a different address (its own storage, your real logs can't be touched), updates on every push, free, set up with clicks only. **Use this.** |

## One-time setup (about 5 minutes, all clicks)

Button names on Netlify change now and then; if one doesn't match exactly, pick the closest.

1. On a computer, go to **app.netlify.com** and sign up with **GitHub**.
2. Choose **Add new project → Import an existing project → GitHub**. Allow Netlify to see the `uptime` repository when GitHub asks.
3. Pick **harshmimani/uptime**.
4. Set **Branch to deploy** to **`redesign`**. Leave **Build command** and **Publish directory** empty (there's no build step).
5. Click **Deploy**. After a minute you get an address like `https://something-random.netlify.app`.
6. Optional: **Project configuration → Change project name** to something like `uptime-preview-hm`, so the address is easy to type.

From now on, every push to `redesign` updates the preview within a minute or two. The live site never changes from this. Netlify's free plan has a monthly deploy allowance; if it ever warns about it, turn off automatic deploys under **Project configuration → Build & deploy** and click **Trigger deploy** only when you want to test.

## On the phone

1. Open the preview address in **Chrome** (Android) or **Safari** (iPhone). A small amber **PREVIEW** label in the top-right corner shows you're on the test copy.
2. Add it to the home screen: Chrome menu **⋮ → Add to Home screen / Install app**; Safari **Share → Add to Home Screen**. Open it from that icon for the real installed experience.
3. Your real logs aren't there (different address). To test with them: in the **live** app, export a backup; in the **preview**, **Plan → Settings → Import a backup**. The live app's data is not changed by this.
4. When you're done testing, delete the preview icon from the home screen so you don't log a real workout into it by mistake.

## Phone test checklist

Tick each on the installed preview icon. Anything off: note the screen and what you expected.

- [ ] **Install:** the home-screen icon is the green dial; it opens full screen with no browser bar.
- [ ] **Fast start:** from the icon, Start is tappable in about a second.
- [ ] **Offline:** turn on airplane mode, open the app, go through Home → Start → check-in → log 2 sets → Progress → Plan. Everything works.
- [ ] **Screen stays on:** during rest, leave the phone untouched for 2+ minutes; the screen shouldn't lock.
- [ ] **Lock and return:** start a rest timer, lock the phone for 30 s, unlock: the time left is right, and the end beep/buzz happened.
- [ ] **Interruption:** mid-workout, swipe the app away completely and reopen it: it returns to the same set.
- [ ] **One-handed:** log sets, change reps (tap number, then Log), Swap, Undo, all with your thumb, without stretching.
- [ ] **Warm-up:** on Upper A, the ramp-up sets show up again when you reach the bench press.
- [ ] **Run day:** tap Done, then Undo; type a time like `10k 52:30` and check the target paces change.
- [ ] **Update prompt:** after the next push to `redesign`, reopen the app (or switch back to it): a small **"New version, tap to refresh"** appears at the top; tapping it reloads into the new version. It must **not** appear while a workout is running.
- [ ] **Bright light:** outdoors or under gym lights, the timer and weights are readable at arm's length.
- [ ] **Data safety:** export a backup from the preview and check the file downloads.

When everything passes, ask for `redesign` to be merged into `main`; that's the only step that changes the live site.
