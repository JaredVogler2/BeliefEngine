import type { RunState } from '../engine/index.ts';
import { getVillagerView, influenceRanks } from '../engine/index.ts';
import type { UiState } from './store.ts';

export interface TutorialStep {
  step: number;
  total: number;
  title: string;
  text: string;
  hintVillagers: string[];
  hintClaims: boolean;
}

const TOTAL = 5;

/** The coach is derived from game state, so it can never get out of sync with what the player actually did. */
export function getTutorial(s: RunState, ui: UiState): TutorialStep | null {
  if (ui.tutorialDone || s.outcome) return null;
  if (s.day > 3) return null;
  const ranks = influenceRanks(s);
  const guide = s.villagers.filter((v) => v.status !== 'dead' && v.keeperTrust >= 40).sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99))[0] ?? s.villagers[0];
  const second = s.villagers.filter((v) => v.status !== 'dead' && v.id !== guide.id && v.keeperTrust >= 35).sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99))[0];
  const gName = guide.name.split(' ')[0];
  void getVillagerView;
  if (s.starter === null)
    return { step: 1, total: TOTAL, title: 'Choose a story', text: 'You are the Keeper of Stories. You cannot move the river — but a story the village believes can. Tap a story card below to begin.', hintVillagers: [], hintClaims: true };
  if (s.stats.seeds === 0 && !(ui.selection?.kind === 'villager'))
    return { step: 2, total: TOTAL, title: 'Find who people listen to', text: `Tap ${guide.name}, the ${guide.role.toLowerCase()}. People listen to ${gName}, and ${gName} trusts you.`, hintVillagers: [guide.id, ...(second ? [second.id] : [])], hintClaims: false };
  if (s.stats.seeds === 0)
    return { step: 3, total: TOTAL, title: 'Tell them', text: `Press “Tell ${gName}” on the card. Watch the conviction marker jump. That costs 1 Influence — you have ${s.apPerDay} a day.`, hintVillagers: [guide.id], hintClaims: false };
  if (s.day === 1)
    return { step: 4, total: TOTAL, title: 'Let it travel', text: 'Spend what you like, then press End Day. Overnight the story passes along ties of trust — only between people who can reach each other.', hintVillagers: s.villagers.filter((v) => v.status !== 'dead' && v.id !== guide.id).sort((a, b) => b.keeperTrust - a.keeperTrust).slice(0, 3).map((v) => v.id), hintClaims: false };
  if (s.day <= 3 && s.stats.rituals === 0)
    return { step: 5, total: TOTAL, title: 'Proof beats repetition', text: 'Open the Laws tab to watch support climb. Past the line, the story becomes law. Skeptics need to see proof: try a ritual at a landmark on a good-omen night.', hintVillagers: [], hintClaims: false };
  return null;
}
