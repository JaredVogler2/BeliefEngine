import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import type { WorldContext } from '../../src/render3d/context.ts';
import { PeopleLayer } from '../../src/render3d/people.ts';
import { getSceneChanges, getSceneSnapshot } from '../../src/render3d/snapshot.ts';

/**
 * Feet that stay where they are put. The real people layer walks Redbank's villagers from home to work on the second morning (the walk
 * it starts when a new day arrives), on flat ground, and the soles of both feet are followed frame by frame. While a person walks a
 * straight stretch, one foot is on the ground: it should hardly move while the body passes over it. A foot that slides along with the
 * body is the "skating" the phase file forbids; it is measured here as the planted foot's travel against the body's.
 */
type Walker = { pos: THREE.Vector3; path: THREE.Vector3[]; wait: number; heading: number; rig: { root: THREE.Object3D; kneeL: THREE.Object3D; kneeR: THREE.Object3D } };

function morningWalk(): { layer: PeopleLayer; ctx: WorldContext; walkers: Map<string, Walker> } {
  const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
  const s1 = getSceneSnapshot(g.state);
  policyById('evidence-first').playDay(g);
  const s2 = getSceneSnapshot(g.state);
  const ctx = {
    heightAt: () => 0,
    reducedMotion: false,
    bridgeLift: 0,
    viewDistance: 6,
    weather: { wind: 1, rain: 0 },
    profile: { detail: 1, particles: 1, trees: 1 },
    visitSpot: () => null,
    // flat ground: the bridge's ends and water level read from it
    terrain: { w: s1.w, tileBase: new Float32Array(s1.w * s1.h) },
  } as unknown as WorldContext;
  const layer = new PeopleLayer(ctx);
  layer.update(s1, getSceneChanges(null, s1), ctx);
  layer.update(s2, getSceneChanges(s1, s2), ctx);
  return { layer, ctx, walkers: (layer as unknown as { walkers: Map<string, Walker> }).walkers };
}

describe('the people walk without skating, with their feet on the ground', () => {
  it('a new morning sends people from home to work along the walkable tiles', () => {
    const { walkers } = morningWalk();
    const walking = [...walkers.values()].filter((w) => w.path.length);
    expect(walking.length, 'most of the village walks to work').toBeGreaterThan(5);
  });

  it('on a straight stretch the planted foot moves less than a fifth as far as the body', () => {
    const { layer, ctx, walkers } = morningWalk();
    const dt = 1 / 60;
    let t = 0;
    // let everyone set off (each waits up to five seconds at their door)
    for (let i = 0; i < 360; i++) layer.tick(dt, (t += dt), ctx);
    const sole = new THREE.Vector3();
    const feet = (w: Walker): [THREE.Vector3, THREE.Vector3] => {
      w.rig.root.updateMatrixWorld(true);
      // the sole, in the lower leg's own frame (the knee is 0.08 below the hip, the sole 0.155)
      return [w.rig.kneeL.localToWorld(sole.set(0, -0.075, 0.01)).clone(), w.rig.kneeR.localToWorld(sole.set(0, -0.075, 0.01)).clone()];
    };
    let body = 0;
    let planted = 0;
    let frames = 0;
    let sunk = 0;
    let cleared = 0;
    let floating = 0;
    let last = new Map<string, { at: THREE.Vector3; feet: [THREE.Vector3, THREE.Vector3]; heading: number }>();
    for (let i = 0; i < 300; i++) {
      layer.tick(dt, (t += dt), ctx);
      const now = new Map<string, { at: THREE.Vector3; feet: [THREE.Vector3, THREE.Vector3]; heading: number }>();
      for (const [id, w] of walkers) {
        if (!w.path.length || w.wait > 0) continue;
        const at = w.rig.root.position.clone();
        const f = feet(w);
        now.set(id, { at, feet: f, heading: w.heading });
        const p = last.get(id);
        // a straight stretch only: turning at a corner swings both feet round
        if (!p || Math.abs(p.heading - w.heading) > 0.004) continue;
        const flat = (a: THREE.Vector3, b: THREE.Vector3): number => Math.hypot(a.x - b.x, a.z - b.z);
        body += flat(at, p.at);
        planted += Math.min(flat(f[0], p.feet[0]), flat(f[1], p.feet[1]));
        frames++;
        // the ground is flat at height 0: no sole goes into it, and the swinging foot is lifted clear of it
        sunk = Math.min(sunk, f[0].y - at.y, f[1].y - at.y);
        cleared = Math.max(cleared, Math.max(f[0].y, f[1].y) - at.y);
        // and one foot is always down: the lower sole never floats above the ground
        floating = Math.max(floating, Math.min(f[0].y, f[1].y) - at.y);
      }
      last = now;
    }
    expect(frames, 'frames of straight walking measured').toBeGreaterThan(200);
    expect(planted / body).toBeLessThan(0.2);
    expect(sunk, 'no foot goes through the ground (a centimetre of boot sole in the grass at most)').toBeGreaterThan(-0.012);
    expect(cleared, 'the swinging foot clears the ground').toBeGreaterThan(0.02);
    expect(floating, 'the planted foot stays down').toBeLessThan(0.012);
  });
});
