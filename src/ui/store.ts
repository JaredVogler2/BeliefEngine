import { useSyncExternalStore } from 'react';
import { GameSession, deserializeRun, serializeRun } from '../engine/index.ts';
import type { Action, ActionResult, CreateRunOptions, GameEvent, DaySummary, RunState } from '../engine/index.ts';
import { DEFAULT_SETTINGS, KEYS, loadSettings, readKey, removeKey, saveSettings, writeKey, type Settings } from './persist.ts';
import { sfx } from '../audio/audio.ts';
import { recordRun } from './progress.ts';

export type Screen = 'title' | 'scenarios' | 'howto' | 'settings' | 'credits' | 'briefing' | 'play' | 'debrief' | 'atlas';
export type Lens = 'none' | 'social';
export type Selection = { kind: 'villager' | 'landmark'; id: string } | null;
export type SideTab = 'selected' | 'laws' | 'village' | 'forecast' | 'log';

export interface Resolution {
  day: number;
  events: GameEvent[];
  summary: DaySummary;
  /** water depth before the night, for animation */
  at: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'good' | 'warn';
}

export interface UiState {
  screen: Screen;
  selection: Selection;
  activeClaim: string | null;
  lens: Lens;
  tab: SideTab;
  sheetOpen: boolean;
  digest: Resolution | null;
  confirmEnd: boolean;
  settings: Settings;
  toasts: Toast[];
  loadError: string | null;
  tutorialDone: boolean;
  debug: boolean;
  announce: string;
  showFlood: boolean;
  scenarioId: string;
  /** plain-language notes about how the current run was opened (e.g. an older link) */
  notes: string[];
}

type Listener = () => void;

export class GameStore {
  session: GameSession | null = null;
  ui: UiState;
  version = 0;
  private listeners = new Set<Listener>();
  private toastId = 1;
  lastSavedOk = true;
  /** previous planning-phase state, kept for render interpolation */
  prevState: RunState | null = null;

  constructor() {
    const settings = loadSettings();
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    this.ui = {
      screen: 'title', selection: null, activeClaim: null, lens: 'none', tab: 'selected', sheetOpen: false, digest: null, confirmEnd: false,
      settings, toasts: [], loadError: null, tutorialDone: !settings.tutorial, debug: params.get('debug') === '1', announce: '', showFlood: settings.showFlood,
      scenarioId: 'redbank', notes: [],
    };
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getVersion = (): number => this.version;

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  get state(): RunState | null {
    return this.session?.state ?? null;
  }

  set(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }

  toast(text: string, kind: Toast['kind'] = 'info'): void {
    const t: Toast = { id: this.toastId++, text, kind };
    this.ui = { ...this.ui, toasts: [...this.ui.toasts.slice(-3), t] };
    this.emit();
    if (typeof window !== 'undefined') window.setTimeout(() => this.dismissToast(t.id), kind === 'error' ? 6000 : 3800);
  }

  dismissToast(id: number): void {
    this.ui = { ...this.ui, toasts: this.ui.toasts.filter((t) => t.id !== id) };
    this.emit();
  }

  hasSave(): boolean {
    const raw = readKey(KEYS.save);
    if (!raw) return false;
    const r = deserializeRun(raw);
    return r.ok && !r.state.outcome;
  }

  savedInfo(): { scenarioId: string; day: number; maxDay: number; seed: number } | null {
    const raw = readKey(KEYS.save);
    if (!raw) return null;
    const r = deserializeRun(raw);
    if (!r.ok || r.state.outcome) return null;
    return { scenarioId: r.state.scenarioId, day: r.state.day, maxDay: r.state.maxDay, seed: r.state.seed };
  }

  newRun(opts: CreateRunOptions): void {
    this.session = GameSession.create(opts);
    this.prevState = null;
    this.ui = { ...this.ui, screen: 'briefing', selection: null, activeClaim: null, digest: null, confirmEnd: false, lens: 'none', tab: 'selected', sheetOpen: false, announce: '', loadError: null, scenarioId: opts.scenarioId, notes: [], tutorialDone: !this.ui.settings.tutorial };
    this.persist();
    this.emit();
  }

  continueRun(): boolean {
    const raw = readKey(KEYS.save);
    if (!raw) return false;
    const r = deserializeRun(raw);
    if (!r.ok) {
      removeKey(KEYS.save);
      this.set({ loadError: `${r.error} The save was cleared so you can start fresh.` });
      return false;
    }
    this.session = new GameSession(r.state);
    this.prevState = null;
    const first = r.state.scn.starters.find((c) => r.state.claims.find((x) => x.id === c)?.available) ?? null;
    this.ui = { ...this.ui, screen: r.state.outcome ? 'debrief' : 'play', selection: null, activeClaim: first, digest: null, confirmEnd: false, loadError: null, scenarioId: r.state.scenarioId, tutorialDone: true };
    this.emit();
    return true;
  }

  clearSave(): void {
    removeKey(KEYS.save);
    this.emit();
  }

  private persist(): void {
    const s = this.state;
    if (!s) return;
    if (s.outcome) {
      removeKey(KEYS.save);
      return;
    }
    this.lastSavedOk = writeKey(KEYS.save, serializeRun(s));
  }

  act(action: Action): ActionResult | null {
    if (!this.session) return null;
    const res = this.session.act(action);
    if (res.ok) {
      this.persist();
      if (action.type === 'SEED' || action.type === 'MESSENGER') sfx('seed');
      else if (action.type === 'RITUAL') sfx(action.ritual === 'ring_bells' ? 'bell' : 'ritual');
      else if (action.type === 'GATHER') sfx('gather');
      else if (action.type === 'COUNTER') sfx('counter');
      else sfx('click');
      this.ui = { ...this.ui, announce: res.summary || 'Action done.' };
    } else {
      sfx('deny');
      this.toast(res.error.message, 'error');
    }
    this.emit();
    return res;
  }

  undo(): void {
    if (this.session?.undo()) {
      sfx('click');
      this.persist();
      this.ui = { ...this.ui, announce: 'Last action undone.' };
      this.emit();
    }
  }

  endDay(): void {
    if (!this.session) return;
    const before = this.session.state;
    this.prevState = before;
    const day = before.day;
    const r = this.session.endDay();
    this.persist();
    const important = r.events.filter((e) => e.importance >= 2);
    sfx(important.some((e) => e.code === 'LAW_ACTIVATED') ? 'law' : important.some((e) => e.code === 'DEATH') ? 'loss' : 'night');
    const over = !!r.state.outcome;
    if (over) {
      try {
        recordRun(r.state, !!this.ui.debug);
      } catch {
        /* progress is best-effort */
      }
    }
    this.ui = {
      ...this.ui,
      digest: { day, events: r.events, summary: r.summary, at: this.version },
      confirmEnd: false,
      activeClaim: this.ui.activeClaim,
      announce: `Day ${day} resolved. ${r.summary.headline}`,
    };
    this.emit();
  }

  closeDigest(): void {
    const s = this.state;
    const over = !!s?.outcome;
    this.ui = { ...this.ui, digest: null, screen: over ? 'debrief' : 'play' };
    if (over) sfx(s!.outcome!.result === 'victory' ? 'win' : 'lose');
    this.emit();
  }

  select(sel: Selection): void {
    this.ui = { ...this.ui, selection: sel, tab: sel ? 'selected' : this.ui.tab, sheetOpen: sel ? true : this.ui.sheetOpen };
    if (sel) sfx('tick');
    this.emit();
  }

  setSettings(patch: Partial<Settings>): void {
    const next = { ...this.ui.settings, ...patch };
    saveSettings(next);
    this.ui = { ...this.ui, settings: next, showFlood: next.showFlood };
    this.emit();
  }

  resetSettings(): void {
    saveSettings(DEFAULT_SETTINGS);
    this.ui = { ...this.ui, settings: { ...DEFAULT_SETTINGS }, showFlood: DEFAULT_SETTINGS.showFlood };
    this.emit();
  }
}

export const store = new GameStore();

export function useStore<T>(selector: (s: GameStore) => T): T {
  // The version counter is the snapshot; derived values are computed on read.
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return selector(store);
}
