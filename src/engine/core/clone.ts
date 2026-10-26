import type { RunState } from './types.ts';

/**
 * Deep clone a RunState. The static scenario definition `scn` is shared by reference (it is never mutated),
 * everything else is copied so internal mutation of the clone cannot leak into the original.
 */
export function cloneState(s: RunState): RunState {
  const { scn, ...rest } = s;
  const copy = structuredClone(rest) as Omit<RunState, 'scn'>;
  return { ...copy, scn };
}
