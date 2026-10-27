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

## What is not covered, plainly

* No human has played the game: no uncoached session, no fun or clarity claim (`docs/PLAYTEST_PROTOCOL.md`).
* No real phone or tablet, no real Safari; WebKit here is Playwright's Linux build and the iPhone profile is emulation.
* No deployed URL exists, so no live smoke test has been run (`docs/RELEASE_CHECKLIST.md`).
* Audio was exercised against a fake Web Audio graph (voice caps, leak freedom, settings); nobody has listened to it.
* The MCP server and the natural-language composer are recorded in their own phases' sections once built.
