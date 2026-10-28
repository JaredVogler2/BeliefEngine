# Test results

Every line below was produced by the command beside it, in this repository, in this environment (Linux container, 4 vCPU, Node 22.22.0, npm 10.9.4).
Re-run the commands to reproduce; nothing here is estimated. Numbers change as the project grows, so each section names the commit it was taken at.

## Release gates on a fresh clone (commit `bb11761`)

`git clone` of the repository into an empty directory, checkout of that commit, then each gate in turn (`scratchpad/gates.sh`; wall time per step):

| Gate | Command | Exit | Time | Result |
| --- | --- | --- | --- | --- |
| 1. install | `npm ci` | 0 | 5 s | lockfile installs cleanly |
| 2. typecheck | `npm run typecheck` | 0 | 7 s | `tsc --noEmit`, strict |
| 3. lint | `npm run lint` | 0 | 7 s | ESLint, no warnings; the engine forbids `Math.random` and `Date.now` |
| 4. unit and integration | `npm test` | 0 | 50 s | **13 files, 210 tests passed** (committed tests at that commit) |
| 5. production build | `npm run build` | 0 | 7 s | JS 691 KB raw / 197 KB gzip, CSS 21 KB / 6 KB |
| 6. bundle budget | `npm run size` | 0 | <1 s | within the 260 KB / 12 KB gzip budget |
| 7. hosting configuration | `npm run verify:hosting` | 0 | 4 s | `vercel.json` headers and rewrites served to a real browser: 17 checks pass, **0 Content-Security-Policy violations**, 0 console errors; a negative control (an injected inline script) is blocked and seen |

## Browser end-to-end (Playwright 1.63, working tree after commit `bb11761` plus the Phase 14 test additions)

| Command | Result |
| --- | --- |
| `npm run test:e2e` (desktop 1366x768 and a Pixel-7 touch profile, Chromium 153; the config builds and serves production) | **105 passed, 0 failed, 49 skipped** (skips are tests that apply to one project only), 212 s |
| `npm run test:e2e:browsers` (Chromium, Firefox 155.0, WebKit 26.6, iPhone-14 profile; smoke spec) | **8 passed**, 45 s |
| `npm run test:sim:smoke` (8 policies x 4 scenario families x 8 paired seeds) | 256 runs in 58 s, **SMOKE OK**: 0 crashes, 0 timeouts, 0 non-deterministic runs, 0 engine violations, no-op never wins |
| `npm audit` / `npm audit --omit=dev` | 0 vulnerabilities / 0 vulnerabilities |
| `npx tsx scripts/licenses.ts --prod` | 3 production packages (react, react-dom, scheduler), all MIT; 266 installed in total, none copyleft-strong (4 MPL-2.0 and 1 CC-BY-4.0 build-time data, none shipped) |

## Phase 15 regression run (working tree after the review fixes)

| Command | Result |
| --- | --- |
| `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `npm test` | **16 files, 248 tests passed** (13 new in `review-fixes.test.ts`, 2 new MCP tests) |
| `npm run build` / `npm run size` | exit 0; JS 204 KB gzip (budget 260), CSS 5.8 KB gzip (budget 12) |
| `npm run test:e2e` (desktop and phone, Chromium 153) | **119 passed, 0 failed, 51 skipped** (project-specific skips), 4.1 min; includes `review.spec.ts` (coach and cards, first-night report, Harvest warning, what-if card, `T` key, phone top bar) |
| `npm run test:sim:smoke` | 256/256 runs in 59 s, **SMOKE OK**: 0 crashes, 0 timeouts, 0 engine violations, 32 repeated runs identical |
| `npx tsx scripts/monkey.ts` (random clicks, keys, tabs, reloads, undo; state replayed from its own record; every game finished) | before the fixes 8 sessions ok; after 12 sessions x 160 steps ok (`docs/data/fun-review/monkey.txt`) |
| `npx tsx scripts/fun-review-probes.ts --seeds 40`, `scripts/fun-review-rescue.ts --seeds 40` | numbers quoted in `docs/FUN_REVIEW.md`: `docs/data/fun-review/probes.json`, `rescue.json` |

The engine's states and hashes are unchanged by the review fixes (the morning report is derived, the threshold constant has the old value), which is why the saved traces and the 25 tournament traces still replay to the same hashes.

## Phase 17 regression run (working tree, natural-language beliefs)

Taken from the working tree before the phase 17 commit (commit `ee033aa` plus the uncommitted phase 17 changes); every row is the command beside it, run in this environment.

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `npm test` | **25 files, 337 tests passed** (new: `nl-balance` 11, `nl-compose` 25, `nl-corpus` 8, `nl-llm` 19 with a mocked provider, `nl-online-client` 4, `mcp-beliefs` 14, `advertised-costs` 3, `names` 1; `mcp-stdio` and `progress` extended) |
| `npm run build` / `npm run size` | exit 0; JS 225 KB gzip (budget 260), CSS 6.0 KB gzip (budget 12) |
| `npm run verify:hosting` | exit 0 (CSP checked in a real browser) |
| `npm run test:sim:smoke` | exit 0, **SMOKE OK** (256 runs: 0 crashes, 0 timeouts, 0 engine violations, repeated runs identical) |
| `npm run test:e2e` (desktop and phone, Chromium 153) | **131 passed, 0 failed, 51 skipped** (project-specific skips), 4.1 min; includes `inventor.spec.ts` (6 tests per viewport: refusal explained, honest preview, pay and tell, not enough Influence, normal run has no composer, the help list, modal fit and Escape, unranked debrief) |
| `npx tsx scripts/monkey.ts --sessions 12 --steps 160` (half the sessions are Inventor runs and fuzz the composer with valid sentences, refusals, injections, control characters, emoji, very long text; the state is replayed with its written beliefs) | **12 sessions of 160 steps (chapters, an expedition, desktop and phone): no crash, no blank screen, every state replayed, every game finished**; the 6 Inventor sessions opened the composer 115 times, previewed 81 sentences (valid, refused, injection, control characters, emoji, very long) and wrote 6 beliefs |
| `npx tsx scripts/nl-corpus.ts` on the three corpora | development 132/132 (tuned), second set 45/47 (33/47 on its first run), **final untuned set 31/36**; reports in `docs/data/nl/*-report.json` |
| `npx tsx scripts/nl-demo.ts` (three chapters) | ten sentences played from words to a measured effect; every no-model replay identical (`docs/data/nl/demo*.json`) |
| Six real Claude Code sessions through the MCP tools | `docs/data/nl/claude-code-inventor-session-*.md`; sessions 3 to 6 replay to the stored hashes (`npx tsx mcp/verify-run.ts`) |

## Phase 17 and 18 final run (the tree committed as phase 18)

Run after the last code change, every row the command beside it, in this environment (Chromium 153, Node 22). The phase 17 section above was taken earlier in the work and is superseded by these numbers.

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `npm test` | **27 files, 349 tests passed** (new in the last pass: version stamps and `RUN_VERSION_MISMATCH`, the source guards for unsafe code and keys, hostile MCP payloads over real stdio, held-back unlock days, the strength cap, the stale belief-language refusal) |
| `npm run build` / `npm run size` | exit 0; JS 226 KB gzip (budget 260), CSS 6.0 KB gzip (budget 12) |
| `npm run verify:hosting` | exit 0 (CSP checked in a real browser, with a negative control) |
| `npm run test:sim:smoke` | exit 0, **SMOKE OK**: 256 runs, 0 crashes, 0 timeouts, 0 engine violations, repeated runs identical |
| `npm run test:e2e` | **140 passed, 0 failed, 52 skipped** (project-specific skips), 6.2 min; includes Journey A (phone) and Journey C (both viewports) |
| `npm run acceptance:mcp` | **28 of 28 checks** (Journey B over the real stdio server) |
| `npm run acceptance:fun -- --seeds 8` / `--seeds 40` follow-ups | 38 exploit-hunt cells, 0 beat the built-in best route; follow-ups at 40 seeds: `docs/data/acceptance/fun-evaluation.json`, `fun-followup-40-*.json` |
| `npm run acceptance:novice` | 24 runs, all reached a debrief, 0 console errors, 0 won (see `docs/FINAL_ACCEPTANCE.md`) |
| `npm run monkey` (12 sessions, 160 steps) | no crash, no blank screen, every state replayed, every game finished; 115 composer dialogs opened, 81 sentences previewed, 6 beliefs written |
| `npm run replay:example`; `npm run mcp:verify -- <run>` for the four recorded Claude Code sessions 3 to 6 | IDENTICAL to the recorded hashes |
| `npx tsx scripts/verify-expeditions.ts --from 1 --to 1000` (to a scratch file) | 853 villages verified, the same winning planners for every seed as the committed catalog |

What this does **not** show: no live provider call (the online interpreter is mock-tested only), no human user, no deployed site. See `docs/NL_BELIEFS.md` and `docs/KNOWN_ISSUES.md`.

## Requirement to test map (the brief's matrix)

| Requirement | Where it is tested |
| --- | --- |
| AP and cost invariants, legal and illegal actions | `tests/unit/engine-core.test.ts`, `exploits.test.ts` (undo, junk targets, overspend), `mcp-service.test.ts` |
| Deterministic PRNG, stable replay hash | `rng-hash.test.ts`, `engine-core.test.ts` (replay), `tournament.test.ts` (25 saved traces replay to the same hashes), every tournament run is repeated and compared |
| Belief propagation: trust, evidence, opposition, memory | `engine-core.test.ts`, `factions.test.ts` (memory, credibility), `exploits.test.ts` (belief farming saturates, proof needs sight) |
| Law activation, hysteresis, contradiction, physical impact | `redbank.test.ts` ("belief -> law -> world is causal", "hysteresis, contradiction, collapse"), `exploits.test.ts` (no two contradicting laws live, no double flip in a night) |
| Hazards, navigation, survival, resources | `redbank.test.ts`, `scenarios.test.ts`, `exploits.test.ts` (no negative or overflowing resource, nobody off the map) |
| Victory, defeat, impossible scenario detection | `scenarios.test.ts`, `expedition.test.ts` (structure, do-nothing must lose), `catalog.test.ts` |
| Score, achievements, progress save and reset | `progress.test.ts`, `tests/e2e/atlas.spec.ts` |
| Bad scenario input and seed versions handled | `expedition.test.ts` (ids, seeds, share links), `engine-core.test.ts` (unknown scenarios, corrupt saves), `tests/e2e/persistence.spec.ts` |
| Two Redbank wins and one loss, exact reproducible trace | `redbank.test.ts` (fixtures: fire wall, witness bridge, no-action), `tests/e2e/redbank.spec.ts` (real clicks, identical hashes) |
| A victory trace per other authored level | `scenarios.test.ts`, `tests/e2e/scenarios.spec.ts` (Harvest: two routes; Ashwood: two routes) |
| Social effect -> law -> physical change -> objective | `redbank.test.ts`, `tests/e2e/redbank.spec.ts` (clicked trace to victory) |
| Cut-off map affects social contact | `engine-core.test.ts`, `redbank.test.ts` (gossip does not cross a fallen bridge) |
| NPC strategic reaction and player counterplan | `factions.test.ts`, the Redbank rival and `tests/e2e/redbank.spec.ts` (traces contain challenges) |
| Generated seeds, 1,000+ offline | `npm run gen:verify` (`docs/BALANCE_REPORT.md`: 1 000 villages generated and played, 853 verified), the tournament (1 000 expedition seeds x 8 policies, `docs/data/tournament/baseline/`) |
| Full save and reload keeps deterministic continuation | `engine-core.test.ts`, `exploits.test.ts`, `tests/e2e/persistence.spec.ts`, `mcp-service.test.ts` (restart mid-run) |
| Event log causal provenance, never contradicts state | `redbank.test.ts` (debrief chains), `tests/unit/tournament.test.ts` (causal clarity measured), `mcp-stdio.test.ts` (history carries `reason` and `cause`) |
| Clean load, tutorial, action, AP update, day resolution, event, win and lose screens | `tests/e2e/redbank.spec.ts`, `smoke.spec.ts`, `expedition-win.spec.ts` |
| Retry same seed, new seed, share seed, campaign mode, daily mode | `tests/e2e/modes.spec.ts`, `redbank.spec.ts` (defeat debrief, retry, new seed) |
| Phone and desktop, keyboard and tap, accessibility smoke | `mobile.spec.ts`, `a11y.spec.ts` (axe, keyboard turn, reduced motion), `visual.spec.ts` (5 sizes) |
| Save/resume, corrupt save recovery, settings and mute persistence | `persistence.spec.ts`, `resilience.spec.ts` |
| No console errors in common flows, no blank screens | every spec above asserts an empty error list; `resilience.spec.ts` breaks rendering on purpose and checks the recovery screen |
| Critical touch interactions at small phone width | `visual.spec.ts` and `resilience.spec.ts` at 320 px (also with large text), `mobile.spec.ts` at 390 px |

## 3D rebuild (final build of this work, commit `7a5ea63`)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint . --max-warnings 0` | exit 0, exit 0 |
| `npm test` | **29 files, 364 tests passed** (includes `render3d-plan.test.ts`: six effect-parity fixtures; `render3d-scene.test.ts`: heights, water depth and snapshot purity against the engine) |
| `npm run test:sim:smoke` | 256/256 runs in 60 s, **SMOKE OK** (engine untouched by this work) |
| `npm run build`, `npm run size` | exit 0; entry 232 KB gzip (budget 260), 3D chunk 197 KB gzip (budget 270, lazy), CSS 7.8 KB gzip (budget 12) |
| `npm run verify:hosting` | 19 checks ok; **the 3D world also loads and draws under the production Content-Security-Policy with 0 violations and 0 console errors** |
| `npm run test:e2e:3d` (`desktop-3d`, `phone-3d`: the real Three.js scene on software WebGL, real mouse and touch) | **32 passed, 0 failed**, 12.4 min: boots and draws, tap picks a villager, recorded winning line and no-op loss reach the identical hashes, medium and high tiers change nothing the engine computes, crowd/bridge/beacon picks, mid-day and mid-storm saves resume, no leaked geometry or textures, every started effect names a logged event, the 2D/3D toggle keeps the run, camera drag/wheel/orbit/reset within limits, options reach the world on its first frame, axe on the live 3D page, interface leaves at least 75% (desktop) / 60% (phone) to the world |
| `npm run test:e2e:classic` (`desktop`, `phone`: the classic map) | **140 passed, 0 failed, 52 skipped** (project-specific), 6.4 min |
| `npm run test:e2e:browsers` (Chromium, Firefox 155, WebKit 26.6, iPhone-14 profile; smoke) | **8 passed**, 52 s |
| `npx tsx scripts/browser-3d-smoke.ts` | Chromium PASS (3D drew); WebKit 26.6 PASS (3D drew); Firefox 155 headless fell back to the classic map (no usable WebGL2) |
| `npx tsx scripts/perf-3d.ts --seconds 8` | scene cost and software-GL frame times per tier: `docs/3d-rebuild/PERFORMANCE.md` (**not a GPU; no real device was measured**) |
| `npx tsx scripts/capture-matrix.ts` | 16 real frames: `docs/3d-rebuild/screenshots/`, reviewed in `docs/3d-rebuild/VISUAL_QA.md` |

Failures met on the way (all fixed or explained in `docs/3d-rebuild/FINAL_REVIEW.md`): a classic map flake from a toast that re-rendered cards, two timing races (a sheet that could not take focus in its first frame; an axe contrast reading taken mid-fade), a first-frame bug (the forecast reached the 3D world only after the first click), and tests that assumed the desktop angle after the phone view was turned.

## 3D visual pass (the finishing chain, the art pass and the quality report; final build of this work)

Every browser run below was made alone, in a container with no GPU (SwiftShader), with fonts made to match the CI runner.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint .` | exit 0, exit 0 |
| `npm test` | **29 files, 364 tests passed** |
| `npm run build`, `npm run size` | exit 0. Entry 232 KB gzip (budget 260), 3D chunk 211 KB gzip (budget 270, lazy), CSS 8.5 KB gzip (budget 12) |
| `npm run test:e2e:3d`, first full run | desktop-3d **19 passed**; phone-3d **17 passed, 1 failed, 1 skipped** (the screen-size test runs on desktop only); 16.1 min. The failure was real: opening a phone's view controls re-framed the village, so the camera test's reset missed home by 12 units. Fixed, then the camera test passed on both projects and 3 times in a row on the phone |
| `npx playwright test --project=phone-3d`, after the fix | **18 passed, 0 failed, 1 skipped** (the desktop-only screen-size test), 4.5 min |
| `npm run test:e2e:classic` | **141 passed, 0 failed, 53 skipped** (project-specific), 6.3 min |
| `npm run test:e2e:browsers` (Chromium, Firefox, WebKit, iPhone profile; smoke) | **8 passed**, 53 s |
| `npm run verify:hosting` | 19 checks ok, including **the 3D world drawing under the production Content-Security-Policy with 0 violations and 0 console errors** |
| `npm run test:sim:smoke` | 256/256 runs in 60 s, **SMOKE OK** (engine untouched) |
| `npx tsx scripts/browser-3d-smoke.ts` | Chromium PASS and WebKit 26.6 PASS (3D drew, no console errors); Firefox 155 headless fell back to the classic map |
| `npx tsx scripts/perf-3d.ts --out docs/3d-rebuild/data/perf-chain.json` | per-tier frame times, 1% lows, draw calls, triangles, heap, startup and the finishing chain's own cost: `docs/3d-rebuild/PERFORMANCE.md` (**software rasteriser; no GPU or real device was measured**) |
| `npx tsx scripts/capture-motion.ts` (and `--dt 0`) | frame-to-frame change by region, about 2% per 2 s step; noise floor exactly 0: `docs/3D_QUALITY_REPORT.md` |
| `npx tsx scripts/capture-matrix.ts` and `capture-3d.ts` at four screen sizes | 16 + 4 real frames, each one looked at: `docs/3d-rebuild/screenshots/`, `docs/3D_QUALITY_REPORT.md` |

## Round 6 (people, crowds, phone sheets, motion)

Every browser run below was made alone, in the same container (no GPU, SwiftShader), with fonts made to match the CI runner.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint .` | exit 0, exit 0 |
| `npm test` | **31 files, 370 tests passed** (new: `render3d-reactions.test.ts`, `render3d-gait.test.ts`) |
| `npm run test:e2e:classic` | **141 passed, 0 failed, 55 skipped** (project-specific), 10.2 min |
| `npm run test:e2e:3d` | **43 of 44 passed** on the run before the last two round 6 commits. The one failure was the double tap under load (the page timed a tap by when it got to the event, not when the finger came up); fixed, it then passed **6 of 6** repeats. The full suite on the final commit is in round 7 below |
| `BE_CROSS_BROWSER=1 npx playwright test tests/e2e/smoke.spec.ts --project=firefox --project=webkit --project=iphone -g "3D world boots"` | **3 passed**: WebKit and the iPhone profile booted the 3D world, drew a modelled village and picked a person by a tap; Firefox (headless, no WebGL2) said so and played on the classic map |
| `npx tsx scripts/browser-3d-smoke.ts` | Chromium 153 **PASS** and WebKit 26.6 **PASS** (3D drew, 0 console errors); Firefox 155 **FALLBACK** (no WebGL2) |
| `npx tsx scripts/capture-sequence.ts` (river, people, storm, village) | the review clips, rendered frame by frame and looked at; they found the river, bank, forecast, stillness and gait defects fixed this round. The final clips and their measures are in round 7 below |
| Gait, measured in `render3d-gait.test.ts` | the planted foot slides **13%** of the body's travel (the old cycle: 58%, which the test fails); the lower sole never floats more than 0.012 above the ground (measured 0.005; the old hip bob: 0.061, which the test fails); the swinging foot clears the ground by 0.04 |

## Round 7 (the 3D build played through its interface; the build this work ends on)

Every browser run below was made alone, in the same container (no GPU, SwiftShader), with fonts made to match the CI runner.

| Command | Result |
| --- | --- |
| A playthrough through the real interface (`docs/PLAYTHROUGH_NOTES.md`, "Round 7") | Flood at Redbank, seed 1, Normal, from the title screen to the debrief by real clicks (desktop) and taps (phone emulation, day 1): **victory, 14 of 14 alive, score 771**. Not a human playtest. Every defect it met was fixed (`4e6bb87`) |
| `npx tsc --noEmit`, `npx eslint .` | exit 0, exit 0 |
| `npm test` | **32 files, 374 tests passed** (new: `render3d-guides.test.ts`: the proof sites, the coach's call-out, which fails on the old marking, and the aftermath captions) |
| `npm run build`, `npm run size` | exit 0. Entry 234 KB gzip (budget 260), 3D chunk 216 KB gzip (budget 270, lazy), CSS 8.9 KB gzip (budget 12) |
| `npm run verify:hosting` | 19 checks ok, including the 3D world under the production Content-Security-Policy |
| `npm run test:e2e:3d`, locally | **18 of 44 passed, 0 failed**, on the build just before the last two small edits, when the run was stopped to free the one browser this container may run for the evidence capture. The full browser suites (classic and 3D, with this round's proof-marker test) then ran in CI on the round's last commit (`156cdf9`): **all green**, the 3D job 43 passed and 3 skipped in 37.7 min. Round 8 ran both suites to completion locally (below) |
| `npx tsx scripts/capture-sequence.ts` (river, people, storm, village) | four clips, 48 frames each at 24 fps, rendered frame by frame on the final build; the worst neighbouring pair changed 1.05× (village), 1.06× (river, storm) and 1.19× (people, a following camera) as much as the median: no pops. Strips, change images and measures: `docs/3d-rebuild/video/` |
| `npx tsx scripts/capture-matrix.ts --quality high` and `capture-3d.ts` at four screen sizes | 16 + 4 frames recaptured on the final build, each one looked at: `docs/3d-rebuild/screenshots/` |
| `npx tsx scripts/perf-3d.ts --out docs/3d-rebuild/data/perf-chain.json` | high tier, calm: 498 draw calls (742 in the visual pass), 628,775 triangles, 545 ms a frame on the CPU rasteriser; the full table in `docs/3d-rebuild/PERFORMANCE.md` (**software rasteriser; no GPU or real device was measured**) |
| `npx tsx scripts/browser-3d-smoke.ts` | Chromium 153 **PASS** and WebKit 26.6 **PASS** (3D drew, 256 calls, 268,116 triangles on the low tier, 0 console errors); Firefox 155 **FALLBACK** (no WebGL2 headless) |
| People before and after (`wc/people-compare.jpg`) | six people from the opening view at `22b7b1c` (four of them inside the buildings they visited) and on the final build (all six outside, dressed, each with a role's hat or tool) |

## Round 8 (phase 08 closed out; the build this work ends on)

Every browser run below was made alone, in the same container (no GPU, SwiftShader), on the round 8 build (`46345f0` plus documentation).

| Command | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint .` | exit 0, exit 0 |
| `npm test` | **34 files, 386 tests passed**. New: `render3d-assets.test.ts` (9 tests: every asset sound, on its origin, in budget, from library materials, deterministic; the written manifest equal to the generators' output; no stand-in in any authored village, as built or burned; the per-asset fallback) and `render3d-lod.test.ts` (3 tests: the distant figures, the swap with its hysteresis, both versions freed). The asset tests failed on their first run on a real defect, zero-area triangles in three roofs, since fixed. A deliberately stale manifest makes the drift test fail |
| `npm run build`, `npm run size` | exit 0. Entry 235 KB gzip (budget 260), 3D chunk 218 KB gzip (budget 270, lazy), CSS 9.1 KB gzip (budget 12) |
| `npm run test:e2e:classic` | **141 passed, 0 failed, 55 skipped** (project-specific skips), 7.7 min |
| `npm run test:e2e:3d` | **45 passed, 0 failed, 3 skipped** (project-specific skips), 27.6 min. New: "ten new villages in a row leave nothing behind" (replaces the five-load leak test) and "the developer quality monitor shows only when the address asks for it" |
| The ten-load leak test, one run with its figures | from the second visit on, Redbank, Ashwood and Harvest Hollow each hold exactly the same geometry (277 / 226 / 245), textures and shader programs; heap after loads 5–7 averages 14.2 MB, after loads 8–10 14.6 MB (the table is in `docs/3d-rebuild/PERFORMANCE.md`) |
| `npm run verify:hosting` | 19 checks ok, including the 3D world under the production Content-Security-Policy |
| `npx tsx scripts/browser-3d-smoke.ts` | Chromium 153 **PASS** and WebKit 26.6 **PASS** (3D drew, 256 calls, 244,070 triangles on the low tier, 0 console errors); Firefox 155 **FALLBACK** (no WebGL2 headless) |
| `npx tsx scripts/perf-3d.ts --out docs/3d-rebuild/data/perf-chain.json` | high tier, calm: 498 draw calls, 580,683 triangles (628,775 in round 7: the people's distant figures), 35 shader programs, first draw 1.37 s, median frame 531 ms and p95 597 ms on the CPU rasteriser; the full table in `docs/3d-rebuild/PERFORMANCE.md` (**software rasteriser; no GPU or real device was measured**) |
| `npx tsx scripts/asset-manifest.ts` | 70 assets written to `docs/3d-rebuild/data/asset-manifest.json` |
| Scratch probes (not part of the repository) | people's height on screen at the overview and the close/distant comparison at the switch size, looked at magnified; programs compiled during a night before and after the warm-up (3 → 0); 30 loads with the 3D and the classic renderer; heap snapshots between loads 9 and 24. Results in `PERFORMANCE.md`, "Round 8" and "Resource hygiene" |

## Round 9 (real hardware; the cut edge and the falls; the phone frame cap; the build this work ends on)

Every local browser run below was made alone, in the same container (no GPU, SwiftShader). The real-hardware runs were made by the
`Real hardware` workflow on GitHub's `macos-15` runner: an Apple GPU through the virtual machine's paravirtualised graphics device,
Chrome 153 and Safari 26.6, and the iOS 26.2 Simulator. Its numbers are in `docs/3d-rebuild/PERFORMANCE.md`, "Real hardware".

| Command | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint .` | exit 0, exit 0 |
| `npm test` | **38 files, 406 tests passed**, on the final code. New: `render3d-sprites.test.ts` (2 tests: every point sprite the world draws multiplies its size by the shared pixel ratio, and the particles read the one the world sets before each frame), `render3d-edge.test.ts` (7 tests: every face of the plate's cut starts at the ground's own edge and ends on the root's top ring, with no gap at a corner; the relief stays within 0.2 units and fades out at the corners; the painted face repeats round the rim without a seam; no crag under the river; one waterfall in Redbank, poured from the river's own surface at the lip, transparent where the lip is dry, every column falling and thrown outwards; a flood at the lip raises the sheet by the engine's depth; no falls and no spring in a village without a river), `render3d-pacing.test.ts` (7 tests in `07a39e7`, now 8: every tier's frame caps divide 60, and a phone's tier draws 60 while the view moves and rests at 30), `render3d-quality.test.ts` (3 tests: `?quality=auto` and the automated-browser rule) |
| `npm run build`, `npm run size` | exit 0, on the final code. Entry 235 KB gzip (budget 260), 3D chunk 224 KB gzip (budget 270, lazy), CSS 9.1 KB gzip (budget 12) |
| `npm run test:e2e:3d` | **44 passed, 1 failed, 3 skipped**, 32.7 min, on the build of `f951751` without its last four small changes (the marker test's fix, the falls kept inside the plate's corners, the mist dimmed at night, the frame cap shown by `?perf=1`). The one failure is the phone proof-marker test, still in its old form, failing exactly as it had in CI on `0455c2a` (a tap on the east beacon's marker picked the shelter in front of it). The CI run's trace showed why: on a phone, closing a card makes the camera re-frame the village, and the test measured the marker mid-move |
| The proof-marker test, fixed (it measures once two readings 0.3 s apart agree), `--repeat-each=3` on both 3D projects | **6 passed, 0 failed** (3 desktop, 3 phone), on the build of `f951751`. Before the fix, the phone project had failed it in 2 of 2 runs (CI and local) |
| `npm run test:e2e:3d`, on the final build | **45 passed, 0 failed, 3 skipped**, 31.0 min: every 3D test on the desktop project and on the phone project (a Pixel 7, pixel ratio 2.625, where the sprite fix applies), the proof-marker test included. The three skips are by design: two phone-only tests on the desktop project, and the seven-size layout test, which runs on the desktop project |
| `npx tsx scripts/capture-sequence.ts` (village, storm), `capture-matrix.ts`, `capture-3d.ts` (four sizes) | the two clips (the change between neighbouring frames at most 1.05 times its median: no jump), the 16 matrix frames and the 4 size frames recaptured on the build with the cut and the falls; the frames drawn above a pixel ratio of 1 (I, L and the three phone sizes) captured again after the sprite fix; and every frame that shows the falls (the village clip, the 16 matrix frames, the 4 sizes) captured again on the final build, after the veil. Every frame looked at |
| `npx tsx scripts/perf-3d.ts` | the table in `docs/3d-rebuild/PERFORMANCE.md`, "The current build" (measured before the sprite fix, which changes only the size of point sprites) |
| `npx tsx scripts/browser-3d-smoke.ts`, on the final build | Chromium and WebKit draw the 3D world (frames drawn, no console errors), WebKit compiling the changed finishing chain with its own shader compiler; this container's Firefox has no WebGL2 and falls back to the classic map, as designed |
| Scratch probes (not part of the repository) | the start of the build before this round's work (`0455c2a`) and of this one, alternating four times each: medians 8.5 and 8.7 s; the shader programs of both, each named by the objects that use it (two new, the falls' sheet and the spring's boulders); the waterfall up close at pixel ratios 1 and 2 after the sprite fix, and twice at ratio 1 (the sheet's streaks differ from frame to frame, the mist's size does not) |
| Real hardware, run 6 (on `b544b83`) | the sprite fix seen on the GPU (the mist a soft cloud at a pixel ratio of 2); the iPhone-sized window turning the view at the display's full 60 (frame p50 16.7 ms, p95 17.7 ms); a player's first night at that size compiled no shader (58 programs before and after); at 2880×1800 the world was built again during the night on the same tier (unexplained; see the next rows); up close, the ink of what stands behind the waterfall drawn through it (fixed below) |
| After run 6: the waterfall's sheet a veil to the finishing chain; lost graphics contexts counted | `render3d-edge.test.ts` now also checks the sheet's blending; a new browser test, "a lost graphics context is survived" (the context lost on purpose and given back: the world is built again, draws, and counts the loss), **2 passed** (desktop and phone), with the finishing-chain and developer-monitor tests, **4 passed**, on the build with both changes. The waterfall up close rendered before and after (`screenshots/wc/falls-ink-veil-before-after.jpg`) |
| CI on `f951751` | **every job passes**, in both its runs (push and pull request): lint, types, unit tests, build, size, `verify:hosting` and the simulation smoke; the classic Chromium suite and the cross-browser smoke; the 3D suite (software WebGL, desktop and phone, the proof-marker test included); and the real-hardware workflow (run 5) |

## What is not covered, plainly

* No human has played the game: no uncoached session, no fun or clarity claim (`docs/PLAYTEST_PROTOCOL.md`). An automated agent played the 3D build to a victory through its interface (round 7); that is not a playtest.
* No physical phone or tablet. WebKit in the local suites is Playwright's Linux build and the iPhone profile is emulation. Since round 9 the 3D world has also run on a real GPU (an Apple GPU through CI's macOS virtual machine, in Chrome and in Safari 26.6) and in Mobile Safari in the iOS Simulator, as measurements and frames, not as the end-to-end suite.
* No deployed URL exists, so no live smoke test has been run (`docs/RELEASE_CHECKLIST.md`).
* Audio was exercised against a fake Web Audio graph (voice caps, leak freedom, settings); nobody has listened to it.
* The MCP server and the natural-language composer are recorded in their own phases' sections once built.
