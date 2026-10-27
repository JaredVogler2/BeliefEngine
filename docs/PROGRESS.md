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
| 09 | Progress + rewards | verified: Atlas, 20 achievements each with a proof test, 6 unlocks that add options, pledges/drafts, readable score, export/import/reset |
| 10 | Agent AI + reactions | verified: utility intents with reasons, law credibility + capped memory, faction bans/endorsements, callouts; 19 tests |
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

### Session 2, later (phases 09-10)
* Phase 09: Atlas of Belief (laws, lore, postcards, badges, unlocks, stats, archive export/import/reset), 20 achievements, each earned in a test by a named planner and seed;
  six unlocks that add choices rather than power (an extra Redbank opening story with a real cost, the Oath pledge, three more pledges, story twists, a hostile-council preset, draft mode);
  rewritten score (categories disclosed, efficiency only on victory, multipliers for difficulty/pledges/draft/twists). Debug-loader runs are archived but earn nothing; archive import is defensive (v1 migration, unknown fields dropped, size caps).
  Fixtures re-recorded after the score change.
* Phase 10: villager intents as small utility scores with reasons (the bridge watch versus a threatened child), law credibility damage and capped memory, Council gathering bans (announced a day ahead, answerable, budgeted), faction endorsements, "what is going on" callouts, COUNTER offered against announced campaigns before the rumour exists.
  A new unit test found a real bug in my own endorsement code (it crossed a fallen bridge); fixed.
  Finding: laws almost never wavered in 300+ bot runs, so the planned "phoenix" achievement was replaced by "Unshaken" (win after a law visibly failed before the last night and still stood). See KNOWN_ISSUES.
* Evidence (executed): `npx vitest run` 179 passed; `npx playwright test` 59 passed, 23 project-specific skips; `npm run gen:verify` refreshed: 853 of 1000 villages verified, 0 crashes, 0 do-nothing wins.

### Session 3 (phase 11)
* Built the headless tournament harness (`npm run test:sim`, `npm run test:sim:smoke`), eight scenario-agnostic bot policies on the public API plus a privileged rollout oracle, telemetry per run, paired same-seed comparisons, rescue / decision-density / determinism samples, JSON + CSV + Markdown reports, regression traces (`tests/fixtures/tournament-traces.json`), and exploit-probe tests (`tests/unit/exploits.test.ts`).
* Baseline (32 000 runs: 4 scenario families x 8 policies x 1 000 seeds, 2 685 s): 0 crashes, 0 timeouts, 0 engine violations, all repeated runs identical. Findings: Redbank's Witness Bridge route won 99.5-100% of seeds with a single outcome and no rival move; Harvest and Ashwood are won only by one law each among the generic bots; the best plan is close to the oracle everywhere.
* **Balance change from the data (paired re-run, same 1 000 seeds):** a second Redbank rival (Old Harl, "A crowded bridge is a broken bridge"). Bridge-builder 99.5% -> 81.5% (+5/-185), evidence-first 100% -> 99.8%, the fire route bit-for-bit unchanged, Harvest/Ashwood/expeditions identical state hashes in 2 400 sampled runs. Evidence-first still wins almost everything and the report says so.
* Integrating the rival exposed a real bug (a rival bridge rumour sent its own believer to stand on the bridge and cost the food that route needs); fixed in `ai/routines.ts`, `ai/utility.ts`, `world/hazards.ts`.
* Evidence (executed): `npx vitest run` 233 passed (this includes tests for work that lands in later commits of the same session: audio, performance and MCP), `npx playwright test` 89 passed / 47 project-specific skips, `npm run lint` and `npm run typecheck` clean.
* Not done / honest limits: no human playtest (protocol in `docs/PLAYTEST_PROTOCOL.md`); bots are proxies; scenarios D and E still unbuilt.
