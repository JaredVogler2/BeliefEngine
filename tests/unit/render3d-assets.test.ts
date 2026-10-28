import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { catalog, describe as describeAsset, type AssetGroup, type AssetStats } from '../../scripts/asset-catalog.ts';
import { listScenarios } from '../../src/engine/content/registry.ts';
import type { LandmarkKind } from '../../src/engine/core/types.ts';
import { createRun } from '../../src/engine/index.ts';
import type { WorldContext } from '../../src/render3d/context.ts';
import { LandmarksLayer } from '../../src/render3d/landmarks.ts';
import { MaterialLib } from '../../src/render3d/materials.ts';
import { rng, seedFrom, type Rng } from '../../src/render3d/rand.ts';
import { getSceneChanges, getSceneSnapshot, type SceneSnapshot } from '../../src/render3d/snapshot.ts';

/**
 * Every 3D asset the world builds, checked from its generator (the world ships no model files: `scripts/asset-catalog.ts` is the
 * manifest, `docs/3d-rebuild/data/asset-manifest.json` its written form). Each generator is run with three seeds, the way the
 * world varies them, and every result must be sound geometry that stands where it is put, asks only for materials that exist and
 * stays within its kind's triangle budget.
 */
const BUDGET: Record<AssetGroup, number> = { building: 2500, civic: 2500, bridge: 2500, prop: 1500, tree: 600, foliage: 200, person: 4000 };
/** the groups made of parts from the material library (the rest are drawn with one material of their own, coloured per vertex or instance) */
const LIBRARY: AssetGroup[] = ['building', 'civic', 'bridge', 'prop'];

describe('every 3D asset the world builds is sound', () => {
  const entries = catalog();
  const rows = entries.flatMap((e) => [1, 2, 3].map((seed) => ({ seed, ...describeAsset(e, seed) })));

  it('the catalog covers what the brief lists: four or more cottage variants, the civic buildings, the bridge, yard and field props, four or more trees, ground cover, 14 people', () => {
    const ids = entries.map((e) => e.id);
    expect(ids.filter((i) => i.startsWith('home-')).length).toBeGreaterThanOrEqual(4);
    for (const kind of ['mill', 'belltower', 'hall', 'shelter', 'beacon', 'bridge', 'granary', 'chapel', 'market', 'well']) expect(ids).toContain(kind);
    for (const kind of ['prop-cart', 'prop-woodpile', 'prop-fence', 'prop-haystack', 'grass-tuft', 'wildflower', 'crop-grain', 'rock', 'reed', 'tree-shrub']) expect(ids).toContain(kind);
    expect(entries.filter((e) => e.group === 'tree').length).toBeGreaterThanOrEqual(4);
    expect(entries.filter((e) => e.group === 'person').length).toBeGreaterThanOrEqual(14);
  });

  it('every asset is real geometry: triangles, finite positions, and unit normals on every vertex (no zero-area faces)', () => {
    for (const r of rows) {
      expect(r.triangles, r.id).toBeGreaterThan(0);
      expect(r.allFinite, r.id).toBe(true);
      expect(r.normals, `${r.id} seed ${r.seed}`).toBe('present, unit length');
    }
  });

  it('every asset stands on its origin: the base at the ground or below it (foundations and piers), never floating, the footprint about the middle', () => {
    for (const r of rows) {
      expect(r.minY, r.id).toBeLessThanOrEqual(0.02);
      expect(r.minY, r.id).toBeGreaterThan(-0.6);
      expect(Math.abs(r.centre[0]), r.id).toBeLessThan(0.35);
      expect(Math.abs(r.centre[1]), r.id).toBeLessThan(0.35);
      // a tile is one unit: a cottage is about one, the bridge spans its river, a stump is a hand high
      expect(Math.max(...r.size), r.id).toBeLessThan(r.group === 'bridge' ? 5 : 2.6);
      expect(Math.max(...r.size), r.id).toBeGreaterThan(0.02);
    }
  });

  it('every material an asset asks for exists in the material library (a tint is a variant of a named material)', () => {
    const known = new Set(new MaterialLib(1).names());
    for (const r of rows) {
      if (!LIBRARY.includes(r.group)) continue;
      for (const key of r.materials) {
        expect(known.has(key.split('@')[0]), `${r.id}: ${key}`).toBe(true);
        if (key.includes('@')) expect(key.split('@')[1], `${r.id}: ${key}`).toMatch(/^[0-9a-f]{6}$/);
      }
    }
  });

  it('each asset stays within its kind’s triangle budget, and textured assets carry texture coordinates', () => {
    for (const r of rows) {
      expect(r.triangles, r.id).toBeLessThanOrEqual(BUDGET[r.group]);
      // and no building is a bare block: a box is 12 triangles, the plainest modelled building (the well) is about 200
      if (['building', 'civic', 'bridge'].includes(r.group) && r.id !== 'stand-in') expect(r.triangles, r.id).toBeGreaterThanOrEqual(150);
      if (LIBRARY.includes(r.group)) expect(r.uv, r.id).toBe(true);
      if (r.group === 'tree' || r.group === 'person') expect(r.vertexColours, r.id).toBe(true);
    }
  });

  it('the generators are deterministic: the same seed builds the same asset', () => {
    for (const e of entries) expect(describeAsset(e, 7), e.id).toEqual(describeAsset(e, 7));
  });

  it('the written manifest is the generators’ own output (regenerate it with `npx tsx scripts/asset-manifest.ts` after changing a model)', () => {
    const written = JSON.parse(readFileSync('docs/3d-rebuild/data/asset-manifest.json', 'utf8')) as { seed: number; assets: AssetStats[] };
    const now = entries.map((e) => describeAsset(e, written.seed));
    expect(written.assets.map((a) => a.id)).toEqual(now.map((a) => a.id));
    for (const [i, a] of written.assets.entries()) {
      const b = now[i];
      const { size: sa, minY: ya, centre: ca, ...restA } = a;
      const { size: sb, minY: yb, centre: cb, ...restB } = b;
      expect(restA, a.id).toEqual(restB);
      // the measured extents are rounded to a thousandth: allow one step of rounding either way
      for (const [x, y] of [...sa.map((v, k) => [v, sb[k]]), [ya, yb], ...ca.map((v, k) => [v, cb[k]])]) expect(Math.abs(x - y), a.id).toBeLessThanOrEqual(0.002);
    }
  });
});

/** a world context with what the landmarks layer reads, and the generators' seeded random numbers (or a broken one for one place) */
function contextFor(snap: SceneSnapshot, broken?: string): WorldContext {
  return {
    materials: { get: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => undefined },
    profile: { detail: 1, particles: 1, trees: 1 },
    rng: (key: string): Rng => (key === `lm:${broken}` ? () => { throw new Error('generator failed'); } : rng(seedFrom('assets', key))),
    heightAt: () => 0,
    reducedMotion: true,
    bridgeLift: 0,
    water: { surfaceAt: () => -1 },
    terrain: { w: snap.w, tileBase: new Float32Array(snap.w * snap.h) },
  } as unknown as WorldContext;
}

/** every kind of place the engine knows, and what draws it (a new kind in the engine fails this file's typecheck until it is drawn) */
const DRAWN_BY: Record<LandmarkKind, string> = {
  home: 'buildHome', cabin: 'buildCabin', granary: 'buildGranary', hall: 'buildHall', chapel: 'buildChapel', belltower: 'buildBellTower', mill: 'buildMill',
  market: 'buildMarket', shelter: 'buildShelter', well: 'buildWell', pen: 'buildPen', campfire: 'buildCampfire', beacon: 'buildBeacon', bridge: 'buildBridge',
  rubble: 'buildRuin', field: 'the ground, its fences, hay and planted rows', road: 'the ground',
};

describe('no place in any village is drawn with a placeholder', () => {
  it('every authored village, as built and after a fire, draws every place from its own generator: no stand-in, nothing missing, nothing reported', () => {
    expect(Object.keys(DRAWN_BY).length).toBe(17);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const s of listScenarios()) {
      for (const seed of [1, 2]) {
        const snap = getSceneSnapshot(createRun({ scenarioId: s.id, seed }));
        // and the same village with every building burned down: each one becomes its ruin
        const burned: SceneSnapshot = { ...snap, landmarks: snap.landmarks.map((l) => (['field', 'road', 'bridge'].includes(l.kind) ? l : { ...l, hp: 0 })) };
        for (const sn of [snap, burned]) {
          const ctx = contextFor(sn);
          const layer = new LandmarksLayer(ctx);
          layer.update(sn, getSceneChanges(null, sn), ctx);
          const picked = new Set(layer.pickables().map((o) => (o.userData.entity as { id: string }).id));
          for (const l of sn.landmarks) {
            expect(DRAWN_BY[l.kind as LandmarkKind], `${s.id}: ${l.kind}`).toBeTruthy();
            if (!['field', 'road'].includes(l.kind)) expect(picked.has(l.id), `${s.id} seed ${seed}: ${l.id}`).toBe(true);
          }
          expect(layer.standIns(), `${s.id} seed ${seed}`).toEqual([]);
          layer.dispose();
        }
      }
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('a generator that fails costs the village one building, not the whole world', () => {
  it('the place whose generator throws gets a plain stand-in that can still be seen and picked, the failure is reported, and every other place is built as usual', () => {
    const snap = getSceneSnapshot(createRun({ scenarioId: 'redbank', seed: 1 }));
    const broken = 'h_wells';
    // the one place's generator gets random numbers that throw, as a broken generator would
    const ctx = contextFor(snap, broken);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const layer = new LandmarksLayer(ctx);
    layer.update(snap, getSceneChanges(null, snap), ctx);
    const picked = new Set(layer.pickables().map((o) => (o.userData.entity as { id: string }).id));
    // every place the world draws a building for is there to pick, the broken one included
    for (const l of snap.landmarks.filter((x) => !['field', 'road'].includes(x.kind))) expect(picked.has(l.id), l.id).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('stand-in');
    expect(layer.standIns()).toEqual([broken]);
    warn.mockRestore();
    layer.dispose();
  });
});
