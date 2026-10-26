import { applyAction, getAvailableActions } from '../../core/actions.ts';
import { claimDef, findLandmark } from '../../core/lookup.ts';
import type { GameSession } from '../../core/session.ts';
import type { Action, RunState } from '../../core/types.ts';
import { computePressure } from '../../laws/resolver.ts';
import type { Policy } from './types.ts';

export interface LawPusherConfig {
  name: string;
  claim: string;
  regions: string[];
  /** day (inclusive) from which beacons are lit for flood protection; undefined = never */
  lightFrom?: number;
  /** Influence kept in reserve each day for physical actions */
  reserve?: (s: RunState) => number;
  /** whether rituals may be used to stage evidence */
  stage?: boolean;
  /** run scenario-specific physical actions after social spending */
  physical?: (g: GameSession) => void;
  /** extra claims to push once the main law is active */
  then?: string[];
}

/** Support objective for a claim across regions: pressure dominates, conviction mass breaks ties. */
export function support(s: RunState, claim: string, regions: string[]): number {
  let total = 0;
  for (const r of regions) {
    const info = computePressure(s, claim, r);
    const law = s.laws.find((l) => l.claimId === claim && l.regionId === r);
    total += info.pressure * 100 + (law ? law.progress * 0.4 : 0);
    const d = new Set(claimDef(s, claim).electorate?.[r] ?? [r]);
    let mass = 0;
    let n = 0;
    for (const v of s.villagers) {
      if (v.status === 'dead' || !d.has(v.district)) continue;
      n++;
      mass += Math.max(0, v.beliefs[claim]?.conv ?? 0);
    }
    total += n ? (mass / n) * 0.05 : 0;
  }
  return total;
}

/** Greedy influence-per-Influence maximiser using exact action previews (same public API as a human). */
export function lawPusher(cfg: LawPusherConfig): Policy {
  return {
    name: cfg.name,
    playDay(g: GameSession) {
      const s0 = g.state;
      if (s0.starter === null) {
        const pick = s0.scn.starters.includes(cfg.claim) ? cfg.claim : s0.scn.starters[0];
        g.act({ type: 'PICK_STARTER', claim: pick });
      }
      const claims = [cfg.claim, ...(cfg.then ?? [])];
      // answer announced rival campaigns first
      for (const r of g.state.rivals) {
        const tgt = r.plan?.target;
        if (!tgt || g.state.ap < 1) continue;
        const mine = g.state.claims.find((c) => c.id === cfg.claim && c.available);
        if (mine) g.act({ type: 'COUNTER', claim: cfg.claim, against: r.claim, target: tgt });
      }
      let guard = 0;
      while (g.state.ap > (cfg.reserve ? cfg.reserve(g.state) : 0) && guard++ < 14) {
        const s = g.state;
        const active = claims.filter((c) => s.claims.find((x) => x.id === c)?.available);
        const mainDone = s.laws.some((l) => l.claimId === cfg.claim && l.status === 'active');
        const targets = mainDone ? active.filter((c) => c !== cfg.claim) : [cfg.claim];
        if (!targets.length) break;
        let best: { a: Action; score: number } | null = null;
        const reserve = cfg.reserve ? cfg.reserve(s) : 0;
        for (const o of getAvailableActions(s)) {
          const a = o.action;
          if (o.cost <= 0 || o.cost > s.ap - reserve) continue;
          if (a.type === 'SCOUT' || a.type === 'PICK_STARTER' || a.type === 'TRADE' || a.type === 'COMPOSE') continue;
          if (a.type === 'RITUAL' && !a.claim) continue;
          if (a.type === 'RITUAL' && cfg.stage === false) continue;
          const claim = ('claim' in a && a.claim) || cfg.claim;
          if (!targets.includes(claim)) continue;
          const r = applyAction(s, a);
          if (!r.ok) continue;
          const delta = support(r.state, claim, cfg.regions) - support(s, claim, cfg.regions);
          const score = delta / o.cost;
          if (delta > 0.04 && (!best || score > best.score)) best = { a, score };
        }
        if (!best) break;
        if (!g.act(best.a).ok) break;
      }
      cfg.physical?.(g);
      g.endDay();
    },
  };
}

/** Light the beacons that cover the most standing east-bank homes, as fuel and Influence allow. */
export function lightBeaconsByCoverage(g: GameSession, region = 'east', maxLit = 4): void {
  const s = g.state;
  const beacons = s.world.landmarks.filter((l) => l.kind === 'beacon' && l.district === region && !(l.lit && l.fuelNights >= 3));
  const homes = s.world.landmarks.filter((l) => l.kind === 'home' && l.hp > 0 && l.district === region);
  const lit = s.world.landmarks.filter((l) => l.kind === 'beacon' && l.lit && l.fuelNights > 0).length;
  const scored = beacons
    .map((b) => ({ b, c: homes.filter((h) => Math.sqrt((h.x - b.x) ** 2 + (h.y - b.y) ** 2) <= 3.5).length }))
    .sort((x, y) => y.c - x.c || (x.b.id < y.b.id ? -1 : 1));
  let n = lit;
  for (const { b } of scored) {
    if (n >= maxLit) break;
    if (g.state.ap < 1 || (g.state.world.stocks.fuel ?? 0) < 2) break;
    const r = g.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: b.id });
    if (r.ok) n++;
  }
  void findLandmark;
}
