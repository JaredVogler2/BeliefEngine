# 3D world: performance, budgets and what was (and was not) measured

**Read this first.** Every number below was produced by a command in this repository, in a Linux container whose only WebGL is a
**software rasteriser (SwiftShader, on 4 CPU cores)**. There is no GPU in that machine. So:

* the **scene counts** (triangles, draw calls, geometries, textures) and the **memory** figures are properties of the scene and carry over to real hardware;
* the **frame times** are a CPU rasteriser's. They are useful for comparing tiers and for catching regressions, and they say **nothing** about what a
  graphics card or a phone will do. **No real GPU, no real phone and no iPhone has been profiled. Real-device frame rate is UNVERIFIED.**

There are two sets of numbers here:

* the **current build**, the one this work ends on: the finishing chain, the visual pass's art, the dressed people of rounds 6 and 7,
  and round 8's level of detail and shader warm-up (next section, `docs/3d-rebuild/data/perf-chain.json`); the visual pass's and round
  7's figures are kept beside them;
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

| Tier (chain) | Scene | Triangles | Draw calls | Shader programs | Video memory (textures + targets) | People drawn far | Load → first frame | of which the build | First draw | JS heap | Median frame | p95 frame | fps | 1% low fps | Median, chain off | Chain cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| low (ink) | calm Day 1 | 244,070 | 256 | 27 | 4.9 + 12.0 MB | 14 of 14 | 5.4 s | 0.96 s | 1.40 s | 34 MB | 309 ms | 357 ms | 3.2 | 2.8 | 320 ms | −11.4 ms |
| low (ink) | flood night | 267,346 | 292 | 43 | 4.9 + 12.0 MB | 14 of 14 | 7.3 s | 0.81 s | 1.17 s | 48 MB | 335 ms | 393 ms | 3.0 | 2.5 | 311 ms | +24.2 ms |
| medium (AO 2 + ink + FXAA) | calm Day 1 | 464,568 | 493 | 32 | 7.2 + 21.0 MB | 14 of 14 | 9.8 s | 1.43 s | 1.43 s | 34 MB | 454 ms | 592 ms | 2.2 | 1.6 | 422 ms | +31.3 ms |
| medium (AO 2 + ink + FXAA) | flood night | 498,394 | 523 | 51 | 7.2 + 21.0 MB | 14 of 14 | 10.3 s | 0.87 s | 1.54 s | 48 MB | 474 ms | 589 ms | 2.1 | 1.7 | 443 ms | +30.9 ms |
| high (AO 4 + ink + bloom + FXAA) | calm Day 1 | 580,683 | 498 | 35 | 7.2 + 46.3 MB | 14 of 14 | 10.9 s | 1.25 s | 1.37 s | 34 MB | 531 ms | 597 ms | 1.9 | 1.6 | 526 ms | +5.2 ms |
| high (AO 4 + ink + bloom + FXAA) | flood night | 648,626 | 532 | 54 | 7.2 + 46.3 MB | 14 of 14 | 10.6 s | 1.04 s | 1.38 s | 34 MB | 567 ms | 618 ms | 1.8 | 1.6 | 539 ms | +27.9 ms |

Measured on the round 8 build (`docs/3d-rebuild/data/perf-chain.json`). The build time now includes the shader warm-up; "first draw" is the
first frame's own draw, which compiles what the warm-up cannot (the shadow pass, the chain's passes). The video memory is
`World3D.memory()`'s estimate for this window's drawing buffer (683×384); on a full-resolution screen the targets are larger (see "Round 8"
below: 59.7 MB at 1280×720 on high).

**Reading it:**

* **The people cost a third fewer draw calls, and now fewer triangles.** Rounds 6 and 7 dressed the fourteen people (garments, faces,
  hair, a tool per role) and baked each into a few vertex-coloured meshes; round 8 gave each a distant version, which all fourteen use at
  this window's overview:

  | Measure (calm Day 1) | Visual pass (`effadc8`) | Round 7 | Round 8 (current) |
  |---|---:|---:|---:|
  | Draw calls, high tier | 742 | 498 | 498 |
  | Draw calls, medium tier | 735 | 493 | 493 |
  | Draw calls, low tier | 376 | 256 | 256 |
  | Triangles, high tier (every pass, the shadow pass included) | 597,483 | 628,775 | 580,683 |
  | Triangles, medium tier | — | 512,660 | 464,568 |
  | Triangles, low tier | 245,992 | 268,116 | 244,070 |
  | Median frame, high tier, on this CPU rasteriser | 566 ms | 545 ms | 531 ms |

* **What the chain costs here.** On medium and high it cost 5–31 ms a frame in this run (round 7: 20–48 ms), against frames of
  450–570 ms on this CPU rasteriser. On low, where the chain is only the ink line, it measured −11.4 and +24.2 ms: that is this machine's
  noise, since medians move by tens of milliseconds between runs. What the chain costs on a GPU or a phone is **UNVERIFIED**.
* **Load → first frame** is wall-clock time, from handing the page a saved run to its first drawn frame: 5.4–10.9 s here (round 7:
  5.1–10.6 s; the medium calm row moved from 7.3 to 9.8 s, the others by under a second, and single runs vary by about that much).
  * The world's own build (terrain, buildings, foliage and people made into meshes, and since round 8 the shader warm-up) is 0.8–1.4 s of
    that, and the first frame's draw 1.2–1.5 s.
  * The rest is the page's other work before that frame: closing the title's village, creating the game's WebGL context and finishing
    chain, pre-filtering the sky light, and on this software rasteriser the frame pacing's wait between frames. It was not broken down
    further.
  * The title now draws a 3D village of its own. The script waits for it to be drawn before it starts the clock, so these figures are
    the game's own start, like the visual pass's.
  * A GPU driver compiles shaders much faster, but how fast this loads on a given phone is **UNVERIFIED**.
* **The scene grew since the earlier tables**, with the cloud sea and islets, the visual pass's denser forests, hedgerows and yard
  props, and the dressed people.

  | Measure | Earlier build (`1809880`) | Current build |
  |---|---:|---:|
  | Triangles, high tier, calm | 494,863 | 580,683 |
  | Draw calls, high tier, calm | 688 | 498 |
  | Triangles, low tier, calm | 222,742 | 244,070 |
  | Draw calls, low tier, calm | 352 | 256 |
  | World build on this machine | 0.6 s | 0.8–1.4 s (with the shader warm-up) |

* **Multisampling.** The first run of this measurement made the chain look *cheaper* than drawing without it.
  * The canvas was 4× multisampled even under the chain, so switching the chain off made the direct path pay for multisampling the scene.
  * The canvas now asks for multisampling only where the chain cannot run, so the comparison is like for like.
  * All the numbers above were measured after that change.
* **The JS heap** varies between runs with garbage collection: 34–48 MB here, 30–45 MB in round 7, 28–40 MB in the visual pass.

## Round 8: level of detail, shader warm-up, video memory, stalls

Measured on the round 8 build with scratch probes driving the production build in headless Chromium (software WebGL), Redbank seed 1 unless
said otherwise. The probes' numbers are scene properties except where a time is given; times are the CPU rasteriser's.

**Level of detail for the people.** Each figure is built twice, the second time at about half the segments, and the two are swapped mesh
by mesh when the person stands under 40 px on screen (back to the close version at 48 px):

| Measure | Close version | Distant version |
|---|---:|---:|
| Triangles per person (the 14 of Redbank, `data/asset-manifest.json`) | 2,928–3,426 | 1,358–1,578 (about 47%) |
| Meshes per person | 9–10 | the same meshes, other geometry |

| Screen (tier) | People's height on screen at the overview | Drawn with the distant version |
|---|---|---:|
| 1280×720 (high) | 22–30 px | 14 of 14 |
| 1920×1080 (high) | 32–46 px | 10 of 14 |
| 390×844 phone (medium) | 13–19 px | 14 of 14 |

At the switch size (44 px) the close and distant figures were compared side by side, magnified four times: they cannot be told apart;
at twice that size only the hair is slightly more faceted. The swap therefore never shows as a pop.

**Shader compile stalls.** `World3D.info()` now records the first frame's draw time (which compiles the shaders it meets), the worst draw
after it, hitches (a frame over 50 ms and four times the median of the draws before it) and the shader program count:

| Day-4 save, high tier, 1280×720 | Before the warm-up | With the warm-up |
|---|---:|---:|
| Shader programs after loading | 46 | 52 |
| Programs compiled during the first night's effects (13 effects) | 3, mid-play | 0 |

The warm-up compiles every material the village holds while it is built, the hidden effect pools included, as the finishing chain draws
them. On a GPU with parallel shader compilation that work overlaps the build; the first frame then compiles only the shadow pass and the
chain's own passes, and the loading veil now lifts after that first frame. First draw on this CPU rasteriser at 1280×720: 1.2–2.5 s
(`firstDrawMs`); the draws after it took 5–22 ms of JS and driver time with no hitch. On a phone: **UNVERIFIED**.

**Video memory**, estimated by `World3D.memory()` from each texture's and render target's size and format (a driver may pad or compress):

| Screen (tier) | Textures | Render targets (finishing chain, shadow map, sky light) |
|---|---:|---:|
| 1280×720 (high) | 7.2 MB | 59.7 MB |
| 1920×1080 (high) | 7.2 MB | 83.1 MB |
| 390×844 phone (medium) | 7.2 MB | 28.3 MB |

The render targets are most of it: they scale with the drawing buffer, and the high tier's half-float chain and 2048 px shadow map are
the largest. The current-build table above gives the same estimate for every tier at the measuring window's size.

**The developer monitor.** All of the above, live, with `?perf=1` in the address (frame p50 / p95, draw time, calls, triangles,
geometries, textures, programs, first draw, worst draw, hitches, video memory, and how many people are drawn far). It is never shown
otherwise.

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
| entry JavaScript (`index-*.js`) | 235 KB | 260 KB | React app, engine, classic map, the developer monitor (shown only with `?perf=1`). Loaded for every visitor. |
| 3D chunk (`World3D-*.js`) | 218 KB | 270 KB | Three.js and `src/render3d/**`. **Lazy**: fetched only where the 3D world is chosen (a machine with graphics acceleration, or `?renderer=3d`); there the title's 3D backdrop fetches it, so the game starts with it in hand. Never fetched on the classic-map path. It was 197 KB before the visual pass's finishing chain and art pass, 211 KB after it, 216 KB after round 7. |
| CSS | 9.1 KB | 12 KB | |

`npm run size` (also a CI step) fails the build over budget. There are **no art, texture, model or font files** in the build: everything is
drawn by code at load (`docs/3d-rebuild/ASSET_LICENSES.md`), so there is nothing to compress, stream or lose. First-paint cost of the 3D
world is therefore *code + CPU time to paint the canvases and build the meshes* (0.9–1.2 s on this machine for the current build), not a download.

## Other browser engines (software WebGL, Playwright's Linux builds)

`npx tsx scripts/browser-3d-smoke.ts` loads a Day-1 village with `?renderer=3d`, waits six seconds and reports what the page chose and drew
(`docs/3d-rebuild/data/browsers.json`):

| Engine | Result |
|---|---|
| Chromium 153 | **PASS**: 3D chosen, frames drawn, 256 draw calls, 244,070 triangles (low tier, current build), no console errors |
| WebKit 26.6 | **PASS**: 3D chosen, frames drawn, the same counts, no console errors (Playwright's Linux build, not Safari on iOS) |
| Firefox 155 (headless) | **FALLBACK**: the page chose the classic map because this build offers no usable WebGL2. That is the designed fallback, not a pass; whether desktop Firefox with a GPU runs the 3D world is **UNVERIFIED** |

Real Safari on a Mac or an iPhone is **UNVERIFIED** (WebKit here is Playwright's Linux build; the iPhone profile is emulation).

## Resource hygiene (tested)

* `tests/e2e/world3d.spec.ts` "ten new villages in a row leave nothing behind", as phase 08 asks ("10 consecutive restart or new-seed
  cycles; no monotonic leak in owned resources"). It loads Redbank, Ashwood and Harvest Hollow in turn, ten loads. After each it forces a
  garbage collection and reads the renderer's counts and the JS heap. It asserts that a village built again holds exactly what it held
  on the visit before (geometry within 2% from the second visit on, textures ±1, shader programs +1 at most) and that the heap after
  loads 8–10 is level with loads 5–7. A run on the round 8 build:

  | Load | Village | Geometries | Textures | Programs | Heap after GC |
  |---:|---|---:|---:|---:|---:|
  | 1 | Redbank | 376 | 16 | 27 | 13.6 MB |
  | 2 | Ashwood | 226 | 15 | 45 | 13.2 MB |
  | 3 | Harvest | 245 | 15 | 28 | 13.5 MB |
  | 4 | Redbank | 277 | 16 | 28 | 14.4 MB |
  | 5 | Ashwood | 226 | 15 | 45 | 13.8 MB |
  | 6 | Harvest | 245 | 15 | 28 | 14.0 MB |
  | 7 | Redbank | 277 | 16 | 28 | 14.8 MB |
  | 8 | Ashwood | 226 | 15 | 45 | 14.3 MB |
  | 9 | Harvest | 245 | 15 | 28 | 14.4 MB |
  | 10 | Redbank | 277 | 16 | 28 | 15.2 MB |

  The first load holds 99 more geometries than later Redbank loads. Those are the close versions of the people's figures, drawn while
  the camera first comes in. Later loads open at the overview, so only the distant versions are uploaded.
* A longer scratch probe, 30 loads, showed the same. The renderer's counts were exactly flat throughout. The heap crept by a little
  under 0.1 MB per load, and the creep slowed: Redbank 12.4 MB at load 1, 14.0 MB at load 13 and 14.8 MB at load 28. With the classic
  renderer the same 30 loads went from 3.4 to 4.2 MB.
* Heap snapshots between loads 9 and 24 put 1.03 MB of the 1.43 MB growth in compiled code, which is the JIT warming up. The rest was
  browser and V8 internals: long-task timing entries, weak lists, three.js binding tables keyed by geometry id. No list of the game's
  own was growing.
* The snapshots also showed the terrain builder keeping its working arrays alive through its `dispose` closure, for as long as the
  village stood. Fixed: the heap after each load is about 0.4 MB lower.
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
