// Uptime training plan: the single source of plan content.
//
// The UI reads everything about *what* to train from here: exercises, cues,
// swaps, sessions, Short versions, the pull-up ladder, jump blocks, busy and
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
      "Basketball occasionally; football rarely.",
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
    repsInReserve: [1, 3],
    increments: {
      lowerMain: 2.5, // Smith squat, deadlift
      upperMain: [1, 2.5],
      dumbbell: "next dumbbell up",
      carry: "add 10 s per set up to 60 s, then the next dumbbell up and back to 40 s",
      calf: "add reps to the top of the range, then add load",
      jump: "3 × 3 → 4 × 3, then move to the next block",
    },
    stallSessions: 2,
    stallAdvice: "Two sessions without progress: drop about 10% and build back, or switch to the next rep range for 3 weeks.",
    deload: { everyDays: [42, 56], roughCheckInsPerRotation: 3, setsFactor: 0.5 },
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
      includes: ["pull-up-max-test", "deload"],
      why: "Test while fresh: the deload week is also the test week.",
    },
    achilles: {
      ok: "Pain 3/10 or less during the session that settles by the next morning.",
      flare: "More than that, or stiffer next morning: swap jumps for the jump's easier option, and the interval run for a tempo run, for one rotation. If it keeps happening, see your physio.",
      gatesJumpBlocks: true,
    },
  },

  warmup: {
    minutes: 5,
    general: [
      "2 min easy cardio: jog, bike, or skipping in place",
      "Leg swings, 10 each way",
      "Arm circles and band-free pull-aparts, 10 each",
      "10 slow calf raises",
    ],
    lowerExtra: ["5 bodyweight squats", "5 lateral lunges per side"],
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
      swaps: { easier: "seated-dumbbell-lateral-raise", harder: "cable-lateral-raise", none: "backpack-lateral-raise" },
    },

    // Upper: pull
    "smith-machine-inverted-row": {
      name: "Smith machine inverted row", kind: "pull",
      cue: "Body stiff as a plank, chest to the bar.",
      swaps: { easier: "chest-supported-dumbbell-row", harder: "feet-elevated-inverted-row", none: "towel-door-row" },
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
      swaps: { easier: "cable-lat-pulldown", harder: "negative-pull-up", none: "towel-door-row" },
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
      why: "Heavy, slow loading is the core of Achilles care and keeps it ready for jumps and speed.",
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
    "backpack-row": { name: "Backpack row", kind: "pull", cue: "Hinge forward, row the bag to your hip." },
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
    "tempo": { name: "Tempo run", kind: "run", cue: "Comfortably hard: a few words at a time." },
    "five-k-time-trial": { name: "5K time trial", kind: "run", cue: "Kept so old logs still have a name." },
    "basketball": { name: "Basketball", kind: "sport", cue: "Counts as hard conditioning." },
    "bike-or-incline-walk": { name: "Bike or incline walk", kind: "conditioning", cue: "Steady, slightly out of breath." },
    "stair-session": { name: "Stair session", kind: "conditioning", cue: "Walk or jog up, walk down, steady rhythm." },
  },

  // ---------------------------------------------------------- pull-up ladder
  // Starts at level 1 (pullUpMax 0). The A list is used in Upper A, B in Upper B.
  // Max test at every checkpoint. Logs from the old app keep these ids.
  ladder: [
    {
      level: 1, name: "Negatives",
      a: [{ ex: "negative-pull-up", sets: 4, reps: [3, 3], tempo: "5-s lower", rest: 90 }],
      b: [
        { ex: "dead-hang", sets: 2, sec: [30, 40], rest: 60 },
        { ex: "scap-pull-up", sets: 2, reps: [6, 8], rest: 60 },
      ],
      pass: "3 × 3 negatives, each lowered over 5 s, the last one still slow.",
    },
    {
      level: 2, name: "Slow negatives",
      a: [{ ex: "negative-pull-up", sets: 4, reps: [3, 3], tempo: "8–10-s lower", rest: 90 }],
      b: [
        { ex: "top-hold", sets: 3, sec: [10, 15], rest: 60 },
        { ex: "dead-hang", sets: 2, sec: [40, 45], rest: 60 },
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
  sessions: {
    UA: {
      name: "Upper A", kind: "upper", focus: "Horizontal press, pull-ups",
      items: [
        { slot: "ladder", list: "a", role: "main" },
        { ex: "dumbbell-bench-press", role: "main", sets: 3, reps: [5, 8], rest: 120, start: { kg: 12.5, note: "per hand" } },
        { ex: "smith-machine-inverted-row", role: "accessory", sets: 3, reps: [8, 12], rest: 90, start: { note: "bar at hip height" } },
        { ex: "half-kneeling-cable-pulldown", role: "accessory", sets: 2, reps: [10, 12], perSide: true, rest: 60, pair: "b", start: { note: "light" } },
        { ex: "hammer-curl", role: "accessory", sets: 2, reps: [10, 15], rest: 60, pair: "a", start: { kg: 7.5, note: "per hand" } },
        { ex: "cable-rope-pushdown", role: "accessory", sets: 2, reps: [10, 15], rest: 60, pair: "a", start: { note: "light" } },
        { ex: "pallof-press", role: "core", sets: 2, reps: [10, 10], perSide: true, rest: 45, pair: "b", start: { note: "light" } },
      ],
    },
    UB: {
      name: "Upper B", kind: "upper", focus: "Overhead press, pull-ups",
      items: [
        { slot: "ladder", list: "b", role: "main" },
        { ex: "standing-dumbbell-overhead-press", role: "main", sets: 3, reps: [5, 8], rest: 120, start: { kg: 7.5, note: "per hand" } },
        { ex: "one-arm-dumbbell-row", role: "accessory", sets: 3, reps: [8, 12], perSide: true, rest: 90, start: { kg: 15 } },
        { ex: "incline-dumbbell-press", role: "accessory", sets: 3, reps: [8, 12], rest: 90, pair: "b", start: { kg: 10, note: "per hand" } },
        { ex: "dumbbell-lateral-raise", role: "accessory", sets: 2, reps: [12, 15], rest: 60, pair: "a", start: { kg: 5, note: "per hand" } },
        { ex: "cable-face-pull", role: "accessory", sets: 2, reps: [12, 15], rest: 60, pair: "a", start: { note: "light" } },
        { ex: "hanging-knee-raise", role: "core", sets: 3, reps: [8, 12], rest: 90, pair: "b" },
      ],
    },
    LA: {
      name: "Lower A", kind: "lower", focus: "Squat, jump",
      items: [
        { slot: "jump", role: "jump" },
        { ex: "smith-machine-back-squat", role: "main", sets: 3, reps: [5, 8], rest: 150, start: { kg: 40, note: "added to the bar" } },
        { ex: "bulgarian-split-squat", role: "accessory", sets: 3, reps: [8, 10], perSide: true, rest: 90, start: { kg: 7.5, note: "per hand" } },
        { ex: "dumbbell-romanian-deadlift", role: "accessory", sets: 3, reps: [8, 12], rest: 90, start: { kg: 15, note: "per hand" } },
        { ex: "farmer-carry", role: "carry", sets: 2, sec: [40, 50], rest: 60, start: { kg: 20, note: "per hand" } },
        { ex: "smith-calf-raise", role: "accessory", sets: 3, reps: [6, 10], tempo: "3 s up, 3 s down", rest: 60, pair: "a", start: { kg: 40 } },
        { ex: "copenhagen-side-plank", role: "core", sets: 2, sec: [15, 20], perSide: true, rest: 45, pair: "a" },
      ],
    },
    LB: {
      name: "Lower B", kind: "lower", focus: "Hinge, jump",
      items: [
        { slot: "jump", role: "jump" },
        { ex: "barbell-deadlift", role: "main", sets: 3, reps: [5, 6], rest: 150, start: { kg: 62.5, note: "total" } },
        { ex: "dumbbell-lateral-lunge", role: "accessory", sets: 3, reps: [8, 8], perSide: true, rest: 90, start: { kg: 7.5 } },
        { ex: "nordic-hamstring-curl", role: "accessory", sets: 3, reps: [3, 5], rest: 90 },
        { ex: "suitcase-carry", role: "carry", sets: 3, sec: [30, 45], perSide: true, rest: 60, start: { kg: 15 } },
        { ex: "seated-dumbbell-calf-raise", role: "accessory", sets: 3, reps: [10, 15], rest: 45, start: { kg: 15 } },
      ],
    },
  },

  // Short version: first N items of any session, at this many work sets.
  short: { items: 3, sets: 2, note: "First 3 exercises, 2 sets each. Under 30 minutes." },

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
          { ex: "dumbbell-bench-press", role: "accessory", sets: 3, reps: [6, 10], rest: 90 },
          { ex: "farmer-carry", role: "carry", sets: 2, sec: [40, 60], rest: 60 },
        ],
      },
      FB2: {
        name: "Full body 2", kind: "full",
        items: [
          { ex: "broad-jump", role: "jump", sets: 3, reps: [3, 3], rest: 75 },
          { ex: "barbell-deadlift", role: "main", sets: 3, reps: [5, 5], rest: 150 },
          { ex: "standing-dumbbell-overhead-press", role: "main", sets: 3, reps: [5, 8], rest: 120 },
          { ex: "one-arm-dumbbell-row", role: "accessory", sets: 3, reps: [8, 12], perSide: true, rest: 60 },
          { ex: "suitcase-carry", role: "carry", sets: 2, sec: [30, 45], perSide: true, rest: 60 },
        ],
      },
      FB3: {
        name: "Full body 3", kind: "full",
        items: [
          { ex: "bulgarian-split-squat", role: "accessory", sets: 3, reps: [8, 10], perSide: true, rest: 90 },
          { slot: "ladder", list: "b", role: "main" },
          { ex: "incline-dumbbell-press", role: "accessory", sets: 3, reps: [8, 12], rest: 90 },
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
  // One run slot per rotation. Strava records the runs; Uptime only says what
  // today's run is (one line) and takes one tap for Done. An optional line like
  // "10k 52:30" updates the paces and nothing else.
  run: {
    perRotation: 1,
    // The run slot cycles so 5K speed, 10K/21K strength and endurance all stay maintained.
    cycle: ["interval", "tempo", "long"],
    busy: "tempo", // Busy mode: one tempo run, cycle untouched
    names: { interval: "Intervals", tempo: "Tempo run", long: "Long easy run", shakeout: "Easy shakeout", race: "Race day" },
    warmup: "10 min easy jog and 4 strides first.",
    // Paces come from your latest time line, turned into a 5K-equivalent with
    // Riegel's formula (T2 = T1 × (d2/d1)^1.06). Seconds per km.
    paces: {
      riegel: 1.06,
      tempoOffset: 15,      // 5K pace + 15 s/km: comfortably hard
      easyOffset: [75, 100], // 5K pace + 75–100 s/km: full sentences
    },
    // reps × distance at a race pace; `at`: "5k" | "10k" | "21k" | "tempo"
    interval: {
      base: { text: "6 × 800 m", at: "5k", jog: "2 min jog between" },
      "5k": { text: "6 × 800 m", at: "5k", jog: "2 min jog between" },
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
      stepKm: 1,       // each long run adds 1 km...
      holdKm: [12, 14], // ...up to 12, then hold at 12–14 km
      backOffKm: 2,     // more than `gapDays` since the last long run: start 2 km lower
      gapDays: 35,
    },
    shakeout: "20–30 min easy + 4 strides",
    // Optional race mode. Weeks before the race lean toward its distance, then taper.
    race: {
      distances: { "5k": 5, "10k": 10, "21k": 21.1 },
      buildDays: { "5k": 56, "10k": 70, "21k": 84 }, // the last 8, 10, 12 weeks
      taperDays: { "5k": 7, "10k": 10, "21k": 14 },
      raceWeekDays: 6, // last 6 days: only easy shakeouts in the run slot
      // In the build, 10K and 21K alternate a quality run with a long run.
      buildCycle: { "5k": ["interval", "tempo", "long"], "10k": ["interval", "long", "tempo", "long"], "21k": ["interval", "long", "tempo", "long"] },
      longMaxKm: { "5k": 12, "10k": 15, "21k": 19 },
      longStepKm: { "5k": 1, "10k": 1, "21k": 2 },
      taperLongFactor: 0.6, // taper long run ≈ 60% of the longest
      liftShortInTaper: true,
    },
    spacing: "No Lower the day before a long run or race; avoid intervals or Lower the day after basketball when another option exists.",
  },

  // Fills the sport slot in the rotation. Basketball when it happens;
  // otherwise any conditioning. Easy running is suggested first because it
  // is the quickest route to the 5K goal.
  conditioning: {
    name: "Sport or conditioning",
    options: [
      { ex: "easy-run", minutes: [30, 40], hard: false, recommended: true, note: "Best for the 5K goal." },
      { ex: "basketball", minutes: [60, 120], hard: true },
      { ex: "bike-or-incline-walk", minutes: [30, 45], hard: false },
      { ex: "stair-session", minutes: [20, 30], hard: false, note: "From jump block 2, if the Achilles is quiet." },
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
      sub25: { oneRun: "about 9–12 months", withEasyRun: "about 5–7 months" },
      note: "One run a week keeps you improving, but slowly. Easy runs in the conditioning slot roughly halve the time. Busy weeks push it back; getting leaner pulls it forward.",
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
    rest: "At least 1 full rest day per rotation, and never 3 hard days in a row.",
    deload: "Every 6 weeks with the checkpoint, or sooner after 3 Rough check-ins in one rotation. Same exercises, about half the sets.",
    achilles: "Pain 3/10 or less that settles by the next morning is fine. More than that: jumps and intervals are swapped for one rotation.",
  },
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
