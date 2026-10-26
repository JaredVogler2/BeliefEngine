import { useEffect, useRef } from 'react';
import { predictedWater } from '../../engine/index.ts';
import { MapRenderer } from '../../render/MapRenderer.ts';
import { Icon } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { getTutorial } from '../tutorial.ts';

export function MapView({ children }: { children?: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendRef = useRef<MapRenderer | null>(null);
  const version = useStore((s) => s.version);
  const ui = useStore((s) => s.ui);
  const state = useStore((s) => s.state);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let r: MapRenderer;
    try {
      r = new MapRenderer(canvas);
    } catch (e) {
      store.toast(`Your browser cannot draw the map (${e instanceof Error ? e.message : 'canvas unavailable'}). Use the Village tab to play from lists.`, 'error');
      return;
    }
    rendRef.current = r;
    (window as unknown as { __beRenderer?: MapRenderer }).__beRenderer = r;
    const size = () => {
      const b = wrap.getBoundingClientRect();
      r.resize(b.width, b.height, window.devicePixelRatio || 1);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);
    const s0 = store.state;
    if (s0) r.setState(s0);
    r.start();

    // ---- pointer handling: tap to select, drag to pan, pinch to zoom, wheel to zoom
    const pts = new Map<number, { x: number; y: number }>();
    let drag = { moved: 0, lastX: 0, lastY: 0 };
    let pinch = 0;
    const local = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      drag = { moved: 0, lastX: p.x, lastY: p.y };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (!pts.has(e.pointerId)) {
        r.setHover(r.hitTest(p.x, p.y));
        canvas.style.cursor = r.hitTest(p.x, p.y) ? 'pointer' : 'grab';
        return;
      }
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) r.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        drag.moved = 99;
        return;
      }
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 8) r.panBy(dx, dy);
      drag.lastX = p.x;
      drag.lastY = p.y;
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      const wasSingle = pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (wasSingle && drag.moved <= 8) {
        const hit = r.hitTest(p.x, p.y);
        store.select(hit ? { kind: hit.kind, id: hit.id } : null);
      }
    };
    const cancel = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e as unknown as PointerEvent);
      r.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    };
    const leave = () => r.setHover(null);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
      r.destroy();
      rendRef.current = null;
    };
  }, []);

  // push state + options into the renderer whenever anything changes
  const lastDigest = useRef<unknown>(null);
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
    if (ui.digest && lastDigest.current !== ui.digest) {
      lastDigest.current = ui.digest;
      if (ui.digest.events.some((e) => e.code === 'RITUAL' && e.text.startsWith('Ring'))) r.noteBell();
      r.playResolution(ui.digest.events, store.prevState);
    }
  }, [version, state, ui]);

  // keyboard camera control
  const onKey = (e: React.KeyboardEvent) => {
    const r = rendRef.current;
    if (!r) return;
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
        return;
    }
    e.preventDefault();
  };

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

  return (
    <div className="stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Village map. Use the Village tab for a list of everyone. Arrow keys pan, plus and minus zoom."
        onKeyDown={onKey}
      />
      <div className="map-tools">
        <button className="btn icon-btn" aria-label="Zoom in" onClick={() => rendRef.current?.zoomBy(1.25)}>
          <Icon name="plus" />
        </button>
        <button className="btn icon-btn" aria-label="Zoom out" onClick={() => rendRef.current?.zoomBy(1 / 1.25)}>
          <Icon name="minus" />
        </button>
        <button className="btn icon-btn" aria-label="Focus on selection, or fit the whole map" onClick={focusSel}>
          <Icon name="fit" />
        </button>
        <button className="btn icon-btn" aria-label="Toggle social lens: trust ties" aria-pressed={ui.lens === 'social'} onClick={() => store.set({ lens: ui.lens === 'social' ? 'none' : 'social' })}>
          <Icon name="lens" />
        </button>
        {state?.scn.features.flood && (
          <button className="btn icon-btn" aria-label="Toggle tonight's flood forecast on the map" aria-pressed={ui.showFlood} onClick={() => store.setSettings({ showFlood: !ui.showFlood })}>
            <Icon name="flood" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function getRenderer(): MapRenderer | null {
  return (window as unknown as { __beRenderer?: MapRenderer }).__beRenderer ?? null;
}
