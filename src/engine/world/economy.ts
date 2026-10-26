import { emit, type Ctx } from '../core/events.ts';
import { findLandmark } from '../core/lookup.ts';
import { clamp } from '../core/rng.ts';
import type { RunState, Villager } from '../core/types.ts';
import { idx } from './grid.ts';

export function aliveCount(s: RunState): number {
  return s.villagers.filter((v) => v.status !== 'dead').length;
}

export function homesStanding(s: RunState): number {
  return s.world.landmarks.filter((l) => l.kind === 'home' && l.hp > 0).length;
}

export function dailyConsumption(s: RunState): number {
  return Math.ceil(aliveCount(s) / 4);
}

/** Workers at a field today: living, working, rested people whose workplace is the field. */
export function workersAt(s: RunState, fieldId: string): Villager[] {
  return s.villagers.filter((v) => v.status !== 'dead' && v.workId === fieldId && v.duty === 'work' && v.energy >= 25);
}

/** Expected food production tomorrow (for forecasts). */
export function projectedProduction(s: RunState): number {
  let total = 0;
  for (const l of s.world.landmarks) {
    if (l.kind !== 'field' || l.data.ruined) continue;
    if (workersAt(s, l.id).length > 0) total += l.data.yield ?? 1;
  }
  return total;
}

/** Daytime: standing, worked fields yield food into the store (simple scenarios; crop scenarios override). */
export function runHarvest(ctx: Ctx): number {
  const s = ctx.s;
  if (s.scn.features.crops) return 0;
  let produced = 0;
  for (const l of s.world.landmarks) {
    if (l.kind !== 'field' || l.data.ruined) continue;
    if (workersAt(s, l.id).length > 0) produced += l.data.yield ?? 1;
  }
  s.world.stocks.food = (s.world.stocks.food ?? 0) + produced;
  s.flags.harvestedToday = produced;
  return produced;
}

/** Dawn bookkeeping: eating, fear, recovery. */
export function runDawnNeeds(ctx: Ctx): void {
  const s = ctx.s;
  const stocks = s.world.stocks;
  const eat = dailyConsumption(s);
  const produced = s.flags.harvestedToday ?? 0;
  const have = stocks.food ?? 0;
  stocks.food = Math.max(0, have - eat);
  if (have - eat < 0) {
    for (const v of s.villagers) if (v.status !== 'dead') v.hunger = clamp(v.hunger + 25, 0, 100);
    emit(ctx, { step: 'needs', code: 'FAMINE', importance: 3, text: 'The granary is empty. The village goes hungry.' });
  } else {
    for (const v of s.villagers) if (v.status !== 'dead') v.hunger = clamp(v.hunger - 15, 0, 100);
  }
  emit(ctx, {
    step: 'needs', code: 'FOOD', importance: 1, delta: { food: [have - produced, stocks.food] },
    text: `Food: +${produced} harvested, \u2212${eat} eaten \u2192 ${stocks.food} in store.`,
  });
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    v.energy = clamp(v.energy + 30, 0, 100);
    if (v.status === 'injured' && v.health >= 60) v.status = 'ok';
    v.health = clamp(v.health + 8, 0, 100);
    v.fear = clamp(Math.round(v.fear * 0.6 + dangerNext(s, v) * 22), 0, 100);
  }
}

/** How scary the next two nights look from this villager's home (0..3). */
function dangerNext(s: RunState, v: Villager): number {
  const home = findLandmark(s, v.homeId);
  if (!home || !s.scn.features.flood) return 0;
  let worst = 0;
  for (let k = 0; k < 2; k++) {
    const th = s.threat[Math.min(s.day, s.threat.length - 1) + k];
    if (!th) continue;
    const depth = Math.max(0, th.level - s.world.elev[idx(s.world, home.x, home.y)]);
    worst = Math.max(worst, depth);
  }
  let g = Math.min(3, worst);
  const lostKin = s.villagers.some((o) => o.household === v.household && o.status === 'dead') ? 1 : 0;
  return g + lostKin;
}
