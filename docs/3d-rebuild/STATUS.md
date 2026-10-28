# 3D rebuild — status

This is the working record of the move from the flat Canvas2D map to an interactive 3D world (the `prompts/3d-rebuild/` phases).
It is updated as each phase is verified. Every claim below names the command, test or screenshot it rests on; anything that could not
be checked is marked **UNVERIFIED** with the manual steps, and anything that failed is marked **FAIL**.

*Last updated: see the git log of this file. The phase table at the bottom is the source of truth.*

## 3D-01 — Source audit and migration plan

### Where the real application is

- Repository: `https://github.com/JaredVogler2/BeliefEngine`, branch `claude/gracious-gates-95kmda` (pull request #1). The working copy is `/home/user/BeliefEngine`.
- The application source **is** in the repository (it is not "prompts only"): Vite 8 + React 19 + TypeScript 6 (strict), package manager npm, entry `index.html` → `src/main.tsx` → `src/App.tsx`.
- No Phaser / Pixi / R3F was ever used. The map was a hand-written **Canvas2D** renderer (`src/render/MapRenderer.ts`, 1,400 lines) with procedural sprites (`src/render/sprites.ts`).
- The deterministic engine (`src/engine/**`) is headless: pure functions over a JSON `RunState`, a stateless hash RNG, a replay checker, a versioned save format, and one `GameSession` controller that the UI, the bots and the MCP server all use (`src/engine/core/session.ts`).
- Nothing was deployed by this work; no live URL exists.

### Baseline that was protected before the renderer changed

| What | Where |
|---|---|
| Engine, content, saves, MCP, NL composer: untouched by the 3D work (`git diff main -- src/engine mcp server` shows only the earlier phases) | `src/engine/**`, `mcp/**`, `server/**` |
| Seeded winning and losing traces (state hash + event hash) used by the replay tests | `tests/fixtures/*-traces.json` |
| Unit tests (356 when this audit was written; 364 now) incl. `rng-hash`, `redbank`, `scenarios`, `mcp-*`, `nl-*` | `tests/unit/**` |
| Browser journeys with real clicks on both renderers' DOM (desktop 1366×768, Pixel 7 390×844) | `tests/e2e/**` |
| Screenshots of the old flat map at the default seed (calm day 1, flood night, law active; desktop and phone) | `docs/3d-rebuild/screenshots/baseline-2d/` |
| Saved states: the e2e `persistence` and `resilience` specs save and reload mid-day runs; `scripts/capture-3d.ts` loads bot-played states through `window.__belief.load` | `tests/e2e/persistence.spec.ts`, `tests/e2e/resilience.spec.ts` |

The 2D renderer was **kept**, not deleted: it is the fallback (no WebGL2, no graphics acceleration, or the player's choice) and the A/B
comparison. A 2D/3D toggle is in the map tools and `?renderer=2d|3d` overrides (`src/render/choose.ts`).

### Module audit (exact paths)

| Module | Verdict | Notes |
|---|---|---|
| `src/engine/**` (core, social, laws, world, gen, ai, nl, progress, save) | **KEEP** | No rule, score, social-graph or save change was made to suit graphics. `RULES_VERSION` stays 1.0.0 (hashes depend on it). |
| `mcp/**`, `server/**` | **KEEP** | MCP server, run verifier, NL interpreter proxy. Same `GameSession` API as the UI. |
| `src/ui/store.ts`, `src/ui/persist.ts`, `src/ui/progress.ts`, `src/ui/modes.ts` | **KEEP** | Store, autosave, progression. |
| `src/ui/play/MapView.tsx` | **ADAPT** | Chooses the renderer, forwards state/options/events through the common `WorldRenderer` interface, owns pointer/keyboard handling for both. |
| `src/ui/play/Panels.tsx` (`getRenderer()?.focusVillager/focusTile`) | **ADAPT** | Calls the interface, not a class. |
| `src/ui/screens.tsx` (title backdrop uses `MapRenderer` directly) | **KEEP** | The title screen stays on the light 2D backdrop (no WebGL cost before the player chooses to play). |
| `src/render/types.ts` (`WorldRenderer`) | **NEW** | The contract both renderers implement. |
| `src/render/choose.ts` | **NEW** | Feature flag: URL, saved choice, WebGL2 and software-GL detection. |
| `src/render/MapRenderer.ts`, `src/render/sprites.ts`, `src/render/palette.ts` | **TEMPORARILY FALLBACK** | Flat tile drawing, sprite houses, screen-space overlays. Kept as the fallback renderer and the A/B baseline. **RETIRE** is deferred until the 3D world has been played by people on real devices, which has not happened (see Known issues). |
| `src/render3d/snapshot.ts` | **NEW** | `getSceneSnapshot(runState)` and `getSceneChanges(prev, next)`: the read-only adapter. |
| `src/render3d/coords.ts` | **NEW** | The one place the axes are defined: x = east = tile column, z = south = tile row, y = up; 1 tile = 1 unit; height = engine elevation × 0.28. |
| `src/render3d/World3D.ts` and the other `src/render3d/*.ts` | **NEW** | The Three.js world (see the table below). |

### The adapter, against the phase's list

| Spec | Implementation |
|---|---|
| `getSceneSnapshot(runState)` | `src/render3d/snapshot.ts`: terrain ids, elevation, per-tile water depth, fire/burn/smoke, the engine's own passable mask, landmarks (tile, health, lit, fuel, data), villagers (tile, duty, status, look), laws (status, strength, radius, *what powers them tonight, from the engine's own `triggerSources`*), ties, regions, packs, the threat kind. Typed arrays are copied once per state change, never per frame. |
| `getSceneChanges(prev, next)` | same file: rebuild / terrain / water / fire / changed landmark ids / changed villager ids / laws. Unchanged entities are not touched. |
| `getEntityAtRaycastHit(hit)` | `World3D.hitTest(x, y)` raycasts invisible proxy volumes whose `userData.entity = { kind, id }` and returns `{ kind, id }`: an engine id, never a mutation. |
| `dispatchPlayerAction(intent)` | The renderer never dispatches. `MapView` calls `store.select(...)`; actions go through `store.act(...)` → `GameSession.act` (the same validated API as the old UI and MCP). |
| animation clocks separate from the simulation day | `World3D` keeps its own `time`; `advance(seconds)` steps animation without touching the run. Render randomness is `src/render3d/rand.ts` (seeded from the scenario and seed, never the engine's generator). |
| serialize / deserialize stays the engine's | `serializeRun` / `deserializeRun` are untouched; `window.__belief.load/parse` (debug only) use them. |

### 3D-01 acceptance

| Check | Result |
|---|---|
| Existing game runs before migration | PASS: `docs/TEST_RESULTS.md` records the browser suite green before the 3D work (140 passed, 0 failed, 52 skipped project-specific cases). With the 3D renderer present and software-GL defaulting to the classic map, the same suite was run again on this branch: 138 passed, 2 failed (a toast re-render race I introduced, fixed and re-run green), 52 skipped. |
| Two saved states load | PASS: `tests/e2e/persistence.spec.ts`, `tests/e2e/resilience.spec.ts` ("a save made elsewhere … loads and plays on"). |
| Same seed/actions → same canonical state with either renderer | PASS for the 2D default environment (`redbank.spec.ts`, `scenarios.spec.ts` replay the recorded traces with real clicks and compare `stateHash`/`eventHash`). 3D coverage: see 3D-09. |
| Baseline screenshot at a fixed camera | PASS: `docs/3d-rebuild/screenshots/baseline-2d/`. |
| New route / flag boots without deleting the old path | PASS: `?renderer=3d` / `?renderer=2d`, plus the map-tools toggle. |
| No rewrite of social graph, claims, physics, scores or MCP | PASS: the engine and MCP directories have no changes in this work. |

## 3D-02 to 3D-10: what was built, and the checks each rests on

The code is in `src/render3d/**` (about 8,000 lines, one lazy chunk), behind the `WorldRenderer` interface in `src/render/types.ts`. Nothing
below changes a rule: the renderer reads a copy of the run (`SceneSnapshot`) and the engine never reads the renderer.

| Phase | What exists | Checks |
|---|---|---|
| 02 Renderer, camera, lighting | Three.js 0.186.1 on WebGL2 (`World3D.ts`); a tabletop camera that pans, zooms to the cursor, orbits within limits (azimuth ±75°, elevation 24–66°), pinches, resets and focuses a person or place, eased on its own clock (`camera.ts`); a warm low key light with a soft shadow map, a sky fill, tone mapping, distance haze, a screen-space sky with drifting clouds; weather moods chosen from the engine's forecast and flood level (`atmosphere.ts`) | `world3d.spec.ts` boots, draws and picks on two projects; frames A, B, D in `VISUAL_QA.md` |
| 03 Terrain, water, weather | The height field is the engine's elevation times one constant, rounded off, with the river channel cut, building plots levelled, a layered plate edge; a ground texture painted from the tile map with paths worn to doors (`terrain.ts`, `groundTexture.ts`); a river and flood surface whose height at every tile is the engine's depth (`water.ts`); rain, wind, wet ground | `render3d-scene.test.ts`: heights tile for tile, surface at the engine's depth on every wet tile, no water on any dry tile, a calm village wet only in the river; frames D, E2, M |
| 04 Architecture and vegetation | Five cottage variants plus cabin, granary, hall, chapel, ruin; bell tower, mill with a turning wheel, market, shelter, well, pen, campfire, beacon; an arched stone bridge built from the engine's own footprint; seven tree kinds, shrubs, tufts, flowers, reeds, crops that ripen with the engine's growth, fences. All procedural, instanced or merged per material | frames A, B, F; `ASSET_LICENSES.md` (no files, nothing to license) |
| 05 Villagers | One hand-built figure per villager, costume from role and faction and the engine's `look`, held props, animated walk, work, rest, watch, shelter; routes follow the engine's passable tiles; standing on the bridge deck when on it; gestures for events | frames B, C; crowd and tap tests |
| 06 Belief magic | Pure planners turn logged events and the engine's law geometry into effects (`plan.ts`); shader-painted law ground (rune wheels, rings, drops), reach discs the size of the engine's flood shield, ripples on the river, ribbons only along real ties, social lens, forecast stripes and contours (`magic.ts`, `effects.ts`, `glyphs.ts`) | `render3d-plan.test.ts` (six parity fixtures) and "every effect the world starts names an event the engine logged"; frames C, E, E2, F, K, M |
| 07 Immersive HUD | A compact rail of views, a story tray, a card anchored to the selection, a side sheet (bottom sheet on a phone) for detail, camera insets so nothing sits under a panel, an end-of-run scene of the real final world (`Hud.tsx`, `Play.tsx`, `MapView.tsx`, `Aftermath.tsx`) | the world keeps at least 75% of a desktop screen and 60% of a phone's at rest (test, on the 3D projects); axe passes on the desktop and phone projects including 320×568 (those run on the classic map, which sits under the very same interface DOM; axe was **not** run against a page with the 3D canvas live); frames A2, C, G, H, I, K, L |
| 08 Asset pipeline and optimisation | No asset files by design; every texture painted at load from a seed, every mesh built by code; instancing, per-material merging, static batching of landmarks; three quality tiers with a run-time monitor and software-GL detection; lazy 3D chunk; disposal on every rebuild | `PERFORMANCE.md`; bundle budget in CI (`npm run size`); leak test |
| 09 Visual QA and regression | 16 real frames, a scorecard, ranked defects, a functional regression table | `VISUAL_QA.md`; `world3d.spec.ts` on `desktop-3d` and `phone-3d`; the classic specs on `desktop` and `phone` |
| 10 Art-director review and release | Defects fixed and frames recaptured; honest per-phase verdicts | `FINAL_REVIEW.md` |

## Round 6 — the ten phase files, read again against the build

This round started from `prompts/3d-rebuild/00_MASTER_3D_REBUILD.md` and its ten phase files, read again in full, and from a review that
named what was still short of them: the people were simple, blocky figures; a phone's sheet covered most of the village; motion had never
been reviewed as moving pictures; open defects were listed but not fixed; no real GPU, phone or Safari had been used; no player had tried
the game. What was done about each, phase by phase (details and frames in `docs/3D_QUALITY_REPORT.md`, iterations 5 and 6):

| Phase file | What it asked for that was still short | Done this round | Evidence |
|---|---|---|---|
| 03 Terrain, water, weather | Banks with volume and a believable shoreline; flow that intensifies with the weather; a forecast that does not destroy material readability | The water uses the ground's own triangles (it stood up out of steep banks as a streaky sheet with a saw-toothed shoreline); steep banks are bare earth; the current follows the wind; the forecast's contour lines no longer light every tile of an even depth (a storm-dark district had turned to a pale haze) | Clips `docs/3d-rebuild/video/river.webp`, `storm.webp`, their frame strips and change images |
| 05 Villagers and life | Recognisable silhouettes, outfits and props; no skating feet; "group overlap resolved by ordered pick menu near crowded targets"; state-driven poses (delighted, skeptical, alarmed, convinced, angry); people placed where they can be seen | Dressed people with faces, hair and a tool per role; visitors wait outside, a body's width apart, with no tall tree between them and the opening views; the who-did-you-mean list; a double tap goes to a person; a walk to work each morning; knees and planted feet; reactions to the events that touch them | `wc/people-compare.jpg`, `wc/group-waiting.jpg`, `wc/crowd-list.jpg`, `video/people.webp`; `render3d-gait.test.ts` (planted foot slides 13% of the body's travel, was 58%; one foot always down), `render3d-reactions.test.ts`; crowd and double-tap tests on both 3D projects |
| 07 HUD and controls | "Bottom collapsible sheet"; the world stays visible; one-finger and two-finger touch | The sheet opens at half height with the village framed above it (324 px of a 390×844 screen, was 139 px) and a handle draws it up and down; a phone on its side gets a side sheet (it was a 126 px strip); pans and pinches tested with real touch events | `wc/phone-sheet-compare.jpg`, `wc/landscape-sheet-compare.jpg`; the sheet, pinch and every-size tests in `world3d.spec.ts` |
| 08 Optimisation | The cost after the changes | Re-measured at the end of round 7: the people are baked into a few meshes each, so the village draws 498 calls at the high tier's overview against 742 in the visual pass (triangles 628,775, was 597,483; 580,683 after round 8's level of detail) | `PERFORMANCE.md`, `data/perf-chain.json` (software rasteriser only) |
| 09 Visual QA | The matrix recaptured; a scorecard with 4 or more per area before "premium" | Matrix and size frames recaptured on the final build and looked at; scorecard redone (`FINAL_REVIEW.md`) | `docs/3d-rebuild/screenshots/` |
| 10 Release | PASS / FAIL / UNVERIFIED per phase | The table below | — |

**Still not possible here, and not claimed:** a real GPU, a real phone, real Safari on iOS (WebKit was exercised as Playwright's Linux
build, and it draws the 3D world; headless Firefox has no WebGL2 and falls back as designed), and a human player. An AI-driven
playthrough of the 3D build through its own interface is recorded in `docs/PLAYTHROUGH_NOTES.md`; it is not a playtest.

## Round 7 — the 3D build played to its end, and what that found

The review after round 6 still named two things this container can act on: no player had tried the game, and defects were listed rather
than fixed. Round 7 played Flood at Redbank from the title screen to a victory through the real interface (an automated agent clicking
and tapping one move at a time and deciding from the screenshots, on desktop and in phone emulation, on software WebGL; **not a human
playtest**), and fixed every defect it met. The run, move by move, is in `docs/PLAYTHROUGH_NOTES.md` ("Round 7").

| Phase file | Found in the playthrough | Fixed | Evidence |
|---|---|---|---|
| 07 HUD and controls | The title showed the old flat 2D map; the chooser and the briefing were flat pages between a 3D title and a 3D game; two briefing buttons did one thing | The living village stays up behind every menu (built once, held still behind text); the briefing shows the village about to be played; one button | `screenshots/playthrough/desktop-run.jpg` frames 1–3, `phone-run.jpg` |
| 05 Villagers and life, 07 | The coach's "Tap Mara Wells" pointed at a ring 14 px across from the overview, and both hinted people were marked although one is named | A gold call-out over the named person, the same size on screen at any distance | `tests/unit/render3d-guides.test.ts` (fails on the old marking) |
| 06 Belief magic and feedback | Nothing pointed at where a story's proof can be staged (a cold beacon is a grey cairn from the overview), and one beacon could not be clicked behind a cottage | Gold markers over the active story's proof sites (none while the coach points at a person, none on a beacon already burning well); a click on a marker picks its place | `render3d-guides.test.ts`; frame 6 |
| 07 | The morning report opened scrolled past its headline; costs said "1 AP" where everything else says Influence; "home(s)", "life/lives"; the ending caption repeated itself | The report is read from its headline with its buttons pinned; the cost wears the Influence pip; plurals; the ending left to the headline | the focus test in `a11y.spec.ts`; `render3d-guides.test.ts` |

What the playthrough could not say is unchanged: how a person reads the game, and anything about smoothness on real hardware.

## Round 8 — phase 08 closed out

The phase table still marked 3D-08 PARTIAL. Read again against `08_ASSET_PIPELINE_AND_OPTIMIZATION.md`, item by item, the build was
missing these, and each now exists with a test or a measurement:

| Phase 08 asks for | Was | Now | Evidence |
|---|---|---|---|
| A repeatable pipeline that records hierarchy, pivots, scale, normals, AO, vertex colour and texture format; a mesh asset manifest versioned with the source | Generators only; no record | The catalog of every generator (70 assets: cottages, civic buildings, the bridge, yard and field props, ten kinds of tree, ground cover, 14 people and their distant versions) and the manifest written from it; a test fails when the manifest drifts from the code | `scripts/asset-catalog.ts`, `docs/3d-rebuild/data/asset-manifest.json`, `ASSET_LICENSES.md` ("The asset manifest") |
| Validation tests for every scene item | Scene-level tests only | Every generator run with three seeds: unit normals on every vertex, origin at the base, library materials, triangle budgets, no bare blocks, determinism; every engine landmark kind drawn by a named generator; no stand-in in any authored village, as built or burned. They found and fixed zero-area triangles in three roofs | `tests/unit/render3d-assets.test.ts` |
| "Missing GLB triggers a graceful stylized 3D fallback for that asset only and logs issue, not blank whole game" | One failing generator would have thrown out of the whole build | A failing generator costs that place a plain stand-in (still pickable) and a console warning; the rest is built | the fallback test in `render3d-assets.test.ts` |
| LOD: "high detail for interactive key landmarks and close zoom; lower silhouette for distant scenery" | None | Each person, the densest mesh, has a distant version at about 47% of the triangles, swapped in under 40 px on screen (back at 48 px). At the overview all 14 are distant on a 1280×720 screen (22–30 px tall) and on a 390×844 phone (13–19 px), 10 of 14 on 1920×1080. At the switch size the two cannot be told apart even magnified four times. Buildings and trees have no distant version: the whole plate is in view, so there is no far scenery | `tests/unit/render3d-lod.test.ts`; manifest rows `person-*-far` |
| Track shader compile stalls | Not tracked | First-draw time, worst draw, hitches and frame p50/p95 recorded; a shader warm-up at build time compiles every material the village holds, hidden effect pools included. Before it, the first night's effects compiled three programs mid-play; now none | `World3D.info()`, `perf-3d.ts`, `PERFORMANCE.md` |
| Track texture memory | Texture count only | Estimated video memory of textures and render targets (`World3D.memory()`) | `PERFORMANCE.md` |
| A developer quality monitor behind a flag, not an always-on overlay | The adaptive tier monitor only | `?perf=1` shows frame times, calls, triangles, programs, video memory, stalls and how many people are drawn far; never shown otherwise | `src/ui/play/PerfMonitor.tsx`; e2e "the developer quality monitor shows only when the address asks for it" |
| "10 consecutive restart or new-seed cycles; no monotonic leak in owned resources" | Five loads, counts within 25% | Ten loads of three villages in turn: from the second visit on, each village holds exactly the same geometry (277 / 226 / 245), textures and shader programs; the heap stays level within the test's bound. A 30-load probe: GPU counts flat throughout; the heap creeps by a little under 0.1 MB per load, slowing (12.4 → 14.8 MB; the classic renderer, for comparison, 3.4 → 4.2 MB), and heap snapshots put most of it in compiled code. The terrain builder kept its working arrays alive through its dispose closure; with that fixed, the heap after each load is about 0.4 MB lower | e2e "ten new villages in a row leave nothing behind"; `PERFORMANCE.md` |
| Real-device performance targets ("aspirational until tested") | UNVERIFIED | Still **UNVERIFIED**: no GPU, phone or iPhone here. The plan allows Chrome desktop and a Playwright WebKit / iPhone-like viewport as the approximation, and those pass | `PERFORMANCE.md`, `data/browsers.json` |

## Round 9 — the 3D world on real hardware, and what its frames showed

Main CI has only a software rasteriser. Round 9 added a workflow that runs the 3D world on GitHub's Apple-silicon macOS runner: a real
GPU (Apple's, reached through the virtual machine's paravirtualised graphics device), in Chrome and in Safari, and Mobile Safari in the
iOS Simulator (`.github/workflows/real-hardware.yml`, `scripts/real-hardware.ts`; every number in `PERFORMANCE.md`, "Real hardware").
It is evidence, not a gate. Eight runs so far. What they found, and what was done about it:

| Phase file | Found on the real GPU | Done | Evidence |
|---|---|---|---|
| 08 "Dynamic quality based on observed frame budget" | Every session ended on the plainest tier, though the GPU drew a frame in 2–6 ms. A village's first frames compile shaders and upload the scene (0.3–3.2 s); an average seeded with them stretched the frame pacing and stepped the quality monitor down twice | Pacing and monitor go by medians of the frames since the village was built or the setting last changed, and late frames (where a busy GPU shows) count too | `src/render3d/pacing.ts`, `tests/unit/render3d-pacing.test.ts`; runs 2–4 |
| 08 "Cap DPR on phones … regression while camera moving" | At an iPhone's size the GPU drew a frame in 12–14 ms back to back, yet the game showed 30 a second: the phones' tier (medium) was capped at 45, which a 60 Hz display can only show on alternate beats | A phone's tier now draws at up to 60 a second while the view moves (a pan, a zoom, an orbit, a glide to a focus, the closing tour) and rests at 30 while it is still; every tier's caps divide 60 | `src/render3d/context.ts`, the cap test in `render3d-pacing.test.ts`; run 5, "while the view turns" |
| 10 "Would this look at home on the front page of a polished indie game collection?" | The art director's Day 1 frame, at full resolution on the GPU: the plate's cut sides were a smeared green-to-brown gradient (seven bands of vertex colour), so the island read as a slice of cake; and the river simply stopped at the cut, the bank's notch showing under it | The cut is painted strata with relief: a turf lip with grass hanging over it, topsoil with roots and pebbles, clay, bedded sandstone and jointed grey rock, its lower edge ragged with crags, the rock dark and wet where the river crosses. The river pours off the island in a waterfall that whitens as it falls and breaks into mist above the cloud sea, swelling with a flood; where it enters, it rises among boulders | `src/render3d/cliff.ts`, `src/render3d/falls.ts`, `tests/unit/render3d-edge.test.ts` (7 tests: the faces close the plate, the painted face repeats without a seam, the falls pour from the river's own surface, swell with a flood, and exist only where a river crosses the cut); frames below |
| 09 "touch hit targets correct" | The proof-marker test failed once in CI on the phone project (the other run of the same commit passed). The trace showed why: closing a card makes the camera re-frame the village on a phone, the test measured the marker mid-move, and on the slow software rasteriser the tap landed where the marker had been, on the shelter in front of the beacon | The test now measures only once two readings 0.3 s apart agree | the failed run's trace; `tests/e2e/world3d.spec.ts` |
| 08 (iOS) | Opening the link in the Simulator timed out four times in runs 3 and 4 (Mobile Safari's first launch on a fresh simulator) | Safari is launched first and given time, and the screen is photographed whatever happened | run 5 opened it at the first try (`screenshots/real-hw/run5-ios-simulator-mobile-safari.jpg`) |
| 06 and 07 (the marks over places and people) | Run 5's frames, at a pixel ratio of 2: the waterfall's mist drew as a scatter of dots. Every point sprite (smoke, flame, mist, the gold proof markers, the coach's call-out, the route dots) was sized in the drawing buffer's pixels, so on a screen of pixel ratio 2 it drew at half its size, and on a phone (ratio 1.5 on the medium tier) at two thirds; it was in the software phone frames too (pixel ratio 2), where the gold rings were smaller than on a desktop, unnoticed until the mist made it plain | Sprites are sized in CSS pixels and scaled by the renderer's pixel ratio each frame | `src/render3d/particles.ts` (`pixelRatio`), `tests/unit/render3d-sprites.test.ts` (every point sprite the world draws is scaled by it); the phone frames recaptured (`screenshots/wc/phone-round8-vs-round9.jpg`); seen fixed on the GPU in run 6 (`screenshots/real-hw/sprites-before-after-run5-run6.jpg`) |
| 10 (the waterfall up close) | Run 6's close-up of the falls at a pixel ratio of 2: the cliff's lip and the island's underside were inked straight through the falling water, a thin dark line in mid-air. The finishing chain inks from the depth of opaque things and lays the ink over everything | The sheet is a veil to the chain: it scales the code of what is behind it by what it lets through, so the ink and the hollows behind fade where the water is thick | `src/render3d/post.ts` (`markVeil`), the sheet's blending checked in `render3d-edge.test.ts`; `screenshots/wc/falls-ink-veil-before-after.jpg`; seen on the GPU in run 7 (`screenshots/real-hw/veil-before-after-run6-run7.jpg`) |
| 08 "stall tracking" | At 2880×1800 the world was built again once during a night, on the same tier, in runs 4, 6 and 7 (about 1.5 s of slow frames). It looked like a lost graphics context; once the world counted those, run 7 counted none. The cause was the world's own: after the quality monitor stepped the tier down, the world forgot which village it had just built, so the next action or night was taken for a new village and built from scratch, a second stall after every automatic step down | `World3D.rebuild` records the snapshot it builds from. The world also counts lost contexts now (`info().contextLosses`, shown by the `?perf=1` monitor) and survives one | `world3d.spec.ts`: "a change of quality tier builds the world once, and the next day only updates it" (failed before the fix: 3 builds for 2; passes after, desktop and phone) and "a lost graphics context is survived" (desktop and phone); run 7's counts. Run 8, after the fix, had its tier step before the night was loaded, so it did not test the fix on the GPU |

What runs 5 and 6 measured on the final pacing, in Chrome on the GPU (`PERFORMANCE.md` has every run): at an iPhone's size and pixel
ratio the medium tier rests at 30 frames a second (frame p50 33 ms, p95 49–50 ms) and turns the view at the display's 60 (p50 17 ms; p95
64 ms in run 5, 47 a second on average, and 17.7 ms in run 6, 60 a second); a 2880×1800 desktop window settles at about 30, rest or
motion, on the high tier or the medium. Safari at 1440×848 holds the high tier at 32–37 frames a second in run 5 and 50–56 in run 6 (the
shared GPU's speed varies from run to run).

What stays **UNVERIFIED**, because nothing here can reach it: a physical iPhone or Android phone (frame rate, heat, battery, touch by a
finger), a Mac's GPU used directly rather than through a virtual machine, Windows and Linux GPUs, and a human player.

## Phase table

Statuses are PASS / PARTIAL / FAIL / UNVERIFIED, re-checked in `FINAL_REVIEW.md`. "PARTIAL" names what is missing in the row. The later
world-class visual pass (finishing chain, art pass, phones and screens) is recorded in `docs/3D_QUALITY_REPORT.md`, against the art direction in
`docs/3D_VISUAL_STANDARD.md` and the plan in `docs/3D_IMPLEMENTATION_PLAN.md`.

| Phase | Status | Evidence / what is outstanding |
|---|---|---|
| 3D-01 Source audit and migration | PASS | This document. |
| 3D-02 Renderer, camera, lighting | PASS | Controls, picking and lighting work and are tested on software WebGL. Round 9: drawn on a real GPU (an Apple GPU through CI's macOS virtual machine, Chrome and Safari), where the game chose the 3D world by itself and the soft shadows, ambient occlusion and glow of the high tier were seen in full-resolution frames (`screenshots/real-hw/`), with frame times measured while the view turns. **UNVERIFIED:** the feel on a physical phone. |
| 3D-03 Terrain, water, weather | PASS | Engine-derived heights and depths asserted tile for tile; floods cover exactly the engine's flooded tiles. Round 6: reviewed as clips rendered frame by frame; the shoreline, the banks, the current and the forecast overlay fixed. Round 9: the plate's cut is painted strata with relief and a ragged rocky base, and the river pours off the island in a waterfall that swells with a flood and rises among boulders at its source (`cliff.ts`, `falls.ts`, `render3d-edge.test.ts`). Water has no refraction or reflection. |
| 3D-04 Architecture and environment | PASS | Detailed procedural kit; flaws listed in `VISUAL_QA.md` (plain plaster, repeated variants). No hand-modelled assets and no glTF pipeline (see below). |
| 3D-05 Villagers and life | PASS | Round 6: 14 dressed, individually recognisable people with role props, seen outside the buildings they visit; an ordered pick list for crowds; a double tap goes to a person; a morning walk to work with knees and planted feet (measured); state-driven reactions to engine events (tested). Round 8: a distant version of each figure, swapped in when a person is small on screen. Arms without elbows and tiny faces at the overview remain; "follow" is a camera focus, not a tracking camera. |
| 3D-06 Belief magic and feedback | PASS | Parity fixtures and the event-named-effect test; frames E, E2, F, F2. Effects are legible, not yet lavish. |
| 3D-07 Immersive HUD and controls | PASS | Desktop and phone layouts tested with real pointer events on the 3D projects, real touch for pans, pinches and the sheet's swipe; axe on the live 3D page. Round 6: a half-height phone sheet that leaves the village in view, and a side sheet on a phone on its side. **UNVERIFIED:** a real phone, a real screen reader. A selected house says what tonight's water does at its door and draws the way to the nearest shelter (`world3d.spec.ts`). |
| 3D-08 Asset pipeline and optimisation | PASS; frame-rate targets: mobile **met** and desktop **FAIL** on the one GPU measured, physical phones **UNVERIFIED** | Round 8 closed what the phase file lists: the asset manifest read from the generators and kept in step by a test, validation tests for every asset and every village, a per-asset stand-in when a generator fails, level of detail for the people, shader warm-up and stall tracking, video-memory estimates, a developer monitor behind `?perf=1`, and the ten-cycle leak check. Procedural generators are the pipeline (the phase allows Three.js geometry factories in place of Blender and glTF; `ASSET_LICENSES.md`). Round 9 measured the phase's targets on a real GPU (an Apple GPU through CI's macOS virtual machine): mobile, a median of 30 fps or more at a suitable quality, **met** at an iPhone's size (30 at rest, a median of 60 while the view moves); desktop, a stable 60 fps at the default camera, **FAIL** there (about 30 at 2880×1800; even the bare scene needs 22–24 ms a frame on that device). A native Mac, other GPUs and physical phones: **UNVERIFIED**. While the chunk arrives and the village is built, the stage shows a small sky with a floating island and a progress bar, and it lifts after the first frame is drawn. |
| 3D-09 Visual QA and gameplay regression | PASS | 16 real frames reviewed, 9 defects fixed, regression tables green (see `FINAL_REVIEW.md` for the exact runs). Automated pixel-diff baselines were not built; frames are reviewed by eye and by structural tests, as the phase allows. |
| 3D-10 Final art direction and release | **PASS**: premium by the phase 09 rubric, held to what was seen and measured; a physical phone and a human player **UNVERIFIED** | Reviewed, repaired, recaptured over nine rounds. Round 9 put the art director's Day 1 frame on a real GPU, where it showed the plate's cut as a smeared gradient and the river stopping at the cut; both fixed and seen again on the GPU (`screenshots/real-hw/edge-before-after-run4-run5.jpg`). The same runs found a phone frame cap that halved its frame rate, sprites drawn at half size on sharp screens, the ink of the island's underside drawn through the waterfall, and a full rebuild of the world after every automatic quality step; all four fixed, the first three seen fixed on the GPU. Scorecard (one reviewer's internal scores, `FINAL_REVIEW.md`, "Round 9"): every area 4, the phone area now resting on a real GPU at an iPhone's size and on Mobile Safari in the iOS Simulator. Round 7: played to a victory through the real interface by an automated agent. Nothing is deployed: there is no live URL and no Vercel deployment was made. |
