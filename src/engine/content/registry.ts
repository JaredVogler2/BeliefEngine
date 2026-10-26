import type { ScenarioDef } from './types.ts';
import { redbank } from './scenarios/redbank.ts';

const AUTHORED: Record<string, ScenarioDef> = {
  redbank,
};

/** Resolver hooks for generated scenarios (registered by the generator module). */
const resolvers: ((id: string) => ScenarioDef | null)[] = [];

export function registerScenarioResolver(fn: (id: string) => ScenarioDef | null): void {
  if (!resolvers.includes(fn)) resolvers.push(fn);
}

export function registerScenario(def: ScenarioDef): void {
  AUTHORED[def.runtime.id] = def;
}

export function getScenarioDef(id: string): ScenarioDef {
  const a = AUTHORED[id];
  if (a) return a;
  for (const r of resolvers) {
    const g = r(id);
    if (g) return g;
  }
  throw new Error(`Unknown scenario: ${id}`);
}

export function hasScenario(id: string): boolean {
  try {
    getScenarioDef(id);
    return true;
  } catch {
    return false;
  }
}

export interface ScenarioListing {
  id: string;
  name: string;
  tagline: string;
  days: number;
  difficulty: number;
  threat: string;
  version: number;
}

export function listScenarios(): ScenarioListing[] {
  return Object.values(AUTHORED)
    .map((d) => ({ id: d.runtime.id, name: d.runtime.name, tagline: d.runtime.tagline, days: d.runtime.durationDays, difficulty: d.runtime.difficulty, threat: d.runtime.threatKind, version: d.runtime.version }))
    .sort((a, b) => a.difficulty - b.difficulty || (a.id < b.id ? -1 : 1));
}
