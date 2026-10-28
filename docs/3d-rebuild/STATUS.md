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

## Phase table

Statuses are PASS / PARTIAL / FAIL / UNVERIFIED, re-checked in `FINAL_REVIEW.md`. "PARTIAL" names what is missing in the row. The later
world-class visual pass (finishing chain, art pass, phones and screens) is recorded in `docs/3D_QUALITY_REPORT.md`, against the art direction in
`docs/3D_VISUAL_STANDARD.md` and the plan in `docs/3D_IMPLEMENTATION_PLAN.md`.

| Phase | Status | Evidence / what is outstanding |
|---|---|---|
| 3D-01 Source audit and migration | PASS | This document. |
| 3D-02 Renderer, camera, lighting | PASS | Controls, picking and lighting work and are tested on software WebGL. **UNVERIFIED:** feel and shadow quality on a real GPU. |
| 3D-03 Terrain, water, weather | PASS | Engine-derived heights and depths asserted tile for tile; floods cover exactly the engine's flooded tiles. Round 6: reviewed as clips rendered frame by frame; the shoreline, the banks, the current and the forecast overlay fixed. Water has no refraction or reflection. |
| 3D-04 Architecture and environment | PASS | Detailed procedural kit; flaws listed in `VISUAL_QA.md` (plain plaster, repeated variants). No hand-modelled assets and no glTF pipeline (see below). |
| 3D-05 Villagers and life | PASS | Round 6: 14 dressed, individually recognisable people with role props, seen outside the buildings they visit; an ordered pick list for crowds; a double tap goes to a person; a morning walk to work with knees and planted feet (measured); state-driven reactions to engine events (tested). Round 8: a distant version of each figure, swapped in when a person is small on screen. Arms without elbows and tiny faces at the overview remain; "follow" is a camera focus, not a tracking camera. |
| 3D-06 Belief magic and feedback | PASS | Parity fixtures and the event-named-effect test; frames E, E2, F, F2. Effects are legible, not yet lavish. |
| 3D-07 Immersive HUD and controls | PASS | Desktop and phone layouts tested with real pointer events on the 3D projects, real touch for pans, pinches and the sheet's swipe; axe on the live 3D page. Round 6: a half-height phone sheet that leaves the village in view, and a side sheet on a phone on its side. **UNVERIFIED:** a real phone, a real screen reader. A selected house says what tonight's water does at its door and draws the way to the nearest shelter (`world3d.spec.ts`). |
| 3D-08 Asset pipeline and optimisation | PASS (real-device performance **UNVERIFIED**) | Round 8 closed what the phase file lists: the asset manifest read from the generators and kept in step by a test, validation tests for every asset and every village, a per-asset stand-in when a generator fails, level of detail for the people, shader warm-up and stall tracking, video-memory estimates, a developer monitor behind `?perf=1`, and the ten-cycle leak check. Procedural generators are the pipeline (the phase allows Three.js geometry factories in place of Blender and glTF; `ASSET_LICENSES.md`). Budgets met and measured on software GL. The phase's frame-rate targets are "aspirational until tested", and they are untested on any GPU or phone: **UNVERIFIED**. While the chunk arrives and the village is built, the stage shows a small sky with a floating island and a progress bar, and it lifts after the first frame is drawn. |
| 3D-09 Visual QA and gameplay regression | PASS | 16 real frames reviewed, 9 defects fixed, regression tables green (see `FINAL_REVIEW.md` for the exact runs). Automated pixel-diff baselines were not built; frames are reviewed by eye and by structural tests, as the phase allows. |
| 3D-10 Final art direction and release | PARTIAL | Reviewed, repaired, recaptured. Round 6 scorecard: every area 4 of 5 (one reviewer's scores, `FINAL_REVIEW.md`); **premium is not claimed**, because phase 09 asks for smoothness on a phone and no real phone or GPU was available. Round 7: played to a victory through the real interface by an automated agent and every defect it met fixed (`PLAYTHROUGH_NOTES.md`). Nothing is deployed: there is no live URL and no Vercel deployment was made. |
