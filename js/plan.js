// Uptime training plan: the single source of plan content.
//
// The UI reads everything about *what* to train from here: exercises, cues,
// how-to guides and muscles, swaps, sessions, Short versions, the pull-up ladder, jump blocks, busy and
// no-gym sessions, the run progression, and guidance text. Behaviour rules
// (rotation order, spacing, gap returns, deloads) are described in CLAUDE.md
// and mirrored under `rules` so the engine can read the numbers.
//
// Conventions
// - Exercise ids are storage keys for logs. Never rename an id: logs are keyed
//   by "date|exerciseId". Ids carried over from the previous app keep old logs
//   attached. Add a new id instead of renaming.
// - Units: kg, seconds, metres. Paces are seconds per km.
// - reps: [min, max]. sec: [min, max] for timed sets. perSide: each side.
// - rest: seconds after each set (or after each round of a superset).
// - pair: items sharing a letter are done as a superset (alternate sets).
// - role drives progression: "main" | "accessory" | "jump" | "carry" | "core".
// - start: a first-session suggestion; the first session calibrates it.
// - Session items may be { slot: "ladder" } or { slot: "jump" }; the engine
//   fills them from `ladder` and `jumpBlocks` for the user's current level.
// - swaps.none may equal the exercise's own id: it already needs no equipment.

export const PLAN_VERSION = 1;

const plan = {
  version: PLAN_VERSION,
  units: "kg",
  disclaimer: "General fitness guidance, not medical advice.",

  // Starting point from onboarding (Nov 2026). Defaults for first run only;
  // live values come from the user's logs.
  baseline: {
    pullUpMax: 0,
    ladderLevel: 1,
    fiveKSec: 1710, // ~28:30
    goals: { fiveKSec: 1500, pullUps: 10 },
    notes: [
      "Left Achilles was sore earlier and settled with physio: jumps and speed work progress only while it stays quiet.",
      "Runs 5K, 10K and 21K; Strava records every run.",
      "Plays basketball regularly.",
      "No-gym: large outdoor steps, optional backpack.",
    ],
  },

  equipment: {
    gym: ["Smith machine", "Barbell (deadlift)", "Dumbbells", "Adjustable bench", "Cable station", "Pull-up bar"],
    gymMissing: ["Free squat rack", "Medicine ball", "Plyo box"],
    noGym: ["Bodyweight", "Large steps or stairs", "Backpack (optional, fill with books or water bottles)"],
  },

  // Numbers the engine uses. The full wording lives in CLAUDE.md.
  rules: {
    rotation: ["UA", "LA", "UB", "LB"],
    sessionMaxMin: 50,
    shortMaxMin: 30,
    repRanges: { main: [5, 8], accessory: [8, 15] },
    // Light dumbbells jump a lot in one step (7.5 → 10 kg is +33%), so pressing items marked
    // `byLoad` use a wider range at light weights. Weight is per hand.
    dumbbellBands: [
      { upToKg: 10, reps: [8, 15] },
      { upToKg: 17.5, reps: [6, 10] },
      { upToKg: null, reps: [5, 8] },
    ],
    repsInReserve: [1, 3],
    increments: {
      lowerMain: 2.5, // Smith squat, deadlift
      upperMain: [1, 2.5],
      dumbbell: "next dumbbell up; items marked slowFirst do one session of 3-s lowers at the top of the range first",
      carry: "add 10 s per set up to 60 s, then the next dumbbell up and back to 40 s",
      calf: "add reps to the top of the range, then add load",
      jump: "3 × 3 → 4 × 3, then move to the next block",
    },
    stallSessions: 2,
    stallAdvice: "Two sessions without progress: drop about 10% and build back, or switch to the next rep range for 3 weeks.",
    // Scheduled deload every 6 weeks (overdue at 8), skipped when the 6 weeks before it were
    // already light: a 7+ day gap (that resets the clock anyway) or 2 light 7-day blocks
    // (Minimum lifting, 2 lifts or fewer, or Busy mode on). The Rough check-in trigger always applies.
    deload: { everyDays: [42, 56], roughCheckInsPerRotation: 3, setsFactor: 0.5, skipIfLightBlocks: 2 },
    returnAfterGap: [
      { minDays: 7, maxDays: 13, loadFactor: 0.9, setsDelta: 0, duration: "first session" },
      { minDays: 14, maxDays: null, loadFactor: 0.8, setsDelta: -1, duration: "first week" },
    ],
    checkIn: {
      options: ["Good", "Okay", "Rough"],
      rough: "Suggest the Short version. Never guilt-trip.",
    },
    checkpoint: {
      everyDays: 42,
      includes: ["pull-up-max-test", "heel-raise-test", "deload"],
      why: "Test while fresh: the deload week is also the test week. When the deload is skipped, still do the tests.",
      note: "6-week check: test your pull-up max, and single-leg heel raises to fatigue on each side.",
    },
    achilles: {
      ok: "Pain 3/10 or less during the session that settles by the next morning.",
      flare: "More than that, or stiffer next morning: swap jumps for the jump's easier option, and the interval run for a tempo run, for one rotation. If it keeps happening, see your physio.",
      gatesJumpBlocks: true,
      // A note only: it never blocks or changes a session by itself.
      heelRaiseTest: "Every 6 weeks: single-leg heel raises to fatigue, each side. Left more than 10% behind the right? Do Lower A's calf raise single-leg (its harder swap), 3 × 6–10 slow, left first.",
      physio: "Ask your physio to clear you before jump block 3 (pogo hops) and before a 21K build.",
    },
    // Spacing after Lower B: Nordics and deadlifts leave the hamstrings sore for 24–48 h.
    afterLowerB: "No basketball or interval run the day after Lower B: choose Upper or an easy run.",
  },

  warmup: {
    minutes: 5,
    general: [
      "2 min easy cardio: jog, bike, or skipping in place",
      "Leg swings, 10 each way",
      "Arm circles and band-free pull-aparts, 10 each",
      "10 slow calf raises",
    ],
    // Balance work cuts ankle sprains in court sports, mostly in people with an earlier sprain.
    lowerExtra: ["Single-leg balance, 2 × 30 s per side (eyes closed once it's easy)", "5 lateral lunges per side"],
    // Extra lines for one session (left out of the Short version). {ladder} becomes today's
    // pull-up ladder move (Upper A's list).
    extra: { LB: "Pull-up practice: 2 × 2 of your ladder move ({ladder}), easy, about 3 min" },
    ramp: "1–3 lighter sets on the first main lift: about 50%, 70%, then 85% of today's weight, 3–5 reps each.",
  },

  // ---------------------------------------------------------------- exercises
  exercises: {
    // Upper: push
    "dumbbell-bench-press": {
      name: "Dumbbell bench press", kind: "push",
      cue: "Shoulder blades pinned, lower to mid-chest.",
      swaps: { easier: "dumbbell-floor-press", harder: "paused-dumbbell-bench-press", none: "push-up" },
    },
    "standing-dumbbell-overhead-press": {
      name: "Standing dumbbell overhead press", kind: "push",
      cue: "Squeeze your glutes, press up and slightly back.",
      swaps: { easier: "seated-dumbbell-overhead-press", harder: "dumbbell-push-press", none: "pike-push-up" },
    },
    "incline-dumbbell-press": {
      name: "Incline dumbbell press", kind: "push",
      cue: "Elbows about 45°, 2-second lower.",
      swaps: { easier: "incline-push-up", harder: "single-arm-incline-dumbbell-press", none: "feet-elevated-push-up" },
    },
    "cable-rope-pushdown": {
      name: "Cable rope pushdown", kind: "arms",
      cue: "Elbows pinned to your sides, spread the rope at the bottom.",
      swaps: { easier: "cable-bar-pushdown", harder: "overhead-cable-extension", none: "close-grip-push-up" },
    },
    "dumbbell-lateral-raise": {
      name: "Dumbbell lateral raise", kind: "shoulders",
      cue: "Lead with your elbows, stop at shoulder height.",
      why: "Light dumbbells jump a lot (5 → 7.5 kg is +50%): at the top of the range, do a session of 3-s lowers before the next dumbbell up.",
      swaps: { easier: "seated-dumbbell-lateral-raise", harder: "cable-lateral-raise", none: "backpack-lateral-raise" },
    },

    // Upper: pull
    "smith-machine-inverted-row": {
      name: "Smith machine inverted row", kind: "pull",
      cue: "Body stiff as a plank, chest to the bar.",
      swaps: { easier: "chest-supported-dumbbell-row", harder: "feet-elevated-inverted-row", none: "backpack-row" },
    },
    "one-arm-dumbbell-row": {
      name: "One-arm dumbbell row", kind: "pull",
      cue: "Pull your elbow to your hip, no twisting.",
      swaps: { easier: "chest-supported-dumbbell-row", harder: "paused-one-arm-dumbbell-row", none: "backpack-row" },
    },
    "half-kneeling-cable-pulldown": {
      name: "Half-kneeling single-arm cable pulldown", kind: "pull",
      cue: "Pull your elbow down into your back pocket.",
      why: "Builds the pulling strength a pull-up needs, alongside the ladder.",
      swaps: { easier: "cable-lat-pulldown", harder: "negative-pull-up", none: "backpack-row" },
    },
    "kneeling-cable-lat-pulldown": {
      name: "Kneeling cable lat pulldown", kind: "pull",
      cue: "Kneel tall, pull the bar to your upper chest, elbows to your ribs.",
      why: "Two-arm vertical pulling: trains the pull out of the dead hang that a pull-up needs.",
      swaps: { easier: "half-kneeling-cable-pulldown", harder: "foot-assisted-pull-up", none: "backpack-row" },
    },
    "cable-face-pull": {
      name: "Cable face pull", kind: "shoulders",
      cue: "Pull to your eyes, thumbs back.",
      swaps: { easier: "rear-delt-dumbbell-raise", harder: "paused-cable-face-pull", none: "prone-y-t-raise" },
    },
    "hammer-curl": {
      name: "Hammer curl", kind: "arms",
      cue: "Elbows still, no swing.",
      swaps: { easier: "seated-hammer-curl", harder: "slow-hammer-curl", none: "backpack-curl" },
    },

    // Core
    "pallof-press": {
      name: "Pallof press", kind: "core",
      cue: "Ribs down, don't let the cable turn you.",
      swaps: { easier: "half-kneeling-pallof-press", harder: "split-stance-pallof-press", none: "side-plank" },
    },
    "hanging-knee-raise": {
      name: "Hanging knee raise", kind: "core",
      cue: "Tilt the pelvis up, don't swing.",
      swaps: { easier: "reverse-crunch", harder: "hanging-leg-raise", none: "reverse-crunch" },
    },
    "copenhagen-side-plank": {
      name: "Copenhagen side plank", kind: "core",
      cue: "Knee on the bench, hips high, body in one line.",
      why: "Strong evidence for fewer groin strains in court and field sports.",
      swaps: { easier: "side-plank", harder: "long-lever-copenhagen-plank", none: "copenhagen-side-plank" },
      noGymNote: "Knee on a sofa edge or a step.",
    },

    // Lower: main
    "smith-machine-back-squat": {
      name: "Smith machine back squat", kind: "squat",
      cue: "Knees track over toes, hips go below knees.",
      swaps: { easier: "smith-machine-box-squat", harder: "smith-machine-pause-squat", none: "bodyweight-bulgarian-split-squat" },
    },
    "barbell-deadlift": {
      name: "Barbell deadlift", kind: "hinge",
      cue: "Bar against your shins, push the floor away.",
      swaps: { easier: "dumbbell-romanian-deadlift", harder: "paused-deadlift", none: "backpack-single-leg-rdl" },
    },

    // Lower: single-leg and accessories
    "bulgarian-split-squat": {
      name: "Bulgarian split squat", kind: "single-leg",
      cue: "Lean slightly forward, front heel stays down.",
      swaps: { easier: "split-squat", harder: "front-foot-elevated-bulgarian-split-squat", none: "bodyweight-bulgarian-split-squat" },
    },
    "dumbbell-lateral-lunge": {
      name: "Dumbbell lateral lunge", kind: "single-leg",
      cue: "Sit back into the hip, other leg straight.",
      why: "Side-to-side strength for cutting and defending on court.",
      swaps: { easier: "bodyweight-lateral-lunge", harder: "cossack-squat", none: "bodyweight-lateral-lunge" },
    },
    "dumbbell-romanian-deadlift": {
      name: "Dumbbell Romanian deadlift", kind: "hinge",
      cue: "Push your hips back, dumbbells close to your legs.",
      swaps: { easier: "kickstand-romanian-deadlift", harder: "single-leg-romanian-deadlift", none: "backpack-single-leg-rdl" },
    },
    "nordic-hamstring-curl": {
      name: "Nordic hamstring curl", kind: "hinge",
      cue: "Feet under the Smith bar, hips straight, fall as slowly as you can.",
      why: "Cuts hamstring strains in sprinting sports by about half.",
      swaps: { easier: "assisted-nordic-curl", harder: "nordic-curl-midrange-hold", none: "nordic-hamstring-curl" },
      noGymNote: "Hook your heels under a heavy sofa, or have someone hold your ankles.",
    },

    // Calves and tendon
    "smith-calf-raise": {
      name: "Heavy slow Smith calf raise", kind: "calf",
      cue: "3 s up, 3 s down, full stretch at the bottom.",
      why: "Heavy, slow loading is the core of Achilles care and keeps it ready for jumps and speed. Every 6 weeks, test single-leg heel raises; if the left is more than 10% behind, do this single-leg, left first.",
      swaps: { easier: "bodyweight-calf-raise", harder: "single-leg-dumbbell-calf-raise", none: "step-calf-raise" },
    },
    "seated-dumbbell-calf-raise": {
      name: "Seated dumbbell calf raise", kind: "calf",
      cue: "Dumbbell on your knees, pause 1 s at the bottom.",
      why: "Bent-knee raises train the soleus, the calf muscle runners load most.",
      swaps: { easier: "seated-bodyweight-calf-raise", harder: "single-leg-seated-calf-raise", none: "backpack-seated-calf-raise" },
    },

    // Carries
    "farmer-carry": {
      name: "Farmer carry", kind: "carry",
      cue: "Tall, shoulders down, short quick steps.",
      swaps: { easier: "farmer-hold", harder: "dumbbell-front-rack-carry", none: "backpack-stair-carry" },
    },
    "suitcase-carry": {
      name: "Suitcase carry", kind: "carry",
      cue: "One dumbbell, don't lean, ribs over hips.",
      swaps: { easier: "suitcase-hold", harder: "single-arm-overhead-carry", none: "side-plank" },
    },

    // Jumps (filled per block, see jumpBlocks)
    "squat-jump": {
      name: "Squat jump", kind: "jump",
      cue: "Jump tall, land quietly where you took off, reset each rep.",
      swaps: { easier: "snap-down", harder: "continuous-squat-jump", none: "step-jump" },
    },
    "broad-jump": {
      name: "Broad jump", kind: "jump",
      cue: "Swing your arms, jump forward, stick the landing for 2 s.",
      swaps: { easier: "snap-down", harder: "double-broad-jump", none: "broad-jump" },
      noGymNote: "On grass or a flat path.",
    },
    "continuous-squat-jump": {
      name: "Squat jumps, 3 in a row", kind: "jump",
      cue: "Short contacts, land and go, stay tall.",
      swaps: { easier: "squat-jump", harder: "pogo-hop", none: "continuous-squat-jump" },
    },
    "skater-bound": {
      name: "Skater bound", kind: "jump",
      cue: "Push sideways off one leg, land on the other and stick it.",
      swaps: { easier: "lateral-step-and-stick", harder: "continuous-skater-bound", none: "skater-bound" },
    },
    "pogo-hop": {
      name: "Pogo hops", kind: "jump",
      cue: "Both feet, small and quick, stiff ankles, light contacts.",
      why: "Trains the springy ankle stiffness that makes running cheaper. Only once the Achilles is quiet.",
      swaps: { easier: "snap-down", harder: "single-leg-pogo-hop", none: "pogo-hop" },
    },
    "single-arm-dumbbell-snatch": {
      name: "Single-arm dumbbell snatch", kind: "jump",
      cue: "Hips snap the dumbbell up, punch it overhead, lower under control.",
      why: "Full-body power without a medicine ball.",
      swaps: { easier: "dumbbell-hang-high-pull", harder: "alternating-dumbbell-snatch", none: "broad-jump" },
    },
    "double-broad-jump": {
      name: "2 broad jumps in a row", kind: "jump",
      cue: "Land, rebound straight into the second, stick it.",
      swaps: { easier: "broad-jump", harder: "triple-broad-jump", none: "double-broad-jump" },
    },
    "step-jump": {
      name: "Step jump", kind: "jump",
      cue: "Jump up one large step, land softly, step back down.",
      swaps: { easier: "snap-down", harder: "two-step-jump", none: "step-jump" },
    },

    // Pull-up ladder
    "negative-pull-up": {
      name: "Negative pull-up", kind: "pull-up",
      cue: "Step or jump to the top, lower slowly to a dead hang.",
      swaps: { easier: "top-hold", harder: "pull-up-attempt", none: "negative-pull-up" },
      noGymNote: "Any sturdy bar: playground, railing underside.",
    },
    "scap-pull-up": {
      name: "Scap pull-up", kind: "pull-up",
      cue: "Arms straight, pull your shoulders down and back, then let go slowly.",
      swaps: { easier: "dead-hang", harder: "negative-pull-up", none: "scap-pull-up" },
    },
    "dead-hang": {
      name: "Dead hang", kind: "pull-up",
      cue: "Full grip, shoulders active, breathe.",
      swaps: { easier: "feet-assisted-hang", harder: "top-hold", none: "dead-hang" },
    },
    "top-hold": {
      name: "Top hold", kind: "pull-up",
      cue: "Chin over the bar, elbows tight, hold still.",
      swaps: { easier: "dead-hang", harder: "negative-pull-up", none: "top-hold" },
    },
    "foot-assisted-pull-up": {
      name: "Foot-assisted pull-up", kind: "pull-up",
      cue: "Feet on the floor, chin over the bar, legs help as little as possible, 3-s lower.",
      why: "Trains the pull out of the dead hang, the part negatives miss.",
      swaps: { easier: "smith-machine-inverted-row", harder: "negative-pull-up", none: "foot-assisted-pull-up" },
      noGymNote: "Any sturdy bar or railing at chest height.",
    },
    "pull-up-attempt": {
      name: "Pull-up attempt + 2 negatives", kind: "pull-up",
      cue: "One strict try from a dead hang, then two slow lowers.",
      swaps: { easier: "negative-pull-up", harder: "pull-up", none: "pull-up-attempt" },
    },
    "pull-up": {
      name: "Pull-up", kind: "pull-up",
      cue: "From a dead hang, chin over the bar, no kipping.",
      swaps: { easier: "negative-pull-up", harder: "weighted-pull-up", none: "pull-up" },
    },
    "weighted-pull-up": {
      name: "Weighted pull-up", kind: "pull-up",
      cue: "Dumbbell between your feet, same strict rep.",
      swaps: { easier: "pull-up", harder: "weighted-pull-up", none: "pull-up" },
    },

    // No-gym extras
    "tibialis-raise": {
      name: "Tibialis raise", kind: "calf",
      cue: "Back against a wall, heels forward, lift your toes high.",
      why: "Strong shins and ankles for running and landing.",
      swaps: { easier: "tibialis-raise", harder: "single-leg-tibialis-raise", none: "tibialis-raise" },
    },
    "stair-step-up": {
      name: "Stair step-up", kind: "single-leg",
      cue: "Whole foot on a high step, drive up through the heel, slow down.",
      swaps: { easier: "split-squat", harder: "backpack-stair-step-up", none: "stair-step-up" },
    },

    // Swap targets (leaf exercises: picked from a swap, no swaps of their own)
    "dumbbell-floor-press": { name: "Dumbbell floor press", kind: "push", cue: "Elbows touch the floor softly, then press." },
    "paused-dumbbell-bench-press": { name: "Paused dumbbell bench press", kind: "push", cue: "3-s lower, 1-s pause on the chest." },
    "push-up": { name: "Push-up", kind: "push", cue: "Body in one line, chest to a fist's height off the floor." },
    "incline-push-up": { name: "Incline push-up", kind: "push", cue: "Hands on a step or bench, body straight." },
    "feet-elevated-push-up": { name: "Feet-elevated push-up", kind: "push", cue: "Feet on a step, hips don't sag." },
    "close-grip-push-up": { name: "Close-grip push-up", kind: "arms", cue: "Hands under shoulders, elbows brush your ribs." },
    "pike-push-up": { name: "Pike push-up", kind: "push", cue: "Hips high, lower the top of your head between your hands." },
    "seated-dumbbell-overhead-press": { name: "Seated dumbbell overhead press", kind: "push", cue: "Back against the bench, press straight up." },
    "dumbbell-push-press": { name: "Dumbbell push press", kind: "push", cue: "Short dip, drive with the legs, press to lockout." },
    "single-arm-incline-dumbbell-press": { name: "Single-arm incline dumbbell press", kind: "push", cue: "Don't let your body twist." },
    "cable-bar-pushdown": { name: "Cable bar pushdown", kind: "arms", cue: "Elbows pinned, lock out fully." },
    "overhead-cable-extension": { name: "Overhead cable extension", kind: "arms", cue: "Elbows point forward, stretch at the bottom." },
    "seated-dumbbell-lateral-raise": { name: "Seated dumbbell lateral raise", kind: "shoulders", cue: "No swing, elbows lead." },
    "cable-lateral-raise": { name: "Cable lateral raise", kind: "shoulders", cue: "Cable behind you, raise to shoulder height." },
    "backpack-lateral-raise": { name: "Backpack lateral raise", kind: "shoulders", cue: "Hold a bag strap in each hand, slow lower." },
    "chest-supported-dumbbell-row": { name: "Chest-supported dumbbell row", kind: "pull", cue: "Chest on an incline bench, squeeze your shoulder blades." },
    "feet-elevated-inverted-row": { name: "Feet-elevated inverted row", kind: "pull", cue: "Feet on the bench, chest to the bar." },
    "towel-door-row": { name: "Towel door row", kind: "pull", cue: "Towel round both handles of a shut door, lean back, row." },
    "paused-one-arm-dumbbell-row": { name: "Paused one-arm dumbbell row", kind: "pull", cue: "2-s hold at the top." },
    "backpack-row": { name: "Backpack row", kind: "pull", cue: "Hinge forward, row the bag to your hip, 3-s lower." },
    "cable-lat-pulldown": { name: "Cable lat pulldown", kind: "pull", cue: "Chest up, pull the bar to your upper chest." },
    "rear-delt-dumbbell-raise": { name: "Rear-delt dumbbell raise", kind: "shoulders", cue: "Chest on an incline bench, arms out wide." },
    "paused-cable-face-pull": { name: "Face pull with 2-s hold", kind: "shoulders", cue: "Hold at your eyes for 2 s." },
    "prone-y-t-raise": { name: "Prone Y-T raise", kind: "shoulders", cue: "Lie face down, lift arms into a Y, then a T." },
    "seated-hammer-curl": { name: "Seated hammer curl", kind: "arms", cue: "Back against the bench, no swing." },
    "slow-hammer-curl": { name: "Slow hammer curl", kind: "arms", cue: "3-s lower." },
    "backpack-curl": { name: "Backpack curl", kind: "arms", cue: "Hold the bag by its top strap, curl slowly." },
    "half-kneeling-pallof-press": { name: "Half-kneeling Pallof press", kind: "core", cue: "Inside knee down, ribs down." },
    "split-stance-pallof-press": { name: "Split-stance Pallof press", kind: "core", cue: "Narrow split stance, hold 2 s at full reach." },
    "side-plank": { name: "Side plank", kind: "core", cue: "Elbow under shoulder, hips high." },
    "reverse-crunch": { name: "Reverse crunch", kind: "core", cue: "Curl your hips off the floor, slow down." },
    "hanging-leg-raise": { name: "Hanging leg raise", kind: "core", cue: "Legs straight, raise to hip height, no swing." },
    "long-lever-copenhagen-plank": { name: "Long-lever Copenhagen plank", kind: "core", cue: "Foot on the bench, hips high." },
    "smith-machine-box-squat": { name: "Smith machine box squat", kind: "squat", cue: "Sit back to a bench, stand up tall." },
    "smith-machine-pause-squat": { name: "Smith machine pause squat", kind: "squat", cue: "2-s pause at the bottom, stay tight." },
    "bodyweight-bulgarian-split-squat": { name: "Bodyweight Bulgarian split squat", kind: "single-leg", cue: "Back foot on a step, 3-s lower." },
    "split-squat": { name: "Split squat", kind: "single-leg", cue: "Back foot on the floor, straight down and up." },
    "front-foot-elevated-bulgarian-split-squat": { name: "Front-foot-elevated Bulgarian split squat", kind: "single-leg", cue: "Front foot on a plate, deeper range." },
    "bodyweight-lateral-lunge": { name: "Bodyweight lateral lunge", kind: "single-leg", cue: "Sit into the hip, other leg straight." },
    "cossack-squat": { name: "Cossack squat", kind: "single-leg", cue: "Sink deep to one side, heel down, other toes up." },
    "kickstand-romanian-deadlift": { name: "Kickstand Romanian deadlift", kind: "hinge", cue: "Back toes down for balance, most weight on the front leg." },
    "single-leg-romanian-deadlift": { name: "Single-leg Romanian deadlift", kind: "hinge", cue: "Hips square, reach long through the back leg." },
    "backpack-single-leg-rdl": { name: "Backpack single-leg RDL", kind: "hinge", cue: "Hold the bag, hips square, slow." },
    "paused-deadlift": { name: "Paused deadlift", kind: "hinge", cue: "1-s pause just below the knee." },
    "assisted-nordic-curl": { name: "Assisted Nordic curl", kind: "hinge", cue: "Shorter range, push off the floor to help." },
    "nordic-curl-midrange-hold": { name: "Nordic curl with a hold", kind: "hinge", cue: "2-s hold halfway down, then lower slowly." },
    "bodyweight-calf-raise": { name: "Bodyweight calf raise", kind: "calf", cue: "Both legs, 3 s down." },
    "single-leg-dumbbell-calf-raise": { name: "Single-leg dumbbell calf raise", kind: "calf", cue: "Off a plate, 3 s down." },
    "step-calf-raise": { name: "Step calf raise", kind: "calf", cue: "Off a step, full stretch, 3 s down. Single-leg when easy." },
    "seated-bodyweight-calf-raise": { name: "Seated calf raise", kind: "calf", cue: "Hands pressing on your knees." },
    "single-leg-seated-calf-raise": { name: "Single-leg seated calf raise", kind: "calf", cue: "Dumbbell on one knee." },
    "backpack-seated-calf-raise": { name: "Backpack seated calf raise", kind: "calf", cue: "Bag on your knees, toes on a book." },
    "farmer-hold": { name: "Farmer hold", kind: "carry", cue: "Stand tall, hold still." },
    "dumbbell-front-rack-carry": { name: "Dumbbell front-rack carry", kind: "carry", cue: "Dumbbells on your shoulders, elbows forward." },
    "backpack-stair-carry": { name: "Backpack stair carry", kind: "carry", cue: "Loaded bag, walk up the stairs, walk down." },
    "suitcase-hold": { name: "Suitcase hold", kind: "carry", cue: "One dumbbell, stand tall, don't lean." },
    "single-arm-overhead-carry": { name: "Single-arm overhead carry", kind: "carry", cue: "Arm locked out, ribs down." },
    "snap-down": { name: "Snap-down", kind: "jump", cue: "Rise on your toes, drop into a quiet landing and hold." },
    "lateral-step-and-stick": { name: "Lateral step and stick", kind: "jump", cue: "Big step sideways, land and hold 2 s." },
    "continuous-skater-bound": { name: "Continuous skater bounds", kind: "jump", cue: "Side to side without pausing." },
    "single-leg-pogo-hop": { name: "Single-leg pogo hops", kind: "jump", cue: "Small, quick, stiff ankle." },
    "dumbbell-hang-high-pull": { name: "Dumbbell hang high pull", kind: "jump", cue: "Hips snap, elbow pulls high." },
    "alternating-dumbbell-snatch": { name: "Alternating dumbbell snatch", kind: "jump", cue: "Switch hands at the bottom, keep it smooth." },
    "triple-broad-jump": { name: "3 broad jumps in a row", kind: "jump", cue: "Rebound, rebound, stick." },
    "two-step-jump": { name: "Two-step jump", kind: "jump", cue: "Jump up two large steps, land softly." },
    "feet-assisted-hang": { name: "Feet-assisted hang", kind: "pull-up", cue: "Toes on a bench, hang with some weight off." },
    "single-leg-tibialis-raise": { name: "Single-leg tibialis raise", kind: "calf", cue: "One foot at a time." },
    "backpack-stair-step-up": { name: "Backpack stair step-up", kind: "single-leg", cue: "Loaded bag, drive through the heel." },

    // Conditioning and running
    "strides": { name: "Strides", kind: "run", cue: "Build to fast but relaxed over 15 s, walk back." },
    "easy-run": { name: "Easy run", kind: "run", cue: "Conversational: you can speak full sentences." },
    "long-run": { name: "Long easy run", kind: "run", cue: "Conversational the whole way. Walk breaks are fine." },
    "tempo": { name: "Tempo run", kind: "run", cue: "Comfortably hard: a few words at a time." },
    "five-k-time-trial": { name: "5K time trial", kind: "run", cue: "Kept so old logs still have a name." },
    "basketball": { name: "Basketball", kind: "sport", cue: "A hard day: it takes the place of that rotation's quality run." },
    "bike-or-incline-walk": { name: "Bike or incline walk", kind: "conditioning", cue: "Steady, slightly out of breath." },
    "stair-session": { name: "Stair session", kind: "conditioning", cue: "Walk or jog up, walk down, steady rhythm." },
  },

  // ------------------------------------------------------------------ guide
  // How to do every exercise: muscles (m = main, s = also works), 3–4 short
  // steps and the one mistake to avoid. Muscle names are the keys the muscle
  // map draws (js/muscles.js). `yt` replaces the exercise name in the YouTube
  // search only where the name alone wouldn't find the movement.
  guide: {
    // Upper: push
    "dumbbell-bench-press": { m: ["chest"], s: ["triceps", "shoulders"],
      steps: ["Sit with the dumbbells on your thighs and kick them up one at a time as you lie back.", "Feet flat, shoulder blades squeezed back and down.", "Lower to the sides of your chest, elbows about 45° from your body.", "Press up and slightly in until your arms are straight."],
      mistake: "Elbows flared straight out to the sides. Keep them at about 45° to protect your shoulders." },
    "standing-dumbbell-overhead-press": { m: ["shoulders", "triceps"], s: ["abs", "traps"],
      steps: ["Feet hip-width, dumbbells at your shoulders.", "Squeeze your glutes and abs so your lower back stays flat.", "Press up and slightly in until your arms are straight by your ears.", "Lower under control to your shoulders."],
      mistake: "Leaning back to finish the rep. If your back arches, the weight is too heavy." },
    "incline-dumbbell-press": { m: ["chest", "shoulders"], s: ["triceps"],
      steps: ["Set the bench to about 30°.", "Shoulder blades back and down, feet flat.", "Lower for 2 seconds to the top of your chest, elbows about 45°.", "Press up until your arms are straight."],
      mistake: "Bench set too steep. Above about 45° it turns into a shoulder press." },
    "cable-rope-pushdown": { m: ["triceps"], s: [],
      steps: ["Rope on the high pulley, stand tall, slight forward lean.", "Elbows pinned to your sides.", "Push down until your arms are straight and spread the rope at the bottom.", "Let it rise slowly to about 90° at the elbow."],
      mistake: "Elbows drifting forward so your shoulders do the work. Keep them glued to your sides." },
    "dumbbell-lateral-raise": { m: ["shoulders"], s: ["traps"],
      steps: ["Stand tall, dumbbells by your sides, slight bend in the elbows.", "Raise your arms out to the sides, leading with your elbows.", "Stop at shoulder height.", "Lower slowly, about 2 seconds."],
      mistake: "Swinging the weights up with your body. Go lighter and lift slowly." },

    // Upper: pull
    "smith-machine-inverted-row": { m: ["lats", "upperback"], s: ["biceps", "reardelts", "abs"],
      steps: ["Lock the Smith bar at about hip height and lie underneath it.", "Hands just wider than shoulders, heels down, body straight like a plank.", "Pull your chest to the bar, squeezing your shoulder blades together.", "Lower for 2 seconds to straight arms."],
      mistake: "Hips sagging toward the floor. Squeeze your glutes so your body stays one straight line." },
    "one-arm-dumbbell-row": { m: ["lats", "upperback"], s: ["biceps", "reardelts"],
      steps: ["Hand and knee on a bench, back flat, dumbbell hanging.", "Pull the dumbbell toward your hip in an arc.", "Pause with your elbow just past your back.", "Lower to a full stretch."],
      mistake: "Twisting your chest open to heave the weight up. Keep your shoulders square to the floor." },
    "kneeling-cable-lat-pulldown": { m: ["lats"], s: ["biceps", "upperback"],
      yt: "kneeling cable lat pulldown",
      steps: ["Straight bar on the high pulley. Kneel facing it, far enough back that the stack lifts with your arms long.", "Hands just wider than shoulders, chest up, ribs down.", "Pull the bar to your upper chest, driving your elbows down to your ribs.", "Let it rise slowly until your arms are straight."],
      mistake: "Leaning back and rowing it to your belly. Stay tall and pull down." },
    "half-kneeling-cable-pulldown": { m: ["lats"], s: ["biceps", "upperback", "obliques"],
      steps: ["Set the cable high and kneel on the knee on the same side as your working arm.", "Arm long, reach up into a stretch.", "Pull your elbow down toward your back pocket.", "Let it rise slowly until your arm is straight again."],
      mistake: "Pulling with your hand and biceps. Think elbow to hip so your lat does the work." },
    "cable-face-pull": { m: ["reardelts", "upperback"], s: ["traps"],
      steps: ["Rope at forehead height, palms facing down.", "Step back until the stack lifts and stand tall.", "Pull toward your eyes, splitting the rope so your knuckles point behind you.", "Pause 1 second, then return slowly."],
      mistake: "Too heavy, so you lean back and row it to your chest. Go light and pull high to your eyes." },
    "hammer-curl": { m: ["biceps", "forearms"], s: [],
      steps: ["Stand tall, palms facing each other.", "Elbows pinned to your sides.", "Curl up without swinging your body.", "Lower slowly."],
      mistake: "Swinging your back to lift the weight. If you need to swing, it's too heavy." },

    // Core
    "pallof-press": { m: ["obliques", "abs"], s: ["glutes"],
      steps: ["Stand side-on to the cable at chest height, handle at your chest.", "Feet shoulder-width, ribs down.", "Press straight out until your arms are long and hold 2 seconds.", "Bring it back without letting the cable turn you."],
      mistake: "Letting your hips and shoulders rotate toward the cable. Stay square." },
    "hanging-knee-raise": { m: ["abs"], s: ["forearms", "obliques"],
      steps: ["Hang from the bar, shoulders pulled slightly down.", "Curl your hips up so your knees rise above your waist.", "Pause at the top.", "Lower slowly without swinging."],
      mistake: "Swinging your legs up. Tilt your pelvis up and stop the swing between reps." },
    "copenhagen-side-plank": { m: ["adductors", "obliques"], s: ["abs"],
      steps: ["Lie on your side, elbow under shoulder.", "Rest the top leg's inner knee on a bench.", "Lift your hips until your body is straight; the bottom leg hangs free.", "Hold, then lower gently."],
      mistake: "Hips sagging. Hold a shorter time with your body in a straight line." },

    // Lower: main
    "smith-machine-back-squat": { m: ["quads", "glutes"], s: ["adductors", "lowerback"],
      steps: ["Set the safety stops just below your bottom position.", "Bar on your upper back, feet shoulder-width and slightly in front of the bar.", "Brace, then sit down until your thighs are at least parallel.", "Drive up through your whole foot, knees following your toes."],
      mistake: "Knees caving in on the way up. Push them out over your toes." },
    "barbell-deadlift": { m: ["hamstrings", "glutes"], s: ["lowerback", "forearms", "traps", "quads"],
      steps: ["Bar over the middle of your feet. Hinge down and grip just outside your legs.", "Chest up, back flat, pull the slack out of the bar.", "Push the floor away, bar touching your legs all the way up.", "Squeeze your glutes at the top, then lower along the same path."],
      mistake: "A rounded lower back. Brace and keep your chest up before the bar leaves the floor." },

    // Lower: single-leg and accessories
    "bulgarian-split-squat": { m: ["quads", "glutes"], s: ["adductors"],
      steps: ["Top of the back foot on a bench, front foot about two feet ahead.", "Lean your torso slightly forward with a flat back.", "Lower until the back knee nearly touches the floor.", "Drive up through the front heel."],
      mistake: "Front foot too close to the bench, so the heel lifts. Step it further out." },
    "dumbbell-lateral-lunge": { m: ["glutes", "adductors", "quads"], s: [],
      steps: ["Hold one dumbbell at your chest, feet together.", "Step wide to the side and sit back into that hip, chest up.", "Keep the other leg straight and both feet flat.", "Push off the bent leg back to standing."],
      mistake: "The bent knee shooting forward past your toes. Sit your hips back instead." },
    "dumbbell-romanian-deadlift": { m: ["hamstrings", "glutes"], s: ["lowerback", "forearms"],
      steps: ["Stand tall, dumbbells in front of your thighs, knees slightly bent.", "Push your hips back and slide the dumbbells down to just below your knees.", "Keep your back flat and the dumbbells close to your legs.", "Stand up by squeezing your glutes."],
      mistake: "Bending the knees more and more so it turns into a squat. Hips go back, shins stay nearly still." },
    "nordic-hamstring-curl": { m: ["hamstrings"], s: ["glutes", "calves"],
      steps: ["Kneel on a pad with your heels hooked under the Smith bar or held down.", "Body straight from knees to head, hips locked.", "Lower forward as slowly as you can.", "Catch yourself with your hands and push back up."],
      mistake: "Bending at the hips to make it easier. Keep hips straight and shorten the range instead." },

    // Calves and tendon
    "smith-calf-raise": { m: ["calves"], s: [],
      steps: ["Balls of your feet on a plate, Smith bar on your upper back.", "Lower your heels for 3 seconds to a full stretch.", "Rise for 3 seconds as high as you can.", "Pause at the top."],
      mistake: "Fast, bouncy reps. Slow and heavy is what strengthens the Achilles." },
    "seated-dumbbell-calf-raise": { m: ["calves"], s: [],
      steps: ["Sit on a bench, balls of your feet on a plate.", "Dumbbell resting on your knees.", "Lower your heels and pause 1 second at the bottom.", "Rise as high as you can."],
      mistake: "Cutting the range short. Full stretch at the bottom, full squeeze at the top." },

    // Carries
    "farmer-carry": { m: ["forearms", "traps"], s: ["obliques", "abs"],
      steps: ["Pick up heavy dumbbells with a flat back, like a deadlift.", "Stand tall, shoulders down and back.", "Walk with short, quick steps.", "Short on space: walk 5 m and turn."],
      mistake: "Shoulders shrugging up to your ears. Keep them pulled down." },
    "suitcase-carry": { m: ["obliques", "forearms"], s: ["traps", "abs"],
      steps: ["One dumbbell in one hand, the other arm free.", "Stand tall, ribs stacked over hips.", "Walk slowly without leaning.", "Switch hands halfway."],
      mistake: "Leaning away from (or toward) the weight. Stay perfectly upright." },

    // Jumps
    "squat-jump": { m: ["quads", "glutes", "calves"], s: [],
      steps: ["Feet hip-width, arms by your sides.", "Dip fast to a quarter squat, arms swinging back.", "Jump as high as you can, arms swinging up.", "Land softly where you took off and reset."],
      mistake: "Landing stiff-legged and loud. Land quietly, knees bending over your toes." },
    "broad-jump": { m: ["glutes", "hamstrings", "quads"], s: ["calves"],
      steps: ["Feet hip-width, arms up.", "Swing your arms back and push your hips back.", "Jump forward as far as you can.", "Land in a half squat and hold for 2 seconds."],
      mistake: "Knees caving in on landing. Land with knees over toes." },
    "continuous-squat-jump": { m: ["quads", "glutes", "calves"], s: [],
      yt: "continuous squat jumps",
      steps: ["Feet hip-width.", "Jump tall.", "Land and go straight into the next jump, short ground contact.", "Do 3 in a row, then reset."],
      mistake: "Sinking deep between jumps. Stay springy with a short dip." },
    "skater-bound": { m: ["glutes", "quads"], s: ["adductors", "calves"],
      steps: ["Stand on one leg, slight knee bend.", "Leap sideways off that leg.", "Land softly on the other leg and hold 1 second.", "Bound back."],
      mistake: "Landing knee caving in. Knee stays over your toes." },
    "pogo-hop": { m: ["calves"], s: ["quads"],
      yt: "pogo hops",
      steps: ["Stand tall, feet hip-width.", "Hop small and quick on the balls of your feet.", "Ankles stiff, knees nearly straight.", "Keep each ground touch short and light."],
      mistake: "Heels crashing down and knees bending. Think springy ankles, not jumping high." },
    "single-arm-dumbbell-snatch": { m: ["glutes", "hamstrings", "shoulders"], s: ["traps", "quads", "abs"],
      steps: ["Dumbbell between your feet, hinge and grab it with one hand.", "Snap your hips forward so the dumbbell flies up close to your body.", "Punch it straight overhead and lock out.", "Lower it under control to the floor."],
      mistake: "Lifting with your arm. The hips throw it; the arm just guides." },
    "double-broad-jump": { m: ["glutes", "hamstrings", "quads"], s: ["calves"],
      yt: "double broad jump",
      steps: ["Start like a normal broad jump.", "Land and rebound straight into the second jump.", "Stick the second landing for 2 seconds.", "Walk back and reset."],
      mistake: "A long pause between the jumps. The rebound is the point." },
    "step-jump": { m: ["quads", "glutes", "calves"], s: [],
      yt: "step up jump",
      steps: ["Stand facing a large, sturdy step.", "Swing your arms and jump up onto it.", "Land softly with your whole foot.", "Step back down; never jump down."],
      mistake: "Jumping back down. Step down each time to spare your Achilles." },

    // Pull-up ladder
    "negative-pull-up": { m: ["lats", "biceps"], s: ["upperback", "forearms"],
      steps: ["Stand on a bench so your chin starts above the bar, palms away.", "Step off and hold the top for a moment.", "Lower as slowly as you can, counting the seconds.", "At the bottom, step back up. Don't jump."],
      mistake: "Dropping fast through the bottom half. Fight the whole way down." },
    "scap-pull-up": { m: ["lats", "upperback"], s: ["traps", "forearms"],
      steps: ["Start in a dead hang.", "Without bending your elbows, pull your shoulder blades down and back.", "Your body rises about an inch; hold 2 seconds.", "Lower slowly back to the hang."],
      mistake: "Bending the elbows. Arms stay straight; only the shoulders move." },
    "dead-hang": { m: ["forearms", "lats"], s: ["shoulders"],
      steps: ["Grip the bar just wider than shoulders, palms away.", "Hang with straight arms.", "Pull your shoulders slightly down, away from your ears.", "Breathe calmly and hold."],
      mistake: "Shoulders shrugged up by your ears. Keep them gently pulled down." },
    "top-hold": { m: ["lats", "biceps"], s: ["forearms", "upperback"],
      yt: "pull up top hold",
      steps: ["Step up from a bench so your chin is over the bar.", "Squeeze the bar, elbows tight to your sides, chest up.", "Hold with your chin above the bar.", "Lower slowly when you can't hold any more."],
      mistake: "Craning your neck to keep the chin up. Hold with your arms, not your neck." },
    "foot-assisted-pull-up": { m: ["lats", "biceps"], s: ["upperback", "forearms"],
      yt: "feet assisted pull up",
      steps: ["Lock the Smith bar at chest height and hang under it, arms straight, feet on the floor in front of you.", "Pull your shoulders down, then pull your chin over the bar, using your legs as little as possible.", "Lower for 3 seconds to straight arms.", "Getting easy: heels only on the floor, then feet up on a bench."],
      mistake: "Standing up with your legs. They only help with what your arms can't finish." },
    "pull-up-attempt": { m: ["lats", "biceps"], s: ["upperback", "forearms"],
      yt: "first pull up progression",
      steps: ["From a dead hang, pull your shoulders down first.", "Drive your elbows toward your hips: one honest effort.", "Made it or not, finish with 2 slow negatives from the top.", "Log the strict reps you got, even 0."],
      mistake: "Kicking or swinging to get up. One strict try beats a kipped rep." },
    "pull-up": { m: ["lats"], s: ["biceps", "upperback", "forearms"],
      steps: ["Dead hang, hands just wider than shoulders, palms away.", "Pull your shoulders down, then drive your elbows toward your hips.", "Chin over the bar.", "Lower for 2–3 seconds to a full hang."],
      mistake: "Half reps. Start every rep from straight arms." },
    "weighted-pull-up": { m: ["lats"], s: ["biceps", "upperback", "forearms"],
      steps: ["Hold a dumbbell between your feet or use a belt.", "Start from a dead hang.", "Pull until your chin is over the bar.", "Lower under control to a full hang."],
      mistake: "Adding weight before 10 clean bodyweight reps. Earn the load first." },

    // No-gym extras
    "tibialis-raise": { m: ["shins"], s: [],
      steps: ["Lean your back against a wall, heels about a foot out.", "Legs straight, weight on your heels.", "Lift your toes as high as you can.", "Lower slowly."],
      mistake: "Bending your knees to make it easier. Keep legs straight." },
    "stair-step-up": { m: ["quads", "glutes"], s: ["calves"],
      steps: ["Whole foot on a high step.", "Lean slightly forward.", "Drive up through the heel of the top foot.", "Lower slowly, 2–3 seconds."],
      mistake: "Pushing off the bottom foot. Let the top leg do all the work." },

    // Swap targets
    "dumbbell-floor-press": { m: ["chest", "triceps"], s: ["shoulders"],
      steps: ["Lie on the floor, knees bent, dumbbells over your chest.", "Lower until your upper arms touch the floor softly.", "Pause, then press up."],
      mistake: "Bouncing your elbows off the floor. Touch, pause, press." },
    "paused-dumbbell-bench-press": { m: ["chest"], s: ["triceps", "shoulders"],
      yt: "paused dumbbell bench press",
      steps: ["Set up like the dumbbell bench press.", "Lower for 3 seconds.", "Pause 1 second at the bottom, staying tight.", "Press up."],
      mistake: "Relaxing in the pause. Stay tight so you press from a strong position." },
    "push-up": { m: ["chest", "triceps"], s: ["shoulders", "abs"],
      steps: ["Hands just wider than shoulders, body in one line.", "Lower until your chest is a fist off the floor.", "Elbows about 45° from your body.", "Push back up."],
      mistake: "Hips sagging. Squeeze glutes and abs so your body moves as one piece." },
    "incline-push-up": { m: ["chest", "triceps"], s: ["shoulders", "abs"],
      steps: ["Hands on a bench or step, body straight.", "Lower your chest to the edge.", "Push back up."],
      mistake: "Head poking forward. Lead with the chest." },
    "feet-elevated-push-up": { m: ["chest", "shoulders"], s: ["triceps", "abs"],
      steps: ["Feet on a step, hands on the floor.", "Body in one line.", "Lower your chest toward the floor.", "Push back up."],
      mistake: "Hips piking up. Keep a straight line from heels to head." },
    "close-grip-push-up": { m: ["triceps"], s: ["chest", "shoulders"],
      steps: ["Hands under your shoulders.", "Lower with elbows brushing your ribs.", "Push back up."],
      mistake: "Elbows flaring out. Keep them close to work the triceps." },
    "pike-push-up": { m: ["shoulders"], s: ["triceps", "traps"],
      steps: ["Hips high, body in an upside-down V.", "Lower the top of your head between your hands.", "Push back up."],
      mistake: "Hips dropping into a normal push-up. Keep them high." },
    "seated-dumbbell-overhead-press": { m: ["shoulders", "triceps"], s: ["traps"],
      steps: ["Bench upright, back against the pad.", "Dumbbells at your shoulders.", "Press straight up.", "Lower under control."],
      mistake: "Arching off the bench. Keep your back against the pad." },
    "dumbbell-push-press": { m: ["shoulders", "triceps"], s: ["quads", "glutes"],
      steps: ["Dumbbells at your shoulders.", "Short dip at the knees.", "Drive with your legs and press to lockout.", "Lower to your shoulders."],
      mistake: "A deep squat dip. Keep it short and snappy." },
    "single-arm-incline-dumbbell-press": { m: ["chest", "shoulders"], s: ["triceps", "obliques"],
      steps: ["Incline bench, one dumbbell.", "Brace so your body doesn't twist.", "Lower to your chest and press up."],
      mistake: "Rolling toward the weight. Stay square on the bench." },
    "cable-bar-pushdown": { m: ["triceps"], s: [],
      yt: "tricep pushdown straight bar",
      steps: ["Straight bar on the high pulley.", "Elbows pinned to your sides.", "Push down to full lockout.", "Let it rise slowly."],
      mistake: "Leaning over the bar. Stand tall." },
    "overhead-cable-extension": { m: ["triceps"], s: [],
      yt: "overhead cable tricep extension",
      steps: ["Face away from a low cable, rope behind your head.", "Elbows point forward.", "Straighten your arms overhead.", "Lower into a stretch."],
      mistake: "Elbows flaring wide. Keep them pointing forward." },
    "seated-dumbbell-lateral-raise": { m: ["shoulders"], s: [],
      steps: ["Sit on a bench, dumbbells by your sides.", "Raise to shoulder height, elbows leading.", "Lower slowly."],
      mistake: "Shrugging. Keep the shoulders down." },
    "cable-lateral-raise": { m: ["shoulders"], s: ["traps"],
      steps: ["Low cable, stand side-on, cable crossing behind you.", "Raise your arm out to shoulder height.", "Lower slowly."],
      mistake: "Pulling with the body. Only the arm moves." },
    "backpack-lateral-raise": { m: ["shoulders"], s: [],
      yt: "lateral raise at home",
      steps: ["Hold a loaded bag strap in each hand, or one bag in one hand.", "Raise out to shoulder height.", "Lower for 3 seconds."],
      mistake: "Swinging the bag. Go slow." },
    "chest-supported-dumbbell-row": { m: ["upperback", "lats"], s: ["reardelts", "biceps"],
      steps: ["Lie face-down on a bench set to 30–45°.", "Pull your elbows back toward your hips.", "Squeeze your shoulder blades for 1 second.", "Lower to a full stretch."],
      mistake: "Lifting your chest off the pad. Stay down so the back does the work." },
    "feet-elevated-inverted-row": { m: ["lats", "upperback"], s: ["biceps", "reardelts", "abs"],
      steps: ["Bar at hip height, feet on a bench.", "Body straight.", "Pull your chest to the bar.", "Lower slowly."],
      mistake: "Hips dropping. Squeeze your glutes." },
    "towel-door-row": { m: ["lats", "upperback"], s: ["biceps", "forearms"],
      steps: ["Loop a towel round both handles of a closed door (open side away from you).", "Hold the ends, feet near the door, lean back with straight arms.", "Row your chest toward the door.", "Lower slowly."],
      mistake: "Using a door that opens toward you. It must close against your pull." },
    "paused-one-arm-dumbbell-row": { m: ["lats", "upperback"], s: ["biceps", "reardelts"],
      yt: "one arm dumbbell row",
      steps: ["Set up like the one-arm row.", "Row to your hip.", "Hold 2 seconds at the top.", "Lower slowly."],
      mistake: "Shortening the pause as you tire. Count it out." },
    "backpack-row": { m: ["lats", "upperback"], s: ["biceps"],
      yt: "backpack bent over row",
      steps: ["Hinge forward, back flat, holding a loaded bag.", "Row the bag to your hip or belly.", "Lower for 3 seconds."],
      mistake: "Standing up as you row. Hold the hinge." },
    "cable-lat-pulldown": { m: ["lats"], s: ["biceps", "upperback"],
      yt: "lat pulldown",
      steps: ["Grip just wider than shoulders, thighs under the pad.", "Chest up, pull the bar to your upper chest.", "Let it rise until your arms are straight."],
      mistake: "Leaning far back and yanking. Stay mostly upright." },
    "rear-delt-dumbbell-raise": { m: ["reardelts"], s: ["upperback"],
      yt: "chest supported rear delt fly",
      steps: ["Chest on an incline bench, light dumbbells hanging.", "Raise your arms out wide, slight elbow bend.", "Lower slowly."],
      mistake: "Squeezing the shoulder blades and rowing. Arms go out wide, not back." },
    "paused-cable-face-pull": { m: ["reardelts", "upperback"], s: ["traps"],
      yt: "cable face pull",
      steps: ["Set up like the face pull.", "Pull to your eyes.", "Hold 2 seconds, then return slowly."],
      mistake: "Going too heavy to hold the pause. Lighten it." },
    "prone-y-t-raise": { m: ["upperback", "reardelts"], s: ["traps", "lowerback"],
      yt: "prone Y T raise",
      steps: ["Lie face down, arms overhead, thumbs up.", "Lift your arms into a Y and hold 2 seconds.", "Lower, then lift into a T and hold."],
      mistake: "Lifting with the lower back. Chest stays near the floor." },
    "seated-hammer-curl": { m: ["biceps", "forearms"], s: [],
      steps: ["Sit with your back against an upright bench.", "Palms facing in, curl up.", "Lower slowly."],
      mistake: "Rocking off the pad. Back stays on the bench." },
    "slow-hammer-curl": { m: ["biceps", "forearms"], s: [],
      yt: "hammer curl",
      steps: ["Set up like the hammer curl.", "Curl up.", "Lower for 3 seconds."],
      mistake: "Rushing the lower. That's where the work is." },
    "backpack-curl": { m: ["biceps"], s: ["forearms"],
      yt: "backpack bicep curl",
      steps: ["Hold a loaded bag by its top strap.", "Elbows by your sides, curl it up.", "Lower slowly."],
      mistake: "Swinging the bag. Slow both ways." },
    "half-kneeling-pallof-press": { m: ["obliques", "abs"], s: ["glutes"],
      yt: "half kneeling pallof press",
      steps: ["Kneel with the inside knee down, side-on to the cable.", "Press out and hold 2 seconds.", "Bring it back slowly."],
      mistake: "Leaning toward the cable. Stay tall." },
    "split-stance-pallof-press": { m: ["obliques", "abs"], s: ["glutes"],
      yt: "split stance pallof press",
      steps: ["Narrow split stance, side-on to the cable.", "Press out and hold 2 seconds.", "Return without twisting."],
      mistake: "Stance too wide, which makes it easy. Keep the feet close." },
    "side-plank": { m: ["obliques"], s: ["abs", "shoulders"],
      steps: ["Lie on your side, elbow under shoulder.", "Lift your hips so your body is straight.", "Hold, breathing slowly."],
      mistake: "Hips sinking. Shorter holds with a straight line beat long sagging ones." },
    "reverse-crunch": { m: ["abs"], s: [],
      steps: ["Lie on your back, knees bent at 90°.", "Curl your hips off the floor toward your chest.", "Lower slowly."],
      mistake: "Swinging the legs. Curl the hips, don't kick." },
    "hanging-leg-raise": { m: ["abs"], s: ["forearms", "obliques"],
      steps: ["Hang from the bar.", "Legs straight, raise them to hip height.", "Lower slowly without swinging."],
      mistake: "Momentum. Stop the swing before the next rep." },
    "long-lever-copenhagen-plank": { m: ["adductors", "obliques"], s: ["abs"],
      yt: "copenhagen plank",
      steps: ["Side plank with your top foot on the bench.", "Lift your hips into a straight line.", "Hold, then lower gently."],
      mistake: "Jumping to it too early. Own the short-lever version first." },
    "smith-machine-box-squat": { m: ["quads", "glutes"], s: ["adductors"],
      steps: ["Bench behind you at about knee height.", "Sit back under control until you touch it.", "Stand up tall without rocking."],
      mistake: "Dropping onto the box. Touch it lightly." },
    "smith-machine-pause-squat": { m: ["quads", "glutes"], s: ["adductors", "lowerback"],
      yt: "pause squat",
      steps: ["Squat down as usual.", "Pause 2 seconds at the bottom, staying braced.", "Drive up."],
      mistake: "Relaxing at the bottom. Stay tight in the pause." },
    "bodyweight-bulgarian-split-squat": { m: ["quads", "glutes"], s: ["adductors"],
      yt: "bulgarian split squat",
      steps: ["Back foot on a step or sofa.", "Lower for 3 seconds until the back knee nearly touches.", "Drive up through the front heel."],
      mistake: "Rushing the lowering. Slow makes bodyweight hard enough." },
    "split-squat": { m: ["quads", "glutes"], s: ["adductors"],
      steps: ["Long stride, back foot on the floor.", "Drop straight down.", "Drive back up."],
      mistake: "Front heel lifting. Keep it planted." },
    "front-foot-elevated-bulgarian-split-squat": { m: ["quads", "glutes"], s: ["adductors"],
      yt: "front foot elevated bulgarian split squat",
      steps: ["Front foot on a plate, back foot on the bench.", "Lower deeper than usual.", "Drive up through the front heel."],
      mistake: "Losing balance from going heavy too soon. Earn the range first." },
    "bodyweight-lateral-lunge": { m: ["glutes", "adductors", "quads"], s: [],
      yt: "lateral lunge",
      steps: ["Feet together.", "Step wide and sit into the hip, other leg straight.", "Push back to standing."],
      mistake: "Knee shooting forward. Sit back." },
    "cossack-squat": { m: ["adductors", "glutes", "quads"], s: [],
      steps: ["Very wide stance.", "Sink to one side, heel down, other toes up.", "Shift across to the other side."],
      mistake: "Heel lifting. Only go as deep as your heel stays down." },
    "kickstand-romanian-deadlift": { m: ["hamstrings", "glutes"], s: ["lowerback"],
      yt: "kickstand RDL",
      steps: ["Back toes down just behind you, most weight on the front leg.", "Hinge back, dumbbells close to the front leg.", "Stand up by squeezing that glute."],
      mistake: "Sharing the weight 50/50. The back foot only balances." },
    "single-leg-romanian-deadlift": { m: ["hamstrings", "glutes"], s: ["lowerback", "obliques"],
      yt: "single leg RDL",
      steps: ["Stand on one leg, soft knee.", "Hinge forward, back leg reaching long behind you.", "Hips square, return to standing."],
      mistake: "Hips opening toward the ceiling. Keep both hips level." },
    "backpack-single-leg-rdl": { m: ["hamstrings", "glutes"], s: ["lowerback"],
      yt: "single leg RDL",
      steps: ["Hold a loaded bag.", "Hinge on one leg, back leg reaching long.", "Return slowly."],
      mistake: "Rushing and wobbling. Slow is harder and safer." },
    "paused-deadlift": { m: ["hamstrings", "glutes"], s: ["lowerback", "forearms", "quads"],
      yt: "paused deadlift",
      steps: ["Pull like a normal deadlift.", "Pause 1 second just below the knee.", "Finish the lift."],
      mistake: "Losing back position in the pause. Stay braced." },
    "assisted-nordic-curl": { m: ["hamstrings"], s: ["glutes"],
      yt: "assisted nordic curl",
      steps: ["Heels held down.", "Lower as slowly as you can.", "Push off the floor with your hands to help back up."],
      mistake: "Bending at the hips. Keep them straight." },
    "nordic-curl-midrange-hold": { m: ["hamstrings"], s: ["glutes"],
      yt: "nordic curl isometric hold",
      steps: ["Lower halfway.", "Hold 2 seconds.", "Lower the rest of the way slowly."],
      mistake: "Hips bending in the hold. Stay straight." },
    "bodyweight-calf-raise": { m: ["calves"], s: [],
      yt: "calf raise",
      steps: ["Both feet on the floor or a step edge.", "Rise up high.", "Lower for 3 seconds."],
      mistake: "Bouncing. Slow down." },
    "single-leg-dumbbell-calf-raise": { m: ["calves"], s: [],
      yt: "single leg calf raise",
      steps: ["One foot on a plate, dumbbell in the same-side hand.", "Lower for 3 seconds.", "Rise as high as you can."],
      mistake: "Knee bending to help. Keep the leg straight." },
    "step-calf-raise": { m: ["calves"], s: [],
      yt: "step calf raise",
      steps: ["Balls of your feet on a step.", "Lower heels to a full stretch.", "Rise high. Single-leg when easy."],
      mistake: "Short range. Full stretch every rep." },
    "seated-bodyweight-calf-raise": { m: ["calves"], s: [],
      yt: "seated calf raise",
      steps: ["Sit, feet flat.", "Press down on your knees with your hands.", "Rise onto your toes, lower slowly."],
      mistake: "Pressing too lightly. Push down hard." },
    "single-leg-seated-calf-raise": { m: ["calves"], s: [],
      yt: "single leg seated calf raise",
      steps: ["Sit, one foot on a plate.", "Dumbbell on that knee.", "Rise and lower slowly."],
      mistake: "Short range. Full stretch at the bottom." },
    "backpack-seated-calf-raise": { m: ["calves"], s: [],
      yt: "seated calf raise",
      steps: ["Sit with a loaded bag on your knees, toes on a book.", "Rise up high.", "Lower slowly."],
      mistake: "Too light to feel. Load the bag." },
    "farmer-hold": { m: ["forearms", "traps"], s: ["abs"],
      yt: "farmer hold",
      steps: ["Pick up the dumbbells like a deadlift.", "Stand tall, shoulders down.", "Hold still."],
      mistake: "Shrugging. Shoulders down." },
    "dumbbell-front-rack-carry": { m: ["abs", "upperback"], s: ["shoulders", "forearms"],
      yt: "dumbbell front rack carry",
      steps: ["Dumbbells resting on your shoulders, elbows forward.", "Stand tall, ribs down.", "Walk slowly."],
      mistake: "Leaning back. Stay stacked." },
    "backpack-stair-carry": { m: ["quads", "glutes"], s: ["forearms", "traps", "calves"],
      yt: "weighted stair climb",
      steps: ["Loaded bag on your back or in your hands.", "Walk up the stairs at a steady pace.", "Walk down carefully."],
      mistake: "Running down. Always walk down." },
    "suitcase-hold": { m: ["obliques", "forearms"], s: ["traps"],
      yt: "suitcase hold",
      steps: ["One dumbbell in one hand.", "Stand tall, don't lean.", "Hold, then switch."],
      mistake: "Leaning away from the weight." },
    "single-arm-overhead-carry": { m: ["shoulders", "obliques"], s: ["upperback", "abs"],
      yt: "single arm overhead carry",
      steps: ["Press one dumbbell overhead, arm locked.", "Ribs down.", "Walk slowly."],
      mistake: "Bent elbow or arched back. Go lighter." },
    "snap-down": { m: ["quads", "glutes"], s: ["calves"],
      yt: "snap down drill",
      steps: ["Rise onto your toes, arms up.", "Snap down into a quarter squat, arms back.", "Land quietly and hold."],
      mistake: "Landing loud and stiff. Absorb it." },
    "lateral-step-and-stick": { m: ["glutes", "adductors"], s: ["quads"],
      yt: "lateral bound and stick",
      steps: ["Stand on one leg.", "Take a big step sideways onto the other.", "Land and hold 2 seconds."],
      mistake: "Knee caving on landing." },
    "continuous-skater-bound": { m: ["glutes", "quads"], s: ["adductors", "calves"],
      yt: "skater bounds",
      steps: ["Bound side to side.", "Land and go without pausing.", "Stay low and controlled."],
      mistake: "Wild landings. Stay balanced." },
    "single-leg-pogo-hop": { m: ["calves"], s: ["quads"],
      yt: "single leg pogo hops",
      steps: ["Stand on one leg.", "Small, quick hops on the ball of the foot.", "Stiff ankle, short contacts."],
      mistake: "Trying before the Achilles is quiet. Earn it with two-leg pogos." },
    "dumbbell-hang-high-pull": { m: ["traps", "glutes"], s: ["shoulders", "hamstrings"],
      yt: "dumbbell high pull",
      steps: ["Dumbbell at your thighs, slight hinge.", "Snap your hips.", "Pull your elbow high and to the side."],
      mistake: "Arm pulling before the hips snap." },
    "alternating-dumbbell-snatch": { m: ["glutes", "hamstrings", "shoulders"], s: ["traps", "quads", "abs"],
      steps: ["Snatch with one hand.", "Lower and switch hands at the bottom.", "Keep it smooth."],
      mistake: "Rushing so form breaks. Smooth beats fast." },
    "triple-broad-jump": { m: ["glutes", "hamstrings", "quads"], s: ["calves"],
      yt: "triple broad jump",
      steps: ["Broad jump.", "Rebound into a second, then a third.", "Stick the last landing."],
      mistake: "Short, choppy jumps. Each should be big." },
    "two-step-jump": { m: ["quads", "glutes", "calves"], s: [],
      yt: "stair jumps",
      steps: ["Face the stairs.", "Jump up two large steps.", "Land softly, walk back down."],
      mistake: "Jumping down. Always walk down." },
    "feet-assisted-hang": { m: ["forearms", "lats"], s: ["shoulders"],
      yt: "assisted dead hang",
      steps: ["Toes on a bench under the bar.", "Hang with some weight taken by your feet.", "Shoulders gently pulled down."],
      mistake: "Resting fully on your feet. Let your arms take most of it." },
    "single-leg-tibialis-raise": { m: ["shins"], s: [],
      yt: "tibialis raise",
      steps: ["Back against a wall, one foot forward.", "Lift the toes high.", "Lower slowly."],
      mistake: "Bending the knee. Keep it straight." },
    "backpack-stair-step-up": { m: ["quads", "glutes"], s: ["calves"],
      yt: "weighted step up",
      steps: ["Loaded bag on your back.", "Whole foot on a high step.", "Drive up through the heel, lower slowly."],
      mistake: "Pushing off the bottom foot." },

    // Conditioning and running
    "strides": { m: ["hamstrings", "calves", "glutes"], s: ["quads"],
      yt: "running strides",
      steps: ["Build to fast but relaxed over 15–20 seconds.", "Tall posture, drive your arms.", "Walk back to recover."],
      mistake: "Sprinting flat out. Strides are fast and relaxed." },
    "long-run": { m: ["quads", "calves"], s: ["glutes", "hamstrings"],
      yt: "long run easy pace",
      steps: ["Start slower than feels necessary.", "Stay conversational: full sentences the whole way.", "Take water if it's over an hour or hot.", "Walk breaks are fine; the distance is the point, not the pace."],
      mistake: "Running it at tempo pace. Easy is the whole point." },
    "easy-run": { m: ["quads", "calves"], s: ["glutes", "hamstrings"],
      yt: "easy run pace",
      steps: ["Run tall, shoulders relaxed.", "Short, quick steps under your hips.", "Slow down if you can't speak in full sentences."],
      mistake: "Running easy days too fast." },
    "tempo": { m: ["quads", "calves"], s: ["glutes", "hamstrings"],
      yt: "tempo run",
      steps: ["Warm up 10 minutes easy.", "Run comfortably hard: a few words at a time.", "Hold an even pace, then cool down."],
      mistake: "Starting too fast and fading." },
    "five-k-time-trial": { m: ["quads", "calves", "hamstrings"], s: ["glutes"],
      yt: "5k race pacing",
      steps: ["Warm up well.", "Run the first kilometre slightly slower than you think you can.", "Hold even through the middle, empty the tank at the end."],
      mistake: "Going out too fast." },
    "basketball": { m: ["quads", "calves", "glutes"], s: ["adductors", "hamstrings", "shoulders"],
      yt: "basketball conditioning",
      steps: ["Warm up before you play.", "Land jumps softly, knees over toes.", "Count it as a hard day: it replaces that rotation's quality run, never the long run.", "Not the day after Lower B: sore hamstrings and sprinting don't mix."],
      mistake: "Playing cold. Warm up first." },
    "bike-or-incline-walk": { m: ["quads", "glutes"], s: ["calves", "hamstrings"],
      yt: "incline treadmill walk",
      steps: ["Steady pace for 20–40 minutes.", "Slightly out of breath, still able to talk.", "Don't hold the rails on the treadmill."],
      mistake: "Holding the treadmill rails, which takes away most of the work." },
    "stair-session": { m: ["quads", "glutes", "calves"], s: ["hamstrings"],
      yt: "stair climbing workout",
      steps: ["Walk or jog up at a steady rhythm.", "Walk down carefully.", "Repeat for 20–30 minutes."],
      mistake: "Running down the stairs. Walk down." },
  },

  // ---------------------------------------------------- the old app's ids
  // Logs from the earlier apps keep their own exercise ids. Each id here says
  // which plan exercise it counts as (`to`), matched by movement where the
  // weight carries over; `to: null` keeps the log but leaves it out of this
  // plan, with the reason; `skip` hides timed workouts and runs from the list.
  // Ids not listed count as the plan exercise with the same id, if there is one.
  legacyIds: {
    "hanging-knee-raises": { to: "hanging-knee-raise", name: "Hanging knee raises" },
    "standing-dumbbell-shoulder-press": { to: "standing-dumbbell-overhead-press", name: "Standing dumbbell shoulder press" },
    "pull-ups": { to: "pull-up", name: "Pull-ups" },
    "lateral-raises": { to: "dumbbell-lateral-raise", name: "Lateral raises" },
    "rear-delt-fly": { to: "rear-delt-dumbbell-raise", name: "Rear-delt fly" },
    "single-leg-calf-raise": { to: "single-leg-dumbbell-calf-raise", name: "Single-leg calf raise" },
    "cable-overhead-triceps-extension": { to: "overhead-cable-extension", name: "Cable overhead triceps extension" },
    "one-arm-dumbbell-snatch": { to: "single-arm-dumbbell-snatch", name: "One-arm dumbbell snatch" },
    "pull-up-attempt-2-negatives": { to: "pull-up-attempt", name: "Pull-up attempt + 2 negatives" },
    "barbell-back-squat": { to: null, name: "Barbell back squat", why: "Free barbell; the plan squats on the Smith machine, so the weights don't match." },
    "barbell-bench-press": { to: null, name: "Barbell bench press", why: "Barbell; the plan uses dumbbells, weighed per hand." },
    "barbell-overhead-press": { to: null, name: "Barbell overhead press", why: "Barbell; the plan presses dumbbells, weighed per hand." },
    "barbell-bent-over-row": { to: null, name: "Barbell bent-over row", why: "Barbell; the plan rows one dumbbell at a time." },
    "barbell-hip-thrust": { to: null, name: "Barbell hip thrust", why: "Not in this plan: deadlifts and Romanian deadlifts train the same hips." },
    "goblet-squat": { to: null, name: "Goblet squat", why: "Not in this plan: the Smith squat replaced it." },
    "dumbbell-walking-lunges": { to: null, name: "Dumbbell walking lunges", why: "Not in this plan: Bulgarian split squats and lateral lunges cover it." },
    "dumbbell-calf-raises": { to: null, name: "Dumbbell calf raises", why: "Standing two-leg raise; the plan loads calves on the Smith machine or seated." },
    "hammer-curl-triceps-extension": { to: null, name: "Hammer curl + triceps extension", why: "One weight for two exercises, so it can't stand for either." },
    "half-kneeling-one-arm-dumbbell-press": { to: null, name: "Half-kneeling one-arm dumbbell press", why: "One arm at a time; not the same load as the two-arm standing press." },
    "incline-dumbbell-curl": { to: null, name: "Incline dumbbell curl", why: "Not in this plan: hammer curls train the arms." },
    "seated-leg-curl": { to: null, name: "Seated leg curl", why: "Machine; the plan trains hamstrings with bodyweight Nordic curls." },
    "explosive-push-up": { to: null, name: "Explosive push-up", why: "Not in this plan." },
    "hollow-hold": { to: null, name: "Hollow hold", why: "Not in this plan: Pallof presses and knee raises cover the core." },
    "plank": { to: null, name: "Plank", why: "Not in this plan: side planks and Pallof presses cover the core." },
    "emom-burpee-shuffle": { to: null, skip: true },
    "emom-burpees-lateral-shuffle": { to: null, skip: true },
    "hrx-style-emom": { to: null, skip: true },
    "amrap-clean-thruster-shoulder-tap": { to: null, skip: true },
    "21-15-9-dumbbell-swing-sit-up": { to: null, skip: true },
    "intervals-400": { to: null, skip: true },
    "intervals-800": { to: null, skip: true },
    "400-m-repeats": { to: null, skip: true },
    "800-m-repeats": { to: null, skip: true },
    "long-easy-run": { to: null, skip: true },
    "fartlek-run": { to: null, skip: true },
    "run-with-1-minute-surges": { to: null, skip: true },
    "five-ten-five-shuttle": { to: null, skip: true },
    "5-10-5-shuttle": { to: null, skip: true },
    "defensive-slide": { to: null, skip: true },
  },

  // ---------------------------------------------------------- pull-up ladder
  // Starts at level 1 (pullUpMax 0). The A list is used in Upper A, B in Upper B.
  // Max test at every checkpoint. Logs from the old app keep these ids.
  // Levels 1–2: negatives train the lowering only, so Upper B adds a concentric pull
  // (foot-assisted pull-ups) for the sticking point out of the dead hang.
  ladder: [
    {
      level: 1, name: "Negatives",
      a: [{ ex: "negative-pull-up", sets: 4, reps: [3, 3], tempo: "5-s lower", rest: 90 }],
      b: [
        { ex: "scap-pull-up", sets: 1, reps: [6, 8], rest: 60 },
        { ex: "foot-assisted-pull-up", sets: 3, reps: [5, 8], tempo: "3-s lower", rest: 90, note: "Getting easy: heels only, then feet on a bench." },
      ],
      pass: "3 × 3 negatives, each lowered over 5 s, the last one still slow.",
    },
    {
      level: 2, name: "Slow negatives",
      a: [{ ex: "negative-pull-up", sets: 4, reps: [3, 3], tempo: "8–10-s lower", rest: 90 }],
      b: [
        { ex: "scap-pull-up", sets: 1, reps: [6, 8], rest: 60 },
        { ex: "foot-assisted-pull-up", sets: 3, reps: [5, 8], tempo: "3-s lower", rest: 90, note: "Getting easy: heels only, then feet on a bench." },
      ],
      pass: "3 × 3 negatives at 10 s each.",
    },
    {
      level: 3, name: "First rep",
      a: [{ ex: "pull-up-attempt", sets: 4, reps: [1, 1], rest: 120 }],
      b: [{ ex: "negative-pull-up", sets: 3, reps: [3, 3], tempo: "5-s lower", rest: 90 }],
      pass: "3 strict pull-ups in one session. Singles are fine.",
    },
    {
      level: 4, name: "Sets",
      a: [{ ex: "pull-up", sets: 5, reps: [2, 3], rest: 120, note: "Add a rep to one set each session." }],
      b: [
        { ex: "pull-up", sets: 3, reps: [2, 2], rest: 120 },
        { ex: "negative-pull-up", sets: 1, reps: [1, 1], tempo: "10-s lower", rest: 0 },
      ],
      pass: "3 × 5 strict pull-ups.",
    },
    {
      level: 5, name: "Toward 10",
      a: [{ ex: "pull-up", sets: 4, reps: [5, 7], rest: 120 }],
      b: [{ ex: "pull-up", sets: 3, reps: [1, 3], rest: 90, note: "Ladder: 1, 2, 3 reps with short rests, 3 times." }],
      pass: "10 strict pull-ups in a row.",
    },
    {
      level: 6, name: "Keep it",
      a: [{ ex: "weighted-pull-up", sets: 4, reps: [4, 6], rest: 150 }],
      b: [{ ex: "pull-up", sets: 3, reps: [6, 8], rest: 120, note: "About 2 short of your max." }],
      pass: null,
    },
  ],

  // ------------------------------------------------------------ jump blocks
  // Each block lasts 6 weeks (one checkpoint to the next). Move up only if the
  // Achilles rule is met; otherwise repeat the block. Low volume on purpose:
  // small doses work about as well as large ones for recreational athletes.
  jumpBlocks: [
    {
      block: 1, weeks: "1–6", focus: "Learn to land",
      LA: { ex: "squat-jump", sets: 3, reps: [3, 3], rest: 75 },
      LB: { ex: "broad-jump", sets: 3, reps: [3, 3], rest: 75 },
    },
    {
      block: 2, weeks: "7–12", focus: "Rebound and side-to-side",
      LA: { ex: "continuous-squat-jump", sets: 3, reps: [3, 3], rest: 90 },
      LB: { ex: "skater-bound", sets: 3, reps: [3, 3], perSide: true, rest: 75 },
    },
    {
      block: 3, weeks: "13+", focus: "Springy ankles and full-body power",
      LA: { ex: "pogo-hop", sets: 2, reps: [10, 10], rest: 60, then: { ex: "squat-jump", sets: 2, reps: [3, 3], rest: 75 } },
      LB: { ex: "single-arm-dumbbell-snatch", sets: 3, reps: [3, 3], perSide: true, rest: 90, alt: "double-broad-jump" },
    },
  ],

  // ---------------------------------------------------------------- sessions
  // Each full session fits 50 min (Short: 30 min). byLoad: the rep range follows the
  // dumbbell weight (rules.dumbbellBands); `reps` is the range at the starting weight.
  // slowFirst: at the top of the range, one session of 3-s lowers before the next dumbbell.
  // optional: done only when there's time; the note says when.
  sessions: {
    UA: {
      name: "Upper A", kind: "upper", focus: "Horizontal press, pull-ups",
      items: [
        { slot: "ladder", list: "a", role: "main" },
        { ex: "dumbbell-bench-press", role: "main", sets: 3, reps: [6, 10], byLoad: true, rest: 120, start: { kg: 12.5, note: "per hand" } },
        { ex: "smith-machine-inverted-row", role: "accessory", sets: 3, reps: [8, 12], rest: 90, start: { note: "bar at hip height" } },
        { ex: "kneeling-cable-lat-pulldown", role: "accessory", sets: 3, reps: [6, 10], rest: 60, pair: "b", note: "Stop 1–2 reps short of failure.", start: { note: "light" } },
        { ex: "hammer-curl", role: "accessory", sets: 2, reps: [10, 15], rest: 60, pair: "a", start: { kg: 7.5, note: "per hand" } },
        { ex: "cable-rope-pushdown", role: "accessory", sets: 2, reps: [10, 15], rest: 60, pair: "a", start: { note: "light" } },
        { ex: "pallof-press", role: "core", sets: 2, reps: [10, 10], perSide: true, rest: 45, pair: "b", start: { note: "light" } },
      ],
    },
    UB: {
      name: "Upper B", kind: "upper", focus: "Overhead press, pull-ups",
      items: [
        { slot: "ladder", list: "b", role: "main" },
        { ex: "standing-dumbbell-overhead-press", role: "main", sets: 3, reps: [8, 15], byLoad: true, rest: 120, start: { kg: 7.5, note: "per hand" } },
        { ex: "one-arm-dumbbell-row", role: "accessory", sets: 3, reps: [8, 12], perSide: true, rest: 90, start: { kg: 15 } },
        { ex: "incline-dumbbell-press", role: "accessory", sets: 2, reps: [8, 15], byLoad: true, rest: 90, pair: "b", start: { kg: 10, note: "per hand" } },
        { ex: "dumbbell-lateral-raise", role: "accessory", sets: 2, reps: [12, 20], slowFirst: true, rest: 60, pair: "a", start: { kg: 5, note: "per hand" } },
        { ex: "cable-face-pull", role: "accessory", sets: 2, reps: [12, 15], rest: 60, pair: "a", start: { note: "light" } },
        { ex: "hanging-knee-raise", role: "core", sets: 2, reps: [8, 12], rest: 90, pair: "b" },
      ],
    },
    // Lower days put the calf raises third, so the Short version (first 3 stations, a superset
    // counting as one) always keeps the Achilles work. Single-leg quad volume was trimmed
    // instead: squats, jumps, running and basketball already load it.
    LA: {
      name: "Lower A", kind: "lower", focus: "Squat, jump, calves",
      items: [
        { slot: "jump", role: "jump" },
        { ex: "smith-machine-back-squat", role: "main", sets: 3, reps: [5, 8], rest: 150, start: { kg: 40, note: "added to the bar" } },
        { ex: "smith-calf-raise", role: "accessory", sets: 3, reps: [6, 10], tempo: "3 s up, 3 s down", rest: 60, pair: "a", note: "Same Smith bar as the squat.", start: { kg: 40 } },
        { ex: "copenhagen-side-plank", role: "core", sets: 2, sec: [15, 20], perSide: true, rest: 60, pair: "a" },
        { ex: "dumbbell-romanian-deadlift", role: "accessory", sets: 3, reps: [8, 12], rest: 90, start: { kg: 15, note: "per hand" } },
        { ex: "bulgarian-split-squat", role: "accessory", sets: 2, reps: [8, 10], perSide: true, rest: 75, start: { kg: 7.5, note: "per hand" } },
        { ex: "farmer-carry", role: "carry", sets: 2, sec: [40, 50], rest: 60, optional: true, note: "Only if you're under about 42 minutes; otherwise skip it.", start: { kg: 20, note: "per hand" } },
      ],
    },
    LB: {
      name: "Lower B", kind: "lower", focus: "Hinge, jump, calves",
      items: [
        { slot: "jump", role: "jump" },
        { ex: "barbell-deadlift", role: "main", sets: 3, reps: [5, 6], rest: 150, start: { kg: 62.5, note: "total" } },
        { ex: "nordic-hamstring-curl", role: "accessory", sets: 3, reps: [3, 5], rest: 75, pair: "a" },
        { ex: "seated-dumbbell-calf-raise", role: "accessory", sets: 3, reps: [10, 15], rest: 75, pair: "a", start: { kg: 15 } },
        { ex: "dumbbell-lateral-lunge", role: "accessory", sets: 2, reps: [8, 8], perSide: true, rest: 75, start: { kg: 7.5 } },
        { ex: "suitcase-carry", role: "carry", sets: 2, sec: [30, 45], perSide: true, rest: 45, start: { kg: 15 } },
      ],
    },
  },

  // Short version: the first N stations of any session (a superset pair counts as one
  // station), at this many work sets.
  short: { items: 3, sets: 2, note: "First 3 exercises (a superset counts as one), 2 sets each. Under 30 minutes." },

  // ------------------------------------------------------------- busy mode
  // 2–3 full-body sessions of about 40 min plus 1 run. Its own rotation;
  // turning busy mode off resumes the main rotation where it stopped.
  busy: {
    rotation: ["FB1", "FB2", "FB3"],
    runsPerWeek: 1,
    sessions: {
      FB1: {
        name: "Full body 1", kind: "full",
        items: [
          { ex: "squat-jump", role: "jump", sets: 3, reps: [3, 3], rest: 75 },
          { ex: "smith-machine-back-squat", role: "main", sets: 3, reps: [5, 8], rest: 150 },
          { slot: "ladder", list: "a", role: "main" },
          { ex: "dumbbell-bench-press", role: "accessory", sets: 3, reps: [6, 10], byLoad: true, rest: 90 },
          { ex: "smith-calf-raise", role: "accessory", sets: 2, reps: [6, 10], tempo: "3 s up, 3 s down", rest: 60 },
        ],
      },
      FB2: {
        name: "Full body 2", kind: "full",
        items: [
          { ex: "broad-jump", role: "jump", sets: 3, reps: [3, 3], rest: 75 },
          { ex: "barbell-deadlift", role: "main", sets: 3, reps: [5, 5], rest: 150 },
          { ex: "standing-dumbbell-overhead-press", role: "main", sets: 3, reps: [8, 15], byLoad: true, rest: 120 },
          { ex: "one-arm-dumbbell-row", role: "accessory", sets: 2, reps: [8, 12], perSide: true, rest: 60 },
          { ex: "suitcase-carry", role: "carry", sets: 2, sec: [30, 45], perSide: true, rest: 60 },
        ],
      },
      FB3: {
        name: "Full body 3", kind: "full",
        items: [
          { ex: "bulgarian-split-squat", role: "accessory", sets: 3, reps: [8, 10], perSide: true, rest: 90 },
          { slot: "ladder", list: "b", role: "main" },
          { ex: "incline-dumbbell-press", role: "accessory", sets: 2, reps: [8, 15], byLoad: true, rest: 90 },
          { ex: "nordic-hamstring-curl", role: "accessory", sets: 2, reps: [3, 5], rest: 90 },
          { ex: "smith-calf-raise", role: "accessory", sets: 3, reps: [6, 10], rest: 45, pair: "a" },
          { ex: "pallof-press", role: "core", sets: 2, reps: [10, 10], perSide: true, rest: 45, pair: "a" },
        ],
      },
    },
  },

  // ------------------------------------------------------------- no-gym mode
  // Each item swaps to its exercise's swaps.none. Extras are added to the end
  // of the session. Jumps in no-gym mode use step-jump / broad-jump until
  // jump block 2; stair hops (pogo on a stair) only from block 3.
  noGym: {
    extras: {
      lower: [{ ex: "tibialis-raise", role: "accessory", sets: 2, reps: [15, 20], rest: 45 }],
      upper: [],
    },
    loadTip: "Make bodyweight work harder with a slower lower (3–4 s), a pause, or a loaded backpack.",
  },

  // ----------------------------------------------------------------- running
  // Two runs per rotation. Strava records them; Uptime only says what today's run is (one
  // line) and takes one tap for Done. An optional line like "10k 52:30" updates the paces
  // and nothing else.
  // - The Run slot is the quality run: tempo and intervals take turns. A basketball game
  //   takes its place that rotation (it's already a hard day).
  // - The sport/conditioning slot is the long easy run by default (other easy cardio when a
  //   long run doesn't fit). A game never replaces the long run.
  // The long run follows a 30-day rule: never more than 10% beyond the longest run of the
  // last 30 days (large single-run spikes went with more injuries in a 5,205-runner cohort).
  run: {
    perRotation: 1, // quality runs per rotation; the long run fills the sport/conditioning slot
    cycle: ["tempo", "interval"], // the quality run alternates
    busy: "tempo", // Busy mode: one tempo run, cycle untouched
    names: { interval: "Intervals", tempo: "Tempo run", long: "Long easy run", easy: "Easy run", shakeout: "Easy shakeout", race: "Race day" },
    warmup: "10 min easy jog and 4 strides first.",
    // Paces come from your latest time line, turned into a 5K-equivalent with
    // Riegel's formula (T2 = T1 × (d2/d1)^1.06). Seconds per km.
    paces: {
      riegel: 1.06,
      tempoOffset: 15,      // 5K pace + 15 s/km: comfortably hard
      easyOffset: [75, 100], // 5K pace + 75–100 s/km: full sentences
      // Riegel assumes you're trained for the distance; on low mileage its 21K pace is a ceiling.
      halfCeiling: "Riegel's half-marathon pace assumes big mileage: treat it as the fastest you'd go, not a target.",
    },
    // reps × distance at a race pace; `at`: "5k" | "10k" | "21k" | "tempo"
    interval: {
      // Starts at 4 × 800 m and adds a rep every second interval session, up to 6.
      // More than `resetDays` since the last interval session: back to the start.
      base: { reps: [4, 6], addEvery: 2, resetDays: 30, dist: "800 m", at: "5k", jog: "2 min jog between" },
      "5k": { reps: [4, 6], addEvery: 2, resetDays: 30, dist: "800 m", at: "5k", jog: "2 min jog between" },
      "10k": { text: "5 × 1 km", at: "10k", jog: "90 s jog between" },
      "21k": { text: "3 × 2 km", at: "21k", jog: "2 min jog between" },
      taper: { text: "4 × 400 m", jog: "full recovery" }, // at race pace
    },
    tempo: {
      base: { text: "20 min", at: "tempo" },
      "5k": { text: "20 min", at: "tempo" },
      "10k": { text: "2 × 12 min", at: "10k", jog: "2 min easy between" },
      "21k": { text: "30 min", at: "21k" },
      taper: { text: "10 min" }, // at race pace
    },
    long: {
      startKm: 8,
      growth: 0.1,       // at most 10% beyond the longest run of the last `lookbackDays`
      lookbackDays: 30,
      maxStepKm: 1,      // and never more than 1 km at a time
      roundKm: 0.5,      // distances round down to the half km (8 → 8.5 → 9 → 9.5 → 10 → 11)
      repeatAfterDays: 14, // last long run over 14 days ago: repeat its distance
      backOffKm: 2,      // nothing in the last 30 days: start 2 km below the last one
      // Normal weeks cap the long run at 10–12 km and about 70 min at easy pace:
      // the slower you are, the closer to 10 km. Only race mode goes beyond.
      capKm: [10, 12],
      capMin: 70,
    },
    easyMinutes: [30, 40], // the extra easy run in a 21K build
    shakeout: "20–30 min easy + 4 strides",
    // Optional race mode. Weeks before the race lean toward its distance, then taper.
    race: {
      distances: { "5k": 5, "10k": 10, "21k": 21.1 },
      buildDays: { "5k": 56, "10k": 70, "21k": 84 }, // the last 8, 10, 12 weeks
      taperDays: { "5k": 7, "10k": 10, "21k": 14 },
      raceWeekDays: 6, // last 6 days: only easy shakeouts in the run slot
      longMaxKm: { "5k": null, "10k": 15, "21k": 18 }, // null: the normal cap
      longStepKm: 1,
      taperLongFactor: 0.6, // taper long run ≈ 60% of the longest
      liftShortInTaper: true,
      // A 21K build trades one lift for a third run: Upper A, one Lower (A and B take turns),
      // Upper B, plus an easy run. One strength session a week maintains strength and power,
      // so this holds for 12 weeks. Won't run three times a week? Race a 10K instead.
      threeLifts: ["21k"],
    },
    timeNote: "Long runs go past the 50-minute cap: about 70 min in normal weeks, up to about 2 hours in a half-marathon build.",
    spacing: "No Lower the day before a long run or race. Avoid intervals or Lower the day after basketball when another option exists. No basketball or intervals the day after Lower B.",
  },

  // Fills the sport/conditioning slot when the long run doesn't fit. Basketball is listed
  // here for logging, but it fills the Run slot (fills: "run"): a game replaces the quality
  // run, never the long run.
  conditioning: {
    name: "Long run or conditioning",
    default: "long",
    options: [
      { ex: "easy-run", minutes: [30, 40], hard: false, fills: "long", note: "When there's no time for the long run." },
      { ex: "basketball", minutes: [60, 120], hard: true, fills: "run", note: "Replaces this rotation's quality run." },
      { ex: "bike-or-incline-walk", minutes: [30, 45], hard: false, fills: "long" },
      { ex: "stair-session", minutes: [20, 30], hard: false, fills: "long", note: "From jump block 2, if the Achilles is quiet." },
    ],
  },

  // Expected progress, shown as honest ranges. Seconds.
  timeline: {
    fiveK: {
      from: 1710,
      rows: [
        { week: 6, oneRun: [1665, 1695], withEasyRun: [1635, 1665] },
        { week: 12, oneRun: [1620, 1650], withEasyRun: [1575, 1605] },
        { week: 24, oneRun: [1560, 1605], withEasyRun: [1500, 1545] },
      ],
      // oneRun: Busy mode or game weeks (one run); withEasyRun: the normal plan (quality + long run).
      sub25: { oneRun: "about 9–12 months", withEasyRun: "about 5–7 months" },
      note: "With a quality run and a long run every rotation, the faster column is the realistic one. Busy weeks push it back; getting leaner pulls it forward.",
    },
    pullUps: [
      { milestone: "First strict rep", eta: "about 6–10 weeks" },
      { milestone: "5 reps", eta: "about 4–6 months" },
      { milestone: "10 reps", eta: "about 9–12 months" },
    ],
  },

  // ---------------------------------------------------------------- guidance
  guidance: {
    lean: {
      title: "Fit, not bulky",
      points: [
        "This plan builds strength and athleticism: low reps, few sets, jumps, carries and running. Getting bulky takes eating a large surplus on purpose, and this plan never asks for one.",
        "Muscle doesn't turn into fat. People look soft after stopping because they keep eating the same while moving less.",
        "Eat around maintenance, or about 300–500 kcal under it while you want to lean out. No bulking phases.",
        "Protein about 1.6–2 g per kg of bodyweight a day, spread over 3–4 meals. It keeps you full and keeps muscle while you lean out.",
        "Track your waist once a month rather than the scale every day. Waist up 2 cm or more with no strength gain: trim portions a little.",
        "Busy spell? A Minimum week (2 full-body sessions) plus your steps holds almost everything. Consistency beats intensity.",
      ],
    },
    steps: {
      target: [7000, 10000],
      floor: 6000,
      tip: "A 10-minute walk after meals is the easiest way to get there. It's a nudge, never a failure.",
    },
    sleep: { hours: [7, 9], tip: "After a short night, check in Okay or Rough and the app goes lighter." },
    rest: "At least 1 full rest day per rotation, and never 3 hard days in a row. No basketball or intervals the day after Lower B.",
    deload: "Every 6 weeks with the checkpoint, or sooner after 3 Rough check-ins in one rotation. Same exercises, about half the sets. Skipped when the 6 weeks were already light (a week off, or two Minimum or Busy weeks).",
    achilles: "Pain 3/10 or less that settles by the next morning is fine. More than that: jumps and intervals are swapped for one rotation. Every 6 weeks, compare single-leg heel raises side to side.",
  },

  // ------------------------------------------------------------------- fuel
  // Fat loss while training, built on normal Indian meals: home food or a mess.
  // Guidance only: no calorie or food tracking anywhere in the app.
  // Protein numbers are rough per serving so they're easy to remember.
  food: {
    intro: "Lean out slowly while you get stronger: a small, steady deficit, plenty of protein, and normal food you can keep eating for years.",
    protein: {
      perKg: [1.6, 2.0],     // g per kg bodyweight a day
      perMeal: [25, 40],     // g, over 3–4 meals
      fallbackKg: 70,        // used for the example until a bodyweight is logged
      why: "Protein keeps you full on less food and tells your body to keep muscle while fat comes off.",
    },
    rules: [
      { title: "A small deficit, not a diet", text: "Eat a little less than you burn: about one roti or one small katori of rice fewer a day, and fewer extras. Losing about 0.25–0.5% of bodyweight a week is the goal; faster costs strength." },
      { title: "Protein at every meal", text: "Build each meal around a protein first, then add the rest. 3–4 meals of 25–40 g gets most people to the target." },
      { title: "Half the plate is sabzi or salad", text: "Vegetables fill the plate for very few calories. Take the sabzi first and the second helping of it, not of rice." },
      { title: "Carbs around training", text: "Keep roti or rice in the meal before and after you train, so sessions stay strong. Trim them at the meals furthest from training." },
      { title: "Watch the hidden extras", text: "Sugar in chai, juices, cold drinks, fried snacks, sweets and oily gravies add up fast. Keep them to a few times a week, not a few times a day." },
      { title: "Drink water, salt after sweat", text: "Water through the day. After a sweaty session, salted buttermilk or nimbu paani does the job of an electrolyte drink." },
    ],
    // g of protein per everyday serving (approximate)
    sources: {
      veg: [
        { name: "Paneer", serving: "100 g (a palm-sized block)", g: 18 },
        { name: "Hung curd or Greek yogurt", serving: "1 bowl, 200 g", g: 18 },
        { name: "Soya chunks", serving: "30 g dry (1 katori cooked)", g: 15 },
        { name: "Tofu", serving: "100 g", g: 12 },
        { name: "Besan chilla", serving: "2 chillas (50 g besan)", g: 11 },
        { name: "Milk", serving: "1 glass, 250 ml", g: 8 },
        { name: "Curd (dahi)", serving: "1 katori, 200 g", g: 7 },
        { name: "Dal, rajma or chole", serving: "1 katori cooked", g: 7 },
        { name: "Sprouted moong", serving: "1 bowl, 100 g", g: 7 },
      ],
      nonVeg: [
        { name: "Chicken (breast or curry pieces)", serving: "100 g cooked meat", g: 27 },
        { name: "Fish", serving: "100 g cooked", g: 22 },
        { name: "Mutton", serving: "100 g cooked (fattier: keep to once or twice a week)", g: 25 },
        { name: "Eggs", serving: "2 whole eggs", g: 12 },
        { name: "Egg whites", serving: "4 whites", g: 14 },
      ],
      either: [
        { name: "Whey protein", serving: "1 scoop in water or milk", g: 24, note: "Handy within an hour after training, or when a meal is low. A supplement, not a must." },
      ],
    },
    // Plates by hand size, so they work at home and in a mess without weighing anything.
    plates: [
      { name: "Home thali", items: ["Half the plate: sabzi or salad", "A quarter: protein (paneer, chicken, eggs, or a big katori of dal with curd)", "A quarter: 2 rotis or 1 katori of rice", "A katori of curd or a glass of buttermilk on the side"] },
      { name: "Mess meal", items: ["Take the protein option first: paneer, egg, chicken, or a double serving of dal", "2 rotis instead of 4, or one serving of rice, not both piled high", "Fill up on sabzi and salad", "Add curd or buttermilk if it's there; skip the fried side most days"] },
      { name: "Breakfast", items: ["Eggs, paneer bhurji or besan chilla", "With 1–2 rotis, toast, or a bowl of poha or upma", "A glass of milk or a bowl of curd", "Poha or upma alone is light on protein: add curd, milk or whey"] },
      { name: "After training", items: ["A glass of milk or a scoop of whey", "With a banana or other fruit", "Then a normal meal within a couple of hours"] },
      { name: "Snack, if you're hungry", items: ["Fruit with curd", "Sprouts chaat", "A glass of buttermilk", "Boiled eggs or a paneer slice"] },
    ],
    checks: [
      "Look at your weekly average weight (Progress), not one day's number: daily weight swings 1–2 kg with water and salt.",
      "Weekly average steady for 3 weeks and the waist isn't moving: trim one more roti or one extra a day.",
      "Lifts dropping two weeks running and always tired: eat a little more, especially around training. Strength comes first.",
      "Exams or a packed week: eat at maintenance and keep protein up. Lean out again when life is calmer.",
    ],
    note: "Rough numbers to guide choices, not to count. If you have a medical condition, follow your doctor's advice first.",
  },

  // ------------------------------------------------------------------ learn
  // Short explainers: why the plan works the way it does. Plain words, a minute each.
  learn: [
    {
      id: "rotation", title: "Why the routine rotates",
      lead: "You never miss a session. The next one simply waits for you.",
      points: [
        "Strength sessions always go in the same order: Upper A, Lower A, Upper B, Lower B, then again. A missed day doesn't skip a session; the app shows the next one in line.",
        "Each rotation also has two runs: a quality run (tempo and intervals take turns) and a long easy run. A basketball game stands in for the quality run.",
        "A calendar plan breaks the first time life gets busy, and a broken plan is how people quit. A rotation bends instead.",
        "Upper and lower alternate, so training two days in a row is fine: one half rests while the other works.",
        "Progress is counted over the last 7 days, not Monday to Sunday, so there's no \"week is ruined\" moment.",
        "No catch-up: never cram missed sessions together. Doing the next one is enough.",
      ],
    },
    {
      id: "double-progression", title: "Double progression",
      lead: "Add reps first, then weight. That's the whole rule.",
      points: [
        "Each exercise has a rep range, like 5–8. Keep the same weight and add reps session by session.",
        "When every set reaches the top of the range, go up the smallest jump: 2.5 kg on squats and deadlifts, 1–2.5 kg on upper-body lifts, or the next dumbbell. Reps drop back to the bottom of the range.",
        "Light dumbbells jump a lot in one step, so presses use a wider range while they're light: up to 10 kg per hand 8–15 reps, 12.5–17.5 kg 6–10, from 20 kg 5–8. Lateral raises: 12–20, then a session of 3-second lowers before the next dumbbell.",
        "Most sets stop with 1–3 good reps left. You get stronger without grinding, and form stays clean.",
        "Two sessions in a row with no progress: drop about 10% and build back up, or switch rep range for a few weeks. Stalls are normal, not failure.",
        "The app does the maths: it prefills the weight and tells you when you've earned a jump.",
      ],
    },
    {
      id: "short-busy", title: "Short version and Busy mode",
      lead: "Something always beats nothing. Both modes exist so you never have to skip.",
      points: [
        "Short version: the first 3 exercises with 2 sets each, under 30 minutes (a superset counts as one). Pick it any day you're short on time or energy. Check in as Rough and the app suggests it.",
        "The first exercises are the main lifts, and on lower days the calf raises come third, so a Short session keeps the work that matters most, Achilles care included.",
        "Busy mode is for a stretch of weeks: exams, deadlines, travel. You get 2–3 full-body sessions of about 40 minutes plus one run.",
        "Your rotation waits while Busy mode is on, and carries on where it stopped when you turn it off.",
        "Two full-body sessions a week holds almost all of your strength and fitness for weeks. Busy weeks keep the streak alive.",
      ],
    },
    {
      id: "deloads", title: "Deloads",
      lead: "A planned easy week so you come back stronger, not worn down.",
      points: [
        "Every 6–8 weeks, or after 3 Rough check-ins within one rotation, do a deload: the same exercises at about half the sets.",
        "If the last 6 weeks were already light (a week or more off, or two Minimum or Busy weeks), the scheduled deload is skipped: life already gave you one. The tests still happen.",
        "Hard training builds fatigue faster than you notice. An easy week lets it clear, and strength usually shows up afterwards.",
        "Keep the weights about the same and do fewer sets. You keep the skill and the habit; the fatigue goes.",
        "The deload week is also the best time to test a pull-up max, compare single-leg heel raises side to side, or run a hard time line, because you're fresh.",
        "Coming back from a break works the same way: 7–13 days off starts at about 90%; 14 or more starts at 80% with a set fewer for the first week.",
      ],
    },
    {
      id: "running", title: "Two runs a rotation",
      lead: "One quality run for speed, one long easy run for endurance. That's what carries a 10K and a half.",
      points: [
        "Quality run: tempo and intervals take turns. Intervals start at 4 × 800 m and add a rep every second time, up to 6.",
        "Long run: starts at 8 km and grows by at most 10% over your longest run of the last 30 days, about 1 km at a time once you're at 10 km. Normal weeks stop at about 10–12 km, around 70 minutes.",
        "Last long run more than 2 weeks ago? Repeat that distance. Nothing for a month? Start 2 km lower.",
        "Basketball replaces the quality run that rotation, never the long run. It's already a hard day.",
        "A half-marathon build (race mode, last 12 weeks) adds an easy 30–40 min run, builds the long run to 18 km, and drops to three lifts: Upper A, one Lower (A and B take turns), Upper B.",
        "Long runs go past the 50-minute cap. That's the price of a half, and the plan says so honestly.",
      ],
    },
    {
      id: "achilles", title: "Achilles care",
      lead: "Jumps, intervals and basketball load the tendon. Slow, heavy calf raises build it back.",
      points: [
        "The calf raises sit third on both lower days, so even the Short version keeps them.",
        "Pain 3/10 or less that settles by next morning is fine. More than that, or stiffer next morning: easier jumps and tempo instead of intervals for one rotation.",
        "Every 6 weeks: single-leg heel raises to fatigue on each side. Left more than 10% behind? Do Lower A's calf raise single-leg, 3 × 6–10 slow, left first. It's a check, not a gate: training carries on either way.",
        "Ask your physio to clear you before jump block 3 (pogo hops) and before a half-marathon build.",
      ],
    },
    {
      id: "form", title: "Form cues",
      lead: "A few cues that apply to every lift, then the one cue that matters most for each main lift.",
      points: [
        "Brace before each rep: breathe in, tighten your stomach as if someone's about to poke it, then move.",
        "Control the lowering: about 2 seconds down. Fast up, slow down.",
        "Full range you can control. Stop the set when form changes, not when you can't move the weight.",
        "Leave 1–3 reps in the tank on most sets. Never grind main lifts to failure.",
        "Pain that's sharp, or more than 3/10 and not settled by next morning: swap the exercise for its easier option and tell a physio if it keeps happening.",
      ],
      // Exercise ids whose cue is shown under these points (cues live in `exercises`).
      exercises: ["smith-machine-back-squat", "barbell-deadlift", "dumbbell-bench-press", "standing-dumbbell-overhead-press", "pull-up", "negative-pull-up", "bulgarian-split-squat", "farmer-carry"],
    },
  ],
};

// Deep-freeze so no screen can mutate plan content by accident.
function freeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) freeze(v);
  }
  return o;
}

export const PLAN = freeze(plan);
export default PLAN;
