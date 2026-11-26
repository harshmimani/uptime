# Testing on your phone

The app is tested on the live site (`harshmimani.github.io/uptime`) after each release. There is no separate preview copy.

## Before you test

1. In the app, **Plan → Settings → Export a backup**, so your logs are safe whatever happens.
2. If the app isn't on your home screen yet: open the address in **Chrome** (Android) or **Safari** (iPhone), then Chrome menu **⋮ → Add to Home screen / Install app**, or Safari **Share → Add to Home Screen**. Test from that icon.

## Phone test checklist

Tick each on the installed app icon. Because this is your real app, do the items that log sets during an actual workout, so every logged set is a real one. Anything off: note the screen and what you expected.

- [ ] **Install:** the home-screen icon is the green dial; it opens full screen with no browser bar.
- [ ] **Fast start:** from the icon, Start is tappable in about a second.
- [ ] **Offline:** turn on airplane mode, open the app, go through Home → Start → check-in → log 2 sets → Progress → Plan. Everything works.
- [ ] **Screen stays on:** during rest, leave the phone untouched for 2+ minutes; the screen shouldn't lock.
- [ ] **Lock and return:** start a rest timer, lock the phone for 30 s, unlock: the time left is right, and the end beep/buzz happened.
- [ ] **Interruption:** mid-workout, swipe the app away completely and reopen it: it returns to the same set.
- [ ] **One-handed:** log sets, change reps (tap number, then Log), Swap, Undo, all with your thumb, without stretching.
- [ ] **Warm-up:** on Upper A, the ramp-up sets show up again when you reach the bench press.
- [ ] **Run day:** tap Done, then Undo; type a time like `10k 52:30` and check the target paces change.
- [ ] **Update prompt:** after the next release, reopen the app (or switch back to it): a small **"New version, tap to refresh"** appears at the top; tapping it reloads into the new version. It must **not** appear while a workout is running.
- [ ] **Bright light:** outdoors or under gym lights, the timer and weights are readable at arm's length.
- [ ] **Data safety:** export a backup and check the file downloads.

Anything that fails: tell Claude which screen and what you expected. The live site only changes when `redesign` is merged into `main`.
