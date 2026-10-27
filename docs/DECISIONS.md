# Decisions (ADR-lite)

Each entry: context → decision → consequence. Newest last.

## D1. Toolchain versions (2026-10)
Node 22.22 LTS, TypeScript **6.0.3** (typescript-eslint 8.72 declares `typescript <6.1`, so TS 7 is deliberately not used), Vite 8.3.5 + @vitejs/plugin-react 6.1.2, Vitest 5.0.5, React 19.3.1, ESLint 10.13, Playwright **1.63.0** (matches the preinstalled Chromium build; a newer `@playwright/test` would not find the browser), `@modelcontextprotocol/sdk` 1.32.2 + zod 4. Versions are exact-pinned in `package.json` and locked in `package-lock.json`.

## D2. Canvas 2D renderer instead of Phaser
The master brief proposes Phaser. After weighing it we render the map with a hand-written Canvas 2D renderer behind `src/render/`:
* Every sprite is procedurally drawn, so Phaser's asset pipeline, scene graph and ~1 MB of bundle bring little.
* The brief asks for a single mounted canvas, discrete layers, interpolation, bounded particles: all straightforward in 2D canvas and easy to cap for phones.
* Hit-testing, camera, DPR handling and reduced-motion are fully under our control and testable in Playwright.
* Phaser 4 (the current major) is new; avoiding a major-version integration risk.
The seam is preserved: the renderer is an observer of `RunState` projections (`src/render/`), never an authority; a Phaser renderer could replace it without touching `src/engine`.

## D3. Stateless, domain-separated randomness
Every random draw is `rand(seed, domain, ...keys)` (hash-based), not a stream with a cursor. Draws therefore do not depend on evaluation order, the number of previous draws, or array insertion order, which makes replays, previews, undo and alternate orderings trivially safe. `RunState` stores the seed; "PRNG state" is the seed plus (day, ids) keys. No transcendental math functions (`exp/pow/log/hypot`) are used in the simulation path, so state hashes are portable across JS engines.

## D4. All player actions are immediate, deterministic and undoable; randomness lives only in the passive night
Actions apply instantly (the player sees the exact conviction change), cost Influence immediately, and are fully reversible until End Day via an exact-state undo stack (no timeline-scumming because actions contain no dice). Randomness appears in the overnight resolution only (who gossips with whom, spark ignition), and every probability is visible or forecastable. Staged evidence strength is a deterministic function of a *visible omen* (forecast), so skill is reading the forecast, not rerolling.

## D5. One law vocabulary for authored, rival and player-written beliefs
All physical effects are `RuleSpec`s (subject × effect × trigger × radius × intensity × thresholds × side-effects) executed by a fixed table of effect primitives in `src/engine/laws/effects.ts`. Authored claims reference canonical specs; the natural-language composer (phase 17) compiles to the same type. No free text becomes code. Compatibility of subject/effect/trigger is validated by `validateSpec`.

## D6. Self-contained RunState
`RunState` embeds the static scenario block (`scn`), including claim definitions and rituals, plus any player-composed claim definitions. Saves and replays therefore do not depend on registry drift. `scn` is shared by reference between clones (never mutated) to keep clones cheap.

## D7. Belief model
Conviction −100..100; speaker signal saturates at |conv| 50; negative trust reverses the signal at 40% strength ("they distrust the speaker, so it backfired"); skeptics discount hearsay (−65%) but not eyewitness accounts (−25%) and respect staged proof; per-claim daily cap ±34; finite attention (190 total positive conviction); contradictory claims crowd each other out. See `docs/GAME_RULES.md`.

## D8. The Keeper has a location
Direct persuasion requires a walking path from the Keeper's anchor (scenario landmark). When the Redbank bridge falls, the east bank can no longer be spoken to directly, which gives the bridge real strategic weight (and makes messengers already on the far bank valuable).

## D9. Procedural villages are verified by witnesses, not promised
The generator (docs/EXPEDITIONS.md) checks structure and that doing nothing loses, then scripted planners that use only the public action API try to win each village offline. A village a planner wins is "verified"; the verified catalog feeds the daily village and "another village". Typed-in seeds still work and are labelled unverified. Guaranteed solvability is never claimed. Rejected alternative: a runtime solver on the player's device (too slow on a phone, and it would still not be a proof).

## D10. Modifiers are data plus a few engine hooks
Static modifier effects rewrite a private copy of the scenario when a run is created; dynamic ones are read through `modActive`. Pledges, drafts and optional starting stories use the same mechanism (`progress/options.ts`) and are enforced by the engine, so a pledge cannot be broken by accident and the score multiplier is always honest.

## D11. Unlocks expand options, never raw power
Every unlock opens a choice that changes a rule of the run (an extra opening story with a real cost, a draft, a pledge, twists on story chapters). Nothing multiplies Influence; every scenario is beatable with none of them. Debug-loader runs are archived but earn nothing.

## D12. Agents are utility scores you can read
Villager decisions are small integer utility scores with authored reasons and seeded bounded tie-breaks, evaluated at discrete moments (dusk, dawn), not per frame. Every faction move is announced a day ahead with its reason, costs budget, has a cooldown and has a counter. Memory is capped at six items per villager and only scales persuasion within 0.55-1.15.
