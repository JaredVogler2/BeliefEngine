import type { Outcome, RunState } from './types.ts';
import { aliveCount, homesStanding } from '../world/economy.ts';
import { medalFor, type Evaluation } from './objectives.ts';

const DIFF_MULT = { story: 0.8, normal: 1, hard: 1.25 } as const;

/**
 * Readable, stable score. Survival dominates. Nothing here rewards doing nothing: every category is a
 * measurement of the end state or a distinct strategic act, and there is no bonus for unspent Influence.
 */
export function computeBreakdown(s: RunState, heroic: boolean): Record<string, number> {
  const total = s.villagers.length;
  const alive = aliveCount(s);
  const trust = alive ? s.villagers.filter((v) => v.status !== 'dead').reduce((a, v) => a + v.keeperTrust, 0) / alive : 0;
  const homesTotal = s.world.landmarks.filter((l) => l.kind === 'home').length;
  const style = Math.min(2, s.stats.lawsActivated.length) * 60 + (s.stats.fieldsBurned === 0 && !s.stats.noBeacons ? 40 : 0) + (s.stats.noBeacons && s.stats.lawsActivated.length > 0 ? 40 : 0);
  return {
    survivors: Math.round((600 * alive) / total),
    homes: Math.round((150 * homesStanding(s)) / Math.max(1, homesTotal)),
    food: Math.min(12, s.world.stocks.food ?? 0) * 8,
    trust: Math.round(trust * 1.2),
    laws: style,
    heroic: heroic ? 120 : 0,
  };
}

export function buildOutcome(s: RunState, ev: Evaluation): Outcome {
  const breakdown = computeBreakdown(s, ev.heroic);
  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.round(raw * DIFF_MULT[s.difficulty]);
  const result = ev.result ?? 'defeat';
  return {
    result,
    day: s.day,
    reason: ev.reason,
    heroic: ev.heroic,
    score,
    breakdown,
    medal: medalFor(result, ev.heroic, score),
    failedObjectives: ev.failed,
  };
}
