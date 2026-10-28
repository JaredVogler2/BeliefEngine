# 3D world: performance, budgets and what was (and was not) measured

**Read this first.** Two kinds of machine produced the numbers here. The section "Real hardware" just below comes from a real GPU: Apple's,
on GitHub's Apple-silicon macOS runner, reached through its virtual machine's paravirtualised graphics device, in Chrome and in Safari,
plus Mobile Safari in the iOS Simulator. **No physical phone has run the game.** Everything after that section was produced in a Linux
container whose only WebGL is a **software rasteriser (SwiftShader, on 4 CPU cores)**, with no GPU. For those:

* the **scene counts** (triangles, draw calls, geometries, textures) and the **memory** figures are properties of the scene and carry over to real hardware;
* the **frame times** are a CPU rasteriser's. They are useful for comparing tiers and for catching regressions, and they say **nothing** about what a
  graphics card or a phone will do. **No real GPU, no real phone and no iPhone has been profiled. Real-device frame rate is UNVERIFIED.**

There are two sets of numbers here:

* the **current build**, the one this work ends on: the finishing chain, the visual pass's art, the dressed people of rounds 6 and 7,
  and round 8's level of detail and shader warm-up (next section, `docs/3d-rebuild/data/perf-chain.json`); the visual pass's and round
  7's figures are kept beside them;
* the **earlier build**, measured at commit `1809880`. That was before the cloud sea, the later art work and the chain. Its sections are
  kept below for comparison (`docs/3d-rebuild/data/perf.json`).

## Real hardware: an Apple GPU, Safari, the iOS Simulator (CI)

`.github/workflows/real-hardware.yml` runs `scripts/real-hardware.ts` on GitHub's `macos-15` runner. The production build is served
locally and opened by the game's own default route: no `?renderer=3d`, so the game decides for itself whether this machine gets the 3D
world. It did, in both browsers:

| Browser | GPU WebGL reports | Renderer the game chose | Console errors |
|---|---|---|---|
| Chrome 153 (headed) | ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device) | 3D, hardware GL | none |
| Safari 26.6.1 (through safaridriver) | Apple GPU | 3D, hardware GL | none |
| Mobile Safari, iOS 26.2 Simulator (iPhone 17) | (not readable without a debugger) | 3D, by its screenshot | — |

**What a player's browser settles on** (run 3, `0513f9a`, `?quality=auto`: an automated browser otherwise starts on the low tier on
purpose, to keep test suites quick; with `auto` it chooses as a player's browser would, and the quality monitor is free). Each scene
was left in the live loop, with the game's own frame pacing, for 12 s:

| Window | Scene | Tier the game settled on | Frame p50 / p95 | fps | Draw on the main thread | Back to back, median |
|---|---|---|---:|---:|---:|---:|
| Chrome 1440×900 at 2× (2880×1800) | calm Day 1 | high, held | 34 / 67 ms | 27 | 3–9 ms | 32 ms |
| Chrome 1440×900 at 2× | flood night | medium (stepped down from high within a second: frames came late) | 33.5 / 53.5 ms | 27 | 3–8 ms | 22 ms |
| Chrome 1440×900 at 2× | a night of effects (end of day 4) | medium | 33.4 / 67.5 ms | 25 | 5–8 ms | — |
| Chrome 390×844 at 3× (iPhone-sized, touch) | calm Day 1 | medium, held | 33.4 / 50 ms | 29 | 2–4 ms | 12 ms |
| Chrome 390×844 at 3× | flood night | medium, held | 33.4 / 50 ms | 29 | 3 ms | 14 ms |
| Chrome 390×844 at 3× | a night of effects | medium, held | 33.4 / 50 ms | 29 | 3–6 ms | — |
| Safari 1440×848 at 1× | calm Day 1 | high, held | 21 / 36 ms | 45 | 4 ms | — |
| Safari 1440×848 at 1× | flood night | high, held | 24 / 47 ms | 35 | 5 ms | — |

Held at the high tier instead (pinned), the same desktop window runs the calm village at p50 34 / p95 82 ms and the flood night at
p50 66 / p95 132 ms (17 fps): that is what the monitor saw and stepped away from.

Reading it:

* **Steady about 30 frames a second at the settled tier, at both sizes, in Chrome; 35–45 in Safari at 1×.** The high and medium tiers
  cap at 60 and 45; on a 60 Hz display a frame that misses a beat waits for the next, so a GPU that needs 17–33 ms a frame gives 30.
  The back-to-back medians say how far each window is from the next step: 12–14 ms at the iPhone size (room to spare), 22–32 ms at the
  2880×1800 desktop (not enough for 60).
* **The phase file's targets.** Mobile, median 30 fps or more at a suitable quality: met at the iPhone-sized window on this GPU (29–30).
  Desktop, a stable 60 fps at the default camera: **not met on this GPU** (about 30 at 2880×1800; 45 in Safari at 1440×848). A virtual
  machine's paravirtualised device is slower than the same chip used directly; a native Mac, a discrete GPU or a phone has not been
  measured, so how far each is from these figures is **UNVERIFIED**.
* **Stalls.** A village's first frame (shaders and uploads) took 0.33–1.1 s in Chrome, and 1.3 s (calm) and 4.8 s (flood) in Safari. It
  is drawn under the loading veil, which lifts after it. One of the frames just after it can be slow too: up to 0.65 s in Chrome. After
  those, the calm village and the flood ran with no hitch at either size; a hitch is a frame over 50 ms and four times the usual. The
  night's resolution brings one to three: the worst frame was 79 ms at the iPhone size and 349 ms at 2880×1800, the moment the night's
  changes reach the GPU. Recorded in `KNOWN_ISSUES.md`.
* **Video memory** (estimated): 7.2 MB of textures in every case; render targets 28 MB at the iPhone size (medium), 62 MB at 2880×1800 on
  medium and 146 MB on high, most of it the finishing chain's half-float buffers at full resolution.
* **Where the high tier's time goes** (run 4, the calm village held at the high tier at 2880×1800, 90 frames back to back with parts of
  the finishing chain switched off in turn; medians): the whole chain 45.6 ms; without ambient occlusion 30.2 ms; without ambient
  occlusion and glow 24.7 ms; with no chain at all 22.3 ms. Ambient occlusion (four pairs of depth samples a pixel, at full resolution)
  is the largest single cost, about a third of the frame. It was not made cheaper in this round: on this GPU even the bare scene at that
  size needs 22 ms, so no change to the chain alone would bring it to 60 frames a second; the quality monitor's step to the medium tier
  (two pairs, no glow, a pixel ratio of 1.5) is the lever, and it takes it when frames come late.

**The iOS Simulator** opened a link that goes straight into the first day (`&play=1&perf=1`). Mobile Safari drew the 3D world, and its
monitor read 13–16 fps (run 2: low tier at half resolution, frame p50 55–58 ms, draws of 3.4–3.9 ms). The Simulator renders through an
emulated graphics path inside the virtual machine, so that frame rate says nothing about an iPhone's. What the run does show is iOS
WebKit choosing, compiling and drawing the 3D world, laid out as on a phone (`screenshots/real-hw/run2-ios-simulator-mobile-safari.jpg`).

**What the first runs found.** Run 1 (`9294f83`) measured only the low tier, because of the automation rule above (`chooseQuality`; an
earlier commit message here put it down to the quality monitor, wrongly). It did show a real defect, in the Simulator, which is not
automated: the old monitor went by an average seeded by the first frames, and while those first frames took 3.2 s, the average was
still high when the monitor looked. So it stepped down to low, though the draws had fallen to 3.7 ms. The same average set the frame
pacing, 2.5 times it between frames, so the seconds after a slow start were a slideshow. Since `07a39e7`, pacing and monitor go by the
medians of the frames since the village was built or the setting changed, and late frames (where a busy GPU shows) count too
(`src/render3d/pacing.ts`, `tests/unit/render3d-pacing.test.ts`). In run 2 the Simulator's tier came down for a real reason, frames 55 ms
apart even at the lowest setting.

Frames from the GPU: `screenshots/real-hw/run3-apple-gpu-chrome-day1-no-interface-high-tier.jpg` (the art director's Day 1 frame at the high
tier), `…-flood-night-high-tier.jpg`, `…-iphone-size-medium-tier.jpg`, `run3-apple-gpu-safari-calm-high-tier.jpg`; the low tier of run 1 for
comparison, `run1-apple-gpu-chrome-day1-no-interface-low-tier.jpg`. The measurement files of every run are in `data/real-hardware/`.

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

* Real GPU: measured on an Apple GPU through a CI virtual machine (above). A native Mac, a Windows or Linux GPU, an Android phone and a
  physical iPhone: **UNVERIFIED**. Mobile Safari ran the 3D world in the iOS Simulator, whose frame rate is not a phone's.
* The p50/p95 above are of a software rasteriser at half resolution; do not quote them as game performance.
* Battery and thermal behaviour on a phone: not measured. Idle frames are capped (`maxFps`) and the world pauses when the tab is hidden.

## Reproduce

```
npm run build && npx vite preview --port 4173 &
npx tsx scripts/perf-3d.ts --out docs/3d-rebuild/data/perf-chain.json   # the current-build table (40 frames per measure by default)
npx tsx scripts/capture-3d.ts --breakdown 1 --url http://127.0.0.1:4173 --out /tmp/x.png   # triangles per part
npm run size                                      # bundle budget
```
