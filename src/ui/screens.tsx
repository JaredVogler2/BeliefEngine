import { useEffect, useRef, useState } from 'react';
import { buildDebrief, createRun, getScenarioDef, listScenarios } from '../engine/index.ts';
import type { Difficulty } from '../engine/index.ts';
import { MapRenderer } from '../render/MapRenderer.ts';
import { unlockAudio, sfx } from '../audio/audio.ts';
import { Icon } from './components.tsx';
import { loadProgress } from './progress.ts';
import { store, useStore } from './store.ts';

// ------------------------------------------------------------------ title

function TitleBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useStore((s) => s.ui.settings.reducedMotion);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let r: MapRenderer;
    try {
      r = new MapRenderer(canvas);
    } catch {
      return;
    }
    const s = createRun({ scenarioId: 'redbank', seed: 7 });
    for (const l of s.world.landmarks) if (l.kind === 'beacon' && l.district === 'east') {
      l.lit = true;
      l.fuelNights = 3;
    }
    r.setState(s);
    r.setOptions({ reducedMotion: reduced, showFlood: false, lens: 'none', quality: 'low', hints: [] });
    r.setLabels(false);
    const size = () => {
      const p = canvas.parentElement!.getBoundingClientRect();
      r.resize(p.width, p.height, 1);
      r.cam.zoom = Math.max(r.cam.zoom, (p.width / (28 * 32)) * 1.04, (p.height / (18 * 32)) * 1.04, 0.9);
    };
    size();
    r.start();
    const ro = new ResizeObserver(size);
    ro.observe(canvas.parentElement!);
    let raf = 0;
    let t = 0;
    const drift = () => {
      raf = requestAnimationFrame(drift);
      t += 0.003;
      if (!reduced) {
        r.cam.cx = 14 * 32 + Math.sin(t) * 260;
        r.cam.cy = 9 * 32 + Math.cos(t * 0.7) * 60;
        r.setOptions({});
      }
    };
    drift();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      r.destroy();
    };
  }, [reduced]);
  return (
    <div className="title-bg" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}

export function Title() {
  const ui = useStore((s) => s.ui);
  const info = store.savedInfo();
  const seen = loadProgress().runs.length;
  return (
    <main className="screen title-screen" data-testid="title">
      <TitleBackdrop />
      <div>
        <h1 className="logo">
          <small>THE KEEPER OF STORIES</small>
          Belief Engine
        </h1>
        <p className="tagline">Convince the village it is true — and the world obeys. But belief spreads both ways.</p>
        <nav className="menu" aria-label="Main menu">
          {info && (
            <button className="btn primary big" data-testid="continue" onClick={() => { unlockAudio(); sfx('click'); store.continueRun(); }}>
              Continue — {getScenarioDef(info.scenarioId).runtime.name}, day {info.day}/{info.maxDay}
            </button>
          )}
          <button className={`btn ${info ? '' : 'primary'} big`} data-testid="play" onClick={() => { unlockAudio(); sfx('click'); store.set({ screen: 'scenarios' }); }}>
            {info ? 'New game' : 'Play'}
          </button>
          <button className="btn" onClick={() => store.set({ screen: 'howto' })}>How it works</button>
          <button className="btn" onClick={() => store.set({ screen: 'settings' })}>Settings</button>
          <button className="btn ghost" onClick={() => store.set({ screen: 'credits' })}>Credits</button>
        </nav>
        {ui.loadError && <div className="toast error" role="alert" style={{ margin: '1rem auto', maxWidth: 440 }}>{ui.loadError}</div>}
        <p className="footer-note">Works offline once loaded. Saves stay on this device. No accounts, no tracking.{seen ? ` ${seen} run${seen === 1 ? '' : 's'} archived locally.` : ''}</p>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ scenario select + briefing

export function Scenarios() {
  const list = listScenarios();
  const prog = loadProgress();
  return (
    <main className="screen">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: 'title' })}>← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>Choose a story</h1>
        <p className="muted">Each chapter adds a new twist. Every one can be won in more than one way.</p>
        <div className="grid2">
          {list.map((sc) => {
            const wins = prog.runs.filter((r) => r.scenarioId === sc.id && r.result === 'victory' && !r.debug).length;
            return (
              <div key={sc.id} className="card scn-card" data-testid={`scn-${sc.id}`}>
                <h2>{sc.name}</h2>
                <p>{sc.tagline}</p>
                <div className="row wrap">
                  <span className="chip">{sc.days} days</span>
                  <span className="chip">{'★'.repeat(sc.difficulty)}{'☆'.repeat(5 - sc.difficulty)} difficulty</span>
                  <span className="chip">{sc.threat}</span>
                  {wins > 0 && <span className="chip good">Won ×{wins}</span>}
                </div>
                <button className="btn primary" onClick={() => { sfx('click'); store.newRun({ scenarioId: sc.id, seed: 1, difficulty: 'normal' }); }} data-testid={`begin-${sc.id}`}>
                  Begin
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function randomSeed(): number {
  const a = new Uint32Array(1);
  window.crypto.getRandomValues(a);
  return a[0] % 1000000;
}

export function Briefing() {
  const state = useStore((s) => s.state);
  const [seed, setSeed] = useState<string>(String(state?.seed ?? 1));
  const [diff, setDiff] = useState<Difficulty>(state?.difficulty ?? 'normal');
  if (!state) return null;
  const sc = state.scn;
  const series = sc.threatKind === 'wolves' ? sc.threat.map((t) => t.pack) : sc.threat.map((t) => t.level);
  const maxLevel = Math.max(...series, 1);
  const seriesName = sc.threatKind === 'wolves' ? 'Packs hunting, night by night' : sc.threatKind === 'drought' ? 'The heat, night by night' : 'The river, night by night';
  const lossLine = sc.objectives.find((o) => o.instantLoss);
  const begin = () => {
    sfx('click');
    const n = Number.parseInt(seed, 10);
    const sd = Number.isFinite(n) && n >= 0 && n <= 2147483647 ? n : 1;
    if (sd !== state.seed || diff !== state.difficulty) store.newRun({ scenarioId: state.scenarioId, seed: sd, difficulty: diff });
    store.set({ screen: 'play', activeClaim: null });
  };
  return (
    <main className="screen" data-testid="briefing">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: 'scenarios' })}>← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>{sc.name}</h1>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem' }}>{sc.tagline}</p>
        {sc.briefing.map((l, i) => <p key={i}>{l}</p>)}
        <h2>{seriesName}</h2>
        <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 110 }} role="img" aria-label={`Forecast by day: ${sc.threat.map((t, i) => `day ${t.day} ${series[i]}`).join(', ')}`}>
          {sc.threat.map((t, i) => (
            <div key={t.day} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: `${Math.max(6, (series[i] / maxLevel) * 80)}px`, background: series[i] / maxLevel >= 0.66 ? 'var(--bad)' : 'var(--river)', borderRadius: 4, opacity: 0.85 }} />
              <div className="small muted">D{t.day}</div>
            </div>
          ))}
        </div>
        <h2>You win if, at the end of day {sc.durationDays}</h2>
        <ul>{sc.objectives.filter((o) => !o.instantLoss && !o.heroic).map((o) => <li key={o.id}>{o.label}</li>)}</ul>
        <p className="small muted">{lossLine ? `You lose at once if the village falls below ${lossLine.value} people. ` : ''}You can undo any planned action until you end the day.</p>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="grid2">
            <label className="field">
              <span>Difficulty</span>
              <select value={diff} onChange={(e) => setDiff(e.target.value as Difficulty)} data-testid="difficulty">
                <option value="story">Story — more Influence, kinder villagers</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard — less fuel, a bolder rival</option>
              </select>
            </label>
            <label className="field">
              <span>Seed (same seed = same flood, same rival)</span>
              <div className="row">
                <input type="text" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))} aria-label="Seed" data-testid="seed" />
                <button className="btn small" onClick={() => setSeed(String(randomSeed()))}>Random</button>
              </div>
            </label>
          </div>
        </div>
        <div className="row spread wrap sticky-cta">
          <button className="btn" onClick={begin}>Skip briefing</button>
          <button className="btn primary big" onClick={begin} data-testid="begin">Begin the first day</button>
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ debrief

export function Debrief() {
  const state = useStore((s) => s.state);
  if (!state || !state.outcome) return null;
  const d = buildDebrief(state);
  const win = d.result === 'victory';
  const link = `${window.location.origin}${window.location.pathname}?scenario=${state.scenarioId}&seed=${state.seed}&d=${state.difficulty}&v=${state.rulesVersion}`;
  const alt = state.scn.starters.find((c) => c !== (state.stats.usedClaims[0] ?? state.starter));
  return (
    <main className="screen" data-testid="debrief">
      <div className="page">
        <div className="row" style={{ gap: '1rem' }}>
          <div className="medal" aria-hidden="true">{win ? (d.medal === 'gold' ? '🥇' : d.medal === 'silver' ? '🥈' : '🥉') : '†'}</div>
          <div>
            <h1 data-testid="verdict">{win ? 'Victory' : 'Defeat'}</h1>
            <p style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: '1.15rem' }}>{d.headline}</p>
          </div>
        </div>
        <p>{d.story}</p>
        <div className="row wrap">
          <button className="btn primary big" data-testid="retry-same" onClick={() => { sfx('click'); store.newRun({ scenarioId: state.scenarioId, seed: state.seed, difficulty: state.difficulty }); store.set({ screen: 'play' }); }}>Retry this seed</button>
          <button className="btn big" data-testid="new-seed" onClick={() => { sfx('click'); store.newRun({ scenarioId: state.scenarioId, seed: randomSeed(), difficulty: state.difficulty }); store.set({ screen: 'play' }); }}>New seed</button>
          {alt && <button className="btn big" data-testid="try-other" onClick={() => { sfx('click'); store.newRun({ scenarioId: state.scenarioId, seed: state.seed, difficulty: state.difficulty }); store.set({ screen: 'play' }); }}>Try another approach</button>}
        </div>
        <h2>Why it went this way</h2>
        {d.chains.map((c, i) => (
          <div key={i} className={`chain ${c.kind === 'loss' ? 'loss' : c.kind === 'rival' ? 'rival' : ''}`}>
            <b>{c.title}</b>
            <ul style={{ padding: 0, margin: '0.3rem 0 0 1.2rem' }}>
              {c.steps.map((s) => <li key={s.id}><span className="muted small">Day {s.day}</span> {s.text}</li>)}
            </ul>
          </div>
        ))}
        {d.chains.length === 0 && <p className="muted">No law took hold, so nothing in the world changed because of belief.</p>}
        <h2>What you may have missed</h2>
        <ul>{d.missed.map((m, i) => <li key={i}>{m}</li>)}</ul>
        <h2>The village</h2>
        <p>{d.saved} of {state.villagers.length} survived. {d.homesSpared} home(s) and {d.livesSpared} life/lives spared by laws.{d.lost.length ? ` Lost: ${d.lost.map((l) => `${l.name} (${l.cause}, day ${l.day})`).join('; ')}.` : ''}</p>
        <h2>Score {d.score}</h2>
        <table className="breakdown"><tbody>{Object.entries(d.breakdown).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
        <p className="small muted">{d.seedInfo}. Score is a rough guide only; the story above matters more.</p>
        <ul className="small">{d.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        <div className="row wrap" style={{ marginTop: '1rem' }}>
          <button className="btn" onClick={() => { void navigator.clipboard?.writeText(link).then(() => store.toast('Seed link copied.', 'good'), () => store.toast(link)); }}><Icon name="share" /> Share this seed</button>
          <button className="btn" onClick={() => store.set({ screen: 'title' })}>Main menu</button>
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ how to / settings / credits

export function HowTo() {
  const back = store.state && !store.state.outcome ? 'play' : 'title';
  return (
    <main className="screen" data-testid="howto">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: back })}>← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>How it works</h1>
        <p><b>Claim → Spread → Belief → Law → Consequence.</b></p>
        <ol>
          <li><b>Claim.</b> You hold stories about the world, like “the river fears fire”. Choose one in the hand at the bottom of the map.</li>
          <li><b>Spread.</b> Tell villagers directly (1 Influence each) or ask a believer to carry it to someone they trust. Overnight, stories travel along ties of trust — only between people who can reach each other.</li>
          <li><b>Belief.</b> Hearsay barely moves skeptics. People who <i>watch</i> something happen are convinced far more deeply. Stage a ritual at a landmark on a good-omen night to give people something to see.</li>
          <li><b>Law.</b> When enough of a place believes (the line on the support bar), the story becomes law and the world obeys: flames turn the flood, watched wood does not break, bells draw rain.</li>
          <li><b>Consequence.</b> Every law has a cost: fire spreads, watchers leave the fields, rain pools elsewhere. Rivals counter. If belief drains away, the law fails.</li>
        </ol>
        <h2>Each day</h2>
        <ul>
          <li>You get Influence (3 a day, up to 5 saved). Planning is free to undo.</li>
          <li><b>Scout</b> someone to see their exact convictions and why they changed.</li>
          <li><b>End Day</b> when ready. Night falls: gossip, laws, flood, fire, rivals. Read the digest, then plan again.</li>
        </ul>
        <h2>Controls</h2>
        <table className="breakdown"><tbody>
          <tr><td>Select a villager or landmark</td><td>Click / tap</td></tr>
          <tr><td>Pan the map</td><td>Drag, or <span className="kbd">arrows</span> / <span className="kbd">WASD</span></td></tr>
          <tr><td>Zoom</td><td>Wheel, pinch, <span className="kbd">+</span> <span className="kbd">-</span> buttons, <span className="kbd">0</span> to fit</td></tr>
          <tr><td>Choose a story</td><td>Click a card, or <span className="kbd">1</span>–<span className="kbd">9</span></td></tr>
          <tr><td>Undo last action</td><td><span className="kbd">U</span> or the Undo button</td></tr>
          <tr><td>Social lens (trust ties)</td><td><span className="kbd">L</span> or the lens button</td></tr>
          <tr><td>End the day</td><td><span className="kbd">Enter</span> (asks to confirm)</td></tr>
          <tr><td>Close / deselect</td><td><span className="kbd">Esc</span></td></tr>
        </tbody></table>
        <p className="small muted">Everything on the map is also available as lists in the Village, Laws and Tonight tabs, so you can play without the canvas.</p>
      </div>
    </main>
  );
}

export function SettingsScreen() {
  const ui = useStore((s) => s.ui);
  const st = ui.settings;
  const inGame = !!store.state && !store.state.outcome;
  return (
    <main className="screen" data-testid="settings">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: inGame ? 'play' : 'title' })} data-testid="settings-back">← {inGame ? 'Back to the game' : 'Back'}</button>
        <h1 style={{ marginTop: '0.8rem' }}>Settings</h1>
        <div className="card">
          <label className="toggle-row"><span>Sound effects</span><input type="checkbox" checked={st.sfx} onChange={(e) => store.setSettings({ sfx: e.target.checked })} /></label>
          <label className="toggle-row"><span>Sound effects volume</span><input type="range" min={0} max={1} step={0.05} value={st.sfxVolume} onChange={(e) => store.setSettings({ sfxVolume: Number(e.target.value) })} aria-label="Sound effects volume" /></label>
          <label className="toggle-row"><span>Music and ambience</span><input type="checkbox" checked={st.music} onChange={(e) => store.setSettings({ music: e.target.checked })} /></label>
          <label className="toggle-row"><span>Music volume</span><input type="range" min={0} max={1} step={0.05} value={st.musicVolume} onChange={(e) => store.setSettings({ musicVolume: Number(e.target.value) })} aria-label="Music volume" /></label>
          <label className="toggle-row"><span>Reduce motion</span><input type="checkbox" checked={st.reducedMotion} onChange={(e) => store.setSettings({ reducedMotion: e.target.checked })} data-testid="reduced-motion" /></label>
          <label className="toggle-row"><span>High contrast</span><input type="checkbox" checked={st.highContrast} onChange={(e) => store.setSettings({ highContrast: e.target.checked })} /></label>
          <label className="toggle-row"><span>Text size</span>
            <select value={st.textScale} onChange={(e) => store.setSettings({ textScale: e.target.value as typeof st.textScale })} aria-label="Text size">
              <option value="compact">Compact</option><option value="default">Default</option><option value="large">Large</option>
            </select></label>
          <label className="toggle-row"><span>Graphics quality</span>
            <select value={st.quality} onChange={(e) => store.setSettings({ quality: e.target.value as typeof st.quality })} aria-label="Graphics quality">
              <option value="auto">Auto</option><option value="high">High</option><option value="low">Low (fewer effects)</option>
            </select></label>
          <label className="toggle-row"><span>Show tips in the first days</span><input type="checkbox" checked={st.tutorial} onChange={(e) => store.setSettings({ tutorial: e.target.checked })} /></label>
        </div>
        <div className="row wrap" style={{ marginTop: '1rem' }}>
          <button className="btn" onClick={() => store.resetSettings()}>Reset settings</button>
          {inGame && <button className="btn" onClick={() => { const s = store.state!; store.newRun({ scenarioId: s.scenarioId, seed: s.seed, difficulty: s.difficulty }); store.set({ screen: 'play' }); }} data-testid="restart-seed">Restart this seed</button>}
          {inGame && <button className="btn danger" onClick={() => store.set({ screen: 'title' })} data-testid="to-title">Leave to title (your game is saved)</button>}
        </div>
        <p className="small muted" style={{ marginTop: '1rem' }}>Settings and saves are stored in this browser only. {store.lastSavedOk ? '' : 'Storage is unavailable, so saves last only until you close the tab.'}</p>
      </div>
    </main>
  );
}

export function Credits() {
  return (
    <main className="screen">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: 'title' })}>← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>Credits</h1>
        <p>Design, code, procedural art and procedural audio: original, made for this project. No external art, music, fonts or sound files are used — every sprite is drawn in code and every sound is synthesised in your browser.</p>
        <p>Built with React, TypeScript and Vite. The simulation is a pure deterministic TypeScript engine; the same engine powers the browser game, the bot tournaments and the MCP agent server.</p>
        <p className="muted small">Privacy: the game makes no network requests and sets no cookies. Saves and settings live in your browser’s local storage.</p>
      </div>
    </main>
  );
}
