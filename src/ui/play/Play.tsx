import { useEffect, useRef, useState } from 'react';
import { allClaimDefs, firstName, getForecast, getLawViews, nightReport } from '../../engine/index.ts';
import { setAmbience, setSceneAudio, setThreatIntensity, unlockAudio } from '../../audio/audio.ts';
import { Icon, Modal, evIcon } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { useNarrow } from '../useNarrow.ts';
import { getTutorial } from '../tutorial.ts';
import { Compose } from './Compose.tsx';
import { Corner, Modes, SelectionPopover, TopBar, Tray } from './Hud.tsx';
import { MapView } from './MapView.tsx';
import { ForecastPanel, LawsPanel, LogPanel, SelectedPanel, TABS, VillagePanel, tabLabel } from './Panels.tsx';

function ConfirmEnd() {
  const state = useStore((s) => s.state)!;
  const f = getForecast(state);
  const unspent = state.ap;
  const close = () => store.set({ confirmEnd: false });
  return (
    <Modal title={`End Day ${state.day}?`} onClose={close}>
      <p>Night falls and the story spreads. You cannot undo what happens overnight.</p>
      <ul className="small">
        <li>Unspent Influence: <b>{unspent}</b> (you will have {Math.min(state.apMax, unspent + state.apPerDay)} tomorrow; the cap is {state.apMax}).</li>
        <li>Tonight: {f.tonight.label}, level {f.tonight.level}, {f.tonight.trend}.</li>
        {f.homesAtRisk.length > 0 && <li>{f.homesAtRisk.length} {f.homesAtRisk.length === 1 ? 'home' : 'homes'} in the water’s reach.</li>}
        {f.peopleAtRisk.length > 0 && <li style={{ color: '#ffb3bf' }}>{f.peopleAtRisk.map((p) => firstName(p.name)).join(', ')} may be lost.</li>}
        {f.trapped.length > 0 && <li style={{ color: '#ffb3bf' }}>{f.trapped.map((p) => firstName(p)).join(', ')} cannot reach safety.</li>}
      </ul>
      <div className="row spread wrap" style={{ marginTop: '1rem' }}>
        <button className="btn" onClick={close} data-testid="keep-planning">Keep planning</button>
        <button className="btn primary big" onClick={() => store.endDay()} data-testid="confirm-end" data-autofocus>Let night fall</button>
      </div>
    </Modal>
  );
}

function Digest() {
  const ui = useStore((s) => s.ui);
  const state = useStore((s) => s.state)!;
  const d = ui.digest;
  const go = useRef<HTMLButtonElement>(null);
  // the way on gets the keyboard focus, without scrolling the report: it is read from its headline down (the button row stays pinned)
  useEffect(() => {
    go.current?.focus({ preventScroll: true });
  }, [d?.day]);
  if (!d) return null;
  const report = nightReport(state, d.events, d.summary);
  const over = !!state.outcome;
  return (
    <section className="digest" role="region" aria-label={`Night of day ${d.day}`} data-testid="digest">
      <h2>Night of Day {d.day}</h2>
      <div className="head">{report.headline}</div>
      <ul style={{ padding: 0, margin: 0 }}>
        {report.story.map((t, i) => (
          <li key={`story-${i}`} data-ic="✦" data-testid="digest-story">{t}</li>
        ))}
        {report.lines.map((e) => (
          <li key={e.id} data-ic={evIcon(e.code)}>{e.text}</li>
        ))}
        {report.story.length === 0 && report.lines.length === 0 && <li data-ic="·">Nothing remarkable happened.</li>}
      </ul>
      <div className="row spread d-actions">
        <button className="btn small" onClick={() => store.set({ tab: 'log', sheetOpen: true })}>All events</button>
        <button className="btn primary" onClick={() => store.closeDigest()} data-testid="digest-continue" ref={go}>
          {over ? 'See what happened' : `On to day ${state.day}`}
        </button>
      </div>
    </section>
  );
}

function Coach() {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const t = getTutorial(state, ui);
  if (!t || ui.digest) return null;
  // a banner between the top bar and the map, never on top of the map or the story cards; on a phone it is one line until it is asked for more
  return (
    <aside className={`coach ${narrow ? 'narrow' : ''} ${open ? 'open' : ''}`} role="note" data-testid="coach">
      <div className="c-body">
        {narrow ? (
          <button className="c-title" aria-expanded={open} onClick={() => setOpen(!open)}>
            <b>{t.title}</b>
          </button>
        ) : (
          <b>{t.title}</b>
        )}
        <span className="c-text">{t.text}</span>
      </div>
      <div className="c-actions">
        <span className="step">Step {t.step} of {t.total}</span>
        <button className="btn small" onClick={() => store.set({ tutorialDone: true })}>Skip tips</button>
      </div>
    </aside>
  );
}

function Toasts() {
  const ui = useStore((s) => s.ui);
  return (
    <div className="toasts" aria-live="polite">
      {ui.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role="status">{t.text}</div>
      ))}
    </div>
  );
}

/**
 * The handle on top of the sheet on a phone held upright. The sheet opens at half height so the village stays in view: a tap on the
 * handle (or Enter) draws it up to full height and back, a swipe up draws it up, and a swipe down lowers it to half, then closes it.
 */
function SheetHandle({ full }: { full: boolean }) {
  const start = useRef<number | null>(null);
  const swiped = useRef(false);
  return (
    <button
      className="grab"
      aria-label={full ? 'Show less of the panel' : 'Show more of the panel'}
      aria-expanded={full}
      data-testid="sheet-handle"
      onPointerDown={(e) => {
        start.current = e.clientY;
        // (a touch swipe is often followed by no click at all: whatever the last swipe left behind does not apply to this press)
        swiped.current = false;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerUp={(e) => {
        const y0 = start.current;
        start.current = null;
        if (y0 === null || Math.abs(e.clientY - y0) < 24) return;
        // a swipe, not a tap: the click that follows it is not a second request
        swiped.current = true;
        if (e.clientY < y0) store.set({ sheetFull: true });
        else if (full) store.set({ sheetFull: false });
        else store.set({ sheetOpen: false });
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onClick={() => {
        if (swiped.current) {
          swiped.current = false;
          return;
        }
        store.set({ sheetFull: !full });
      }}
    />
  );
}

export function Play() {
  const state = useStore((s) => s.state);
  const ui = useStore((s) => s.ui);
  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      const s = store.state;
      if (!s || store.ui.confirmEnd || store.ui.composing) return;
      if (e.key === 'Escape') {
        if (store.ui.digest) return;
        if (store.ui.sheetOpen) store.set({ sheetOpen: false });
        else if (store.ui.selection) store.select(null);
        return;
      }
      if (e.key === 'Enter' && (e.target === document.body || (e.target as HTMLElement | null)?.tagName === 'CANVAS') && !store.ui.digest) {
        e.preventDefault();
        store.set({ confirmEnd: true });
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const claims = allClaimDefs(s).filter((c) => !c.rival);
        const c = claims[Number(e.key) - 1];
        if (c) {
          const cs = s.claims.find((x) => x.id === c.id);
          if (s.starter === null && s.scn.starters.includes(c.id)) {
            store.act({ type: 'PICK_STARTER', claim: c.id });
            store.set({ activeClaim: c.id });
          } else if (cs?.available) store.set({ activeClaim: store.ui.activeClaim === c.id ? null : c.id });
        }
      }
      if (e.key === 'u' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) store.undo();
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // tell the selected villager the chosen story: the most repeated move in the game, one key instead of three clicks
        const sel = store.ui.selection;
        const claim = store.ui.activeClaim;
        if (sel?.kind === 'villager' && claim) store.act({ type: 'SEED', claim, target: sel.id });
        else store.toast('Choose a story card and select a villager first, then press T to tell them.', 'error');
      }
      if (e.key === 'l') store.set({ lens: store.ui.lens === 'social' ? 'none' : 'social' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ambience follows the threat; audio starts on the first gesture
  useEffect(() => {
    const first = () => {
      unlockAudio();
      const s = store.state;
      setSceneAudio({ water: !!s && (s.scn.features.flood || s.world.landmarks.some((l) => l.kind === 'bridge')) });
      setAmbience(true);
    };
    window.addEventListener('pointerdown', first, { once: true });
    window.addEventListener('keydown', first, { once: true });
    return () => {
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
      setAmbience(false);
    };
  }, []);
  const level = state ? (state.threat[Math.min(state.day, state.threat.length) - 1]?.level ?? 0) : 0;
  useEffect(() => {
    setThreatIntensity(Math.min(1, level / 6));
  }, [level]);

  // pick a sensible default active story
  useEffect(() => {
    if (!state || ui.activeClaim) return;
    const first = allClaimDefs(state).find((c) => !c.rival && state.claims.find((x) => x.id === c.id)?.available);
    if (first) store.set({ activeClaim: first.id });
  }, [state, ui.activeClaim]);

  if (!state) return null;
  const laws = getLawViews(state);
  const awakening = laws.some((l) => !l.rival && (l.status === 'awakening' || l.status === 'active'));
  return (
    <div className={`play immersive ${ui.sheetOpen ? 'sheet-open' : ''}`} data-testid="play">
      <MapView>{ui.digest && <Digest />}</MapView>
      <TopBar />
      <Corner />
      <Modes />
      <Coach />
      <SelectionPopover />
      <aside className={`side ${ui.sheetOpen ? 'open' : ''} ${ui.sheetFull ? 'full' : ''}`} aria-label="Details">
        <SheetHandle full={ui.sheetFull} />
        <div className="tabs-row">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" className="tab" aria-selected={ui.tab === t} onClick={() => store.set({ tab: t, sheetOpen: true })} data-testid={`tab-${t}`}>
                {tabLabel(t)}
                {t === 'laws' && awakening && <span className="dot" style={{ background: 'var(--gold)' }} />}
              </button>
            ))}
          </div>
          <button className="btn icon-btn side-x" aria-label="Close panel" onClick={() => store.set({ sheetOpen: false })} data-testid="sheet-close">
            <Icon name="close" />
          </button>
        </div>
        <div className="panel" role="tabpanel" tabIndex={0} aria-label={`${tabLabel(ui.tab)} panel`}>
          {/* the contents exist only while the sheet is open: a closed sheet must not hold a second copy of the selected person's actions beside the card on the map */}
          {ui.sheetOpen && ui.tab === 'selected' && <SelectedPanel />}
          {ui.sheetOpen && ui.tab === 'laws' && <LawsPanel />}
          {ui.sheetOpen && ui.tab === 'village' && <VillagePanel />}
          {ui.sheetOpen && ui.tab === 'forecast' && <ForecastPanel />}
          {ui.sheetOpen && ui.tab === 'log' && <LogPanel />}
        </div>
      </aside>
      <Tray />
      {ui.confirmEnd && <ConfirmEnd />}
      {ui.composing && <Compose />}
      <Toasts />
      <div className="sr-only" aria-live="polite" role="status" data-testid="announce">{ui.announce}</div>
    </div>
  );
}
