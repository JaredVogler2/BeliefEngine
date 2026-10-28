import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameSession, createRun } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import type { RunState } from '../../src/engine/index.ts';
import type { WorldContext } from '../../src/render3d/context.ts';
import { LandmarksLayer } from '../../src/render3d/landmarks.ts';
import { PeopleLayer } from '../../src/render3d/people.ts';
import { rng, seedFrom } from '../../src/render3d/rand.ts';
import { getSceneChanges, getSceneSnapshot, type SceneSnapshot } from '../../src/render3d/snapshot.ts';
import { aftermathCaptions } from '../../src/ui/play/Aftermath.tsx';

/**
 * What the 3D world shows a player to guide them, found wanting in a playthrough and added afterwards: the places where the chosen
 * story's proof can be staged (a cold beacon is a small grey cairn from the overview), the call-out over the one person the coach names,
 * and an ending that does not repeat itself under the aftermath picture.
 */

/** a context for the landmarks layer without a GPU or a page: plain materials, flat ground */
function landmarkCtx(snap: SceneSnapshot): WorldContext {
  return {
    materials: { get: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => undefined },
    profile: { detail: 1, particles: 1, trees: 1 },
    rng: (key: string) => rng(seedFrom('guides', key)),
    heightAt: () => 0,
    reducedMotion: true,
    bridgeLift: 0,
    water: { surfaceAt: () => -1 },
    terrain: { w: snap.w, tileBase: new Float32Array(snap.w * snap.h) },
  } as unknown as WorldContext;
}

describe('the places where a story can be proved are marked when it is chosen', () => {
  it('the snapshot names them: the beacons for the fire, the bridge for the watch, the bell tower for the bells', () => {
    const snap = getSceneSnapshot(createRun({ scenarioId: 'redbank', seed: 1 }));
    expect(snap.claimSites.river_fears_fire.sort()).toEqual(['b_c', 'b_e', 'b_n', 'b_s']);
    expect(snap.claimSites.bridge_stands_watched).toEqual(['br']);
    expect(snap.claimSites.rain_heeds_bells).toEqual(['bell']);
  });

  it('only the chosen story marks its places; a beacon already burning well, or the coach pointing at someone, takes marks away', () => {
    const s: RunState = createRun({ scenarioId: 'redbank', seed: 1 });
    const snap = getSceneSnapshot(s);
    const ctx = landmarkCtx(snap);
    const layer = new LandmarksLayer(ctx);
    layer.update(snap, getSceneChanges(null, snap), ctx);
    expect(layer.siteCount(), 'no story chosen').toBe(0);
    layer.setOptions({ selection: null, activeClaim: 'river_fears_fire', hints: [] });
    expect(layer.siteCount()).toBe(4);
    // each mark floats above its place, higher than the place itself
    for (const m of layer.siteSpots()) {
      const l = snap.landmarks.find((x) => x.id === m.id)!;
      expect(Math.hypot(m.at.x - (l.x + 0.5), m.at.z - (l.y + 0.5))).toBeLessThan(0.6);
      expect(m.at.y).toBeGreaterThan(0.5);
    }
    // a beacon lit tonight with three nights of fuel cannot be lit again: it loses its mark
    const b = s.world.landmarks.find((l) => l.id === 'b_n')!;
    b.lit = true;
    b.fuelNights = 3;
    const lit = getSceneSnapshot(s);
    layer.update(lit, getSceneChanges(snap, lit), ctx);
    expect(layer.siteSpots().map((m) => m.id).sort()).toEqual(['b_c', 'b_e', 'b_s']);
    // while the coach points at a person the places wait, so there is one thing to find at a time
    layer.setOptions({ selection: null, activeClaim: 'river_fears_fire', hints: ['mara'] });
    expect(layer.siteCount()).toBe(0);
    layer.setOptions({ selection: null, activeClaim: 'bridge_stands_watched', hints: [] });
    expect(layer.siteSpots().map((m) => m.id)).toEqual(['br']);
    layer.setOptions({ selection: null, activeClaim: null, hints: [] });
    expect(layer.siteCount()).toBe(0);
    layer.dispose();
  });
});

describe('the coach names one person and the world points at that one', () => {
  it('the named person gets the large gold call-out; the other hinted person keeps only the ring at their feet', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 1 });
    const snap = getSceneSnapshot(s);
    const ctx = {
      heightAt: () => 0,
      reducedMotion: true,
      bridgeLift: 0,
      viewDistance: 30,
      weather: { wind: 1, rain: 0 },
      profile: { detail: 1, particles: 1, trees: 1 },
      visitSpot: () => null,
      terrain: { w: snap.w, tileBase: new Float32Array(snap.w * snap.h) },
    } as unknown as WorldContext;
    const layer = new PeopleLayer(ctx);
    layer.update(snap, getSceneChanges(null, snap), ctx);
    layer.setOptions({ selection: null, activeClaim: null, known: new Set(), hints: ['mara', 'tilly'] });
    layer.tick(1 / 60, 1, ctx);
    const inner = layer as unknown as { walkers: Map<string, unknown>; markSize: Float32Array; markCol: Float32Array };
    const ids = [...inner.walkers.keys()];
    const size = (id: string): number => inner.markSize[ids.indexOf(id)];
    expect(size('mara')).toBeGreaterThan(1);
    expect(size('tilly')).toBeLessThan(0.7);
    expect(ids.filter((id) => size(id) > 0.7)).toEqual(['mara']);
    // and once she is selected, the call-out gives way to the selection's own mark
    layer.setOptions({ selection: { kind: 'villager', id: 'mara' }, activeClaim: null, known: new Set(), hints: ['mara', 'tilly'] });
    layer.tick(1 / 60, 1.1, ctx);
    expect(size('mara')).toBeLessThan(0.7);
    layer.dispose();
  });
});

describe('the aftermath picture', () => {
  it('its captions are the last events that decided the run, not the ending the headline under it already states', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const p = policyById('evidence-first');
    for (let d = 1; d <= 7 && !g.state.outcome; d++) p.playDay(g);
    expect(g.state.outcome).not.toBeNull();
    expect(g.state.log.some((e) => e.code === 'VICTORY' || e.code === 'DEFEAT')).toBe(true);
    const caps = aftermathCaptions(g.state);
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.length).toBeLessThanOrEqual(3);
    for (const e of caps) {
      expect(e.code).not.toBe('VICTORY');
      expect(e.code).not.toBe('DEFEAT');
      expect(e.importance).toBeGreaterThanOrEqual(2);
    }
  });
});
