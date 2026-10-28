# Belief Engine: 3D quality report (world-class visual pass)

This is the record of the visual pass that followed the 3D rebuild. It covers:

* what was changed;
* how each change was checked;
* the frames that were looked at;
* the scores;
* what could not be verified here.

The standard the frames are judged against is `docs/3D_VISUAL_STANDARD.md` (an inked storybook diorama). The work plan is
`docs/3D_IMPLEMENTATION_PLAN.md`. Earlier reviews are in `docs/3d-rebuild/` (`VISUAL_QA.md`, `FINAL_REVIEW.md`).

**Where this was run.** A Linux container with 4 CPU cores and no GPU. WebGL is SwiftShader, a software rasteriser, in headless Chromium.
Every frame below was rendered by the real game from an engine state played by a bot through the save format; none is a mock-up. Each frame
was opened and looked at by the developer (an AI agent) against the standard. That is a real inspection, but it is one reviewer's eye, not a
player's or an artist's.

## The iterations

### Iteration 0: where the pass started

At the start (commit `6aaa41d`), the same frames looked like this:

* the green was saturated, toy-like;
* there were no outlines;
* ambient light was flat, from a hemisphere light only;
* the houses had blank backs;
* there were no yards and no props;
* a few repeated tree shapes stood in open grass.

Before/after pairs from the same seed and camera:

* `docs/3d-rebuild/screenshots/wc/compare-A-overview.jpg`
* `docs/3d-rebuild/screenshots/wc/compare-B-closeup.jpg`
* `docs/3d-rebuild/screenshots/wc/compare-D-storm.jpg`
* `docs/3d-rebuild/screenshots/wc/compare-E-law.jpg`

### Iteration 1: the finishing chain switched on, and what the frames showed

This added the chain (`src/render3d/post.ts`) and sky light (`src/render3d/env.ts`):

* the scene renders into a half-float buffer with its depth;
* hollows are darkened by a depth-only ambient occlusion;
* a thin warm ink line is drawn on standing things;
* bloom is fed only by emitted light;
* ACES tone mapping and the sRGB encoding are applied once;
* FXAA follows;
* a pre-filtered procedural sky gives ambient light and soft reflections.

The first frames of the overview were **wrong**, and these were the defects found by looking at them:

1. **Washed-out sky, clouds and haze** (`wc/iter1-washed-out.jpg`). The sky, cloud sea and effects had been authored as screen colours and were
   never tone-mapped. One honest tone curve at the end now greyed them. Three.js also mixes fog in after its own tone mapping. The old look
   therefore depended on that order, and the fog came out brighter than before.
2. **Faction marks glowing like lamps.** Their white rims became very bright once compensated, and the bloom lit them.

Fixes:

* Colours authored for the screen go through an exact inverse of the tone curve while the chain draws, so they come out as authored. The
  inverse is computed from three.js's own ACES fit, and its round trip was checked numerically.
* The fog colour is converted the same way, to match three.js's ordering.
* The marks are held under white, so they never reach the glow threshold.
* The sky carries its own class code, so its compensated whites never trigger the brightness glow.

One gain was not aimed for: in the law-waking frame (`wc/compare-E-law.jpg`), the river under the ripples had been whited out, and now
it keeps its colour. The likely cause was not checked against the old build:

* Before, the additive ripples were drawn in screen colour and summed on the screen, where the sum clips to white.
* Now they are summed in the half-float buffer and tone-mapped once.

### Iteration 2: up close

The close-up (`wc/compare-B-closeup.jpg`) was right on the chain: roofs, trees, fences and people are inked; the grass and the ground's folds
are not. It also showed what the art pass had to fix:

* **A bug older than this pass.** Every window meant for a back wall had its wall distance negated, so it sat *inside the front wall*, and
  every house showed a blank back to a camera behind it. Fixed: back walls now have windows, and the window helper documents how back
  windows are given.
* **Bare yards.** There was nothing between the houses but grass. Now:
  * each home stands in trodden earth;
  * each has one or two of a woodpile, a hand cart, a washing line or a fenced kitchen garden, kept off doors, roads, water and fields;
  * windows are on the sides and backs;
  * tile roofs are terracotta, brick, glazed teal and umber;
  * the ground moved to the standard's sage and olive.

  These were checked from above in a top-down frame.

### Iteration 3: density, phones and people

* **Plain meadows** in the overview. Broken hedgerows now line the roadsides, a lone tree stands in open meadow now and then, and cypresses
  stand by doors and the chapel. Forests are denser and mixed: pine, cypress, oak in loose autumn drifts, birch.
* **Phones and screens**, measured at the brief's seven sizes in the 3D world:
  * The folded view-controls button, the story details button and, on 360 px phones, Undo and Open panel were **under 44 px**. They are now
    44×44.
  * **On a phone held sideways:**
    * the bottom bar wrapped into two rows;
    * the lens column was hidden, so lenses could not be switched at all;
    * the view controls ran under the story strip.

    Now it has one bar, four icon lenses and folded tools. The world's share at rest went from about 52% to about 67%
    (`wc/phone-844x390-landscape.jpg`).
* **People** were specks at the overview. They are now drawn at true size up close and up to about a third larger at the overview. Their
  tap volumes grow with them, and their faction marks ride at the new height.
* **Roofs** had a solid triangle at each end of the roof. It hung below the ridge as a dark fin on every house in the overview. The ends are
  now open under the overhang, with thin verges, and the gable wall beneath closes the house.
* **Chimney smoke was not showing at all.** Even after ten seconds of world time it did not appear in a close-up, enlarged. A probe of the
  live scene showed about a hundred smoke particles from the twelve lived-in homes.
  * **Cause:** a bug older than this pass. The chimney tops are given in a building's own units, and cottages are drawn 1.2 times larger,
    so every puff was born inside the roof. It had faded by the time it rose clear.
  * **Fix:** the emitter now applies the building's scale. The puffs are also larger, paler and longer-lived, with a larger pool for them,
    and are held under the brightness at which they would glow.

  Now a soft column rises from each lived-in chimney up close, and a faint wisp shows at the overview. Empty houses stay smokeless. The
  earlier review (`docs/3d-rebuild/VISUAL_QA.md`) counted "chimneys smoke" among the signs of life. It was judging from the code, and the
  smoke was not on screen.

### Iteration 4: the frames at the brief's sizes

New frames with the interface at four of the brief's sizes, all on Day 3 with the camera left at rest:

* `wc/phone-390x844.jpg`;
* `wc/phone-360x740.jpg`;
* `wc/phone-844x390-landscape.jpg`;
* `wc/desktop-1920x1080.jpg`.

The first capture of the two portrait phones showed a **framing defect**. The village sat well left of centre: its left corner ran off the
screen under the lens rail, while open sky was left on the right.

* **Cause.** The folded view-controls button at the top right was counted as a right-hand margin, as a desktop's full column of controls is.
  It shifted the whole view left, though on a phone it sits up beside the top bar, above the village.
* **Fix.** On a phone the view controls now float over the village's edge, as the lens rail always has, and no longer move it. A wide
  screen still frames the village clear of both.
  * A first version still counted the controls once they were unfolded, so opening them re-framed the village farther out.
  * The full 3D suite caught it: the camera test's reset came back 12 units away from home.
  * The rule is now the rail's.

  The plate is now centred:
  * A tall phone starts a little closer in, by design, so the plate's two side corners are cropped evenly.
  * A phone on its side centres the plate on the screen, well clear of the rail.

  The phone frames of the matrix (I, J, L) were recaptured with the fix. None of these seven frames shows the defect any more. They were
  taken with the first version of the fix, which frames a phone at rest exactly as the final rule does: a recapture of the 390×844 frame
  under the final rule differs from it by 0.004% (mean absolute error), which is the random smoke.

### Iteration 5: the people, a crowd under a finger, and a phone's sheet

This round answered a review of the work against the ten phase files in `prompts/3d-rebuild/` (the master plan and phases 01 to 10),
which named what was still short of them. Each item below was seen in a frame or caught by a test first.

* **The people were simple, blocky figures** (phase 05 asks for recognisable silhouettes, outfits and props). Each person is now built
  from turned garment profiles: a coat that narrows to the waist over a skirt or a gown down to the ankles, sleeves with cuffs, hands,
  breeches and boots. The face has ears, eyes, brows, cheeks, a nose and a mouth. Hair comes in six styles, chosen so curls never poke
  through a cap. Every role has its own hat and tool: the bridgekeeper's lantern, the farmer's pitchfork, the fisher's rod, the scribe's
  book and spectacles, the storyteller's tall hat, cape and book, the bell-keeper's hood and bell, and so on. Each person is baked into a
  few vertex-coloured meshes, so the village draws 498 calls at the overview on the high tier, against 742 in the visual pass (measured with
  `scripts/perf-3d.ts`, `docs/3d-rebuild/PERFORMANCE.md`). Three defects turned up while doing it:
  * **Seven of the fourteen stood inside the buildings they visited.** The engine puts a visitor on the building's tile, and the figure was
    drawn on that tile, inside the walls. A visitor now waits outside, on the side the opening view can see (the door is preferred when it
    faces that way), measured from the building's own walls and eaves.
  * **The garments were pastel.** The hue was set in linear colour space; it is now set in sRGB, as the rest of the palette is.
  * **Wren, a slight adult, was drawn as a child.** The engine's build (slight, average, stout) had been read as age. Children are now the
    child archetype or role only.

  Portraits of the same six people from the build before this round and after it: `wc/people-compare.jpg`.
* **A group waiting outside stood 0.17 apart, less than a body is wide** (about 0.3), so arms went through neighbours, and **the three at
  the chapel stood behind a tree** in the opening view. They now stand three abreast, 0.34 apart, with a second row a step out and half a
  place across, clear of the eaves. No tall tree grows on the spot where people wait or in the line from it to either opening view (a wide
  window's and a tall phone screen's); shrubs and grass still do, and the woods' random draws are made either way, so every other tree
  stands where it stood (`wc/group-waiting.jpg`).
* **A tap on a knot of people picked whichever was nearest** (phase 05: "group overlap resolved by ordered pick menu near crowded
  targets"). The world now says when a tap could mean more than one person: anyone whose body, plus the slack of a fingertip (or a
  pointer), covers the tap. Then a short list opens beside the tap, nearest first, with each person's portrait, name and role on a
  finger-sized button, and nobody is selected until the player chooses (`wc/crowd-list.jpg`). Up close the same people spread apart and
  a tap selects directly. A double tap goes to the person under it. Measured on the chapel three: at the opening view they are 9 px apart
  on a 1366×768 desktop and the list opens; at the close-up distance they are 17 px apart and a mouse picks each directly, while a phone's
  fingertip still gets the list.
* **On a phone held upright, an open sheet left the village a 139 px strip** (390×844; phase 07: "bottom collapsible sheet", "the world
  remains touch-pan friendly"). The sheet now opens at about a third of the screen, and the camera frames the whole village in the 324 px
  left above it. Its handle draws it up to the old height and back (a tap or Enter toggles, a swipe up raises it, a swipe down lowers it
  and then closes it), and it always reopens at half height. The card docked over the bottom bar gives way while a sheet is open
  (`wc/phone-sheet-compare.jpg`). On a phone held this way, focusing a person also used to put the camera 47 units away (the whole-plate
  fit is far off when the plate is wider than the screen); it now frames about seven and a half units across, at 24 units.
* **On a phone on its side the sheet was a 126 px strip along the bottom showing one line of text.** It now stands at the right, under the
  top bar and over the bottom bar, as on a wide screen, and the camera keeps the village in the width beside it
  (`wc/landscape-sheet-compare.jpg`).
* **Touch was only tapped in tests.** One-finger pans and two-finger pinches now go through the browser's own touch input in a phone
  test, within the camera's limits and without touching the run, and so does the sheet's swipe. That test found one real defect: after a
  swipe, the handle ignored the next tap, because a touch swipe is often followed by no click and the handle was still waiting to swallow
  one.

### Iteration 6: motion, rendered frame by frame and looked at

The previous rounds measured motion from stills two seconds apart. This round rendered clips of the real world one frame at a time and
looked at consecutive frames, which is how a moving picture can be judged in a container with no screen and no GPU.

**How.** `scripts/capture-sequence.ts` loads a bot-played run, freezes the live loop, and steps the real animation clock by exactly
1/24 s with `advance()` (the same simulate-then-draw the live loop does), photographing the canvas after each step: the clip plays at true
speed however slowly the software rasteriser draws it. It writes an animated WebP and an H.264 file, a strip of twelve consecutive frames,
the mean change between every pair of neighbouring frames (a pop or a flicker is one pair far above the rest), and an image of where the
picture changed at all over the clip (dark where nothing moved). Four clips of two seconds at 960×600: the river at the bridge, a person
walking (the camera follows them from the side), the storm of seed 2's flood, and the whole village at the opening view.

**What the frames showed, and what was done:**

* **The river stood up out of its banks.** Up close the far bank carried a streaky, translucent sheet of water above the waterline, with a
  saw-toothed shoreline. Cause: the water mesh split every quad one way while the ground alternates its diagonals, so on half the quads of
  a steep bank the water triangle stood above the ground's. The water now uses the ground's triangles; the shoreline is a smooth line with
  a thin edge of foam.
* **Steep banks were grass smeared into streaks.** The ground is painted from above; on a slope too steep for turf its flecks stretch.
  Those banks are now bare, muddy earth fading into the grass above them.
* **Tonight's forecast turned a storm-dark district into a pale haze** (seed 2's east bank on its flood night). Cause, a bug: the contour
  lines were drawn wherever the predicted extra depth was near a whole number, and the engine's depths *are* whole steps, so every tile of
  an even depth lay on a "line" and was lit. The lines now sit where the depth steps from one level to the next, and the stripes inside
  are painted into the ground's own colour instead of added as light. The district keeps its colours under them.
* **The current ran at one speed in calm and storm.** It now quickens with the wind, eased so the pattern never jumps.
* **The village stood still all week.** In Redbank nobody changes place between mornings until the flood night (checked on four bot
  policies), so the people stood at their work all week. Each new morning seen in play now sends everyone whose day is work from their
  own front door to it, each at their own moment, over the engine's walkable tiles. It is only the way between two places the engine puts
  them; not on a load, not with reduced motion.
* **Feet skated and floated.** The legs swung on a clock while the body moved at its own speed: a planted foot slid 58% as far as the
  body. And the hips bobbed *up* as the legs spread, the opposite of a walk, so at every long stride both feet hung in the air (6 cm, at
  the figure's scale). The step now follows the ground covered, and the foot's reach runs almost straight through the stance; the legs
  have knees, so the swinging foot is lifted clear while the planted leg stays straight; and the hips ride only as high as the planted leg
  reaches. The planted foot now slides 13% as far as the body and one foot is always down (measured by
  `tests/unit/render3d-gait.test.ts` on the second morning's walk; it fails on the old cycle and on the old hip motion).
* **Poses for events existed and nothing called them.** A new believer now nods with a hand to the heart, someone who refuses a story
  shakes their head, a rival argues with a jabbing hand, a pressed listener stops to think, people who saw a proof nod, people in reach of
  a waking law cheer, and people near a fire or a breaking bridge raise the alarm, each only from an effect that names an engine event
  (`tests/unit/render3d-reactions.test.ts`).

**Measured on the final clips** (`docs/3d-rebuild/video/*.json`): the worst neighbouring pair changed 1.05× to 1.19× as much as the median
pair in every clip (no pops; the walking clip's camera follows its subject, so everything moves there). The change images show the water,
the trees and crops in the wind, the people, the birds and the smoke moving, and the ground and buildings dark: no shimmer on still ground.
The clips are `docs/3d-rebuild/video/{river,people,storm,village}.webp`, with their frame strips and change images beside them.

**What this is not.** It is a frame-by-frame review of rendered clips by one reviewer, at 24 frames a second on a software rasteriser. It
says nothing about the frame rate a real GPU or phone would reach, and no one has watched the game being played live on one.

### Iteration 7: played through the interface, and what playing showed

Frames and clips judge how the world looks; playing it judges whether what it shows can be used. Flood at Redbank was played from the
title screen to a victory through the real interface (an automated agent, one click or tap at a time, deciding from the screenshots it
had just looked at, on desktop and in phone emulation; `docs/PLAYTHROUGH_NOTES.md`, "Round 7"; contact sheets in
`docs/3d-rebuild/screenshots/playthrough/`). What it showed about the picture, and what was changed:

* **The 3D world began only after the menus.** The title had the old flat 2D map behind it, and the chooser and briefing were flat dark
  pages. The 3D village now stands behind every menu (built once; it circles on the title and is held still, dimmed, behind pages of
  text), and the briefing shows the village about to be played: Ashwood's misty forest behind the Ashwood briefing.
* **Things the player is told to find were too small to find from the overview.** The coach's "Tap Mara Wells" pointed at a ring about
  14 px across and a pixel thick; the named person now carries a gold call-out above the head, the same size on screen at any distance.
  A cold beacon, where the fire's proof is staged, is a small grey cairn among roofs; while a story is chosen, each place its proof can be
  staged carries a gold ring from afar (none while the coach points at a person, none on a beacon already burning well), and a click on
  the ring picks the place even where a cottage stands in front of it. These marks use the overhead marks' own language (a flat shape
  drawn at a fixed size on screen, faded out close up), so they read as labels, not as things in the world.
* **The storm and the law read well in play.** Rain and a darkening sky as the forecast worsens, the flood spreading over the east-bank
  fields on night 4, gold rings round each lit beacon once the law woke, the fallen bridge, and the aftermath with the rings still holding
  the water off the homes were each the thing the morning report described (frames 7 to 9 of `desktop-run.jpg`).

## Scores (1 to 5)

Each score names the frame or measurement it rests on. No area is scored on something that was not looked at.

The first set was given once, on the frames of iteration 4 (interim scores were not recorded during iterations 1 to 4, although the plan
asked for them). They were given again after iterations 5 and 6, on the recaptured frames and clips; where a score changed, the earlier
one is shown struck through with the reason.

| Area | Score | Evidence | What holds it back |
|---|---:|---|---|
| Art direction and cohesion | **4** | One written direction applied everywhere: palette, ink on standing things only, glow only for light and magic, weather as mood (A, B, D, E) | The ink has one weight everywhere; no variation for silhouette against interior lines |
| Geometry and materials | **4** | Five cottage types with windows all round, open gables, footings, chimneys, shutters and doors; civic buildings; yard props; painted PBR materials with sky reflections (B, top-down frame). People now dressed: turned garments, faces, hair, a tool and hat per role (`wc/people-compare.jpg`) | Walls are plain plaster up close; people's arms have no elbows and their faces are tiny at the overview |
| Lighting and depth | **4** | Warm sun with soft PCF shadows, sky light, AO in hollows, ink separating planes, fog by distance (A, B, D) | No bounced light; on the low tier the AO is off |
| Environmental richness | **4** | Dense mixed forests, hedgerows, yards with props, the cloud sea and islets, birds, smoke (A, B) | Open ground is still plainer than the reference's; no life on the water |
| Animation and life | ~~3~~ **4** | Wind in every tree and grass, a river whose current follows the weather, rain rings, birds, smoke, drifting islets; people walk to work each morning with knees and planted feet (slip 13% of the body's travel, was 58%) and react to the events that touch them. Reviewed as clips rendered frame by frame (iteration 6; `docs/3d-rebuild/video/`) | Was 3: the village stood still all week, feet skated and floated, motion never seen as moving pictures. Still: the clips are a software rasteriser's, seen by one reviewer; arms are one piece |
| Interaction feedback | **4** | Hover and selection rings, the route to shelter, magic rings and runes that glow, cards anchored to what they describe (E, `world3d.spec.ts`); a call-out over the person the coach names and rings over the places a chosen story is proved at, found missing by playing (iteration 7) | — |
| Camera | **4** | Bounded orbit, zoom to the cursor, wheel and trackpad zoom by distance turned, keyboard, buttons, portrait framing, insets, a double tap to go to a person (`world3d.spec.ts` drives real mouse input, and real touch for one-finger pans and two-finger pinches) | Touch is a desktop browser's emulation of a phone, not a phone |
| Mobile | **4** in emulation | Seven sizes pass the layout test, now also with the law ledger open; the sheet opens at half height with the village framed above it (a side sheet on a phone on its side); a crowd under a fingertip becomes a list; controls 44×44 (`wc/phone-*.jpg`, `wc/phone-sheet-compare.jpg`) | **A real phone was never used.** This score is for emulated layouts only |
| Performance | **UNVERIFIED** | Tiers, an adaptive render scale, and the chain's cost measured on its own (Performance with the chain, below) | No GPU and no phone in this container: real frame rates are unknown |

## Performance with the chain

These were measured on the final build with `scripts/perf-3d.ts`. The method and the full table are in
`docs/3d-rebuild/PERFORMANCE.md`, and the raw data in `docs/3d-rebuild/data/perf-chain.json`. Everything ran on a CPU rasteriser
(SwiftShader) at 683×384 pixels. The frame times can compare tiers and catch regressions; they say nothing about a GPU or a phone.

| Tier | Chain | Triangles (calm / flood) | Draw calls | Median frame (calm / flood) | 1% low fps | Chain's own cost |
|---|---|---:|---:|---:|---:|---:|
| low | ink | 268,116 / 291,392 | 256 / 292 | 296 / 312 ms | 2.9 / 2.6 | within noise (−8.0, −0.9 ms) |
| medium | AO (2 pairs), ink, FXAA | 512,660 / 546,486 | 493 / 523 | 443 / 464 ms | 1.5 / 1.8 | 20–31 ms |
| high | AO (4 pairs), ink, bloom, FXAA | 628,775 / 696,718 | 498 / 532 | 545 / 566 ms | 1.5 / 1.5 | 30–48 ms |

* **Measured again at the end of round 7**, on the build this work ends on. The dressed people are baked into a few meshes each, so the
  draw calls fell by a third against the visual pass (742 to 498 on the high tier, calm), while the triangles rose a little (597,483 to
  628,775).
* **Startup**, from handing the page a run to its first frame, took 5.1–10.6 s here (the title's own village is drawn before the clock
  starts). The world's own build is 0.8–1.3 s of that, and the rest was not broken down (shader compiling on the CPU, the sky light, the
  first frame). The JS heap was 30–45 MB.
* **A measurement that was wrong at first.** The first run made the chain look cheaper than no chain. The canvas was multisampled even
  under the chain, so the comparison's direct path paid for multisampling the whole scene. The canvas now asks for multisampling only
  where the chain cannot run, and the figures above come after that change.
* **Adapting to a slow machine.** The tier monitor steps `high → medium → low` when frames are slow, then lowers the render scale (an
  adaptive pixel ratio) to 0.5, and raises it again when there is room. The chain sheds parts with each tier. A machine with only a
  software rasteriser gets the classic map unless `?renderer=3d` asks for the 3D world.
* **What carries over to real hardware:** the scene counts and the memory. **Real frame rates, on any GPU or phone, are UNVERIFIED.**

## Motion

*This was the first measure of motion, from stills two seconds apart, on the build before iterations 5 and 6. The clips rendered frame by
frame in iteration 6 supersede it; the numbers below are kept as they were measured.*

**How it was measured.** `scripts/capture-motion.ts` runs the real renderer:

1. It loads a Day-1 village and frames its middle at 1000×640.
2. It stops the live loop, so that nothing else moves time.
3. It advances the real animation clock in steps of 2 s with `advance()`, the same simulate-then-draw step the live loop takes, and
   photographs the canvas after each step.
4. It measures the mean absolute difference between neighbouring frames in four regions, as a share of the full colour range.
5. With `--dt 0` no time passes between the shots, which measures the noise floor.

The raw data is in `docs/3d-rebuild/data/motion.json` and `motion-floor.json`. The six frames are in `wc/motion-strip.jpg`.

| Region | Change per 2 s step (5 steps) | Noise floor (no time passing) |
|---|---:|---:|
| Far bank and sky (top fifth) | 1.53–1.63% | 0 |
| River and banks (centre) | 2.48–2.61% | 0 |
| Village (lower right) | 1.38–1.50% | 0 |
| Whole frame | 2.00–2.09% | 0 |

What this shows:

* **The renderer adds no change of its own.** The floor is exactly 0, so the picture changes only when the animation clock moves.
* **The motion is continuous, not a one-off.** Every region changes by a steady amount at every step, as continuous motion does: wind in
  trees and grass, the river's flow, people walking and working, smoke, drifting clouds.
* **The river moves most.**
* **Repeated runs match where nothing is random.** The village region gave exactly the same five numbers in two runs, one before the
  smoke fix and one after, so the animation there follows the clock alone. The regions where smoke rises differed slightly between the
  runs, because the puffs use random numbers.

What it cannot show is whether the motion looks smooth and pleasant at 60 frames a second on a GPU. That needs video on real hardware,
which was not available here.

## Mobile and screens

`world3d.spec.ts` › "at every screen size the brief names…" loads a Day-3 village in the 3D world at each of these sizes:

* 390×844;
* 393×852;
* 360×740;
* 844×390 (a phone on its side);
* 1920×1080;
* 1440×900;
* 1366×768.

At each it asserts:

* no sideways scroll;
* every top-bar, corner, lens, tool and bottom-bar control at least 44×44;
* End Day in view;
* the world at least 60% of a phone screen and 75% of a desktop.

It passes at all seven. The one-line tip's buttons keep a slim look, but their tap area is 44 px tall: an invisible box the layout check
cannot measure, so the test leaves them out.

The test measures the layout; it cannot judge the picture. For that, four of the sizes were captured with the interface on and looked at
(`wc/phone-390x844.jpg`, `wc/phone-360x740.jpg`, `wc/phone-844x390-landscape.jpg`, `wc/desktop-1920x1080.jpg`; phones at a device pixel
ratio of 2). That is how the off-centre village on phones (iteration 4) was found.

**Not verifiable here:**

* **Safe areas.** The layout uses `env(safe-area-inset-*)`, but desktop emulation has no notch, so the insets are 0 in every test.
* **Real devices.** Touch on a real phone, Safari on iOS, and how the game feels in the hand were not tried.

## Functional checks run on this pass

All runs used headless Chromium (and the other engines where named), software WebGL, and fonts made to match the CI runner. They were
made one at a time on the final build. The exact commands and counts are in `docs/TEST_RESULTS.md` ("3D visual pass").

* **Lint, types and unit tests:** `eslint`, `tsc` and 364 unit tests, all passing.
* **Browser tests:**
  * The full 3D suite on desktop and phone. Its first full run on the final code caught one real defect, the phone's view controls
    re-framing the village (iteration 4). With the fix:
    * desktop: 19 of 19 in that first full run. The fix changes nothing on a wide screen, and the camera test was re-run on both
      projects after it.
    * phone: 18 of 18 in a full re-run, with one desktop-only test skipped by design.
  * The full classic suite: 141 passed, 0 failed, and 53 skipped because they belong to the other project.
  * New tests in this pass cover the finishing chain, the seven screen sizes, and a closing panel taking a tap.
  * The cross-browser smoke (Chromium, Firefox, WebKit, iPhone profile) and the hosting check under the production Content-Security-Policy,
    which also loads the 3D world.
* **CI failures found and fixed today, each reproduced first:**
  * a 320 px title overflow under the runner's fonts;
  * a camera test timing out on 120 wheel events (zoom now follows the distance turned);
  * WebKit logging a console error when refused a WebGL context (now a quiet fallback);
  * a phone tap swallowed by the details panel sliding away (a closing panel now passes taps through; the new test failed 4 of 4 before and
    passed 4 of 4 after).

## Not verified, and not claimed

* **Real hardware.** No GPU, phone, iPhone or real Safari was used. Frame times here are a CPU rasteriser's. WebKit was exercised as
  Playwright's Linux build (it draws the 3D world and picks a person by a tap); headless Firefox has no WebGL2 and falls back as designed.
* **Players.** No person has played this build; the scores are one reviewer's. An automated agent played Flood at Redbank to a victory
  through the interface (iteration 7, `docs/PLAYTHROUGH_NOTES.md`); it is not a playtest.
* **Video.** Motion was reviewed as clips rendered frame by frame at 24 frames a second on a software rasteriser (iteration 6), not watched
  live on real hardware.
* **Deployment.** Nothing is deployed.
