import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { WATER_UNIT } from '../../src/render3d/coords.ts';
import { buildPlateEdge, PLATE_BASE } from '../../src/render3d/cliff.ts';
import { PROFILES, type WorldContext } from '../../src/render3d/context.ts';
import { FallsLayer } from '../../src/render3d/falls.ts';
import { rng, seedFrom } from '../../src/render3d/rand.ts';
import { getSceneChanges, getSceneSnapshot, type SceneSnapshot } from '../../src/render3d/snapshot.ts';
import { buildHeightField, SUB, type TerrainData } from '../../src/render3d/terrain.ts';
import { Water } from '../../src/render3d/water.ts';

/**
 * The plate's cut edge and the river where it meets it. The edge is painted and has relief, but it must still close the plate: every
 * face starts exactly at the ground's own edge and ends exactly where the root of rock begins, and the painted face repeats seamlessly
 * round the rim. The falls pour from the river's own surface at the lip, swell with a flood, and exist only where a river crosses the cut.
 */
const village = (scenarioId: string): { snap: SceneSnapshot; terrain: TerrainData } => {
  const snap = getSceneSnapshot(GameSession.create({ scenarioId, seed: 1 }).state);
  return { snap, terrain: buildHeightField(snap, seedFrom(snap.scenarioId, snap.seed)) };
};

/** a 2D canvas that draws nothing, so the painted face can be made outside a browser */
function stubCanvas(): void {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key) => (key === 'createImageData' ? (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) : () => undefined),
    set: () => true,
  });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
}

const key = (x: number, y: number, z: number): string => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

describe('the plate’s cut edge closes the plate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('every face starts at the ground’s own edge and ends where the root begins, with no gap at either seam or at a corner', () => {
    stubCanvas();
    const { terrain } = village('redbank');
    const edge = buildPlateEdge(terrain, 7, 1, SUB);
    const faces = edge.group.getObjectByName('plate-edge') as THREE.Mesh;
    const root = edge.group.getObjectByName('island-root') as THREE.Mesh;
    const fp = faces.geometry.getAttribute('position');
    const rp = root.geometry.getAttribute('position');
    const cols = 2 * (terrain.nx + terrain.nz);
    const rows = fp.count / cols;
    expect(Number.isInteger(rows)).toBe(true);
    const rootPoints = new Set<string>();
    for (let i = 0; i < rp.count; i++) rootPoints.add(key(rp.getX(i), rp.getY(i), rp.getZ(i)));
    for (let c = 0; c < cols; c++) {
      const top = c * rows;
      const bottom = top + rows - 1;
      // the top row is the ground's edge itself
      expect(fp.getY(top), `column ${c} top`).toBeCloseTo(terrain.heightAt(fp.getX(top), fp.getZ(top)), 4);
      // the bottom row is a point of the root's top ring
      expect(rootPoints.has(key(fp.getX(bottom), fp.getY(bottom), fp.getZ(bottom))), `column ${c} bottom`).toBe(true);
      // and the face only ever goes down
      for (let r = 1; r < rows; r++) expect(fp.getY(top + r)).toBeLessThan(fp.getY(top + r - 1));
    }
    edge.dispose();
  });

  it('the relief stays within a hand’s breadth of the cut and fades out at the corners, so neighbouring faces meet edge to edge', () => {
    stubCanvas();
    const { terrain } = village('redbank');
    const edge = buildPlateEdge(terrain, 7, 1, SUB);
    const fp = (edge.group.getObjectByName('plate-edge') as THREE.Mesh).geometry.getAttribute('position');
    const { w, h } = terrain;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i);
      const z = fp.getZ(i);
      // how far out of the plate's footprint the face stands here (negative: tucked in)
      const outside = Math.max(-x, x - w, -z, z - h);
      const inside = Math.min(x, w - x, z, h - z);
      expect(Math.max(outside, -inside), `vertex ${i}`).toBeLessThan(0.21);
      expect(Math.max(outside, -inside), `vertex ${i}`).toBeGreaterThan(-0.05);
    }
    // the four corners: every face's vertex there sits on the corner's vertical line
    for (const [cx, cz] of [[0, 0], [w, 0], [w, h], [0, h]]) {
      let found = 0;
      for (let i = 0; i < fp.count; i++) if (Math.hypot(fp.getX(i) - cx, fp.getZ(i) - cz) < 1e-6) found++;
      expect(found, `corner ${cx},${cz}`).toBeGreaterThanOrEqual(2 * 13);
    }
    edge.dispose();
  });

  it('the painted face runs on round the rim without a seam: whole repeats, and each face picks up where the last one ended', () => {
    stubCanvas();
    const { terrain } = village('redbank');
    const edge = buildPlateEdge(terrain, 7, 1, SUB);
    const uv = (edge.group.getObjectByName('plate-edge') as THREE.Mesh).geometry.getAttribute('uv');
    let maxU = 0;
    for (let i = 0; i < uv.count; i++) {
      maxU = Math.max(maxU, uv.getX(i));
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-6);
    }
    expect(Math.abs(maxU - Math.round(maxU))).toBeLessThan(1e-6);
    // the faces are laid round the rim in order (north, east, south, west): where one ends the next starts at the same u
    const rows = uv.count / (2 * (terrain.nx + terrain.nz));
    const lastOf = (c: number) => uv.getX(c * rows);
    const ends = [terrain.nx, terrain.nx + terrain.nz, 2 * terrain.nx + terrain.nz];
    for (const e of ends) expect(lastOf(e)).toBeCloseTo(lastOf(e - 1), 9);
    edge.dispose();
  });

  it('no crag hangs under the river where it crosses the cut: the water wears the lip back', () => {
    stubCanvas();
    const { terrain } = village('redbank');
    const edge = buildPlateEdge(terrain, 7, 1, SUB);
    const fp = (edge.group.getObjectByName('plate-edge') as THREE.Mesh).geometry.getAttribute('position');
    const rows = fp.count / (2 * (terrain.nx + terrain.nz));
    let wetColumns = 0;
    for (let c = 0; c < fp.count / rows; c++) {
      const i = c * rows;
      const x = fp.getX(i);
      const z = fp.getZ(i);
      const k = Math.round(z * SUB) * terrain.nx + Math.round(x * SUB);
      if (terrain.wet[k] < 0.999) continue;
      wetColumns++;
      expect(fp.getY(i + rows - 1), `column at ${x},${z}`).toBeCloseTo(PLATE_BASE - 0.04, 3);
    }
    // the river crosses the cut twice in Redbank, three tiles wide each time
    expect(wetColumns).toBeGreaterThan(8);
    edge.dispose();
  });
});

const contextFor = (terrain: TerrainData, water: Water): WorldContext =>
  ({
    terrain,
    water,
    profile: PROFILES.high,
    seed: 1,
    rng: (salt: string) => rng(seedFrom(1, salt)),
    heightAt: (x: number, z: number) => terrain.heightAt(x, z),
    reducedMotion: false,
    weather: { wind: 1, rain: 0 },
  }) as unknown as WorldContext;

describe('the river falls where it leaves the plate and rises among boulders where it enters', () => {
  it('Redbank: one sheet over the downstream (south) lip, poured from the river’s own surface, and boulders at the upstream lip', () => {
    const { snap, terrain } = village('redbank');
    const water = new Water(snap, terrain, 'high');
    const ctx = contextFor(terrain, water);
    const falls = new FallsLayer(ctx);
    falls.update(snap, getSceneChanges(null, snap), ctx);
    const sheets = falls.group.children.filter((o) => o.name === 'waterfall') as THREE.Mesh[];
    expect(sheets).toHaveLength(1);
    // a veil to the finishing chain: what is behind it keeps its code scaled by what the water lets through, so its ink fades under it
    const m = sheets[0].material as THREE.Material;
    expect([m.blending, m.blendSrcAlpha, m.blendDstAlpha]).toEqual([THREE.CustomBlending, THREE.ZeroFactor, THREE.OneMinusSrcAlphaFactor]);
    const g = sheets[0].geometry;
    const pos = g.getAttribute('position');
    const t = g.getAttribute('aT');
    const a = g.getAttribute('aA');
    let poured = 0;
    let dry = 0;
    for (let i = 0; i < pos.count; i++) {
      if (t.getX(i) !== 0) continue;
      // the top row is the lip: on the south cut, inside the river's span plus a tile of margin either side
      expect(pos.getZ(i)).toBeCloseTo(snap.h + 0.012, 3);
      expect(pos.getX(i)).toBeGreaterThanOrEqual(11 - 1e-6);
      expect(pos.getX(i)).toBeLessThanOrEqual(17 + 1e-6);
      if (a.getX(i) > 0.5) {
        poured++;
        expect(pos.getY(i)).toBeCloseTo(water.surfaceAt(pos.getX(i), snap.h - 0.02), 4);
      } else if (a.getX(i) === 0) dry++;
    }
    expect(poured, 'columns of falling water').toBeGreaterThan(3);
    expect(dry, 'transparent columns where the lip is dry').toBeGreaterThan(0);
    // every column falls and is thrown outwards as it goes
    const rows = 19;
    for (let c = 0; c < pos.count / rows; c++) {
      for (let k = 1; k < rows; k++) {
        expect(pos.getY(c * rows + k)).toBeLessThan(pos.getY(c * rows + k - 1));
        expect(pos.getZ(c * rows + k)).toBeGreaterThan(pos.getZ(c * rows + k - 1));
      }
    }
    // the boulders stand where the river comes in, at the north cut
    const rocks = falls.group.getObjectByName('spring-rocks') as THREE.Mesh;
    rocks.geometry.computeBoundingBox();
    const box = rocks.geometry.boundingBox as THREE.Box3;
    expect(box.min.x).toBeGreaterThan(10.5);
    expect(box.max.x).toBeLessThan(16.5);
    expect(box.min.z).toBeGreaterThan(-0.6);
    expect(box.max.z).toBeLessThan(1.4);
    expect(falls.group.getObjectByName('falls-mist')).toBeTruthy();
    falls.dispose();
    expect(falls.group.children).toHaveLength(0);
    water.dispose();
  });

  it('a flood at the lip swells the falls: the sheet’s top rises with the engine’s water', () => {
    const { snap, terrain } = village('redbank');
    const water = new Water(snap, terrain, 'high');
    const ctx = contextFor(terrain, water);
    const falls = new FallsLayer(ctx);
    falls.update(snap, getSceneChanges(null, snap), ctx);
    const sheet = falls.group.getObjectByName('waterfall') as THREE.Mesh;
    const topAt = (): number => {
      const pos = sheet.geometry.getAttribute('position');
      const a = sheet.geometry.getAttribute('aA');
      let best = -Infinity;
      for (let i = 0; i < pos.count; i += 19) if (a.getX(i) > 0.5) best = Math.max(best, pos.getY(i));
      return best;
    };
    const before = topAt();
    const flooded: SceneSnapshot = { ...snap, water: Float32Array.from(snap.water) };
    for (let x = 0; x < snap.w; x++) for (const y of [snap.h - 2, snap.h - 1]) if (snap.terrain[y * snap.w + x] === 1) flooded.water[y * snap.w + x] += 3;
    water.setState(flooded, false);
    falls.update(flooded, { ...getSceneChanges(snap, flooded), water: true }, ctx);
    expect(topAt() - before).toBeCloseTo(3 * WATER_UNIT, 2);
    falls.dispose();
    water.dispose();
  });

  it('a village with no river has no falls and no spring', () => {
    for (const id of ['ashwood', 'harvest']) {
      const { snap, terrain } = village(id);
      const water = new Water(snap, terrain, 'high');
      const ctx = contextFor(terrain, water);
      const falls = new FallsLayer(ctx);
      falls.update(snap, getSceneChanges(null, snap), ctx);
      expect(falls.group.children, id).toHaveLength(0);
      falls.dispose();
      water.dispose();
    }
  });
});
