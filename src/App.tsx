import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { configureAudio } from './audio/audio.ts';
import { Briefing, Credits, Debrief, HowTo, Scenarios, SettingsScreen, Title } from './ui/screens.tsx';
import { Play } from './ui/play/Play.tsx';
import { hasScenario } from './engine/content/registry.ts';
import { store, useStore } from './ui/store.ts';

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }
  override render() {
    if (this.state.error) {
      return (
        <main className="error-box card" role="alert">
          <h1>Something broke</h1>
          <p>The game hit an unexpected problem. Your last save is safe.</p>
          <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <div className="row wrap">
            <button className="btn primary" onClick={() => { this.setState({ error: null }); store.set({ screen: 'title' }); }}>Back to title</button>
            <button className="btn" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function parseDeepLink(): void {
  const q = new URLSearchParams(window.location.search);
  const scenario = q.get('scenario');
  const seedRaw = q.get('seed');
  if (!scenario || seedRaw === null) return;
  const seed = Number.parseInt(seedRaw, 10);
  const d = q.get('d');
  const difficulty = d === 'story' || d === 'hard' ? d : 'normal';
  if (!hasScenario(scenario) || !Number.isFinite(seed) || seed < 0 || seed > 2147483647) {
    store.set({ loadError: 'That shared seed link is not valid for this version, so it was ignored.' });
    return;
  }
  store.newRun({ scenarioId: scenario, seed, difficulty });
}

export function App() {
  const ui = useStore((s) => s.ui);
  useEffect(() => {
    parseDeepLink();
    if (store.ui.debug) {
      (window as unknown as { __belief?: unknown }).__belief = {
        get state() { return store.state; },
        get session() { return store.session; },
        store,
      };
    }
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scale = ui.settings.textScale;
    root.dataset.contrast = ui.settings.highContrast ? 'high' : 'normal';
    root.dataset.motion = ui.settings.reducedMotion ? 'reduced' : 'full';
    configureAudio({ sfx: ui.settings.sfx, music: ui.settings.music, sfxVolume: ui.settings.sfxVolume, musicVolume: ui.settings.musicVolume });
  }, [ui.settings]);
  let screen: ReactNode;
  switch (ui.screen) {
    case 'title': screen = <Title />; break;
    case 'scenarios': screen = <Scenarios />; break;
    case 'briefing': screen = <Briefing />; break;
    case 'howto': screen = <HowTo />; break;
    case 'settings': screen = <SettingsScreen />; break;
    case 'credits': screen = <Credits />; break;
    case 'debrief': screen = <Debrief />; break;
    case 'play': screen = <Play />; break;
    default: screen = <Title />;
  }
  return <Boundary>{screen}</Boundary>;
}
