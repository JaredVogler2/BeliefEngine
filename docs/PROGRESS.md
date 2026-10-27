# Progress

Honest status per phase. "verified" means executed and checked in this repository; evidence is listed. Nothing is marked
implemented unless it was run.

| Phase | Topic | Status |
|---|---|---|
| 00 | Master goal / contract | applied |
| 01 | Design bible, rules, schema | working (docs/GAME_RULES.md, docs/CONTENT_SCHEMA.md) |
| 02 | Architecture + bootstrap | verified (npm ci, typecheck, lint, unit, build, E2E all run) |
| 03 | Social simulation | verified by unit tests (hub vs hermit, cut graph, saturation, reverse signal, determinism) |
| 04 | Laws + world | verified: causal toggle test (same beacons + flood, only belief differs), hysteresis, contradiction |
| 05 | Flood at Redbank vertical slice | verified: both strategies replayed via real clicks to victory with identical state hashes; loss path; phone run |
| 06 | Interface + onboarding | verified: HUD, panels, tutorial, social lens, debrief, phone layout; axe scan clean |
| 07 | Content + scenarios | 3 of 5 shipped and verified (Redbank, Harvest, Ashwood); scenarios D and E not built (see KNOWN_ISSUES) |
| 08 | Procedural runs | verified: 3 biomes, 14 modifiers, daily/share/replay flows, 1 000-seed offline run (docs/EXPEDITIONS.md) |
| 09 | Progress + rewards | not started |
| 10 | Agent AI + reactions | partial (rival faction campaign/rebuttal, evacuation) |
| 11 | Balance bots + telemetry | partial (bot framework, baseline policies) |
| 12 | Audio + art + juice | not started |
| 13 | Mobile / a11y / perf | not started |
| 14 | Testing, security, release | not started |
| 15 | Adversarial fun review | not started |
| 16 | MCP agent play | not started |
| 17 | Natural-language beliefs | not started |
| 18 | Final cross-interface acceptance | not started |

## Log

### Session 1
* Scaffolded Vite/React/TS project; pinned versions (see DECISIONS D1).
* Built the deterministic engine: core types, stateless RNG, canonical hashing, persuasion math, propagation,
  law resolver (hysteresis, contradictions), effect primitives, flood/fire/bridge hazards, rivals, routines,
  actions with exact previews, session with undo, save/load, replay.
* Flood at Redbank authored (14 villagers, 34 ties, 4 factions, 4 claims incl. one rival, 3 rituals).
* Evidence (command `npx tsx tmp/botrun.ts 30`, scratch script): no-op 0/30 wins, random 3/30, greedy fire-wall bot 26/30,
  greedy witness-bridge bot 28/30. Bots use exact previews, so these are upper bounds on human performance, and difficulty
  tuning is scheduled for phase 11.

### Session 1, later
* Built React UI + Canvas2D renderer (title with live backdrop, briefing, play HUD, claim hand, inspect/laws/village/forecast/log
  panels, plan bar with undo and confirmed End Day, night digest, debrief with causal chains, settings, how-to).
* `window.__belief` debug API (only with `?debug=1`).
* **Bug found by E2E and fixed**: pressing Enter opened the End Day dialog and the same key press activated its primary button,
  ending the day without confirmation. Fixed with `preventDefault` + deferred focus; covered by the keyboard test.
* Evidence (all executed): `npx vitest run` 49 passed; `npx playwright test` 25 passed / 9 project-specific skips
  (desktop 1366x768 and Pixel-7-like 390x844 touch, Chromium 1.63 build). axe-core WCAG 2.x A/AA scan has no critical or serious
  violations on title, how-to, settings, scenarios, briefing, play, villager card, laws, forecast (desktop and phone).
* Not yet verified: Firefox / WebKit (not installed in this environment), real devices, human fun.

### Session 2 (phases 06-08 completed)
* Phase 06/07: generalised the HUD, forecast, tutorial and renderer to crop, trade, wolf and smoke scenarios; **Harvest** and **Ashwood** play end
  to end in the browser. Real-click Playwright replays of the recorded winning traces (two strategies each) reach victory with
  identical state and event hashes; "do nothing" is a defeat with a scenario-specific debrief.
* Bugs found by those E2E runs and fixed: counter-rumour button hidden for villagers a rival had *announced* a campaign against
  (only shown after they already believed it); adoptable rival claims (Ashwood's decoy theory) were missing from the starter hand;
  trade deals had no UI entry point.
* **Latent bug found while building the generator:** woodcutters never produced fuel, because the dawn tally ran after
  villagers had gone to bed (`duty === 'rest'`). Fixed (count at dusk); Ashwood fixtures re-recorded (same canonical seed, new hashes).
* Performance: `cloneState` is now a hand-written copy that shares the immutable map and event objects; a full bot run went from
  about 0.55 s to 0.15 s and the unit suite from 13 s to 4 s, with all recorded hashes unchanged.
* Phase 08: expedition generator (river, drought, wolves), 14 run modifiers each with a measuring test, share-link validation,
  UTC daily village, verified-village catalog. Evidence: `npm run gen:verify` over seeds 1-1000: 0 crashes, 0 villages won by doing
  nothing, 85.5% won by at least one scripted planner (river 83%, drought 98%, wolves 75%), 51.6% by two or more different planners; 640 distinct
  signatures. Full table in docs/BALANCE_REPORT.md. The 95% aspiration is **not** met, so the catalog is used for daily and
  "another village" and typed-in seeds are labelled unverified.
* Evidence (executed): `npx vitest run` 117 passed; `npx playwright test` 49 passed, 19 project-specific skips.
