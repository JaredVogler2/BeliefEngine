# 3D world: performance, budgets and what was (and was not) measured

**Read this first.** Every number below was produced by a command in this repository, in a Linux container whose only WebGL is a
**software rasteriser (SwiftShader, on 4 CPU cores)**. There is no GPU in that machine. So:

* the **scene counts** (triangles, draw calls, geometries, textures) and the **memory** figures are properties of the scene and carry over to real hardware;
* the **frame times** are a CPU rasteriser's. They are useful for comparing tiers and for catching regressions, and they say **nothing** about what a
  graphics card or a phone will do. **No real GPU, no real phone and no iPhone has been profiled. Real-device frame rate is UNVERIFIED.**

There are two sets of numbers here:

* the **current build**, the one this work ends on: the finishing chain, the visual pass's art, and the dressed people of rounds 6 and 7
  (next section, `docs/3d-rebuild/data/perf-chain.json`); the visual pass's own figures (commit `effadc8`) are kept beside them;
* the **earlier build**, measured at commit `1809880`. That was before the cloud sea, the later art work and the chain. Its sections are
  kept below for comparison (`docs/3d-rebuild/data/perf.json`).

## The current build, with the finishing chain

**How it was measured.**

1. `npm run build && npx vite preview --port 4173`, then `npx tsx scripts/perf-3d.ts --out docs/3d-rebuild/data/perf-chain.json`.
2. The page runs in headless Chromium, in a 1366×768 window at render scale 0.5 (683×384 pixels drawn).
3. For each tier, the script waits for the title's own 3D village to be drawn (so its build is not counted), then loads a calm Day-1
   village and a flood night and waits for the first drawn frame.
4. It then draws 40 frames back to back, waiting for each one with a one-pixel read: first with the finishing chain, then without it.
5. The chain's cost is the difference between the two medians.

| Tier (chain) | Scene | Triangles | Draw calls | Load → first frame | of which the world build | JS heap | Median frame | fps | 1% low fps | Same frame, chain off | Chain cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| low (ink) | calm Day 1 | 268,116 | 256 | 5.1 s | 1.06 s | 45 MB | 296 ms | 3.4 | 2.9 | 304 ms | -8.0 ms |
| low (ink) | flood night | 291,392 | 292 | 7.1 s | 1.21 s | 34 MB | 312 ms | 3.2 | 2.6 | 313 ms | -0.9 ms |
| medium (AO 2 + ink + FXAA) | calm Day 1 | 512,660 | 493 | 7.3 s | 1.30 s | 30 MB | 443 ms | 2.3 | 1.5 | 423 ms | +19.7 ms |
| medium (AO 2 + ink + FXAA) | flood night | 546,486 | 523 | 10.6 s | 0.88 s | 32 MB | 464 ms | 2.2 | 1.8 | 433 ms | +31.3 ms |
| high (AO 4 + ink + bloom + FXAA) | calm Day 1 | 628,775 | 498 | 10.3 s | 0.79 s | 32 MB | 545 ms | 1.8 | 1.5 | 497 ms | +47.9 ms |
| high (AO 4 + ink + bloom + FXAA) | flood night | 696,718 | 532 | 10.5 s | 0.99 s | 32 MB | 566 ms | 1.8 | 1.5 | 536 ms | +30.2 ms |

**Reading it:**

* **The people cost a third fewer draw calls.** Rounds 6 and 7 dressed the fourteen people (garments, faces, hair, a tool per role) and
  baked each into a few vertex-coloured meshes. The scene has more triangles and far fewer draw calls than the visual pass's:

  | Measure (calm Day 1) | Visual pass (`effadc8`) | Current build |
  |---|---:|---:|
  | Draw calls, high tier | 742 | 498 |
  | Draw calls, medium tier | 735 | 493 |
  | Draw calls, low tier | 376 | 256 |
  | Triangles, high tier | 597,483 | 628,775 |
  | Triangles, low tier | 245,992 | 268,116 |
  | Median frame, high tier, on this CPU rasteriser | 566 ms | 545 ms |

* **What the chain costs here.** On medium and high it cost 20–48 ms a frame in this run, against frames of 440–570 ms on this CPU
  rasteriser (the visual pass's three runs gave 19–37 ms). On low, where the chain is only the ink line, it measured −8.0 and −0.9 ms:
  that is this machine's noise, since medians move by about ±10 ms between runs. What the chain costs on a GPU or a phone is
  **UNVERIFIED**.
* **Load → first frame** is wall-clock time, from handing the page a saved run to its first drawn frame: 5.1–10.6 s here.
  * The world's own build (terrain, buildings, foliage and people made into meshes) is 0.8–1.3 s of that.
  * The rest is everything else before the first frame: compiling shaders (which SwiftShader does on the CPU), pre-filtering the sky
    light and drawing the first frame. It was not broken down further.
  * The title now draws a 3D village of its own. The script waits for it to be drawn before it starts the clock, so these figures are
    the game's own start, like the visual pass's.
  * A GPU driver compiles shaders much faster, but how fast this loads on a given phone is **UNVERIFIED**.
* **The scene grew since the earlier tables**, with the cloud sea and islets, the visual pass's denser forests, hedgerows and yard
  props, and the dressed people.

  | Measure | Earlier build (`1809880`) | Current build |
  |---|---:|---:|
  | Triangles, high tier, calm | 494,863 | 628,775 |
  | Draw calls, high tier, calm | 688 | 498 |
  | Triangles, low tier, calm | 222,742 | 268,116 |
  | Draw calls, low tier, calm | 352 | 256 |
  | World build on this machine | 0.6 s | 0.8–1.3 s |

* **Multisampling.** The first run of this measurement made the chain look *cheaper* than drawing without it.
  * The canvas was 4× multisampled even under the chain, so switching the chain off made the direct path pay for multisampling the scene.
  * The canvas now asks for multisampling only where the chain cannot run, so the comparison is like for like.
  * All the numbers above were measured after that change.
* **The JS heap** varies between runs with garbage collection: 30–45 MB here, against 28–40 MB in the visual pass and 30–38 MB before it.

## Earlier build: scene cost per quality tier (commit `1809880`)

How it was measured: `npx tsx scripts/perf-3d.ts --seconds 8`, the script as it was then. It used headless Chromium, a 1366×768 window and render
scale 0.5. For each tier it loaded a calm Day-1 village and a flood night (day 5 of a threat-aware run), waited for the first drawn frame,
waited 1.5 s, then watched 8 s of the paced live loop.

| Tier | Scene | Triangles | Draw calls | Geometries | Textures | JS heap | Build (load a run → first frame) |
|---|---|---:|---:|---:|---:|---:|---:|
| low | calm | 222,742 | 352 | 181 | 13 | 30 MB | 0.59 s |
| low | flood night | 229,000 | 390 | 204 | 13 | 30 MB | 0.61 s |
| medium | calm | 421,427 | 688 | 181 | 15 | 32 MB | 0.61 s |
| medium | flood night | 434,589 | 724 | 204 | 15 | 32 MB | 0.64 s |
| high | calm | 494,863 | 688 | 181 | 15 | 36 MB | 0.60 s |
| high | flood night | 528,083 | 724 | 204 | 15 | 38 MB | 0.65 s |

(Triangles and calls are what the renderer reports for the last drawn frame, so they include the shadow pass on the tiers that have one;
`low` has no shadow map. The JS heap is the page's, from `performance.memory`; **GPU memory is not measured**: the textures are 13–15 small
canvases (256 px, 128 px on `low`), so it is small, but that is an estimate, not a reading.)

What the tiers change (`src/render3d/context.ts`, `PROFILES`): pixel-ratio cap 2 / 1.5 / 1, shadow map 2048 / 1024 / off, water shader
high / medium / low, grass and prop density ×1 / 0.6 / 0.3, tree count ×1 / 0.8 / 0.55, frame cap 60 / 45 / 30, particle budget ×1 / 0.6 / 0.3.

## Earlier build: frame times on the software rasteriser (not a GPU)

| Tier | Frames actually drawn per second | JS time to submit a frame | Page `requestAnimationFrame` p50 / p95 |
|---|---:|---:|---:|
| low (0.5 scale) | 3.0 (the software cap) | 3.0–4.8 ms | 17 / 233 ms |
| medium (0.5 scale) | 1.7 | 6.6 ms | 600–633 / 683–700 ms |
| high (0.5 scale) | 1.4–1.6 | 5.1–7.6 ms | 667–750 / 733–817 ms |

Read these as: **`low` is capped, not measured.** On a software rasteriser the render loop deliberately draws at most 3 frames a second
(`World3D`, `software ? 3 : maxFps`), so the 3.0 above is that cap and the page stays responsive (its animation-frame median is one 60 Hz tick).
`medium` and `high` are limited by the rasteriser itself: 1.7 and 1.4–1.6 drawn frames a second means about 0.6 s and 0.7 s of CPU rasterising per
frame at half resolution, and the page's own frames are blocked for that long. The **JS side is cheap everywhere (3–7 ms to build and submit a
frame)**; the cost is rasterising about half a million triangles in software. On a GPU, half a million triangles and 700 draw calls is an
ordinary load for a desktop part; on a phone it is the reason the `low` tier exists (223 k triangles, 351 calls, no shadows). Whether `low`
holds 30 fps on a particular phone is **UNVERIFIED**.

The quality monitor (`World3D.monitor`) is what protects a slow machine at run time: if a frame takes over 28 ms of JS+driver time it steps
`high → medium → low`, then lowers the render scale down to 0.5; with room to spare it raises the scale back (never the tier). A machine
with only a software rasteriser is detected (`src/render/choose.ts`, `softwareGL`) and given the classic 2D map unless `?renderer=3d` asks
for the 3D world, which is why every CI browser test for the 3D world says so explicitly.

## Earlier build: where the triangles go (high tier, calm Day 1)

From `World3D.heaviest()` / `breakdown()` (`npx tsx scripts/capture-3d.ts --breakdown 1`): the scene's geometry is about **325,000 triangles**, of which
**foliage is 77%** (250 k: trees and shrubs, tufts of grass, flowers, crops, fences), terrain 6% (19.8 k), landmarks 6% (20.7 k, 135 meshes after
batching), villagers 6% (17.9 k, 262 meshes), water 5% (16.1 k). The renderer's figure of about 495 k triangles per frame is larger because it counts the
shadow pass too, which draws the shadow-casting meshes a second time (I did not separate the two counts). The largest single items are the
456-triangle tree models (×151 and ×32) and a 48-triangle piece (×1,216).

Everything repeated is **instanced** (one draw call per species or prop type) or **merged** into one geometry per material (every cottage's walls,
roof, trim and chimney is one mesh per material; landmarks are statically batched across the village and re-batched only when one of them changes
state). The earlier build of this scene was 672 k triangles and 1,100 calls; the reductions came from triangle-cutting the tree and foliage models,
merging per material and batching statics. The obvious next saving, if a real device needs it, is fewer or lower-poly trees: they are three quarters of the cost.

## Bundle (production build, gzip)

| File | Size | Budget | Notes |
|---|---:|---:|---|
| entry JavaScript (`index-*.js`) | 234 KB | 260 KB | React app, engine, classic map. Loaded for every visitor. |
| 3D chunk (`World3D-*.js`) | 216 KB | 270 KB | Three.js and `src/render3d/**`. **Lazy**: fetched only where the 3D world is chosen (a machine with graphics acceleration, or `?renderer=3d`); there the title's 3D backdrop fetches it, so the game starts with it in hand. Never fetched on the classic-map path. It was 197 KB before the visual pass's finishing chain and art pass, 211 KB after it. |
| CSS | 8.9 KB | 12 KB | |

`npm run size` (also a CI step) fails the build over budget. There are **no art, texture, model or font files** in the build: everything is
drawn by code at load (`docs/3d-rebuild/ASSET_LICENSES.md`), so there is nothing to compress, stream or lose. First-paint cost of the 3D
world is therefore *code + CPU time to paint the canvases and build the meshes* (0.9–1.2 s on this machine for the current build), not a download.

## Other browser engines (software WebGL, Playwright's Linux builds)

`npx tsx scripts/browser-3d-smoke.ts` loads a Day-1 village with `?renderer=3d`, waits six seconds and reports what the page chose and drew
(`docs/3d-rebuild/data/browsers.json`):

| Engine | Result |
|---|---|
| Chromium 153 | **PASS**: 3D chosen, frames drawn, 256 draw calls, 268,116 triangles (low tier, current build), no console errors |
| WebKit 26.6 | **PASS**: 3D chosen, frames drawn, the same counts, no console errors (Playwright's Linux build, not Safari on iOS) |
| Firefox 155 (headless) | **FALLBACK**: the page chose the classic map because this build offers no usable WebGL2. That is the designed fallback, not a pass; whether desktop Firefox with a GPU runs the 3D world is **UNVERIFIED** |

Real Safari on a Mac or an iPhone is **UNVERIFIED** (WebKit here is Playwright's Linux build; the iPhone profile is emulation).

## Resource hygiene (tested)

* `tests/e2e/world3d.spec.ts` "restarting and loading other villages does not leak geometry or textures": loads a village, then four others,
  and asserts the renderer's geometry count stays within 25% and the texture count within 6 of where it started (every rebuild disposes the previous world).
  Passed on desktop and phone projects.
* The 2D/3D toggle test asserts the old canvas is replaced, not stacked, and that the run's state hash is unchanged by switching.
* WebGL context loss is handled (`contextLost` guard in `draw()`): the scene stops drawing instead of throwing. **Not exercised on a real device.**

## Known limits

* Real GPU / phone / iOS Safari frame rates: **UNVERIFIED** (no device). The honest statement is: counts are in the range of ordinary stylised
  3D games, the JS cost is small, the CPU rasteriser is slow, and the tier system and monitor exist to handle weak GPUs.
* The p50/p95 above are of a software rasteriser at half resolution; do not quote them as game performance.
* Battery and thermal behaviour on a phone: not measured. Idle frames are capped (`maxFps`) and the world pauses when the tab is hidden.

## Reproduce

```
npm run build && npx vite preview --port 4173 &
npx tsx scripts/perf-3d.ts --out docs/3d-rebuild/data/perf-chain.json   # the current-build table (40 frames per measure by default)
npx tsx scripts/capture-3d.ts --breakdown 1 --url http://127.0.0.1:4173 --out /tmp/x.png   # triangles per part
npm run size                                      # bundle budget
```
