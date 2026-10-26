# BELIEF ENGINE

> **Make the village believe it—and reality obeys.**
>
> A planned browser strategy game where influence networks, rivalry, evidence and public belief rewrite the laws of a living settlement. This repository currently contains a **detailed implementation prompt series** for Claude Code Opus 5.5 Max; it is **not yet an implemented/playable game**.

## Start building

**Full executable prompt series:** [prompts/README.md](prompts/README.md)

**Master agent brief:** [prompts/00_MASTER_GOAL.md](prompts/00_MASTER_GOAL.md)

Paste into Claude Code with this repository opened:

\`\`\`text
/goal Read prompts/README.md and prompts/00_MASTER_GOAL.md. Execute numbered phases 01–18 in order, implementing and testing the actual game. Commit after every verified phase. Prioritize playable Flood at Redbank vertical slice, then campaign, procedural expeditions, realistic balancing, polish, optional MCP gameplay and safe player-written belief composition. The final game must be browser-playable, replayable, responsive, and deterministically testable. No mock controls, invented tests or aspirational completion claims. Record evidence in docs/PROGRESS.md, and continue with the next phase without asking for routine design decisions.
\`\`\`

If agent context/credit limits require shorter runs, execute the current phase file, update docs/PROGRESS.md with verification evidence and resume from the next incomplete phase on a new run.

## Vision

Beliefs spread through a physically grounded social network. Strong enough local belief activates a bounded reality-law (e.g. a river avoids lit beacons). Those laws change flood paths, bridge behavior, food growth and villagers' incentives, often with dangerous side effects. The goal is not to maximize a global meter; it is to save a village by understanding and manipulating interconnected social and physical systems under a hard threat clock.

- Browser single-player: React/Phaser + pure TypeScript deterministic simulation; local saves; no mandatory cloud API.
- Agent play: optional Model Context Protocol adapters exposing legal game actions; a local MCP server is a required phase in the revised roadmap; secure remote sessions are optional infrastructure.
- Player-composed beliefs: offline ontology-based interpretation supports bounded phrasings; opt-in LLM backend can interpret broader open-ended prose and propose balanced executable DSL, **not arbitrary generated scripts**.
- Replayability: at least 3 different campaign scenarios, constrained validated procedural expeditions, daily seeded puzzle, competing viable strategies, meaningful consequences.
- Verification: automated reproducible victories/losses, bot tournaments, real browser tests, and final cross-interface security and fun review.

## Status

- [x] Comprehensive phase-by-phase implementation prompts committed.
- [ ] Actual browser game implemented.
- [ ] Playable vertical slice validated.
- [ ] MCP agent-game adapter implemented.
- [ ] Player-authored natural-language beliefs implemented.
- [ ] Production deployment tested.

**Do not interpret a prompt as shipped functionality.** The development agent must implement, test, commit and document each phase, then update this status honestly.