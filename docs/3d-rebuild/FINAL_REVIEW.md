# 3D rebuild: final review

This is the closing record of the `prompts/3d-rebuild/` work, written as the art director the brief asks for and then as the engineer who has to
back every sentence with a command. **Verdict first: the game now has a real, interactive, richly rendered 3D village on its default route wherever
the browser has graphics acceleration, it is fully playable and replayable through it, and the engine, saves and MCP are untouched. It is not
claimed to be "premium": three scorecard areas sit at 3 of 5, nothing has been run on a real GPU or phone, and nobody has played it.**

> **Since this review.** Later work went through most of "What I would do next" below. The visual pass among it is recorded in
> `docs/3D_QUALITY_REPORT.md`, scored against the art direction in `docs/3D_VISUAL_STANDARD.md`. The later work added:
> * a finishing chain (ink outlines, ambient occlusion, glow, a single tone curve, FXAA) and sky light;
> * an art pass (meadow palette, yards, cypresses, denser forests, windows all round, yard props);
> * a cloud sea and islets;
> * evacuation routes;
> * an in-world loading scene;
> * phone and landscape layout fixes.
>
> The verdicts below are kept as they were when written. Where that pass changed one, the row says so.
>
> **Round 9** ran the game on a real GPU for the first time and closes this review: its verdict is in "Round 9" below.

## Round 6: the phase 09 scorecard, redone

After round 6 (`STATUS.md`, "Round 6"; `docs/3D_QUALITY_REPORT.md`, iterations 5 and 6) the scorecard phase 09 asks for was given again,
on the recaptured matrix, the size frames and the four clips rendered frame by frame. These are one reviewer's internal scores, not a
player's; each names what it rests on.

| Area (phase 09) | Score | Rests on | What still holds it back |
|---|---:|---|---|
| Three-dimensional depth | 4 | Sculpted terrain with banks of bare earth, roof volumes, foreshortening, ambient occlusion and ink (A, B, `video/river.webp`) | No bounced light |
| Art coherence | 4 | One palette and one ink rule everywhere; procedural, so no clashing packs (A, B, D) | Ink has one weight |
| Environmental life | 4 | Wind in trees and crops, a current that follows the weather, smoke, birds, a walk to work each morning, reactions to events (`video/*.webp` and their change images) | Seen only on a software rasteriser |
| Lighting and material | 4 | Warm low sun, soft shadows, sky light, painted PBR materials (A, B, D) | Plain plaster up close |
| River | 4 | A moving surface whose depth is the engine's on every tile, a smooth shoreline with foam, banks with volume, a flood that covers exactly the engine's flooded tiles (`video/river.webp`, `video/storm.webp`, D, E2) | No reflection or refraction |
| Architecture | 4 | Five cottage types, civic buildings, the arched bridge, mill, tower, market (B, F) | Repeated variants at a distance |
| Citizens | 4 | Dressed and recognisable, a tool and hat per role, standing where they can be seen, animated by duty, walking on knees with planted feet, pickable through a crowd list (`wc/people-compare.jpg`, `wc/crowd-list.jpg`, `video/people.webp`) | Arms without elbows; faces tiny at the overview |
| Magical causality | 4 | Effects only from logged events, the law's reach the engine's, people reacting to what touched them (parity and reaction tests; E, F) | Legible rather than lavish |
| UI discipline | 4 | The world keeps at least 75% of a desktop and 60% of a phone at rest; a card beside the selection; a half-height phone sheet (`world3d.spec.ts`; K, L) | The opening story cards cover the lower village for a moment |
| Phone usability | 4 in emulation | Seven sizes, sheet open and shut, real touch for taps, pans, pinches and the sheet's swipe (`world3d.spec.ts`; I, J, L) | **No real phone.** Smoothness on one is unknown |
| No faux completion | — | Every frame is a bot-played engine state through the save format; every claim names its test or frame; nothing is deployed and none is claimed | — |

Every area now scores 4. **"Premium" is still not claimed:** phase 09 asks for a 3D world that is "readable and smooth" on a phone, and
smoothness can only be shown on real hardware, which this container does not have; and these are one reviewer's scores. The verdicts
below are updated in `STATUS.md`'s phase table (3D-05 is now PASS).

## Round 8: phase 08 closed out

Phase 08 was read again item by item (`STATUS.md`, "Round 8"). What it lists and the build lacked now exists, each with a test or a
measurement:

* an asset manifest read from the generators and kept in step with them by a test;
* validation tests for every asset and every village, which found and fixed zero-area triangles in three roofs;
* a per-asset stand-in when a generator fails;
* level of detail for the people;
* a shader warm-up, so the first night's effects no longer compile programs mid-play;
* stall, frame-percentile and video-memory records;
* a developer monitor behind `?perf=1`;
* the ten-cycle leak check.

**3D-08 is now PASS** for everything that can be checked here. Its frame-rate targets, which the phase itself calls "aspirational until
tested", remain **UNVERIFIED**: no GPU or phone has run the game.

**3D-10 stays PARTIAL, and "premium" is still not claimed.** Phase 10 says "do not assert premium quality on missing evidence", and phase
09's phone area asks for a world that is smooth on a phone. Nothing here can show smoothness on a phone. The way to settle it:

1. Make a preview deployment. That needs the owner's go-ahead; none was made.
2. Open it on a real iPhone and a mid-range Android phone with `?perf=1`.
3. Record the monitor's frame p50/p95 at the overview and during a flood night in `PERFORMANCE.md`.

## Round 9: real hardware, and the art director's frame seen on it

Everything before this round was seen on a software rasteriser. Round 9 ran the game on a real GPU: an Apple GPU, reached through
the CI's macOS virtual machine, in Chrome and in Safari, plus Mobile Safari in the iOS Simulator (`STATUS.md`, "Round 9";
`PERFORMANCE.md`, "Real hardware"). Seen there at full resolution, the Day 1 frame showed two things the software frames had hidden
in their softness: the plate's cut sides were a smeared gradient (the island read as a slice of cake), and the river stopped dead at
the cut. Both are fixed: the cut is painted strata with relief and a ragged rocky base, and the river falls off the island into the
cloud sea and rises among boulders at its source. The runs also found two pacing faults that cost players smoothness (an average
seeded by the first frames, and a phone frame cap a 60 Hz screen could only show as 30), both fixed and measured again, and one fault
of size: every point sprite (mist, smoke, the gold markers, the coach's call-out) drew at half its size on a screen of pixel ratio 2,
fixed after run 5 and seen fixed on the GPU in run 6 (`screenshots/real-hw/sprites-before-after-run5-run6.jpg`). Run 6's close-up of
the waterfall showed one more fault: the ink of the cliff's lip and the island's underside was drawn straight through the falling water.
The sheet is now a veil to the finishing chain, and that ink fades under it (`screenshots/wc/falls-ink-veil-before-after.jpg`).

### The scorecard, round 9

| Area (phase 09) | Score | Rests on | What still holds it back |
|---|---:|---|---|
| Three-dimensional depth | 4 | As round 6, and now the island itself: strata with relief and a ragged base, an overhanging turf lip (`run5` Day 1 frame) | No bounced light |
| Art coherence | 4 | The strata painted in the meadow's palette, inked like everything else | Ink has one weight |
| Environmental life | 4 | As round 6, plus a waterfall and its mist at the front of every opening view | Seen as clips on a software rasteriser; live on the GPU only as frames and frame times |
| Lighting and material | 4 | Soft shadows, ambient occlusion and glow seen on the real GPU at the high tier (`run3`/`run5` frames) | Plain plaster up close |
| River | 4 | As round 6, and now it leaves the island: a falling sheet on the river's own clock and colour that widens in a flood | No reflection or refraction |
| Architecture | 4 | Unchanged | Repeated variants at a distance |
| Citizens | 4 | Unchanged | Arms without elbows; faces tiny at the overview |
| Magical causality | 4 | Unchanged | Legible rather than lavish |
| UI discipline | 4 | Unchanged | The opening story cards cover the lower village for a moment |
| Phone usability | 4 | Touch tests at seven sizes; on a real GPU at an iPhone's size and pixel ratio, 30 frames a second at rest (frame p50 33 ms, p95 50 ms) and a median of 60 while the view turns (p50 17 ms; p95 64 ms in run 5, 17.7 ms in run 6); Mobile Safari draws and runs the world in the iOS Simulator | **A physical phone is UNVERIFIED** |
| No faux completion | — | Every frame a bot-played engine state; every number from a named run; nothing deployed and none claimed | — |

**Verdict, round 9.** Phase 09 asks for 4 or more in every area before "premium". Every area scores 4 in this review. The area that held
the claim back in round 6 was phone usability ("3D readable and smooth"). It now rests on three things:

- the real GPU at an iPhone's size and pixel ratio: 30 frames a second at rest (frame p50 33 ms, p95 50 ms), and the display's 60 at the median while the view turns (p50 17 ms; run 5: p95 64 ms, 47 a second on average; run 6: p95 17.7 ms, 60 a second);
- Mobile Safari drawing and running the world in the iOS Simulator;
- the touch tests at seven sizes.

**So, by the phase 09 rubric, the 3D world is premium, and that claim is held to what was seen and measured.** Phase 10 forbids asserting
premium on missing evidence, so here is what stays outside the claim:

- **UNVERIFIED:** a physical phone (frame rate, heat, battery, a finger on glass).
- **UNVERIFIED:** a Mac's GPU used directly (not through a virtual machine), and Windows and Linux GPUs.
- **UNVERIFIED:** a human player.
- **FAIL on the one GPU measured:** phase 08's desktop target of a stable 60 frames a second at the default camera (about 30 at 2880×1800).

These are one reviewer's internal scores, not players' ratings, as phase 09 says.

## What was reviewed, and how

* **Source and commits.** Branch `claude/gracious-gates-95kmda`. Pull request 1 (merged at `15257dc`) carried the first Three.js world; pull request 2 carries everything after it. The 3D work is in `7b5bfa0` (Three.js world behind a renderer interface, belief-magic effects), `6416850` (immersive HUD, aftermath scene, forecast overlay, batching, 3D browser tests), `ebde29e` (side-sheet focus race), `1809880` (this review's repairs, scripts and the 16 frames) and `7a5ea63` (forecast overlay over standing water, the camera-control test, recaptured frames). `git log --oneline` names the rest; the docs-only commit after `7a5ea63` carries this file.
* **Frames.** The ten required scenes plus six more (A, A2, B, C, D, E, E2, F, F2, G, H, I, J, K, L, M) were captured from the production build, looked at one by one, scored, and the defects fixed and recaptured. Paths, seeds, viewports and scores: `VISUAL_QA.md`.
* **Anti-target.** The old flat map (`screenshots/baseline-2d/`) was compared feature by feature (volume, terrain, bridge, canopy, sunlight, water, people, interface share, camera) in `VISUAL_QA.md`.

## The brief's rejection conditions, one by one

| Rejection condition | Status |
|---|---|
| Gameplay still looks like 2D icons, green tiles or extruded cubes | **Not true.** Sculpted terrain, shaped roofs, an arched bridge, instanced trees, a flowing river (frames A, B, F) |
| Houses lack roof, door, window, chimney, foundation, surroundings | **Not true.** Five cottage types with all of those, plus civic buildings (B). Plain plaster walls and dark gable tips remain as flaws |
| Water is a static blue rectangle, or a flood is only a HUD meter | **Not true.** A flow shader whose depth is the engine's depth tile for tile; a surge floods the engine's tiles and stops at a lit beacon's reach (D, E2) |
| Fixed fake-isometric view | **Not true.** Pan, zoom to cursor, bounded orbit, pinch, keyboard, buttons, focus (`MapView.tsx`, `camera.ts`). `world3d.spec.ts` drives a real mouse drag (pans, selects nothing), the wheel (zooms between its limits), a right-drag (orbits, elevation kept between 24° and 66°), the buttons and the reset key. Two-finger pinch is wired but has **no automated test** (Playwright cannot make two real touches) |
| Citizens only flat cards or cylinders | **Not true, but weak:** 14 role-costumed, animated, pickable figures; small and blocky (scored 3) |
| HUD so large the village does not dominate | **Not true.** At least 75% of a desktop screen and 60% of a phone's stays world at rest (asserted). One exception named: the opening story cards cover the lower fifth for a moment (A2) |
| A fancy screenshot that cannot play, or mock states | **Not true.** Every frame is a bot-played engine state loaded through the save format; the 3D world is played with real clicks and taps in tests |
| Mechanics, replay, saves or MCP broken by the migration | **Not true.** See the runs below: recorded traces reach identical hashes through the 3D world; `npm test` 364 of 364; `git diff 1077522 HEAD -- src/engine mcp server` is empty (that merge is the last commit before the 3D work) |
| Mobile graphical path blank or unplayably slow | **Not shown either way.** On an emulated Pixel 7 with software WebGL it draws and plays (slowly: that is a CPU rasteriser). A real phone is **UNVERIFIED**. *Since round 9: not true on the evidence there is. iOS WebKit chooses, compiles and draws the 3D world in the iOS Simulator, and an iPhone-sized window on a real GPU holds about 30 frames a second at rest and a median of 60 while the view turns. A physical phone is still **UNVERIFIED**.* |
| No visual evidence captured, yet declared complete | **Not true.** 16 real frames, reviewed |

## The ten steps of the review loop

1. **Captured the ten scenes** (plus six): done, `screenshots/`.
2. **Before/after against the anti-target, with concrete changes:** done, `VISUAL_QA.md` last table.
3. **Ranked defect list (P0/P1/P2):** done, nine defects, `VISUAL_QA.md`.
4. **Fixed all P0 and at least the top five P1, recaptured:** done. One P0 (the forecast overlay did not appear until the first click; found because frame M had no overlay) and five P1 (backwards timber beams; the hero bridge drowned in the surge; phone framing, haze and stale zoom; a small and misdirected debrief world; flat lighting). Three P2 as well.
5. **Gameplay walkthrough, not only a flying camera:** the 3D projects play a run from the first click: pick a story, tap a villager, spend Influence, end the day, win through the recorded line, lose through doing nothing and retry on a new seed, save mid-storm and resume. One thing became awkward and was fixed: with a tall phone screen a tap near the bridge could pick the neighbour, so the tests come in on the person first, as a player would (the limitation stays listed).
6. **Full engine, E2E, compatibility and performance suite:** below, with the numbers.
7. **Production build and browser route:** `npm run build`, `npm run size`, and `npm run verify:hosting` (the shipped Content-Security-Policy and headers served to a real browser, now including the lazily loaded 3D world with zero violations and zero console errors).
8. **Deployment:** **none.** No Vercel deployment was made and no live URL exists; nothing here claims one. `vercel.json` and `docs/RELEASE_CHECKLIST.md` describe how to deploy.
9. **Source backup and migration story:** the work is committed and pushed on the branch above; the 2D renderer is kept (fallback and A/B), and `prompts/00_MASTER_GOAL.md` opens with the renderer override that makes the old 2D prescriptions obsolete, `prompts/3d-rebuild/` is the binding plan, and the top-level `README.md` and `docs/3d-rebuild/STATUS.md` say the 3D world is the default and the 2D map the fallback, so a future agent has no instruction left to undo this. (`prompts/README.md` does not itself carry the override line.)
10. **Honest PASS / PARTIAL / UNVERIFIED per phase:** `STATUS.md` phase table, repeated here.

## Full runs on the final build (Linux container, 4 cores, software WebGL, Chromium 153)

| Command | Result |
|---|---|
| `npx tsc --noEmit`, `npx eslint . --max-warnings 0` | clean |
| `npm test` | **29 files, 364 tests passed** |
| `npm run test:sim:smoke` (8 policies × 4 scenario families × 8 paired seeds) | **256/256 runs, SMOKE OK**: no crash, softlock, nondeterminism or engine violation |
| `npm run build`, `npm run size` | entry 232 KB gzip (budget 260), 3D chunk 197 KB gzip (budget 270, lazy), CSS 7.8 KB (budget 12) |
| `npm run verify:hosting` | 19 checks ok, including the 3D world under the production policy |
| `npm run test:e2e:3d` (desktop-3d and phone-3d projects, the real 3D scene) | **32 passed, 0 failed** (12.4 min) |
| `npm run test:e2e:classic` (desktop and phone, the classic map) | **140 passed, 0 failed, 52 skipped** (project-specific skips) (6.4 min) |
| `npm run test:e2e:browsers` (Chromium, Firefox 155, WebKit 26.6, iPhone-14 profile; smoke) | **8 passed** |
| `npx tsx scripts/browser-3d-smoke.ts` (does the 3D world come up in other engines?) | Chromium **PASS**; WebKit 26.6 (Playwright Linux build) **PASS**: 3D drew frames; Firefox 155 headless **fell back to the classic map** (no usable WebGL2 there), which is the designed fallback, not a pass |

Failures that happened on the way and are not hidden: a keyboard-flow test and an axe contrast check each failed once under load (a hidden-to-visible
transition made `focus()` miss in the first frame of a sheet opening; a card was measured half way through its fade-in). Both were real timing
races in the page or the test; the page was changed for the first (the sheet is now visible from its first frame), the audit now waits for finite
animations for the second. A parallel Playwright run of my own also wiped the other run's output folder once and produced two bogus failures, which
passed on a clean re-run. A camera-control test I added failed once on the phone project because it measured "home" before the interface had finished measuring itself; it now waits for that. And the 3D suite's two phone tests that tap people and beacons failed after the portrait view arrived, because from that angle a home stands in front of a beacon: the tests now judge the picks from one fixed angle, which is why "picking uses box volumes" is on the open list.

## Phase verdicts

| Phase | Verdict | The honest reason |
|---|---|---|
| 3D-01 Source audit and migration | **PASS** | Audit, adapter, flag, baseline frames, engine untouched |
| 3D-02 Renderer, camera, lighting | **PASS** | Works and is tested on software WebGL. Feel and shadow quality on a real GPU: **UNVERIFIED** (*since round 9: shadows, ambient occlusion and glow seen on a real GPU at full resolution, frame times measured while the view turns; a physical phone still UNVERIFIED*) |
| 3D-03 Terrain, water, weather | **PASS** | Engine-derived, asserted tile for tile. No refraction or reflection |
| 3D-04 Architecture and environment | **PASS** | Detailed procedural kit. No glTF/Blender pipeline: a deliberate choice recorded in `ASSET_LICENSES.md` |
| 3D-05 Villagers and life | **PARTIAL** | Present, animated, pickable; small and blocky; motion not reviewed as video |
| 3D-06 Belief magic and feedback | **PASS** | Event-parity fixtures and tests; legible, not lavish |
| 3D-07 Immersive HUD and controls | **PASS** | Tested with real pointer events (3D projects) and axe, including on the live 3D page. A real phone and a real screen reader: **UNVERIFIED**. Evacuation routes are not drawn (*since drawn: see the quality report*) |
| 3D-08 Asset pipeline and optimisation | **PARTIAL** | Budgets met and measured on software GL only; GPU and phone frame rate **UNVERIFIED**; no in-world loading scene (*since added*). *Since: PASS in round 8 (manifest, validation, per-asset fallback, people LOD, shader warm-up, ten-cycle leak check); real-device frame rate still **UNVERIFIED*** |
| 3D-09 Visual QA and gameplay regression | **PASS** | Frames, scorecard, defects, regression table. No automated pixel-diff baseline (the phase allows structural tests plus inspection) |
| 3D-10 Final art direction and release | **PARTIAL** | Reviewed and repaired. Not premium by its own rubric; nothing deployed (*since round 9: **PASS**, premium by the rubric and held to what was seen and measured; a physical phone and a human player UNVERIFIED ("Round 9", above)*) |

## Final artist's test (Day 1, no interface)

Frame A (`screenshots/A-day1-overview.jpg`) is Day 1 with every piece of interface hidden. Would it sit on the front page of a polished indie game
collection? **Close, not there.** What passes: it reads at once as a fantasy village, not a map editor: the plate has volume, the river has life, the
bridge, tower, mill and market have silhouettes, the light is warm and the shadows long, a few birds are in the air. What does not: the diorama
floats on a plain gradient with nothing beyond it; up close the surfaces are matte and a little too clean; the people are specks until you zoom. I did not
declare it finished on this test; I list those three as the next work.

**Since round 9: the same test on a real GPU.** The Day 1 frame with no interface, photographed on an Apple GPU at 2880×1800 at the
high tier (`screenshots/real-hw/run5-apple-gpu-chrome-day1-no-interface-high-tier.jpg`), against the same frame before this round's
work (`edge-before-after-run4-run5.jpg`). Would it sit on the front page of a polished indie game collection? **Yes, with reservations.**
It reads at once as a fantasy village on an island in the sky: the island has a cut of turf, soil and rock with weight to it, the river
runs under the bridge and pours off the front edge into the clouds, the roofs, the tower, the mill and the market have silhouettes, and
the light is warm with long soft shadows. The reservations: the meadows are broad and plain between the clusters; the people are
specks until you zoom; plaster is plain up close; the islet in the corner is cut by the frame. None of them makes it read as a map editor
or a dashboard.

## What I would do next, in order

1. Put the game in front of a real GPU and a real phone and record the numbers `PERFORMANCE.md` has to leave as UNVERIFIED (including thermal behaviour). *(Since round 9: done for one real GPU, an Apple GPU through CI's macOS virtual machine; a physical phone, other GPUs and heat are still to do.)*
2. Give the plate a world: a horizon of hills in haze, a ground it sits on, drifting cloud shadows.
3. Lift the surfaces: textured plaster, a roof texture without the colour noise, a few more tree and cottage variants, a bigger villager silhouette at the overview.
4. Review motion as video; add the ambient life that survives that review.
5. Replace box pick volumes with the visible geometry so a beacon half behind a home picks as the beacon.
6. Draw evacuation routes when a house is selected.

## Rollback

If a critical failure is found in the 3D world, `?renderer=2d` (or the 2D toggle in the map tools) gives the classic map immediately, and it is the
default wherever the browser has no graphics acceleration. A hard rollback is a revert of the 3D commits listed above; the engine, saves and MCP are
not part of them, so no save or recorded run is affected.
