import { lawPusher, lightBeaconsByCoverage } from './lawpusher.ts';
import { noop, randomLegal } from './basic.ts';
import type { Policy } from './types.ts';

/** Strategy A - The Fire Wall: build belief that the river fears fire in Eastbank, then light beacons by coverage. */
export const fireWall: Policy = lawPusher({
  name: 'fire-wall',
  claim: 'river_fears_fire',
  regions: ['east'],
  reserve: (s) => (s.day >= 5 ? Math.min(s.ap, 4) : 0),
  physical: (g) => {
    if (g.state.day >= 5) lightBeaconsByCoverage(g);
  },
});

/** Strategy B - The Witness Bridge: build belief across both banks that a watched bridge cannot break. */
export const witnessBridge: Policy = lawPusher({
  name: 'witness-bridge',
  claim: 'bridge_stands_watched',
  regions: ['river'],
});

export const REDBANK_POLICIES: Policy[] = [noop, randomLegal, fireWall, witnessBridge];
