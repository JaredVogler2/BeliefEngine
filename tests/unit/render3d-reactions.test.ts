import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import type { GameEvent, RunState } from '../../src/engine/index.ts';
import type { WorldContext } from '../../src/render3d/context.ts';
import { EffectsLayer } from '../../src/render3d/effects.ts';
import { planResolution, type EffectPlan } from '../../src/render3d/plan.ts';
import { getSceneChanges, getSceneSnapshot, type SceneSnapshot } from '../../src/render3d/snapshot.ts';

/**
 * The people react to what an event did to them (a new believer nods, a refuser shakes their head, a rival argues, people in reach of a
 * waking law cheer, people near a fire or a breaking bridge raise the alarm). These run real fixed-seed games with the tournament's bots
 * and feed the dawn's planned effects to the real effects layer, with the people stubbed out to record what they were asked to do.
 * Every gesture must come from an effect that names an event the engine logged that night.
 */
interface Night {
  snap: SceneSnapshot;
  events: GameEvent[];
  plans: EffectPlan[];
}

function nights(policy: string, seed: number, days: number): Night[] {
  const g = GameSession.create({ scenarioId: 'redbank', seed });
  const p = policyById(policy);
  const out: Night[] = [];
  for (let d = 1; d <= days && !g.state.outcome; d++) {
    const before: RunState = structuredClone(g.state);
    const from = g.state.log.length;
    p.playDay(g);
    const events = g.state.log.slice(from);
    const snap = getSceneSnapshot(g.state);
    out.push({ snap, events, plans: planResolution(events, snap, getSceneSnapshot(before), { reduced: false }) });
  }
  return out;
}

/** the effects layer with the people replaced by a recorder; returns what each plan made them do */
function react(n: Night): { plan: EffectPlan; gestures: { id: string; kind: string }[] }[] {
  let current: { id: string; kind: string }[] = [];
  const ctx = {
    profile: { particles: 1 },
    reducedMotion: false,
    heightAt: () => 0,
    actors: { gesture: (id: string, kind: string) => current.push({ id, kind }), faceToward: () => undefined, head: () => null },
    locate: (kind: string, id: string) => {
      const v = kind === 'villager' ? n.snap.villagers.find((q) => q.id === id) : undefined;
      return v ? new THREE.Vector3(v.x + 0.5, 0, v.y + 0.5) : null;
    },
  } as unknown as WorldContext;
  const layer = new EffectsLayer(ctx);
  layer.update(n.snap, getSceneChanges(null, n.snap));
  const out: { plan: EffectPlan; gestures: { id: string; kind: string }[] }[] = [];
  for (const plan of n.plans) {
    current = [];
    (layer as unknown as { start(p: EffectPlan): void }).start(plan);
    out.push({ plan, gestures: current });
  }
  layer.dispose();
  return out;
}

/** the last gesture each person was asked for by one effect (a later one replaces an earlier one, as on screen) */
const last = (gs: { id: string; kind: string }[]): Map<string, string> => new Map(gs.map((g) => [g.id, g.kind]));

describe('the people react to what an event did to them', () => {
  const runs = [...nights('evidence-first', 1, 7), ...nights('threat-aware', 2, 7), ...nights('greedy', 3, 7)];
  const all = runs.flatMap((n) => react(n).map((r) => ({ ...r, ids: new Set(n.events.map((e) => e.id)) })));

  it('every gesture comes from an effect that names an event the engine logged that night', () => {
    const gestures = all.filter((r) => r.gestures.length);
    expect(gestures.length).toBeGreaterThan(0);
    for (const r of gestures) expect(r.ids.has(r.plan.eventId), `${r.plan.code} ${r.plan.eventId}`).toBe(true);
  });

  it('a new believer nods; a listener who refuses the story shakes their head; a rival argues', () => {
    const gained = all.filter((r) => r.plan.kind === 'rune' && r.plan.code === 'BELIEVER_GAINED');
    expect(gained.length, 'the runs win believers').toBeGreaterThan(0);
    for (const r of gained) expect(last(r.gestures).get(r.plan.to!)).toBe('nod');
    for (const r of all.filter((x) => x.plan.kind === 'arc' && x.plan.vocab === 'resist')) expect(last(r.gestures).get(r.plan.to!)).toBe('doubt');
    const rival = all.filter((r) => r.plan.kind === 'arc' && r.plan.vocab === 'rival');
    expect(rival.length, 'the rival campaigns in these runs').toBeGreaterThan(0);
    for (const r of rival) expect(last(r.gestures).get(r.plan.from!)).toBe('point');
    // and a listener pressed by a counter-story stops to think
    const pressed = all.filter((r) => r.plan.kind === 'ring' && r.plan.vocab === 'rival' && r.plan.to);
    expect(pressed.length).toBeGreaterThan(0);
    for (const r of pressed) expect(last(r.gestures).get(r.plan.to!)).toBe('think');
  });

  it('people in reach of a law that wakes cheer, and nobody out of its reach does', () => {
    const woke = all.filter((r) => r.plan.kind === 'glyph' && r.plan.code === 'LAW_ACTIVATED');
    expect(woke.length, 'some run wakes a law').toBeGreaterThan(0);
    for (const r of woke) {
      expect(r.gestures.every((g) => g.kind === 'cheer')).toBe(true);
      const n = runs.find((x) => x.events.some((e) => e.id === r.plan.eventId))!;
      for (const g of r.gestures) {
        const v = n.snap.villagers.find((q) => q.id === g.id)!;
        expect(v.status).not.toBe('dead');
        expect(Math.hypot(v.x + 0.5 - r.plan.at!.x, v.y + 0.5 - r.plan.at!.z)).toBeLessThanOrEqual((r.plan.radius ?? 2) + 0.5 + 1e-9);
      }
    }
  });

  it('effects that touch nobody make nobody move: the ground glows and rings ask for no pose', () => {
    for (const r of all.filter((x) => x.plan.kind === 'ripple' || x.plan.kind === 'focus' || (x.plan.kind === 'ring' && x.plan.vocab !== 'rival'))) expect(r.gestures).toEqual([]);
  });
});
