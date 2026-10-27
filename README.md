# Belief Engine

> **Make the village believe it, and reality obeys.** A 2D browser strategy roguelite where shared belief rewrites the physical laws of a
> small living region. You are the Keeper of Stories: you cannot move the river, but you can change what people believe, and enough belief
> becomes law.

Client-only TypeScript (React + Canvas2D + Web Audio, no assets to download), free to run, no accounts, no analytics, no backend. Saves and settings
stay in your browser. The simulation is a pure, deterministic engine: the same seed and the same actions always give the same world, which is what
makes replays, the bot tournaments and an AI-agent interface possible.

**Status, honestly:** playable and tested (see [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md)); **not deployed anywhere**, so there is no live URL; difficulty and fun
have been measured on bots only and **no human playtest has been run** ([`docs/PLAYTEST_PROTOCOL.md`](docs/PLAYTEST_PROTOCOL.md) is the script). Known limits:
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md). Build log: [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Play it

```bash
npm ci
npm run dev                          # http://127.0.0.1:5173
npm run build && npm run preview     # production build on http://127.0.0.1:4173
```

Needs Node >= 22.12. Once loaded the game makes no network requests.

### A three-minute first game
1. **Play**, choose **Flood at Redbank**, **Begin**. Read the briefing, begin day 1.
2. Tap the story card **River fears fire** (or **Bridge stands watched**), tap a villager on the map (try **Ivo Thatcher**), press **Tell Ivo Thatcher** (1 Influence). Undo is free until you end the day.
3. Spend the rest, press **End Day** and read the night digest. Watch the **Laws** tab: support climbs towards the white line.
4. On a good-omen night, pick a landmark (a beacon, the bridge) in **Village > Places** and stage it as proof: people who *see* something change their minds far more than people who only hear.
5. The surge comes on day 7. Check **Tonight** (the forecast) before you end each day, and keep an eye on food.
6. After the debrief, **Retry this seed**, **New seed**, **Try another approach**, or **Share this seed**.

### Controls
| Action | Mouse / touch | Keyboard |
|---|---|---|
| Select a villager or place | click / tap | Village tab list (Tab, Enter) |
| Pan / zoom the map | drag / wheel, pinch, +/- buttons | arrows or WASD / `+` `-`, `0` fits |
| Choose a story | click a card | `1`-`9` |
| Undo the last action | Undo button | `U` or Ctrl+Z |
| Social lens (trust ties) | lens button | `L` |
| End the day | End Day (asks to confirm) | `Enter` (asks to confirm) |
| Close / deselect | close button | `Esc` |

## What is in the game
* **Three hand-made chapters**, each won in more than one way: *Flood at Redbank* (7 days: fire wall, witnessed bridge, bells), *The Harvest That Refused to Grow* (9 days: moonlight work, or a grain caravan that needs a trader's trust) and *The Wolves of Ashwood* (8 days: smoke fires around the pens, or a decoy fire deep in the wood).
* **Expeditions:** a generated village from any seed (river, drought or wolves), with 1-3 run modifiers (e.g. *Stubborn elders*, *Silent bells*, *Restless wolves*). The catalog behind "another village" and the **Daily village** holds only villages that a scripted planner has verified winnable; typed-in seeds still work and are labelled unverified.
* **Share links** carry only the mode, seed and versions (never state or code) and are validated on open.
* **Rivals and factions** that announce their moves a day ahead and can be answered; villagers who weigh a post on the bridge against their own children; laws that lose credibility when they visibly fail.
* **The Atlas of Belief:** laws you have seen take hold, lore, postcards, 20 badges, unlocks that add *choices* (pledges, a draft, twists), your stats, and an export/import of the archive. Nothing in it is needed to win a scenario.
* **Save files:** Settings > Download this game / Load a game file.
* **Accessibility and platforms:** keyboard play, screen-reader text for everything on the map, reduced motion, text size, high contrast, 320 px layouts ([`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md)). Tested in Chromium, Firefox and WebKit builds; no real device has been tested.

Rules (authoritative, matching the code): [`docs/GAME_RULES.md`](docs/GAME_RULES.md). Procedural generation and modifiers: [`docs/EXPEDITIONS.md`](docs/EXPEDITIONS.md).

## Develop and test
| Command | What it does |
|---|---|
| `npm run typecheck` / `npm run lint` | strict TypeScript; ESLint (the engine forbids `Math.random` and `Date.now`) |
| `npm test` | Vitest: determinism and replay, social mechanics, laws and physics, scenarios, generator, progression, factions, exploit probes, audio, performance, saved tournament traces |
| `npm run test:e2e` | Playwright (builds and serves production): desktop and phone, real-click winning traces for every chapter and a generated village, persistence and recovery, 5 viewport sizes, axe audits |
| `npm run test:e2e:browsers` | smoke tests in Chromium, Firefox, WebKit and an iPhone-14 profile (needs `npx playwright install firefox webkit`) |
| `npm run test:sim` / `npm run test:sim:smoke` | headless bot tournaments (paired seeds, JSON/CSV/Markdown reports) / a one-minute CI benchmark |
| `npm run gen:verify` | verify generated villages offline and refresh the catalog (after any generator or rules change) |
| `npm run build && npm run size` | production build and bundle budget |
| `npm run verify:hosting` | serve `dist/` with `vercel.json`'s headers and check the Content-Security-Policy in a real browser |
| `npm run profile` / `npx tsx scripts/capture-states.ts` | cold-start and interaction timings / screenshots of real engine states |

`src/`: `engine/` pure deterministic simulation (core, social, laws, world, content, ai, gen, progress, save), `render/` Canvas2D observer, `ui/` React, `audio/` procedural Web Audio.
Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md). Content schema: [`docs/CONTENT_SCHEMA.md`](docs/CONTENT_SCHEMA.md). Balance evidence: [`docs/BALANCE_REPORT.md`](docs/BALANCE_REPORT.md).
Developer flag: `?debug=1` exposes `window.__belief` (state, hashes) for tests; debug runs earn nothing.

## Privacy
No cookies, no analytics, no accounts, no third-party requests. `localStorage` holds your autosave, settings and Atlas archive. The shipped page's Content-Security-Policy
(`vercel.json`) allows only same-origin scripts and connections.

## Deploying
Static build in `dist/`. Vercel: framework preset *Vite*, build `npm run build`, output `dist`; `vercel.json` carries the headers and the single-page fallback.
**Nothing has been deployed by this repository's automation, so no live URL is claimed.** Exact steps and the release checklist: [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md).

## Licence
MIT ([`LICENSE`](LICENSE)). No third-party art, music or fonts ([`docs/ASSETS.md`](docs/ASSETS.md)); runtime dependencies are `react` and `react-dom` (MIT).
