import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { predictedWater } from '../../engine/index.ts';
import { MapRenderer } from '../../render/MapRenderer.ts';
import type { WorldRenderer } from '../../render/types.ts';
import { chooseRenderer, loadWorld3D, rememberRenderer } from '../../render/choose.ts';
import { Avatar, Icon } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { getTutorial } from '../tutorial.ts';
import { useNarrow } from '../useNarrow.ts';

let announcedReason = false;

export function MapView({ children }: { children?: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendRef = useRef<WorldRenderer | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const version = useStore((s) => s.version);
  const ui = useStore((s) => s.ui);
  const state = useStore((s) => s.state);
  const [mode, setMode] = useState(() => chooseRenderer());
  const [ready, setReady] = useState(false);
  /** what the loading veil says while the 3D world arrives: its code is fetched, then the village is built */
  const [stage, setStage] = useState<'fetching' | 'building'>('fetching');
  const choice = mode.choice;
  // on a phone the view controls fold into one button: pinch zooms, and the rest is a tap away
  const narrow = useNarrow();
  const [toolsOpen, setToolsOpen] = useState(false);
  const showTools = !narrow || toolsOpen;
  /** a tap on a knot of people who cannot be told apart there: where it landed, who it could mean (nearest first), and in which moment
   * of the run (the people move on when the run does, and a list of who was standing there would be stale) */
  const [crowd, setCrowd] = useState<{ x: number; y: number; ids: string[]; run: unknown } | null>(null);
  const crowdDone = useCallback((id: string | null, refocus: boolean) => {
    setCrowd(null);
    if (id) store.select({ kind: 'villager', id });
    if (refocus) wrapRef.current?.querySelector('canvas')?.focus({ preventScroll: true });
  }, []);

  // when the classic map is showing and the player did not ask for it, say why, once, and offer the way to 3D
  const [noteShown, setNoteShown] = useState(() => !!mode.reason && !mode.reason.startsWith('classic map chosen') && !announcedReason);
  const dismissNote = () => {
    announcedReason = true;
    setNoteShown(false);
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // a fresh canvas per renderer: a canvas keeps the kind of context it was first given, and a 3D one cannot be reused
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', choice === '3d'
      ? 'Village in 3D. Use the Village tab for a list of everyone. Arrow keys pan, plus and minus zoom, Q and E rotate, zero resets the view.'
      : 'Village map. Use the Village tab for a list of everyone. Arrow keys pan, plus and minus zoom.');
    canvas.dataset.renderer = choice;
    wrap.insertBefore(canvas, wrap.firstChild);
    let cancelled = false;
    let r: WorldRenderer | null = null;
    let ro: ResizeObserver | null = null;
    const cleanups: (() => void)[] = [];
    setReady(false);

    /** a name beside the pointer for whatever is under it (the card with the detail opens on a tap) */
    const showTip = (hit: { kind: 'villager' | 'landmark'; id: string } | null, x: number, y: number): void => {
      const tip = tipRef.current;
      if (!tip) return;
      const st = store.state;
      if (!hit || !st) {
        tip.hidden = true;
        return;
      }
      const v = hit.kind === 'villager' ? st.villagers.find((q) => q.id === hit.id) : null;
      const l = hit.kind === 'landmark' ? st.world.landmarks.find((q) => q.id === hit.id) : null;
      const title = v ? v.name : l ? l.name : '';
      const sub = v ? `${v.role}${v.status === 'dead' ? ' · lost' : ''}` : l ? l.kind : '';
      if (tip.dataset.key !== hit.id) {
        tip.dataset.key = hit.id;
        tip.replaceChildren();
        const b = document.createElement('span');
        b.textContent = title;
        const sm = document.createElement('small');
        sm.textContent = sub;
        tip.append(b, sm);
      }
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.hidden = false;
    };

    const attach = (renderer: WorldRenderer): void => {
      r = renderer;
      rendRef.current = r;
      (window as unknown as { __beRenderer?: WorldRenderer }).__beRenderer = r;
      const size = () => {
        const b = wrap.getBoundingClientRect();
        r?.resize(b.width, b.height, window.devicePixelRatio || 1);
      };
      size();
      ro = new ResizeObserver(size);
      ro.observe(wrap);
      const s0 = store.state;
      if (s0) r.setState(s0);
      r.start();
      setReady(true);

      // ---- pointer handling: tap to select, drag to pan, right-drag to orbit (3D), pinch to zoom, wheel to zoom
      const pts = new Map<number, { x: number; y: number }>();
      let drag = { moved: 0, lastX: 0, lastY: 0, orbit: false };
      let pinch = 0;
      /** the person the last tap landed on, and when: a second tap on them soon after brings the camera to them */
      let lastTap = { id: '', at: 0 };
      const local = (e: PointerEvent | WheelEvent) => {
        const b = canvas.getBoundingClientRect();
        return { x: e.clientX - b.left, y: e.clientY - b.top };
      };
      const down = (e: PointerEvent) => {
        canvas.setPointerCapture?.(e.pointerId);
        const p = local(e);
        pts.set(e.pointerId, p);
        drag = { moved: 0, lastX: p.x, lastY: p.y, orbit: e.button === 2 || e.shiftKey };
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = Math.hypot(a.x - b.x, a.y - b.y);
        }
      };
      const move = (e: PointerEvent) => {
        const p = local(e);
        if (!pts.has(e.pointerId)) {
          const hit = r?.hitTest(p.x, p.y) ?? null;
          r?.setHover(hit);
          canvas.style.cursor = hit ? 'pointer' : 'grab';
          showTip(hit, p.x, p.y);
          return;
        }
        showTip(null, 0, 0);
        pts.set(e.pointerId, p);
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch > 0) r?.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
          pinch = d;
          drag.moved = 99;
          return;
        }
        const dx = p.x - drag.lastX;
        const dy = p.y - drag.lastY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 8) {
          if (drag.orbit && r?.orbitBy) r.orbitBy(-dx * 0.006, dy * 0.004);
          else r?.panBy(dx, dy);
        }
        drag.lastX = p.x;
        drag.lastY = p.y;
      };
      const up = (e: PointerEvent) => {
        const p = local(e);
        const wasSingle = pts.size === 1;
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = 0;
        if (wasSingle && drag.moved <= 8 && e.button !== 2) {
          const hit = r?.hitTest(p.x, p.y) ?? null;
          const now = performance.now();
          if (hit?.kind === 'villager' && hit.id === lastTap.id && now - lastTap.at < 450) {
            // a double tap on someone: go to them (up close a knot of people spreads apart, so this one is the one selected)
            lastTap = { id: '', at: 0 };
            setCrowd(null);
            store.select({ kind: 'villager', id: hit.id });
            r?.focusVillager(hit.id);
            return;
          }
          lastTap = hit?.kind === 'villager' ? { id: hit.id, at: now } : { id: '', at: 0 };
          // several people under the tap who cannot be told apart there: ask who was meant rather than guess
          const many = hit?.kind === 'villager' ? (r?.crowdAt?.(p.x, p.y) ?? []) : [];
          if (many.length > 1) {
            store.select(null);
            setCrowd({ x: p.x, y: p.y, ids: many, run: store.state });
            return;
          }
          store.select(hit ? { kind: hit.kind, id: hit.id } : null);
          // the river is not a person or a place, but tapping it is asking about tonight's water
          const st = store.state;
          const t = !hit && st?.scn.features.flood ? r?.tileAt?.(p.x, p.y) : null;
          if (t && st && st.world.terrain[t.y * st.world.w + t.x] === 1) {
            store.setSettings({ showFlood: true });
            store.set({ tab: 'forecast', sheetOpen: true });
          }
        }
      };
      const cancel = (e: PointerEvent) => {
        pts.delete(e.pointerId);
        pinch = 0;
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        setCrowd(null);
        const p = local(e);
        // follow how far the wheel or trackpad moved (a mouse notch is about 100 px, about 12%), so a trackpad glides instead of jumping
        const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
        r?.zoomBy(Math.exp(Math.max(-0.5, Math.min(0.5, -px * 0.00115))), p.x, p.y);
      };
      const leave = () => {
        r?.setHover(null);
        showTip(null, 0, 0);
      };
      const menu = (e: Event) => e.preventDefault();
      const key = (e: KeyboardEvent) => {
        if (onMapKey(renderer, e)) setCrowd(null);
      };
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', cancel);
      canvas.addEventListener('pointerleave', leave);
      canvas.addEventListener('wheel', wheel, { passive: false });
      canvas.addEventListener('contextmenu', menu);
      canvas.addEventListener('keydown', key);
      cleanups.push(() => {
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', cancel);
        canvas.removeEventListener('pointerleave', leave);
        canvas.removeEventListener('wheel', wheel);
        canvas.removeEventListener('contextmenu', menu);
        canvas.removeEventListener('keydown', key);
      });
    };

    if (choice === '3d') {
      loadWorld3D()
        .then((World3D) => {
          if (cancelled) return;
          // say that the village is being built, let that be painted, and only then spend the half second it takes
          setStage('building');
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (cancelled) return;
              try {
                attach(new World3D(canvas));
              } catch (e) {
                store.toast(`The 3D world could not start (${e instanceof Error ? e.message : 'WebGL unavailable'}). Using the classic map.`, 'error');
                setMode({ choice: '2d', reason: 'the 3D world could not start' });
              }
            }),
          );
        })
        .catch(() => {
          if (!cancelled) setMode({ choice: '2d', reason: 'the 3D world could not load' });
        });
    } else {
      try {
        attach(new MapRenderer(canvas));
      } catch (e) {
        store.toast(`Your browser cannot draw the map (${e instanceof Error ? e.message : 'canvas unavailable'}). Use the Village tab to play from lists.`, 'error');
      }
    }
    return () => {
      cancelled = true;
      ro?.disconnect();
      for (const c of cleanups) c();
      r?.destroy();
      rendRef.current = null;
      canvas.remove();
      setStage('fetching');
    };
  }, [choice]);

  // push state + options into the renderer whenever anything changes, and once it exists (the 3D world arrives a moment after the first render)
  const lastDigest = useRef<unknown>(null);
  const lastAction = useRef<unknown>(null);
  useEffect(() => {
    const r = rendRef.current;
    if (!r || !state) return;
    const known = new Set<string>();
    for (const v of state.villagers) if (v.scoutedUntil >= state.day || (state.flags[`spoke:${v.id}`] ?? -1) === state.day) known.add(v.id);
    const tut = getTutorial(state, ui);
    r.setState(state);
    r.setOptions({
      reducedMotion: ui.settings.reducedMotion,
      lens: ui.lens,
      showFlood: ui.showFlood,
      activeClaim: ui.activeClaim,
      selection: ui.selection,
      hints: tut?.hintVillagers ?? [],
      forecast: state.scn.features.flood ? predictedWater(state) : null,
      highContrast: ui.settings.highContrast,
      quality: ui.settings.quality === 'low' ? 'low' : 'high',
      known,
    });
    if (ui.lastAction && lastAction.current !== ui.lastAction) {
      lastAction.current = ui.lastAction;
      r.playAction(ui.lastAction.events);
    }
    if (ui.digest && lastDigest.current !== ui.digest) {
      lastDigest.current = ui.digest;
      if (ui.digest.events.some((e) => e.code === 'RITUAL' && e.text.startsWith('Ring'))) r.noteBell();
      r.playResolution(ui.digest.events, store.prevState);
    }
  }, [version, state, ui, ready]);

  // keep the village clear of the interface: tell the renderer how much of the canvas the rail, tray, tools and open sheet cover
  useEffect(() => {
    if (!ready) return;
    const apply = (): void => {
      const r = rendRef.current;
      const wrap = wrapRef.current;
      if (!r?.setInsets || !wrap) return;
      const sr = wrap.getBoundingClientRect();
      const q = (sel: string): DOMRect | null => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const top = q('.topbar');
      const tray = q('.tray');
      const modes = q('.modes');
      const tools = q('.map-tools');
      const side = q('.side.open');
      // on a phone the card for the selection and the open sheet sit above the tray: the village is framed in what is left above them
      const dock = q(".pop[data-dock='1'][data-ready='1']");
      const wide = sr.width > 900;
      // the sheet stands along the bottom on a phone held upright, and at the right on a wide screen or a phone on its side
      const sheetAtBottom = !!side && side.width > sr.width * 0.8;
      const sheetH = side && sheetAtBottom ? sr.bottom - side.top : 0;
      const dockTop = dock && dock.top > sr.top + sr.height * 0.25 ? sr.bottom - dock.top : 0;
      // while the opening choice is up the card docks under the rail instead (the cards need the bottom)
      const dockHigh = dock && dock.top <= sr.top + sr.height * 0.25 ? dock.bottom - sr.top : 0;
      // on a phone the lens rail and the view controls float over the village's edges, as the rail always has: counting the controls
      // pushed the village off-centre at rest, and opening them would re-frame it. A wide screen frames the village clear of both
      r.setInsets({
        top: Math.max(top ? top.bottom - sr.top + 8 : 0, dockHigh + 8),
        bottom: Math.max(tray ? sr.bottom - tray.top + 8 : 0, dockTop + 8, sheetH + 8),
        left: wide && modes ? Math.max(0, modes.right - sr.left + 8) : 0,
        right: Math.max(side && !sheetAtBottom ? sr.right - side.left : 0, wide && tools ? sr.right - tools.left + 6 : 0),
      });
    };
    apply();
    const t = window.setInterval(apply, 250);
    window.addEventListener('resize', apply);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', apply);
    };
  }, [ready, choice]);

  const focusSel = () => {
    const r = rendRef.current;
    const sel = store.ui.selection;
    const s = store.state;
    if (!r || !s) return;
    if (sel?.kind === 'villager') r.focusVillager(sel.id);
    else if (sel?.kind === 'landmark') {
      const l = s.world.landmarks.find((x) => x.id === sel.id);
      if (l) r.focusTile(l.x, l.y, 1.4);
    } else r.fit();
  };

  const switchTo = (c: '2d' | '3d') => {
    rememberRenderer(c);
    setMode({ choice: c, reason: '' });
  };

  return (
    <div className="stage" ref={wrapRef} data-renderer={choice} data-ready={ready ? '1' : '0'}>
      {choice === '3d' && !ready && (
        <div className="stage-loading" role="status">
          <div className="sl-scene" aria-hidden="true">
            <i className="sl-cloud a" />
            <i className="sl-cloud b" />
            <i className="sl-island" />
          </div>
          <span>{stage === 'fetching' ? 'Fetching the 3D world…' : 'Raising the village…'}</span>
          <div className="sl-bar" aria-hidden="true">
            <i style={{ width: stage === 'fetching' ? '38%' : '86%' }} />
          </div>
        </div>
      )}
      {noteShown && choice === '2d' && (
        <div className="stage-note" role="note" data-testid="renderer-note">
          <span>Classic map: {mode.reason.replace(/, so the classic map is used.*$/, '')}.</span>
          <button className="btn small" onClick={() => { dismissNote(); switchTo('3d'); }}>Try 3D</button>
          <button className="btn small ghost" onClick={dismissNote} aria-label="Dismiss this note">Dismiss</button>
        </div>
      )}
      <div className="hover-tip" ref={tipRef} hidden aria-hidden="true" />
      {crowd && crowd.run === state && <CrowdPicker at={crowd} onDone={crowdDone} />}
      <div className={`map-tools ${narrow ? 'narrow' : ''} ${toolsOpen ? 'open' : ''}`}>
        {narrow && (
          <button className="btn icon-btn tools-toggle" aria-label="View controls: zoom, rotate, fit and the 2D or 3D switch" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)} data-testid="tools-toggle">
            <Icon name={toolsOpen ? 'close' : 'fit'} />
          </button>
        )}
        {showTools && (
          <>
            <button className="btn icon-btn" aria-label="Zoom in" onClick={() => rendRef.current?.zoomBy(1.25)}>
              <Icon name="plus" />
            </button>
            <button className="btn icon-btn" aria-label="Zoom out" onClick={() => rendRef.current?.zoomBy(1 / 1.25)}>
              <Icon name="minus" />
            </button>
            <button className="btn icon-btn" aria-label="Focus on selection, or fit the whole map" onClick={focusSel}>
              <Icon name="fit" />
            </button>
            {choice === '3d' && (
              <>
                <button className="btn icon-btn" aria-label="Rotate the view left" onClick={() => rendRef.current?.orbitBy?.(0.25, 0)} data-testid="orbit-left">
                  <span aria-hidden="true">⟲</span>
                </button>
                <button className="btn icon-btn" aria-label="Rotate the view right" onClick={() => rendRef.current?.orbitBy?.(-0.25, 0)} data-testid="orbit-right">
                  <span aria-hidden="true">⟳</span>
                </button>
              </>
            )}
            <button className="btn icon-btn" aria-label={choice === '3d' ? 'Switch to the classic 2D map' : 'Switch to the 3D world'} onClick={() => switchTo(choice === '3d' ? '2d' : '3d')} data-testid="renderer-toggle">
              <span aria-hidden="true" style={{ fontWeight: 700, fontSize: '0.72rem' }}>{choice === '3d' ? '2D' : '3D'}</span>
            </button>
          </>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Who did you mean? The people under a tap who stand too close together to tell apart there, nearest first, in a short list beside
 * the tap. Choosing one selects them; Escape, a tap anywhere else or moving the camera closes it.
 */
function CrowdPicker({ at, onDone }: { at: { x: number; y: number; ids: string[] }; onDone: (id: string | null, refocus: boolean) => void }) {
  const state = useStore((s) => s.state);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  // beside the tap, below it when there is room and above it when not, always between the top rail and the bottom bar (or an open sheet)
  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.parentElement;
    if (!el || !stage) return;
    const sr = stage.getBoundingClientRect();
    const q = (sel: string): DOMRect | null => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const rail = q('.topbar');
    const tray = q('.tray');
    const sheet = q('.side.open');
    const minY = (rail ? rail.bottom - sr.top : 0) + 8;
    let maxY = (tray ? tray.top - sr.top : sr.height) - 8;
    if (sheet && sheet.top > sr.top + sr.height * 0.3) maxY = Math.min(maxY, sheet.top - sr.top - 8);
    const room = Math.max(120, maxY - minY);
    const h = Math.min(el.scrollHeight, room);
    const w = el.offsetWidth;
    const left = Math.min(Math.max(8, at.x - w / 2), sr.width - w - 8);
    let top = at.y + 20;
    if (top + h > maxY) top = at.y - 20 - h;
    top = Math.min(Math.max(minY, top), maxY - h);
    setPos({ left: Math.round(left), top: Math.round(top), maxHeight: Math.round(room) });
  }, [at]);

  useEffect(() => {
    const el = ref.current;
    const away = (e: PointerEvent) => {
      if (!el?.contains(e.target as Node)) onDone(null, false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onDone(null, true);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    el?.querySelector('button')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [onDone]);

  const people = at.ids.map((id) => state?.villagers.find((v) => v.id === id)).filter((v) => !!v);
  return (
    <div
      ref={ref}
      className="crowd"
      role="dialog"
      aria-labelledby="crowd-title"
      data-testid="crowd-picker"
      data-ready={pos ? '1' : '0'}
      style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : undefined}
    >
      <h2 id="crowd-title">Who did you mean?</h2>
      <ul>
        {people.map((v) => (
          <li key={v.id}>
            <button className="crowd-pick" data-id={v.id} onClick={() => onDone(v.id, true)}>
              <Avatar look={v.look} faction={v.faction} label="" />
              <span>
                <b>{v.name}</b>
                <small>
                  {v.role}
                  {v.status === 'dead' ? ' · lost' : ''}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** keyboard camera control, attached to whichever canvas is current; says whether the key moved the camera */
function onMapKey(r: WorldRenderer, e: KeyboardEvent): boolean {
  const step = 70;
  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
      r.panBy(step, 0);
      break;
    case 'ArrowRight':
    case 'd':
      r.panBy(-step, 0);
      break;
    case 'ArrowUp':
    case 'w':
      r.panBy(0, step);
      break;
    case 'ArrowDown':
    case 's':
      r.panBy(0, -step);
      break;
    case 'q':
      r.orbitBy?.(0.18, 0);
      break;
    case 'e':
      r.orbitBy?.(-0.18, 0);
      break;
    case 'r':
      r.orbitBy?.(0, 0.1);
      break;
    case 'f':
      r.orbitBy?.(0, -0.1);
      break;
    case '+':
    case '=':
      r.zoomBy(1.2);
      break;
    case '-':
      r.zoomBy(1 / 1.2);
      break;
    case '0':
      r.fit();
      break;
    default:
      return false;
  }
  e.preventDefault();
  return true;
}

export function getRenderer(): WorldRenderer | null {
  return (window as unknown as { __beRenderer?: WorldRenderer }).__beRenderer ?? null;
}
