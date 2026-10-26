# BELIEF ENGINE

> **Make the village believe it — and reality obeys.** A 2D browser strategy roguelite where shared belief rewrites the
> physical laws of a small living region. You are the Keeper of Stories: you cannot move the river, but you can change what
> people believe, and enough belief becomes law.

This repository contains the **implemented game** (client-only TypeScript, free to run, no accounts or backend) plus the
phase prompts it was built from (`prompts/`). Honest status lives in [`docs/PROGRESS.md`](docs/PROGRESS.md); known limits in
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

## Play it

```bash
npm ci
npm run dev        # http://127.0.0.1:5173
# or a production build:
npm run build && npm run preview   # http://127.0.0.1:4173
```

Requires Node >= 22.12. Everything runs in the browser; saves and settings stay in `localStorage`. No network requests are made.

### 3-minute demo
1. Press **Play → Begin → Begin the first day**.
2. Tap the story card **River fears fire**, tap **Ivo Thatcher** on the map, press **Tell Ivo Thatcher** (1 Influence).
3. Spend the rest, press **End Day**, read the night digest. Open the **Laws** tab to watch support climb.
4. On a good-omen night (river *ebbing*, day 3 or 5), select a beacon in the **Village → Places** list and stage it as proof.
5. Light beacons before the surge (day 5+). Watch the flood hatch redirect around the glowing law zones.

### Controls
| Action | Mouse / touch | Keyboard |
|---|---|---|
| Select villager / landmark | click / tap | Village tab list (Tab, Enter) |
| Pan / zoom | drag / wheel, pinch, +/- buttons | arrows or WASD / `+` `-`, `0` fits |
| Choose story | click a card | `1`–`9` |
| Undo last action | Undo button | `U` or Ctrl+Z |
| Social lens | lens button | `L` |
| End the day | End Day button (confirms) | `Enter` (confirms) |
| Close / deselect | ✕ | `Esc` |

## The game loop
Claim → Spread → Belief → Law → Consequence. Stories travel along ties of trust between people who can walk to each other.
Skeptics need to *see* something. When a place believes enough, the story becomes law (white line on the support bar), with
side effects: fire spreads, watchers leave the fields, rain pools elsewhere. Rivals counter, and you can undo any planned action
until you end the day. Rules: [`docs/GAME_RULES.md`](docs/GAME_RULES.md).

### Scenarios
* **Flood at Redbank** (7 days): two verified winning routes on seed 1 — the **Fire Wall** and the **Witness Bridge** — and a
  no-action baseline that loses.

## Develop and test
| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (the engine forbids `Math.random`/`Date.now`) |
| `npm test` | Vitest unit + integration (determinism, replay, law causality, social mechanics, saves) |
| `npm run test:e2e` | Playwright (builds and serves production): desktop + phone, real-click winning traces, persistence, a11y |
| `npx tsx scripts/record-traces.ts` | re-record verified winning/losing traces into `tests/fixtures/` |
| `npm run test:sim` | bot tournament harness (see docs/BALANCE_REPORT.md) |

Architecture (`src/`): `engine/` pure deterministic simulation (core, social, laws, world, content, ai, save), `render/` Canvas2D
observer, `ui/` React, `audio/` procedural Web Audio. Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md). Content schema:
[`docs/CONTENT_SCHEMA.md`](docs/CONTENT_SCHEMA.md).

Developer flag: append `?debug=1` to expose `window.__belief` (state, hash) for tests. Debug runs are flagged and never feed
records.

## Deploying
Static build in `dist/` (Vite). Vercel: framework preset *Vite*, build command `npm run build`, output `dist`. **Not deployed by
this repository's automation; no live URL is claimed.**

## Roadmap status
- [x] Browser game: Flood at Redbank, undo, tutorial, debrief, saves, mobile layout
- [ ] More scenarios, procedural expeditions, progression (see `docs/PROGRESS.md`)
- [ ] MCP agent adapter, natural-language belief composer
