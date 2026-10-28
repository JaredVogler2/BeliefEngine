import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GameSession, createRun } from '../../src/engine/index.ts';
import type { WorldContext } from '../../src/render3d/context.ts';
import { FAR_PX, PeopleLayer, buildFigure, setFar } from '../../src/render3d/people.ts';
import { getSceneChanges, getSceneSnapshot } from '../../src/render3d/snapshot.ts';

/**
 * Level of detail for the people, the densest meshes in the village. Each figure is built twice, the second time at about half the
 * segments, and the two are paired mesh by mesh: a person standing only a few dozen pixels tall on screen is drawn with the distant
 * version, and the close one comes back as the camera draws near. Only geometry is swapped, so the pivots and the animation are shared.
 */
const triangles = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.owned) {
      const g = o.geometry as THREE.BufferGeometry;
      n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
  });
  return n;
};

describe('the people have a distant version of their figures', () => {
  const snap = getSceneSnapshot(createRun({ scenarioId: 'redbank', seed: 1 }));

  it('every figure’s distant version is the same rig with at most 60% of the triangles, and the swap goes both ways', () => {
    for (const v of snap.villagers) {
      const rig = buildFigure(v);
      const near = triangles(rig.root);
      expect(rig.lod.length, v.id).toBeGreaterThan(5);
      expect(rig.far).toBe(false);
      setFar(rig, true);
      const far = triangles(rig.root);
      expect(far, v.id).toBeLessThanOrEqual(near * 0.6);
      // still a whole figure: every part is there, only turned more coarsely
      expect(far, v.id).toBeGreaterThan(near * 0.2);
      for (const l of rig.lod) expect(l.mesh.geometry).toBe(l.far);
      setFar(rig, false);
      expect(triangles(rig.root)).toBe(near);
      for (const l of rig.lod) expect(l.mesh.geometry).toBe(l.near);
    }
  });

  it('the people layer draws a person with the distant version when they stand under the threshold on screen, and the close one again as the camera comes in', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const s1 = getSceneSnapshot(g.state);
    const viewFrom = new THREE.Vector3(0, 60, 60);
    // a small window: 400 CSS pixels per unit at a unit's distance (a 14° slice of a 30° view)
    const VPX = 400;
    const ctx = {
      heightAt: () => 0, reducedMotion: true, bridgeLift: 0, viewDistance: 40, weather: { wind: 1, rain: 0 }, profile: { detail: 1, particles: 1, trees: 1 },
      visitSpot: () => null, terrain: { w: s1.w, tileBase: new Float32Array(s1.w * s1.h) }, viewFrom, viewPx: VPX,
    } as unknown as WorldContext;
    const layer = new PeopleLayer(ctx);
    layer.update(s1, getSceneChanges(null, s1), ctx);
    const walkers = [...(layer as unknown as { walkers: Map<string, { rig: { far: boolean; root: THREE.Object3D } }> }).walkers.values()];
    expect(walkers.length).toBe(14);
    layer.tick(1 / 60, 0, ctx);
    // from 85 units away a person is about 3 px tall
    expect(walkers.every((w) => w.rig.far)).toBe(true);
    // stand the camera two units from one person: that person is drawn close, the rest stay distant
    const one = walkers[0].rig.root.position;
    viewFrom.set(one.x, one.y + 1, one.z + 1.7);
    layer.tick(1 / 60, 1 / 60, ctx);
    expect(walkers[0].rig.far).toBe(false);
    // everyone else by their own height on screen: close from FAR_PX + 8 up (they were all distant a moment ago)
    const px = (d: number): number => (0.62 * walkers[0].rig.root.scale.y * VPX) / d;
    for (const w of walkers) expect(w.rig.far).toBe(px(viewFrom.distanceTo(w.rig.root.position)) < FAR_PX + 8);
    expect(walkers.some((w) => w.rig.far), 'someone across the village is still small on screen').toBe(true);
    // between the two thresholds a person keeps the version they have, so a slow zoom does not flicker between them
    const at = (h: number): number => (0.62 * walkers[0].rig.root.scale.y * VPX) / h;
    viewFrom.set(one.x, one.y, one.z + at(FAR_PX + 4));
    layer.tick(1 / 60, 2 / 60, ctx);
    expect(px(viewFrom.distanceTo(one))).toBeCloseTo(FAR_PX + 4, 0);
    expect(walkers[0].rig.far).toBe(false);
    viewFrom.set(one.x, one.y, one.z + at(FAR_PX - 2));
    layer.tick(1 / 60, 3 / 60, ctx);
    expect(walkers[0].rig.far).toBe(true);
    viewFrom.set(one.x, one.y, one.z + at(FAR_PX + 4));
    layer.tick(1 / 60, 4 / 60, ctx);
    expect(walkers[0].rig.far).toBe(true);
    layer.dispose();
  });

  it('a figure that leaves the scene frees both versions of its geometry', () => {
    const rig = buildFigure(snap.villagers[0]);
    const freed = new Set<THREE.BufferGeometry>();
    for (const l of rig.lod) for (const geo of [l.near, l.far]) vi.spyOn(geo, 'dispose').mockImplementation(() => void freed.add(geo));
    const layer = new PeopleLayer({ heightAt: () => 0, profile: { detail: 1, particles: 1, trees: 1 } } as unknown as WorldContext);
    (layer as unknown as { walkers: Map<string, unknown> }).walkers.set('x', { rig, proxy: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()) });
    layer.dispose();
    for (const l of rig.lod) {
      expect(freed.has(l.near)).toBe(true);
      expect(freed.has(l.far)).toBe(true);
    }
  });
});
