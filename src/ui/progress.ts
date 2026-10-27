import type { RunState } from '../engine/index.ts';
import { KEYS, readKey, writeKey } from './persist.ts';

/** Minimal local run archive (expanded in the progression phase). Never leaves the device. */
export interface RunRecord {
  scenarioId: string;
  seed: number;
  difficulty: string;
  result: 'victory' | 'defeat';
  score: number;
  day: number;
  alive: number;
  lawsActivated: string[];
  debug: boolean;
  mode?: 'story' | 'expedition' | 'daily' | 'sandbox';
  /** Daily Village: the UTC date (YYYYMMDD) the run was made for */
  dailyDate?: number;
  name?: string;
  modifiers?: string[];
}

export interface Progress {
  version: 1;
  runs: RunRecord[];
}

export function loadProgress(): Progress {
  const raw = readKey(KEYS.progress);
  if (!raw) return { version: 1, runs: [] };
  try {
    const p = JSON.parse(raw) as Progress;
    if (p && p.version === 1 && Array.isArray(p.runs)) return p;
  } catch {
    /* corrupt: start over */
  }
  return { version: 1, runs: [] };
}

export function recordRun(s: RunState, debug: boolean): void {
  if (!s.outcome) return;
  const p = loadProgress();
  p.runs.push({
    scenarioId: s.scenarioId, seed: s.seed, difficulty: s.difficulty, result: s.outcome.result, score: s.outcome.score, day: s.outcome.day,
    alive: s.villagers.filter((v) => v.status !== 'dead').length, lawsActivated: s.stats.lawsActivated.slice(), debug,
    mode: s.mode, dailyDate: s.flags.dailyDate, name: s.scn.name, modifiers: s.modifiers.slice(),
  });
  p.runs = p.runs.slice(-200);
  writeKey(KEYS.progress, JSON.stringify(p));
}

/** Best finished (non-debug) run for a daily date, or null. */
export function dailyBest(date: number): RunRecord | null {
  const runs = loadProgress().runs.filter((r) => r.mode === 'daily' && r.dailyDate === date && !r.debug);
  if (!runs.length) return null;
  return runs.reduce((b, r) => (r.result === b.result ? (r.score > b.score ? r : b) : r.result === 'victory' ? r : b));
}

/** Seeds of expeditions already finished on this device. */
export function playedExpeditionSeeds(): number[] {
  return loadProgress().runs.filter((r) => r.mode === 'expedition' && !r.debug).map((r) => r.seed);
}
