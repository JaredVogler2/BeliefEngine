# 3D asset and licence ledger

**The 3D world ships no art files.** There is no glTF/GLB, no image, no HDRI, no font file, no audio sample and no shader from another
project in the repository or in the build. Every texture is painted onto a small canvas at load from a seeded generator; every mesh is
built from primitives by code; every shader is written here. This was a choice, not a gap: the playbook prefers GLB where possible and
procedural generation as the fallback, and a hand-built procedural kit lets the whole world be reproduced from the repository with
nothing to download, nothing to attribute and nothing that can go missing.

`git ls-files | grep -iE '\.(png|jpe?g|webp|glb|gltf|woff2?|ttf|otf|mp3|ogg|wav|hdr|ktx2?)$'` returns nothing outside the screenshots
under `docs/` (those are evidence, not assets). The only shipped non-code file is `public/favicon.svg` (the project's own).

## What is generated, and where

| Asset | How it is made | Source | Licence |
|---|---|---|---|
| Ground (grass, fields, roads, rock, marsh, sand, forest floor, paths worn to doors, mown plots) | one canvas per village, painted from the tile map, blended per tile with seeded noise | `src/render3d/groundTexture.ts` | project (MIT) |
| Plaster, tile, thatch, planks, timber, stone, cobble, bark, cloth | 256 px canvases (128 on the low tier) painted from a seeded generator; tinted variants share the texture | `src/render3d/materials.ts` | project (MIT) |
| Glass, iron, brass, rope, straw, mud, gold | flat PBR materials (colour, roughness, metalness) | `src/render3d/materials.ts` | project (MIT) |
| Terrain mesh | height field from the engine's elevation, smoothed; the painted ground texture | `src/render3d/terrain.ts`, `src/render3d/groundTexture.ts` | project (MIT) |
| The plate's cut edge and the root of rock under it | painted strata on a canvas made from the seed (turf, topsoil with roots and pebbles, clay, sandstone, jointed rock), faces with relief and a ragged base; the root flat-shaded rock | `src/render3d/cliff.ts` | project (MIT) |
| Waterfall, mist and spring boulders | a falling sheet shaded with the river's own uniforms, soft point sprites for mist, boulders from the rock generator merged into one mesh | `src/render3d/falls.ts` | project (MIT) |
| River and flood surface | one mesh over the terrain, a custom GLSL shader (flow, glints, foam) | `src/render3d/water.ts` | project (MIT) |
| Houses, cabins, mill, granary, hall, chapel, market, shelter, well, pens, campfire, beacon, bridge, bell tower | merged primitive geometry per material (box, cylinder, extruded arch, gable and hip roofs) | `src/render3d/geom.ts`, `buildings.ts`, `civic.ts`, `kit.ts`, `landmarks.ts` | project (MIT) |
| Oak (also in blossom and in autumn colour), pine, birch, willow, cypress, apple, shrub, stump; grass tufts, wildflowers, reeds, grain, rocks | one merged geometry per species with colours painted into the vertices (or one material coloured per instance), instanced | `src/render3d/trees.ts`, `foliage.ts` | project (MIT) |
| Yard and field props: woodpile, hand cart, washing line, kitchen garden, fence runs, haystacks; crates, barrels, sacks, lanterns on the buildings | merged primitive geometry per material, batched for the whole village | `src/render3d/props.ts`, `kit.ts`, `foliage.ts` | project (MIT) |
| Villagers (build, skin, hair, hat, garment from `Villager.look` and role; held props) | turned and primitive shapes baked into a few vertex-coloured meshes per figure, on pivots at the hips, knees, shoulders and head, with procedural walk, work, rest and gesture animation; a distant version of each figure at about half the segments | `src/render3d/people.ts` | project (MIT) |
| Sky | a screen-space gradient shader | `src/render3d/sky.ts`, `atmosphere.ts` | project (MIT) |
| Rain, smoke, flame, embers, sparks, dust | point sprites and line segments in vertex shaders; one draw call per pool | `src/render3d/atmosphere.ts`, `particles.ts` | project (MIT) |
| Runes, eyes | old-futhark rune shapes drawn as strokes on a 128 px canvas with a glow | `src/render3d/glyphs.ts` | project (MIT) |
| Law ground (rings, ticks, spirals, drops, dots) and ripples | fragment-shader patterns inside the terrain's and river's own shading | `src/render3d/magic.ts` | project (MIT) |
| Typography | system font stacks only; no web fonts are requested | `src/styles.css` | the user's operating system |
| Sound | unchanged: Web Audio synthesis | `src/audio/audio.ts` | project (MIT) |

## The asset manifest, and how every asset is checked

Phase 08 asks for a repeatable pipeline that records each model's hierarchy, pivots, scale, normals, ambient occlusion, vertex colour
and texture format, a coherent material library, a mesh asset manifest versioned with the source, fallback assets and validation tests.
The pipeline here is the generators themselves (the phase allows "well-crafted Three.js geometry factories converted to reusable
assets" in place of Blender and glTF), and the record is read from them rather than written by hand:

- **The catalog**, `scripts/asset-catalog.ts`, lists every model the world builds and the generator that makes it: five cottage
  variants, the cabin, granary, hall, chapel, ruin (standing and burned), bell tower, mill, market, shelter, well, pen, campfire, beacon,
  the bridge, the yard and field props, ten kinds of tree (a shrub and a stump among them), five kinds of ground cover, the 14 people of Redbank and the distant version of each,
  and the plain stand-in drawn only when a generator fails. 70 entries. The surfaces built from the village's own data rather than
  placed (the ground, the plate's cut edge and the root under it, the river with its falls, the sky and the cloud sea) are in the table
  above, not the catalog, and are checked by their own tests (`render3d-scene.test.ts`, `render3d-edge.test.ts`).
- **The manifest**, `docs/3d-rebuild/data/asset-manifest.json`, is the catalog run with a fixed seed and written out by
  `npx tsx scripts/asset-manifest.ts` (add `--md` for a table). For each asset it gives the generator, how the world draws it,
  triangles, vertices, meshes before batching, the materials by library name and tint, the animated sub-groups and where each turns
  (the bell, the mill wheel, the people's joints), the extent in world units (one engine tile is one unit), the base and the
  footprint's centre (every asset stands on its origin), and whether it carries unit normals, vertex colours and texture coordinates.
  The header records the units, the origin convention, the texture format (one 256 px RGBA8 sRGB canvas per textured material, 128 px on
  the low tier, repeat-wrapped, mipmapped, anisotropic filtering up to 8; a material with relief uses its canvas as its bump map too) and
  how ambient occlusion is done (none baked into
  building textures; screen-space ambient occlusion on the medium and high tiers; the underside of each tree crown is darker in
  their vertex colours; the ground is darkened round each building's footprint in its painted texture).
- **The material library** is `src/render3d/materials.ts`: every building, civic structure, the bridge and every prop asks for its
  materials by name (`plaster`, `roofTile`, `stone`, `timber`, …), optionally with a tint (`stone@8e887a`); a tint is a variant of a
  named material and shares its texture.
- **Validation**, `tests/unit/render3d-assets.test.ts`, runs every generator with three seeds and checks that each result is real
  geometry (triangles, finite positions, unit normals on every vertex: no zero-area faces), stands on its origin, asks only for
  materials the library has, stays within its kind's triangle budget (buildings 2,500, people 4,000, trees 600, ground cover 200),
  carries texture coordinates where it is textured and vertex colours where it is coloured that way, is never a bare block (150
  triangles or more for any building), and is the same asset for the same seed. It also checks that the written manifest is the
  generators' current output, so the record cannot drift from the code, and that every kind of place the engine knows is drawn by a
  named generator: every authored village, as built and with every building burned, draws every place from its own generator with no
  stand-in. The first run of these tests found a real defect (zero-area triangles with no normal in the pyramid roofs of the chapel,
  the bell tower and the shelter), since fixed.
- **Fallback**: if a generator throws, that one place is drawn as a plain stand-in cottage (still there to see and to pick), the failure
  is reported in the console, and the rest of the village is built as usual (`LandmarksLayer`; tested). The developer monitor
  (`?perf=1`) names any place standing in.
- **Level of detail**: each person is built twice, the second time at about half the segments (about 1,500 triangles against 3,200),
  and the two are swapped mesh by mesh when the person stands under 40 px on screen (`tests/unit/render3d-lod.test.ts`). Buildings
  and trees have no distant version: the whole plate is in view at the overview, so there is no far scenery to simplify, and
  the tiny props already cast no shadow (grass, flowers, reeds and crops).

Nothing in the manifest is a placeholder: the stand-in is listed so that it is checked like everything else, and the tests assert that
no authored village ever draws it.

## Third-party code

| Package | Version | Licence | Used for | Shipped |
|---|---|---|---|---|
| `three` | 0.186.1 | MIT | WebGL2 renderer, scene graph, `BufferGeometryUtils` (merge, weld). Only the parts imported by `src/render3d/**` are bundled, in a lazy chunk named `World3D-*`. | yes, as the lazy 3D chunk |
| `@types/three` | matches | MIT | types | no (dev) |

React Three Fiber and Drei were **not** used. The playbook names them as the default; this project uses Three.js directly behind a
small renderer interface (`src/render/types.ts`) because the scene is driven by a read-only snapshot, not by React state, and the
extra layer would add a dependency and a reconciler to a loop that already has one owner. `docs/THIRD_PARTY_LICENSES_PROD.md` is
regenerated by `npx tsx scripts/licenses.ts --prod --write` and lists `three` among the shipped packages.

## Rules for adding assets (unchanged, and stricter for 3D)

1. Prefer code over files.
2. A file is acceptable only with its author, source URL, licence text and fetch date in this ledger **in the same commit**, and the
   licence file committed beside it.
3. Nothing is copied from another game or from the concept images the brief refers to; the direction (tabletop fantasy settlement,
   warm afternoon light, terracotta / emerald / gold / teal / indigo) is a brief, not a source.
4. Texture budgets are in `PERFORMANCE.md`; a new texture must fit them.
