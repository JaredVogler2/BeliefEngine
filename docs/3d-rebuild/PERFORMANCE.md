# 3D world: performance, budgets and what was (and was not) measured

**Read this first.** Two kinds of machine produced the numbers here. The section "Real hardware" just below comes from a real GPU: Apple's,
on GitHub's Apple-silicon macOS runner, reached through its virtual machine's paravirtualised graphics device, in Chrome and in Safari,
plus Mobile Safari in the iOS Simulator. **No physical phone has run the game.** Everything after that section was produced in a Linux
container whose only WebGL is a **software rasteriser (SwiftShader, on 4 CPU cores)**, with no GPU. For those:

* the **scene counts** (triangles, draw calls, geometries, textures) and the **memory** figures are properties of the scene and carry over to real hardware;
* the **frame times** are a CPU rasteriser's. They are useful for comparing tiers and for catching regressions, and they say **nothing** about what a
  graphics card or a phone will do. Frame times from a real GPU are in "Real hardware" (one GPU, through a virtual machine). **No physical
  phone and no iPhone has been profiled: a phone's frame rate is UNVERIFIED.**

There are two sets of numbers here:

* the **current build**, the one this work ends on: the finishing chain, the visual pass's art, the dressed people of rounds 6 and 7,
  round 8's level of detail and shader warm-up, and round 9's painted cut and waterfall (next section,
  `docs/3d-rebuild/data/perf-chain.json`); the earlier rounds' figures are kept beside them;
* the **earlier build**, measured at commit `1809880`. That was before the cloud sea, the later art work and the chain. Its sections are
  kept below for comparison (`docs/3d-rebuild/data/perf.json`).

## Real hardware: an Apple GPU, Safari, the iOS Simulator (CI)

`.github/workflows/real-hardware.yml` runs `scripts/real-hardware.ts` on GitHub's `macos-15` runner. The production build is served
locally and opened by the game's own default route: no `?renderer=3d`, so the game decides for itself whether this machine gets the 3D
world. It did, in both browsers, in every run:

| Browser | GPU WebGL reports | Renderer the game chose | Console errors |
|---|---|---|---|
| Chrome 153 (headed) | ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device) | 3D, hardware GL | none |
| Safari 26.6.1 (through safaridriver) | Apple GPU | 3D, hardware GL | none |
| Mobile Safari, iOS 26.2 Simulator (iPhone 17) | (not readable without a debugger) | 3D, by its screenshot | — |

Seven runs so far. The GPU is a virtual machine's paravirtualised device on a shared machine, and its speed varies from run to run
(the same window and tier: 34 ms a frame in run 3, 82 ms in run 4), so the runs are read together. The measurement files of every run
are in `data/real-hardware/`.

**What a player's browser settles on** (`?quality=auto`: an automated browser otherwise starts on the low tier on purpose, to keep test
suites quick; with `auto` it chooses as a player's browser would, and the quality monitor is free). Each scene was left in the live
loop, with the game's own frame pacing, for 12 s; the tier it ended on and the frame times of its last seconds:

| Window | Scene | Run 3 (`0513f9a`) | Run 4 (`0455c2a`) | Run 5 (`f951751`) | Run 6 (`b544b83`) | Run 7 (`016cdaf`) |
|---|---|---|---|---|---|---|
| Chrome 1440×900 at 2× (2880×1800) | calm Day 1 | high, 34 / 67 ms | medium (from 6 s), 33.5 / 73 ms | medium (from 2 s), 33.4 / 51 ms | high, 33.3 / 67 ms | medium (from 2 s), 33.4 / 52 ms |
| Chrome 1440×900 at 2× | flood night | medium, 33.5 / 53.5 ms | medium, 33.7 / 57 ms | medium, 33.4 / 50 ms | medium, 33.4 / 50 ms | low, 34.7 / 84 ms |
| Chrome 1440×900 at 2× | a night of effects (end of day 4) | medium, 33.4 / 67.5 ms | low, 33.4 / 50 ms | medium, 33.4 / 50 ms | medium, 33.3 / 35 ms | low, 33.5 / 51 ms |
| Chrome 390×844 at 3× (iPhone-sized, touch) | calm Day 1 | medium, 33.4 / 50 ms | medium, 33.3 / 50 ms | medium, 33.3 / 50 ms | medium, 33.4 / 49 ms | medium, 33.4 / 50 ms |
| Chrome 390×844 at 3× | flood night | medium, 33.4 / 50 ms | low (from 4 s), 33.6 / 50 ms | medium, 33.4 / 50 ms | medium, 33.3 / 49 ms | medium, 33.4 / 50 ms |
| Chrome 390×844 at 3× | a night of effects | medium, 33.4 / 50 ms | low, 33.4 / 50 ms | medium, 33.5 / 50 ms | medium, 33.4 / 47 ms | medium, 33.5 / 49 ms |
| Safari 1440×848 at 1× | calm Day 1 | high, 21 / 36 ms | high, 19 / 33 ms | high, 25 / 48 ms | high, 18 / 30 ms | high, 17 / 29 ms |
| Safari 1440×848 at 1× | flood night | high, 24 / 47 ms | high, 18 / 29 ms | high, 27 / 39 ms | high, 19 / 25 ms | high, 22 / 32 ms |

(frame p50 / p95: the median and the 95th percentile of the intervals between frames. Since run 6 the night of effects comes before
the flood night, in a page that has drawn only the calm village, as a player's first night does; before, it came after the flood night,
whose shaders it then found compiled.)

**While the view turns** (the calm village, five seconds of a slow orbit through the camera's own controls), the same windows:

| Window | Tier and frame cap | Run 5: frame p50 / p95, fps | Run 6 | Run 7 |
|---|---|---:|---:|---:|
| Chrome 390×844 at 3× (iPhone-sized) | medium, cap 60 while moving | **17 / 64 ms, 47** | **16.7 / 17.7 ms, 60** | **16.7 / 32 ms, 60** |
| Chrome 1440×900 at 2× | the tier the game chose (medium, high, medium), cap 60 | 33.3 / 67 ms, 29 | 34.3 / 81 ms, 26 | 33.4 / 76 ms, 26 |
| Chrome 1440×900 at 2×, the high tier held | high | 35 / 101 ms, 22 | 33.4 / 67 ms, 29 | 34.2 / 98 ms, 24 |
| Safari 1440×848 at 1× | high | 26 / 61 ms, 32 | 17 / 29 ms, 56 | 17 / 24 ms, 55 |

Held at the high tier instead (pinned), the 2880×1800 window runs the calm village at p50 34–82 ms and the flood night at 50–67 ms
(12–18 fps) across the runs: that is what the monitor saw and stepped away from.

Reading it:

* **At rest, a steady 30 frames a second at the settled tier, at both sizes, in Chrome; 32–51 in Safari at 1×.** On a 60 Hz display a
  frame that misses a beat waits for the next, so a GPU that needs 17–33 ms a frame gives 30.
* **A phone got 30 a second however fast its GPU, until run 5.** The medium tier (phones' tier) was capped at 45 frames a second, and a
  60 Hz display can only show 45 on alternate beats: 30. At the iPhone size the GPU drew a frame in 12–14 ms back to back (run 3) and
  the game still showed 30. Since `f951751` each tier has a cap while the view moves and one at rest, both dividing 60: the medium tier
  draws up to 60 a second while the player pans, zooms, orbits or the camera glides, and rests at 30 while the view is still (battery
  and heat). Run 5 measured it: at the iPhone size, frames 17 ms apart (the 60 Hz beat) at the median while the view turned, 47 a second
  on average; at 2880×1800 the same tier stays at 30 (its frames need 17–20 ms there, back to back). Runs 6 and 7, faster runs of the
  same GPU: 16.7 ms at the median (17.7 and 32 ms at the 95th percentile) while the view turned, the display's full 60.
* **The phase file's targets.** Mobile, median 30 fps or more at a suitable quality: **met** at the iPhone-sized window on this GPU (30
  at rest, a median of 60 while the view turns). Desktop, a stable 60 fps at the default camera: **not met on this GPU** (about 30 at
  2880×1800, on the high tier or a step down, in every run; 32–56 in Safari at 1440×848). A virtual machine's paravirtualised device is
  slower than the same chip used directly; a native Mac, a discrete GPU and a physical phone have not been measured, so how far each is from these
  figures is **UNVERIFIED**.
* **Stalls.** A village's first frame (shaders and uploads) took 0.33–1.24 s in Chrome (3.3–3.4 s for the flood night at 2880×1800 in
  runs 4 and 5), and 1.0–1.3 s (calm) and 3.8–4.8 s (flood) in Safari. It is drawn under the loading veil, which lifts after it. A later
  frame of the first seconds can be slow too, up to 0.95 s (the flood night held at the high tier). After those, the calm village ran
  without a hitch at the tier the game chose, at both sizes, in every run (a hitch is a frame over 50 ms and four times the usual). A
  night's resolution brought up to four in runs 3 to 5, the worst frame from 79 ms to 1.08 s at the iPhone size and 191–439 ms at
  2880×1800: the moment the night's changes reach the GPU. In those runs the night came after a flood night in the same page, and
  compiled no shader (the programs count did not change). Run 6 measured a player's first night instead, in a page that had drawn only
  the calm village: at the iPhone size it compiled no shader either (58 programs before it and after, in run 7 too) and brought two
  hitches. At 2880×1800 the world was built again as the night resolved, on the same tier (run 6: its build count went from 3 to 4 and
  its programs from 61 to 40, about 1.5 s of slow frames; runs 4 and 7 the same). That looked like a lost graphics context, so the world
  was made to count those (`info().contextLosses`, shown by the developer monitor too): run 7 counted none. The cause was the world's
  own. When the quality monitor stepped the tier down, the world built itself again for the new tier but forgot which village it had
  just built, so the next state it was given, a player's action or the night, was taken for a new village and built from scratch: a
  second stall after every automatic step down, on any machine whose tier the monitor lowers. Fixed (`World3D.rebuild` records the
  snapshot it builds from); a browser test changes the tier and checks that the next day only updates the world (before the fix it
  built it a third time). The count of lost contexts stays, with a browser test that loses the context on purpose and checks that the
  world comes back, built again and drawing. Recorded in `KNOWN_ISSUES.md`.
* **Video memory** (estimated): textures 7.2 MB in runs 3–4 and 8.9 MB in run 5 (the plate's painted cut, 1.7 MB with its mipmaps);
  render targets 28 MB at the iPhone size (medium), 62 MB at 2880×1800 on medium and 146 MB on high (66 MB for Safari's 1440×848 window
  at the high tier), most of it the finishing chain's half-float buffers at full resolution.
* **Where the high tier's time goes** (the calm village held at the high tier at 2880×1800, 90 frames back to back with parts of the
  finishing chain switched off in turn; medians, runs 4 to 7): the whole chain 45.6 / 39.3 / 27.4 / 36.0 ms; without ambient occlusion
  30.2 / 32.4 / 27.6 / 31.5 ms; without ambient occlusion and glow 24.7 / 27.6 / 25.1 / 26.5 ms; with no chain at all 22.3 / 23.5 / 21.7 /
  24.0 ms. Ambient occlusion (four pairs of depth samples a pixel, at full resolution) was the largest single cost in runs 4 and 5, a
  sixth to a third of the frame, and 0–4.5 ms in runs 6 and 7, faster runs of the GPU. It was not made cheaper: on this GPU even the
  bare scene at that size needs 22–24 ms, so no change to the chain alone would bring it to 60 frames a second; the quality monitor's step
  to the medium tier (two pairs, no glow, a pixel ratio of 1.5) is the lever, and it takes it when frames come late.
* **Sprites were half-size on a screen of pixel ratio 2** (found in run 5's frames: the waterfall's mist drew as a scatter of dots).
  Every point sprite (smoke, flame, mist, the gold proof markers, the coach's call-out, the route dots) was sized in the drawing buffer's
  pixels, so its size on screen fell with the pixel ratio. It was in the software rasteriser's phone frames too (a pixel ratio of 2,
  where the gold rings were smaller than on a desktop), unnoticed until the mist made it plain.
  They are now sized in CSS pixels and scaled by the renderer's pixel ratio each frame (`src/render3d/particles.ts`, `pixelRatio`). Run 6
  shows the fix on the GPU: the same Day 1 frame, the mist a soft cloud (`screenshots/real-hw/sprites-before-after-run5-run6.jpg`).
* **The ink of what stands behind the waterfall showed through it** (run 6's close-up of the falls at a pixel ratio of 2,
  `screenshots/real-hw/run6-apple-gpu-falls-close-up-pixel-ratio-2.jpg`). The finishing chain inks from the depth of opaque things and
  lays the ink over everything, so the cliff's lip and the island's underside were outlined straight through the falling water: a thin
  dark line in mid-air. The sheet is now a veil to the chain: it scales the code of what is behind it by what it lets through, and the ink
  and the hollows behind fade with it (`src/render3d/post.ts`, `markVeil`; before and after, on the software rasteriser:
  `screenshots/wc/falls-ink-veil-before-after.jpg`). Seen on the GPU in run 7 (`screenshots/real-hw/veil-before-after-run6-run7.jpg`):
  the lines are gone where the water is thick and show faintly where it thins out.

**The iOS Simulator** opens a link that goes straight into the first day (`&play=1&perf=1`). Mobile Safari draws the 3D world there,
and its monitor read 13–17 fps in runs 2 and 5 (the low tier at half resolution, frame p50 55–58 ms, draws of 3.4–3.9 ms) and 24 in run 6
(the low tier at 0.575, frame p50 40 ms). The Simulator
renders through an emulated graphics path inside the virtual machine, so that frame rate says nothing about an iPhone's. What the runs do
show is iOS WebKit choosing, compiling and drawing the 3D world, laid out as on a phone (`screenshots/real-hw/run5-ios-simulator-mobile-safari.jpg`;
a Safari tip of its own covers one corner). In runs 3 and 4 the link timed out while Mobile Safari did its first-run setup; since run 5
Safari is launched first.

**What the first runs found.** Run 1 (`9294f83`) measured only the low tier, because of the automation rule above (`chooseQuality`; an
earlier commit message here put it down to the quality monitor, wrongly). It did show a real defect, in the Simulator, which is not
automated: the old monitor went by an average seeded by the first frames, and while those first frames took 3.2 s, the average was
still high when the monitor looked. So it stepped down to low, though the draws had fallen to 3.7 ms. The same average set the frame
pacing, 2.5 times it between frames, so the seconds after a slow start were a slideshow. Since `07a39e7`, pacing and monitor go by the
medians of the frames since the village was built or the setting changed, and late frames (where a busy GPU shows) count too
(`src/render3d/pacing.ts`, `tests/unit/render3d-pacing.test.ts`). In run 2 the Simulator's tier came down for a real reason, frames 55 ms
apart even at the lowest setting.

**Frames from the GPU** (`screenshots/real-hw/`): the art director's Day 1 frame at the high tier, before and after this round's work on
the plate's edge and the river (`edge-before-after-run4-run5.jpg`, and its front edge at full resolution, `…-closeup.jpg`);
`run5-apple-gpu-chrome-day1-no-interface-high-tier.jpg`; `run5-apple-gpu-chrome-iphone-size-medium-tier.jpg` (its monitor reads "cap 30" at
rest); `run5-apple-gpu-safari-calm-high-tier.jpg`; the waterfall in the Day 1 frame before and after the sprite fix
(`sprites-before-after-run5-run6.jpg`) and up close at a pixel ratio of 2 (`run6-apple-gpu-falls-close-up-pixel-ratio-2.jpg`), before and
after the veil (`veil-before-after-run6-run7.jpg`); from run 3,
the flood night at the high tier and the iPhone-sized window; and the low tier of run 1 for comparison.

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
| low (ink) | calm Day 1 | 250,086 | 259 | 29 | 6.6 + 12.0 MB | 14 of 14 | 7.5 s | 1.08 s | 1.05 s | 30 MB | 323 ms | 378 ms | 3.1 | 2.5 | 302 ms | +20.1 ms |
| low (ink) | flood night | 273,362 | 295 | 52 | 6.6 + 12.0 MB | 14 of 14 | 9.6 s | 0.94 s | 1.38 s | 36 MB | 362 ms | 458 ms | 2.8 | 1.9 | 334 ms | +27.8 ms |
| medium (AO 2 + ink + FXAA) | calm Day 1 | 475,880 | 497 | 33 | 8.9 + 21.0 MB | 14 of 14 | 12.2 s | 1.13 s | 1.46 s | 34 MB | 480 ms | 530 ms | 2.1 | 1.8 | 482 ms | −1.4 ms |
| medium (AO 2 + ink + FXAA) | flood night | 509,706 | 527 | 58 | 8.9 + 21.0 MB | 14 of 14 | 11.5 s | 1.15 s | 1.56 s | 36 MB | 478 ms | 573 ms | 2.1 | 1.1 | 473 ms | +5.1 ms |
| high (AO 4 + ink + bloom + FXAA) | calm Day 1 | 591,995 | 502 | 36 | 8.9 + 46.3 MB | 14 of 14 | 11.6 s | 1.04 s | 1.30 s | 34 MB | 562 ms | 636 ms | 1.8 | 1.5 | 522 ms | +39.8 ms |
| high (AO 4 + ink + bloom + FXAA) | flood night | 659,938 | 536 | 61 | 8.9 + 46.3 MB | 14 of 14 | 12.7 s | 1.13 s | 1.59 s | 36 MB | 604 ms | 736 ms | 1.7 | 1.3 | 571 ms | +32.9 ms |

Measured on the round 9 build, with the plate's painted cut and the falls (`docs/3d-rebuild/data/perf-chain.json`), before the sprite
and veil fixes, which change only the size of point sprites and the ink behind the waterfall. The build time includes the shader
warm-up; "first draw" is the first frame's own draw, which compiles what the warm-up cannot (the shadow pass, the chain's passes). The
video memory is `World3D.memory()`'s estimate for this window's drawing buffer (683×384); on a full-resolution screen the targets are
larger (see "Round 8" below: 59.7 MB at 1280×720 on high).

**Reading it:**

* **The people cost a third fewer draw calls than in the visual pass; the island's cut and the falls add a few.** Rounds 6 and 7
  dressed the fourteen people (garments, faces, hair, a tool per role) and baked each into a few vertex-coloured meshes; round 8 gave each
  a distant version, which all fourteen use at this window's overview. Round 9 painted the plate's cut and added the falls, the spring's
  boulders and the mist: 3–4 draw calls and 6,000–11,300 triangles, by tier.

  | Measure (calm Day 1) | Visual pass (`effadc8`) | Round 7 | Round 8 | Round 9 (current) |
  |---|---:|---:|---:|---:|
  | Draw calls, high tier | 742 | 498 | 498 | 502 |
  | Draw calls, medium tier | 735 | 493 | 493 | 497 |
  | Draw calls, low tier | 376 | 256 | 256 | 259 |
  | Triangles, high tier (every pass, the shadow pass included) | 597,483 | 628,775 | 580,683 | 591,995 |
  | Triangles, medium tier | — | 512,660 | 464,568 | 475,880 |
  | Triangles, low tier | 245,992 | 268,116 | 244,070 | 250,086 |
  | Median frame, high tier, on this CPU rasteriser | 566 ms | 545 ms | 531 ms | 562 ms |

* **What the chain costs here.** On medium and high it measured −1.4 to +39.8 ms a frame in this run (round 8: 5–31 ms), against
  frames of 480–600 ms on this CPU rasteriser; on low, where the chain is only the ink line, +20.1 and +27.8 ms (round 8: −11.4 and
  +24.2). Differences of this size are this machine's noise: medians move by tens of milliseconds between runs. What the chain costs on a
  real GPU is in "Real hardware" above (an Apple GPU at 2880×1800); on a phone it is **UNVERIFIED**.
* **Load → first frame** is wall-clock time, from handing the page a saved run to its first drawn frame: 7.5–12.7 s here (round 8:
  5.4–10.9 s). That rise is this container, not the game: the same measurement, made on the build before this round's work (`0455c2a`)
  and on this one, alternating between them four times each (the low tier, the calm village), gave medians of 8.5 s and 8.7 s with ranges
  that overlap (7.6–9.0 s and 7.4–9.2 s).
  * The world's own build (terrain, buildings, foliage and people made into meshes, and since round 8 the shader warm-up) is 0.9–1.2 s of
    that, and the first frame's draw 1.1–1.6 s; both are as they were in round 8.
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
  | Triangles, high tier, calm | 494,863 | 591,995 |
  | Draw calls, high tier, calm | 688 | 502 |
  | Triangles, low tier, calm | 222,742 | 250,086 |
  | Draw calls, low tier, calm | 352 | 259 |
  | World build on this machine | 0.6 s | 0.9–1.2 s (with the shader warm-up) |

* **Shader programs and textures.** Round 9 added two programs, the falls' sheet and the spring's boulders (the mist shares the
  particles' program, and the cut and its root share programs that already existed), and one texture, the cut's painted face (1.7 MB with
  its mipmaps). Counted at the same moment of the same village in the build before this round and in this one, the programs went from 27
  to 29 on a calm day and from 48 to 52 on a flood night, whose two others are variants tied to no object in the scene (a pass, a shadow
  or a depth variant). Against round 8's table the flood rows rose by 7–9 (43–54 then, 52–61 now): four are this round's, and the rest
  were already there in the build before it (48 at that moment of the flood night), which was not broken down further. On the real GPU,
  a night's resolution compiled no new program in run 5 (the count stayed at 61 through it, in a page that had drawn a flood night
  just before).

* **Multisampling.** The first run of this measurement made the chain look *cheaper* than drawing without it.
  * The canvas was 4× multisampled even under the chain, so switching the chain off made the direct path pay for multisampling the scene.
  * The canvas now asks for multisampling only where the chain cannot run, so the comparison is like for like.
  * All the numbers above were measured after that change.
* **The JS heap** varies between runs with garbage collection: 30–36 MB here, 34–48 MB in round 8, 30–45 MB in round 7, 28–40 MB in the
  visual pass.

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
