# Progress

Honest status per phase. "verified" means executed and checked in this repository; evidence is listed. Nothing is marked
implemented unless it was run.

| Phase | Topic | Status |
|---|---|---|
| 00 | Master goal / contract | applied |
| 01 | Design bible, rules, schema | working (docs/GAME_RULES.md, docs/CONTENT_SCHEMA.md) |
| 02 | Architecture + bootstrap | in progress |
| 03 | Social simulation | engine working, unit-tested partly |
| 04 | Laws + world | engine working (flood, fire, bridge, rain/bells) |
| 05 | Flood at Redbank vertical slice | engine: two bot strategies win, no-op loses; UI not yet built |
| 06 | Interface + onboarding | not started |
| 07 | Content + scenarios | not started |
| 08 | Procedural runs | not started |
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
