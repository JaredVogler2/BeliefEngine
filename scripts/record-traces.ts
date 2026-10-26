/* Records verified action traces for regression fixtures: npx tsx scripts/record-traces.ts */
import { writeFileSync } from 'node:fs';
import { runPolicy } from '../src/engine/ai/bots/run.ts';
import { fireWall, witnessBridge } from '../src/engine/ai/bots/strategies.ts';
import { noop } from '../src/engine/ai/bots/basic.ts';
import { replayRun } from '../src/engine/core/replay.ts';

const scenarioId = 'redbank';
const out: Record<string, unknown> = {};
let found = 0;
for (let seed = 1; seed <= 60 && found < 1; seed++) {
  const a = runPolicy(fireWall, { scenarioId, seed });
  const b = runPolicy(witnessBridge, { scenarioId, seed });
  if (a.result === 'victory' && b.result === 'victory') {
    found++;
    out.canonicalSeed = seed;
    for (const [key, r] of [['fireWall', a], ['witnessBridge', b]] as const) {
      const rep = replayRun({ scenarioId, seed, actions: r.log });
      out[key] = { seed, result: r.result, alive: r.alive, homes: r.homes, food: r.food, score: r.score, lawsActivated: r.lawsActivated, stateHash: rep.stateHash, eventHash: rep.eventHash, actions: r.log };
    }
  }
}
const loss = runPolicy(noop, { scenarioId, seed: out.canonicalSeed as number });
const rep = replayRun({ scenarioId, seed: out.canonicalSeed as number, actions: loss.log });
out.noop = { seed: out.canonicalSeed, result: loss.result, alive: loss.alive, homes: loss.homes, food: loss.food, stateHash: rep.stateHash, eventHash: rep.eventHash, actions: loss.log };
writeFileSync('tests/fixtures/redbank-traces.json', JSON.stringify(out, null, 1));
console.log('canonical seed', out.canonicalSeed, 'fireWall', (out.fireWall as { result: string }).result, 'witness', (out.witnessBridge as { result: string }).result, 'noop', loss.result);
