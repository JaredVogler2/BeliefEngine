# BELIEF ENGINE — Claude Code execution playbook

This folder is a **sequential implementation program**, not a generic idea dump. The objective is to deliver a **real, polished, playable, replayable 2D browser strategy game** in which social belief literally alters a village's physical laws. A pretty simulation with no objectives, meaningful player choices, or credible win/loss loop is a FAILURE.

## Start here

Open this repository in Claude Code (Opus 5.5 Max). Begin a fresh run with the text of [00_MASTER_GOAL.md](00_MASTER_GOAL.md), or paste:

> /goal Read and execute prompts/00_MASTER_GOAL.md and the numbered phase prompts in prompts/ in order. Implement the actual browser game in this repository, not a planning document or mock UI. Commit and test each phase. Follow acceptance criteria and quality gates; prioritize a playable, fun vertical slice before expanding scope. Make autonomous decisions when details are missing. Show proof of gameplay, deterministic tests, measured playtest results, and a deployed-ready production build. Continue until the release gate is met, or precisely document the blocker and resume point.

If the coding environment only supports executing one bounded task per context window, hand it the **next incomplete phase file**, then restart with 00_MASTER_GOAL.md plus that phase. Phase progress and results must be written in docs/PROGRESS.md and docs/DECISIONS.md.

## Read order and game construction phases

| Order | File | Executable output |
|---|---|---|
| 00 | [00_MASTER_GOAL.md](00_MASTER_GOAL.md) | Contract, phase-gating, autonomous workflow |
| 01 | [01_GAME_DESIGN_BIBLE.md](01_GAME_DESIGN_BIBLE.md) | Mechanics specification, goals, testable economy |
| 02 | [02_ARCHITECTURE_AND_BOOTSTRAP.md](02_ARCHITECTURE_AND_BOOTSTRAP.md) | Real project, engine, build, tests, playable shell |
| 03 | [03_DETERMINISTIC_SOCIAL_SIMULATION.md](03_DETERMINISTIC_SOCIAL_SIMULATION.md) | Trust graph, belief propagation, explainable causality |
| 04 | [04_LAWS_AND_WORLD_SIMULATION.md](04_LAWS_AND_WORLD_SIMULATION.md) | Actual map, physical rules, threats, contradictions |
| 05 | [05_PLAYABLE_VERTICAL_SLICE.md](05_PLAYABLE_VERTICAL_SLICE.md) | Complete beginning-to-end Flood at Redbank run |
| 06 | [06_INTERFACE_AND_ONBOARDING.md](06_INTERFACE_AND_ONBOARDING.md) | Readable, tactile UX; tutorial; controller/touch |
| 07 | [07_CONTENT_AND_SCENARIOS.md](07_CONTENT_AND_SCENARIOS.md) | Narrative, rival agendas, multiple authored scenarios |
| 08 | [08_PROCEDURAL_RUNS_AND_REPLAYABILITY.md](08_PROCEDURAL_RUNS_AND_REPLAYABILITY.md) | Valid seeds, emergent variety, daily challenge |
| 09 | [09_PROGRESS_AND_REWARDS.md](09_PROGRESS_AND_REWARDS.md) | Meaningful variety unlocks, fair score/achievements |
| 10 | [10_AGENT_AI_AND_REACTIONS.md](10_AGENT_AI_AND_REACTIONS.md) | Adaptive villagers, political factions, reactions |
| 11 | [11_BALANCE_BOTS_AND_TELEMETRY.md](11_BALANCE_BOTS_AND_TELEMETRY.md) | Simulation tournaments, balance reports, exploit checks |
| 12 | [12_AUDIO_ART_AND_JUICE.md](12_AUDIO_ART_AND_JUICE.md) | Coherent art direction, audio, responsiveness, feedback |
| 13 | [13_MOBILE_ACCESSIBILITY_PERFORMANCE.md](13_MOBILE_ACCESSIBILITY_PERFORMANCE.md) | Phone, keyboard, accessibility, robust performance |
| 14 | [14_TESTING_SECURITY_RELEASE.md](14_TESTING_SECURITY_RELEASE.md) | Hard production gates, E2E, deployment, final QA |
| 15 | [15_ADVERSARIAL_FUN_REVIEW.md](15_ADVERSARIAL_FUN_REVIEW.md) | Final critical review and replayability corrections |

## Non-negotiable product goals

- **Actually playable**: title → onboarding → a complete strategic run → win or loss → debrief → replay, no TODO screens or fake interactions.
- **Meaningful decisions**: at least two viable strategic approaches to each core scenario; impactful tradeoffs, scarce Influence, time pressure and observable effects.
- **Belief is the game**: local social influence drives real, visibly changing world states; social and physical simulation must be linked, not two unrelated minigames.
- **Understandable causality**: every major outcome can be traced to a claim, supporter network, event, or conflicting belief.
- **Replayability**: authored levels plus deterministic seeded procedural runs, new situations and combinations, multiple victory paths and adaptive factions.
- **Polished from early builds**: fluid 2D graphics, strong information hierarchy, sound controls, satisfying animations, clear win/loss, keyboard and touch.
- **Free to run**: no required LLM API, pay-per-call service, login, database, hosting server, paid assets, or proprietary asset license for single-player.
- **Truthful verification**: never report tests played or flows seen unless actually executed. Keep commands, screenshots where possible, and structured test results.
- **Privacy and fairness**: offline local saves, opt-in telemetry only, non-predatory engagement design, seeded shareable runs.

## Scope & implementation philosophy

Target a **single-player, client-only TypeScript browser game**, hosted as static assets (Vercel-compatible). Use a **headless deterministic simulation** that can be unit-tested without React/Phaser, with Phaser for the map and React for legible HUD/menus. Choose current stable compatible versions after checking official docs; document selections. Render is an observer of state, never the authoritative simulator.

Ship the **seven-day flood vertical slice** before adding endless progression. Limit unnecessary dependencies, giant art pipelines and premature multiplayer. All "AI villagers" should use inspectable state machines/utility scores and bounded deterministic randomness, not remotely hosted language models. Avoid treating an imagined simulation as gameplay: build actual objectives, challenge, feedback, victories, failures, and restart loops.

## Phase protocol

For EACH numbered phase: (1) inspect current repository, (2) identify gaps vs. phase acceptance criteria, (3) implement, (4) run typecheck/lint/unit and existing E2E as relevant, (5) manually interact with the game when browser tools are available, (6) update docs/PROGRESS.md with actual evidence and remaining defects, (7) commit only implemented work, (8) advance. If a phase is partly blocked, make the maximum honest progress and document the exact block. **Never write "implemented" for code that was not executed or verified.**

Do not expand a phase if earlier build/run paths are broken. No excessive conceptual essays in lieu of code. The final game must be enjoyable when played without reading these files.