/**
 * Every 3D asset the world builds, as one list: the procedural generator for each kind of building, civic structure, tree and person,
 * and what it produces. The world ships no model files (`docs/3d-rebuild/ASSET_LICENSES.md`); this catalog is the manifest phase 08
 * asks for, read from the generators themselves rather than written by hand. `scripts/asset-manifest.ts` writes it out
 * (`docs/3d-rebuild/data/asset-manifest.json`), and `tests/unit/render3d-assets.test.ts` checks every entry.
 */
import * as THREE from 'three';
import { createRun } from '../src/engine/index.ts';
import { buildCabin, buildChapel, buildGranary, buildHall, buildHome, buildRuin, buildStandIn, type Built } from '../src/render3d/buildings.ts';
import { buildBeacon, buildBellTower, buildBridge, buildCampfire, buildMarket, buildMill, buildPen, buildShelter, buildWell, bridgeSpecOf } from '../src/render3d/civic.ts';
import { flowerGeometry, plantGeometry, reedGeometry, rockGeometry, tuftGeometry } from '../src/render3d/foliage.ts';
import { mergeByMaterial, type Part } from '../src/render3d/geom.ts';
import { fence } from '../src/render3d/kit.ts';
import { FAR_PX, buildFigure, buildRig, setFar } from '../src/render3d/people.ts';
import { YARD_PROPS, haystackAt, yardProp } from '../src/render3d/props.ts';
import { rng } from '../src/render3d/rand.ts';
import { getSceneSnapshot } from '../src/render3d/snapshot.ts';
import { makeTree, type TreeKind } from '../src/render3d/trees.ts';

export type AssetGroup = 'building' | 'civic' | 'bridge' | 'prop' | 'tree' | 'foliage' | 'person';

/** what one generator produced, before it is turned into meshes */
export interface Made {
  /** static parts, merged per material at load (buildings, civic structures, the bridge) */
  parts?: Part[];
  /** pieces that move, each in its own group about its own pivot (a bell, a mill wheel) */
  extras?: { name: string; parts: Part[]; pivot: [number, number, number] }[];
  /** one merged geometry, drawn instanced (trees, grass, flowers, rocks, reeds, crops) */
  geometry?: THREE.BufferGeometry;
  /** what an instanced geometry is drawn with */
  material?: string;
  /** a jointed figure: a group of vertex-coloured meshes on pivots (people) */
  rig?: THREE.Object3D;
}

export interface AssetEntry {
  id: string;
  group: AssetGroup;
  /** the generator, as file and function */
  source: string;
  /** how the world draws it */
  drawn: string;
  make(seed: number): Made;
}

const fromBuilt = (b: Built): Made => ({ parts: b.parts, extras: b.extras });

const TREES: TreeKind[] = ['oak', 'pine', 'birch', 'willow', 'apple', 'shrub', 'stump', 'blossom', 'autumn', 'cypress'];

function redbank() {
  return getSceneSnapshot(createRun({ scenarioId: 'redbank', seed: 1 }));
}

export function catalog(): AssetEntry[] {
  const merged = 'static parts merged into one mesh per material, then batched with the other buildings';
  const out: AssetEntry[] = [];
  for (let v = 0; v < 5; v++) out.push({ id: `home-${v}`, group: 'building', source: 'src/render3d/buildings.ts buildHome', drawn: merged, make: (s) => fromBuilt(buildHome(v, rng(s))) });
  out.push(
    { id: 'cabin', group: 'building', source: 'src/render3d/buildings.ts buildCabin', drawn: merged, make: (s) => fromBuilt(buildCabin(rng(s))) },
    { id: 'granary', group: 'building', source: 'src/render3d/buildings.ts buildGranary', drawn: merged, make: (s) => fromBuilt(buildGranary(rng(s))) },
    { id: 'hall', group: 'building', source: 'src/render3d/buildings.ts buildHall', drawn: merged, make: (s) => fromBuilt(buildHall(rng(s))) },
    { id: 'chapel', group: 'building', source: 'src/render3d/buildings.ts buildChapel', drawn: merged, make: (s) => fromBuilt(buildChapel(rng(s))) },
    { id: 'ruin', group: 'building', source: 'src/render3d/buildings.ts buildRuin', drawn: merged, make: (s) => fromBuilt(buildRuin(rng(s), false)) },
    { id: 'ruin-burned', group: 'building', source: 'src/render3d/buildings.ts buildRuin', drawn: merged, make: (s) => fromBuilt(buildRuin(rng(s), true)) },
    { id: 'stand-in', group: 'building', source: 'src/render3d/buildings.ts buildStandIn (drawn only where a generator failed)', drawn: merged, make: () => fromBuilt(buildStandIn()) },
    { id: 'belltower', group: 'civic', source: 'src/render3d/civic.ts buildBellTower', drawn: `${merged}; the bell swings in its own group`, make: (s) => fromBuilt(buildBellTower(rng(s))) },
    { id: 'mill', group: 'civic', source: 'src/render3d/civic.ts buildMill', drawn: `${merged}; the wheel turns in its own group`, make: (s) => fromBuilt(buildMill(rng(s))) },
    { id: 'market', group: 'civic', source: 'src/render3d/civic.ts buildMarket', drawn: merged, make: (s) => fromBuilt(buildMarket(rng(s))) },
    { id: 'shelter', group: 'civic', source: 'src/render3d/civic.ts buildShelter', drawn: merged, make: (s) => fromBuilt(buildShelter(rng(s))) },
    { id: 'well', group: 'civic', source: 'src/render3d/civic.ts buildWell', drawn: merged, make: (s) => fromBuilt(buildWell(rng(s))) },
    { id: 'pen', group: 'civic', source: 'src/render3d/civic.ts buildPen', drawn: merged, make: (s) => fromBuilt(buildPen(rng(s))) },
    { id: 'campfire', group: 'civic', source: 'src/render3d/civic.ts buildCampfire', drawn: `${merged}; flame and sparks are particles`, make: (s) => fromBuilt(buildCampfire(rng(s))) },
    { id: 'beacon', group: 'civic', source: 'src/render3d/civic.ts buildBeacon', drawn: `${merged}; flame and sparks are particles, with a point light`, make: (s) => fromBuilt(buildBeacon(rng(s))) },
    {
      id: 'bridge',
      group: 'bridge',
      source: 'src/render3d/civic.ts buildBridge (fitted to the engine tiles of each village; Redbank shown)',
      drawn: 'standing span, rubble (shown once it falls) and watch trim, each merged per material',
      make: () => {
        const snap = redbank();
        const br = snap.landmarks.find((l) => l.kind === 'bridge')!;
        const spec = bridgeSpecOf(br.tiles, { heightAt: () => 0.4, terrain: { w: snap.w, tileBase: new Float32Array(snap.w * snap.h) } });
        const b = buildBridge(spec);
        // the span is placed in the world by its tiles: brought back to its own centre here, so it reads like the other assets
        const cx = (spec.x0 + spec.x1 + 1) / 2;
        const cz = spec.row + 0.5;
        return { parts: [...b.standing, ...b.trim].map((p) => ({ geo: p.geo.clone().translate(-cx, -0.4, -cz), mat: p.mat })) };
      },
    },
  );
  const clutter = 'merged with the clutter of every yard and field into one mesh per material: a few draw calls for the whole village';
  for (const kind of YARD_PROPS) {
    out.push({ id: `prop-${kind}`, group: 'prop', source: `src/render3d/props.ts yardProp('${kind}')`, drawn: clutter, make: (s) => {
      const parts: Part[] = [];
      yardProp(parts, kind, 0, 0, 0, 0, rng(s));
      return { parts };
    } });
  }
  out.push(
    { id: 'prop-fence', group: 'prop', source: 'src/render3d/kit.ts fence (one unit of a field fence; runs are cut to the field edge)', drawn: clutter, make: () => {
      const parts: Part[] = [];
      fence(parts, -0.5, 0, 0.5, 0, 0, 0.12);
      return { parts };
    } },
    { id: 'prop-haystack', group: 'prop', source: 'src/render3d/props.ts haystackAt', drawn: clutter, make: () => {
      const parts: Part[] = [];
      haystackAt(parts, 0, 0, 0);
      return { parts };
    } },
  );
  for (const kind of TREES) out.push({ id: `tree-${kind}`, group: 'tree', source: `src/render3d/trees.ts makeTree('${kind}')`, drawn: 'one geometry per species, colours in the vertices, drawn as instances with their own transforms', make: (s) => ({ geometry: makeTree(kind, rng(s)) }) });
  const swayed = 'one geometry, drawn as instances with their own transforms and colours, bent by the shared wind in the vertex shader; casts no shadow';
  out.push(
    { id: 'grass-tuft', group: 'foliage', source: 'src/render3d/foliage.ts tuftGeometry', drawn: swayed, make: () => ({ geometry: tuftGeometry(), material: 'vertex colours, darker at the root' }) },
    { id: 'wildflower', group: 'foliage', source: 'src/render3d/foliage.ts flowerGeometry (placed in clusters)', drawn: 'one geometry, drawn as instances in clusters, each in its own colour; casts no shadow', make: () => ({ geometry: flowerGeometry(), material: 'one material, coloured per instance' }) },
    { id: 'reed', group: 'foliage', source: 'src/render3d/foliage.ts reedGeometry', drawn: swayed, make: () => ({ geometry: reedGeometry(), material: 'one material, tinted per instance' }) },
    { id: 'crop-grain', group: 'foliage', source: 'src/render3d/foliage.ts plantGeometry', drawn: `${swayed}; ripens with the engine's crop growth through the instance colour`, make: () => ({ geometry: plantGeometry(), material: 'vertex colours, ripened per instance' }) },
    // a rock is made at unit size and scaled per instance (0.04 to 0.16): shown here at 0.1
    { id: 'rock', group: 'foliage', source: 'src/render3d/foliage.ts rockGeometry (shown at an instance scale of 0.1)', drawn: 'one noise-shaped geometry per village, drawn as instances with their own transforms and colours; casts a shadow', make: (s) => ({ geometry: rockGeometry(rng(s)).scale(0.1, 0.1, 0.1), material: 'one material, coloured per instance' }) },
  );
  for (const v of redbank().villagers) {
    out.push({ id: `person-${v.id}`, group: 'person', source: 'src/render3d/people.ts buildRig', drawn: 'a jointed figure: vertex-coloured meshes on pivots (hips, knees, shoulders, head), animated by code', make: () => ({ rig: buildRig(v).root }) });
    out.push({
      id: `person-${v.id}-far`, group: 'person', source: 'src/render3d/people.ts buildFigure (the distant version: the same rig at about half the segments)',
      drawn: `the same figure's geometry, swapped in mesh by mesh while the person stands under ${FAR_PX} CSS pixels tall on screen`,
      make: () => {
        const rig = buildFigure(v);
        setFar(rig, true);
        return { rig: rig.root };
      },
    });
  }
  return out;
}

export interface AssetStats {
  id: string;
  group: AssetGroup;
  source: string;
  drawn: string;
  triangles: number;
  vertices: number;
  /** meshes the asset adds before batching: one per material for merged parts, one per jointed piece for people */
  meshes: number;
  materials: string[];
  /** the animated sub-groups and where each turns about (local space) */
  pivots: { name: string; at: [number, number, number] }[];
  /** extent in world units (a tile is one unit) */
  size: [number, number, number];
  /** the lowest point and the footprint's centre: the asset's origin is its base, in the middle of its footprint */
  minY: number;
  centre: [number, number];
  normals: 'present, unit length' | 'missing' | 'not unit length';
  vertexColours: boolean;
  uv: boolean;
  allFinite: boolean;
}

function geoStats(g: THREE.BufferGeometry): { tris: number; verts: number; finite: boolean; normals: AssetStats['normals']; colours: boolean; uv: boolean } {
  const pos = g.getAttribute('position');
  const tris = (g.index ? g.index.count : pos.count) / 3;
  let finite = true;
  for (let i = 0; i < pos.count * 3; i++) if (!Number.isFinite((pos.array as ArrayLike<number>)[i])) finite = false;
  const n = g.getAttribute('normal');
  let normals: AssetStats['normals'] = n ? 'present, unit length' : 'missing';
  if (n) {
    for (let i = 0; i < n.count; i += Math.max(1, Math.floor(n.count / 400))) {
      const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
      if (Math.abs(len - 1) > 0.02) normals = 'not unit length';
    }
  }
  return { tris, verts: pos.count, finite, normals, colours: !!g.getAttribute('color'), uv: !!g.getAttribute('uv') };
}

export function describe(e: AssetEntry, seed = 1): AssetStats {
  const made = e.make(seed);
  const box = new THREE.Box3();
  const mats = new Set<string>();
  const pivots: AssetStats['pivots'] = [];
  let tris = 0;
  let verts = 0;
  let meshes = 0;
  let finite = true;
  let normals: AssetStats['normals'] = 'present, unit length';
  let colours = false;
  let uv = false;
  const take = (g: THREE.BufferGeometry, offset?: [number, number, number]): void => {
    const s = geoStats(g);
    tris += s.tris;
    verts += s.verts;
    finite &&= s.finite;
    if (s.normals !== 'present, unit length') normals = s.normals;
    colours ||= s.colours;
    uv ||= s.uv;
    g.computeBoundingBox();
    const b = g.boundingBox!.clone();
    if (offset) b.translate(new THREE.Vector3(...offset));
    box.union(b);
  };
  if (made.parts) {
    // as the world draws them: merged per material (which also fills in missing normals and texture coordinates)
    for (const [key, g] of mergeByMaterial(made.parts)) {
      mats.add(key);
      meshes++;
      take(g);
    }
  }
  for (const x of made.extras ?? []) {
    pivots.push({ name: x.name, at: x.pivot.map((v) => Math.round(v * 1000) / 1000) as [number, number, number] });
    for (const [key, g] of mergeByMaterial(x.parts)) {
      mats.add(key);
      meshes++;
      take(g, x.pivot);
    }
  }
  if (made.geometry) {
    meshes++;
    take(made.geometry);
    mats.add(made.material ?? 'vertex colours (one shared material per species)');
  }
  if (made.rig) {
    made.rig.updateMatrixWorld(true);
    made.rig.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      meshes++;
      const g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
      take(g);
      mats.add('vertex colours (one shared material for every person)');
    });
    pivots.push({ name: 'hips, knees, shoulders, head (jointed)', at: [0, 0, 0] });
  }
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const r3 = (v: number): number => Math.round(v * 1000) / 1000;
  return {
    id: e.id, group: e.group, source: e.source, drawn: e.drawn, triangles: Math.round(tris), vertices: verts, meshes, materials: [...mats].sort(), pivots,
    size: [r3(size.x), r3(size.y), r3(size.z)], minY: r3(box.min.y), centre: [r3(c.x), r3(c.z)], normals, vertexColours: colours, uv, allFinite: finite,
  };
}
