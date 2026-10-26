import type { GameEvent, Landmark, RunState } from '../engine/index.ts';
import { claimDef } from '../engine/core/lookup.ts';
import { C, TS, hsl, nz, trustColor } from './palette.ts';
import {
  drawBeacon, drawBellTower, drawBridge, drawCabin, drawChapel, drawField, drawHall, drawHome, drawLabel, drawMarket, drawMill, drawShelter, drawTree, drawVillager, flame,
} from './sprites.ts';

export interface RenderOpts {
  reducedMotion: boolean;
  lens: 'none' | 'social';
  showFlood: boolean;
  activeClaim: string | null;
  selection: { kind: 'villager' | 'landmark'; id: string } | null;
  hints: string[];
  /** predicted flood depth for tonight, for the forecast overlay */
  forecast: number[] | null;
  highContrast: boolean;
  quality: 'high' | 'low';
  /** villager ids whose exact belief is known (scouted) */
  known: Set<string>;
}

export interface HitResult {
  kind: 'villager' | 'landmark';
  id: string;
}

interface VV {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

type EffectKind = 'pulse' | 'ring' | 'float' | 'spark' | 'flash';
interface Effect {
  kind: EffectKind;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  t0: number;
  dur: number;
  color: string;
  text?: string;
  r?: number;
}

const DEFAULT_OPTS: RenderOpts = {
  reducedMotion: false, lens: 'none', showFlood: true, activeClaim: null, selection: null, hints: [], forecast: null, highContrast: false, quality: 'high', known: new Set(),
};

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export class MapRenderer {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private state: RunState | null = null;
  private opts: RenderOpts = { ...DEFAULT_OPTS };
  private W = 300;
  private H = 200;
  private dpr = 1;
  cam = { cx: 0, cy: 0, zoom: 1 };
  private minZoom = 0.4;
  private terrain: HTMLCanvasElement | null = null;
  private terrainKey = '';
  private vv = new Map<string, VV>();
  private effects: Effect[] = [];
  private raf = 0;
  private running = false;
  private dirty = true;
  private t0 = performance.now();
  private lastDraw = 0;
  private hover: HitResult | null = null;
  private floodAnim: { t0: number; water: number[] } | null = null;
  private camAnim: { t0: number; dur: number; from: { cx: number; cy: number; zoom: number }; to: { cx: number; cy: number; zoom: number } } | null = null;
  private frames = 0;
  private fpsT = performance.now();
  fps = 60;
  private rainSeed = 1;
  private labelsOn = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('Canvas 2D is not available in this browser.');
    this.g = g;
  }

  setLabels(on: boolean): void {
    this.labelsOn = on;
    this.dirty = true;
  }

  // ------------------------------------------------------------ lifecycle
  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.terrain = null;
    this.effects = [];
  }

  resize(w: number, h: number, dpr: number): void {
    this.W = Math.max(50, w);
    this.H = Math.max(50, h);
    this.dpr = Math.min(2, dpr || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    if (this.state) {
      const old = this.minZoom;
      this.minZoom = this.computeMinZoom();
      if (this.cam.zoom < this.minZoom || old === 0.4) this.cam.zoom = Math.max(this.cam.zoom, this.minZoom);
      this.clampCam();
    }
    this.dirty = true;
  }

  private computeMinZoom(): number {
    if (!this.state) return 0.4;
    const mw = this.state.world.w * TS;
    const mh = this.state.world.h * TS;
    return Math.min(this.W / mw, this.H / mh) * 0.98;
  }

  setOptions(o: Partial<RenderOpts>): void {
    this.opts = { ...this.opts, ...o };
    this.dirty = true;
  }

  setState(s: RunState): void {
    const first = !this.state;
    this.state = s;
    const key = `${s.world.w}x${s.world.h}:${s.scenarioId}:${s.world.burned.reduce((a, b) => a + b, 0)}:${s.world.landmarks.filter((l) => l.kind === 'field' && l.data.ruined).length}`;
    if (key !== this.terrainKey) {
      this.terrainKey = key;
      this.terrain = null;
    }
    for (const v of s.villagers) {
      const j1 = (nz(v.id.length, v.id.charCodeAt(0), 1) - 0.5) * 11;
      const j2 = (nz(v.id.length, v.id.charCodeAt(0), 2) - 0.5) * 6;
      const tx = (v.x + 0.5) * TS + j1;
      const ty = (v.y + 0.92) * TS + j2;
      const cur = this.vv.get(v.id);
      if (!cur || first || this.opts.reducedMotion) this.vv.set(v.id, { x: tx, y: ty, tx, ty });
      else {
        cur.tx = tx;
        cur.ty = ty;
      }
    }
    this.minZoom = this.computeMinZoom();
    if (first) this.fit();
    this.dirty = true;
  }

  fit(): void {
    if (!this.state) return;
    const mw = this.state.world.w * TS;
    const mh = this.state.world.h * TS;
    this.minZoom = this.computeMinZoom();
    const narrow = this.W < 640;
    this.cam.zoom = narrow ? Math.max(this.minZoom, Math.min(1.0, this.W / (mw * 0.62))) : this.minZoom;
    this.cam.cx = narrow ? mw * 0.62 : mw / 2;
    this.cam.cy = narrow ? mh * 0.5 : mh / 2;
    this.clampCam();
    this.dirty = true;
  }

  // ------------------------------------------------------------ camera
  private clampCam(): void {
    if (!this.state) return;
    const mw = this.state.world.w * TS;
    const mh = this.state.world.h * TS;
    const halfW = this.W / 2 / this.cam.zoom;
    const halfH = this.H / 2 / this.cam.zoom;
    const pad = 40;
    this.cam.cx = halfW * 2 >= mw + pad * 2 ? mw / 2 : Math.max(halfW - pad, Math.min(mw - halfW + pad, this.cam.cx));
    this.cam.cy = halfH * 2 >= mh + pad * 2 ? mh / 2 : Math.max(halfH - pad, Math.min(mh - halfH + pad, this.cam.cy));
  }

  panBy(dx: number, dy: number): void {
    this.cam.cx -= dx / this.cam.zoom;
    this.cam.cy -= dy / this.cam.zoom;
    this.camAnim = null;
    this.clampCam();
    this.dirty = true;
  }

  zoomBy(factor: number, ax = this.W / 2, ay = this.H / 2): void {
    const before = this.screenToWorld(ax, ay);
    this.cam.zoom = Math.max(this.minZoom, Math.min(3.2, this.cam.zoom * factor));
    const after = this.screenToWorld(ax, ay);
    this.cam.cx += before.x - after.x;
    this.cam.cy += before.y - after.y;
    this.camAnim = null;
    this.clampCam();
    this.dirty = true;
  }

  focusTile(x: number, y: number, zoom?: number, animate = true): void {
    const to = { cx: (x + 0.5) * TS, cy: (y + 0.5) * TS, zoom: Math.max(this.minZoom, Math.min(3, zoom ?? Math.max(this.cam.zoom, 1.1))) };
    if (!animate || this.opts.reducedMotion) {
      this.cam = to;
      this.clampCam();
    } else this.camAnim = { t0: performance.now(), dur: 700, from: { ...this.cam }, to };
    this.dirty = true;
  }

  focusVillager(id: string): void {
    const v = this.vv.get(id);
    if (v) this.focusTile(v.tx / TS - 0.5, v.ty / TS - 0.5, undefined, true);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.W / 2) / this.cam.zoom + this.cam.cx, y: (sy - this.H / 2) / this.cam.zoom + this.cam.cy };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.cam.cx) * this.cam.zoom + this.W / 2, y: (wy - this.cam.cy) * this.cam.zoom + this.H / 2 };
  }

  /** screen position of a villager, for DOM overlays */
  villagerScreen(id: string): { x: number; y: number } | null {
    const v = this.vv.get(id);
    return v ? this.worldToScreen(v.x, v.y - 10) : null;
  }

  // ------------------------------------------------------------ hit testing
  hitTest(sx: number, sy: number): HitResult | null {
    const s = this.state;
    if (!s) return null;
    const w = this.screenToWorld(sx, sy);
    const touch = this.W < 700 || matchMedia?.('(pointer: coarse)').matches;
    const radius = (touch ? 26 : 16) / this.cam.zoom;
    let best: { id: string; d: number } | null = null;
    for (const v of s.villagers) {
      const p = this.vv.get(v.id);
      if (!p) continue;
      const d = Math.hypot(p.x - w.x, p.y - 9 - w.y);
      if (d <= radius && (!best || d < best.d)) best = { id: v.id, d };
    }
    if (best) return { kind: 'villager', id: best.id };
    const tx = Math.floor(w.x / TS);
    const ty = Math.floor(w.y / TS);
    let lmBest: Landmark | null = null;
    for (const l of s.world.landmarks) {
      const hit = l.tiles.some(([x, y]) => x === tx && y === ty) || (this.isTall(l) && l.x === tx && l.y === ty - 1) || (l.x === tx && Math.abs(l.y - ty) <= 0);
      if (hit && (!lmBest || l.y > lmBest.y)) lmBest = l;
    }
    if (lmBest) return { kind: 'landmark', id: lmBest.id };
    // generous landmark pick for touch
    if (touch) {
      let near: { l: Landmark; d: number } | null = null;
      for (const l of s.world.landmarks) {
        if (l.kind === 'field') continue;
        const d = Math.hypot((l.x + 0.5) * TS - w.x, (l.y + 0.3) * TS - w.y);
        if (d < radius * 1.2 && (!near || d < near.d)) near = { l, d };
      }
      if (near) return { kind: 'landmark', id: near.l.id };
    }
    return null;
  }

  private isTall(l: Landmark): boolean {
    return ['home', 'mill', 'belltower', 'hall', 'chapel', 'cabin', 'shelter', 'market', 'beacon'].includes(l.kind);
  }

  setHover(h: HitResult | null): void {
    if (h?.id !== this.hover?.id) {
      this.hover = h;
      this.dirty = true;
    }
  }

  // ------------------------------------------------------------ animation hooks
  playResolution(events: GameEvent[], prev: RunState | null): void {
    const s = this.state;
    if (!s) return;
    const now = performance.now();
    this.floodAnim = { t0: now, water: s.world.water.slice() };
    const reduced = this.opts.reducedMotion;
    const pos = (id?: string): { x: number; y: number } | null => {
      if (!id) return null;
      const p = this.vv.get(id);
      return p ? { x: p.tx, y: p.ty - 10 } : null;
    };
    const tilePos = (e: GameEvent): { x: number; y: number } | null => (e.tile ? { x: (e.tile[0] + 0.5) * TS, y: (e.tile[1] + 0.5) * TS } : null);
    let delay = 200;
    let n = 0;
    let focus: { x: number; y: number } | null = null;
    const add = (ef: Omit<Effect, 't0'> & { delay?: number }) => {
      const { delay: dl, ...rest } = ef;
      this.effects.push({ ...rest, t0: now + (dl ?? delay) });
    };
    for (const e of events) {
      if (n > 40) break;
      switch (e.code) {
        case 'BELIEF_SHIFT':
        case 'BELIEVER_GAINED':
        case 'BELIEVER_LOST': {
          const a = pos(e.actor);
          const b = pos(e.target);
          if (a && b && a !== b && n < 26) {
            const bad = e.code === 'BELIEVER_LOST' || e.reason === 'DISTRUST_REVERSAL';
            add({ kind: 'pulse', x: a.x, y: a.y, x2: b.x, y2: b.y, dur: reduced ? 200 : 900, color: bad ? '#9fb2cc' : e.code === 'BELIEVER_GAINED' ? C.gold : '#e6c97a' });
            if (e.code === 'BELIEVER_GAINED') add({ kind: 'float', x: b.x, y: b.y - 18, dur: 1200, color: C.gold, text: '✦ believes', delay: delay + 700 });
            delay += reduced ? 20 : 90;
            n++;
          }
          break;
        }
        case 'RIVAL_CAMPAIGN':
        case 'RIVAL_REBUTTAL': {
          const a = pos(e.actor);
          const b = pos(e.target);
          if (a && b) add({ kind: 'pulse', x: a.x, y: a.y, x2: b.x, y2: b.y, dur: 1000, color: C.violet });
          else if (a) add({ kind: 'ring', x: a.x, y: a.y, dur: 1000, color: C.violet, r: 60 });
          break;
        }
        case 'EVIDENCE_STAGED':
        case 'RITUAL': {
          const p = tilePos(e);
          if (p) add({ kind: 'ring', x: p.x, y: p.y, dur: 1100, color: C.gold, r: 80 });
          break;
        }
        case 'LAW_ACTIVATED': {
          const law = s.laws.find((l) => l.id === e.law);
          const p = law ? this.lawCenter(law.claimId, law.regionId) : null;
          if (p) {
            add({ kind: 'ring', x: p.x, y: p.y, dur: 1600, color: C.gold, r: 150, delay: delay + 200 });
            add({ kind: 'ring', x: p.x, y: p.y, dur: 1900, color: '#fff3d1', r: 110, delay: delay + 450 });
            add({ kind: 'flash', x: 0, y: 0, dur: 900, color: 'rgba(242,184,75,0.35)', delay: delay + 200 });
            focus = p;
          }
          break;
        }
        case 'HOME_SPARED':
        case 'FIELD_SPARED': {
          const p = tilePos(e);
          if (p) add({ kind: 'ring', x: p.x, y: p.y, dur: 1200, color: C.emerald, r: 46, delay: delay + 500 });
          break;
        }
        case 'BRIDGE_HELD': {
          const br = s.world.landmarks.find((l) => l.kind === 'bridge');
          if (br) add({ kind: 'ring', x: (br.x + 0.5) * TS, y: (br.y + 0.5) * TS, dur: 1400, color: C.gold, r: 90, delay: delay + 400 });
          break;
        }
        case 'DEATH': {
          const p = pos(e.target);
          if (p) add({ kind: 'ring', x: p.x, y: p.y + 8, dur: 1500, color: '#6b7a99', r: 36, delay: delay + 600 });
          break;
        }
        case 'FIRE_STARTED':
        case 'FIRE_SPREAD':
        case 'FIELD_BURNED': {
          const p = tilePos(e);
          if (p) add({ kind: 'spark', x: p.x, y: p.y, dur: 1400, color: C.ember, delay: delay + 300 });
          break;
        }
        case 'BRIDGE_COLLAPSED': {
          const br = s.world.landmarks.find((l) => l.kind === 'bridge');
          if (br) {
            add({ kind: 'spark', x: (br.x + 0.5) * TS, y: (br.y + 0.5) * TS, dur: 1600, color: '#8a6a44', delay: delay + 400 });
            focus = { x: (br.x + 0.5) * TS, y: (br.y + 0.5) * TS };
          }
          break;
        }
        case 'RAIN_DISPLACED': {
          add({ kind: 'flash', x: 0, y: 0, dur: 800, color: 'rgba(80,150,220,0.22)', delay: delay + 200 });
          break;
        }
      }
    }
    if (focus && !reduced && this.W >= 500) this.focusTile(focus.x / TS - 0.5, focus.y / TS - 0.5, Math.max(this.cam.zoom, 1.0), true);
    void prev;
    this.dirty = true;
  }

  private lawCenter(claimId: string, regionId: string): { x: number; y: number } | null {
    const s = this.state;
    if (!s) return null;
    let def;
    try {
      def = claimDef(s, claimId);
    } catch {
      return null;
    }
    const k = def.spec.trigger.kind;
    const pts: Landmark[] = s.world.landmarks.filter((l) => (k === 'lit_beacon' && l.kind === 'beacon' && l.lit) || (k === 'watchers' && l.kind === 'bridge') || (k === 'bell' && l.kind === 'belltower') || (k === 'smoke_fire' && l.kind === 'campfire' && l.lit));
    if (pts.length) {
      const x = pts.reduce((a, l) => a + l.x, 0) / pts.length;
      const y = pts.reduce((a, l) => a + l.y, 0) / pts.length;
      return { x: (x + 0.5) * TS, y: (y + 0.5) * TS };
    }
    const r = s.world.regions.find((q) => q.id === regionId);
    if (r) {
      const q = r.rects[0];
      return { x: ((q[0] + q[2]) / 2 + 0.5) * TS, y: ((q[1] + q[3]) / 2 + 0.5) * TS };
    }
    return null;
  }

  // ------------------------------------------------------------ frame
  private tick(): void {
    const now = performance.now();
    const t = (now - this.t0) / 1000;
    let anim = false;
    if (this.camAnim) {
      const p = ease((now - this.camAnim.t0) / this.camAnim.dur);
      const { from, to } = this.camAnim;
      this.cam.cx = from.cx + (to.cx - from.cx) * p;
      this.cam.cy = from.cy + (to.cy - from.cy) * p;
      this.cam.zoom = from.zoom + (to.zoom - from.zoom) * p;
      this.clampCam();
      if (p >= 1) this.camAnim = null;
      anim = true;
    }
    for (const v of this.vv.values()) {
      const dx = v.tx - v.x;
      const dy = v.ty - v.y;
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
        const k = this.opts.reducedMotion ? 1 : 0.06;
        v.x += dx * k;
        v.y += dy * k;
        anim = true;
      }
    }
    this.effects = this.effects.filter((e) => now < e.t0 + e.dur);
    if (this.effects.length) anim = true;
    if (this.floodAnim) {
      if (now - this.floodAnim.t0 > 9000) this.floodAnim = null;
      anim = true;
    }
    const idle = !this.opts.reducedMotion;
    const minGap = anim ? 0 : idle ? 55 : 1e9;
    if (!this.dirty && !anim && now - this.lastDraw < minGap) return;
    if (!this.state) return;
    if (this.opts.quality === 'low' && now - this.lastDraw < 33) return;
    this.dirty = false;
    this.lastDraw = now;
    this.draw(t, now);
    this.frames++;
    if (now - this.fpsT > 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.frames = 0;
      this.fpsT = now;
    }
  }

  private ensureTerrain(): void {
    const s = this.state!;
    if (this.terrain) return;
    const S = 2;
    const cv = document.createElement('canvas');
    cv.width = s.world.w * TS * S;
    cv.height = s.world.h * TS * S;
    const g = cv.getContext('2d')!;
    g.scale(S, S);
    const w = s.world;
    for (let y = 0; y < w.h; y++)
      for (let x = 0; x < w.w; x++) {
        const i = y * w.w + x;
        const t = w.terrain[i];
        const el = w.elev[i];
        const n = nz(x, y, 1);
        const n2 = nz(x, y, 2);
        let col: string;
        switch (t) {
          case 1:
            col = hsl(207, 55, 26 + n * 3);
            break;
          case 2:
            col = hsl(28, 32, 27 + n * 3);
            break;
          case 3:
            col = hsl(78, 22, 38 + el * 1.2 + n * 3);
            break;
          case 4:
            col = hsl(135, 30, 18 + n * 3);
            break;
          case 5:
            col = hsl(38, 30, 50 + n * 3);
            break;
          case 6:
            col = hsl(210, 6, 44 + n * 4);
            break;
          case 7:
            col = hsl(110, 20, 28 + n * 3);
            break;
          case 8:
            col = hsl(44, 40, 62 + n * 3);
            break;
          default:
            col = hsl(96, 32, 31 + el * 1.1 + n * 3);
        }
        g.fillStyle = col;
        g.fillRect(x * TS, y * TS, TS, TS);
        if (t === 0 || t === 3 || t === 4) {
          g.strokeStyle = 'rgba(255,255,255,0.06)';
          g.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            const gx = x * TS + nz(x, y, 10 + k) * TS;
            const gy = y * TS + nz(x, y, 20 + k) * TS;
            g.beginPath();
            g.moveTo(gx, gy);
            g.lineTo(gx + 1.5, gy - 4);
            g.stroke();
          }
          if (t === 0 && n2 > 0.93) {
            g.fillStyle = n > 0.5 ? '#f2d16b' : '#e8a0b4';
            g.beginPath();
            g.arc(x * TS + n * 26 + 3, y * TS + n2 * 22 + 5, 1.6, 0, Math.PI * 2);
            g.fill();
          }
        }
        if (t === 5) {
          g.fillStyle = 'rgba(70,50,30,0.15)';
          g.fillRect(x * TS, y * TS + 12, TS, 8);
        }
        if (t === 2) {
          g.strokeStyle = 'rgba(0,0,0,0.12)';
          for (let k = 0; k < 4; k++) {
            g.beginPath();
            g.moveTo(x * TS, y * TS + 4 + k * 8);
            g.lineTo(x * TS + TS, y * TS + 4 + k * 8);
            g.stroke();
          }
        }
        if (w.burned[i]) {
          g.fillStyle = 'rgba(20,14,10,0.7)';
          g.fillRect(x * TS, y * TS, TS, TS);
          g.fillStyle = 'rgba(90,60,40,0.5)';
          g.fillRect(x * TS + 4, y * TS + 8, 10, 5);
        }
      }
    // soft shore: darken land tiles next to river, lighten river edge
    for (let y = 0; y < w.h; y++)
      for (let x = 0; x < w.w; x++) {
        const i = y * w.w + x;
        if (w.terrain[i] !== 1) continue;
        for (const dx of [-1, 1]) {
          const nx = x + dx;
          if (nx < 0 || nx >= w.w || w.terrain[y * w.w + nx] === 1) continue;
          g.fillStyle = 'rgba(90,70,40,0.55)';
          g.fillRect(dx < 0 ? x * TS : x * TS + TS - 5, y * TS, 5, TS);
        }
      }
    this.terrain = cv;
  }

  private draw(t: number, now: number): void {
    const s = this.state!;
    const g = this.g;
    const w = s.world;
    const reduced = this.opts.reducedMotion;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0b1220';
    g.fillRect(0, 0, this.W, this.H);
    g.save();
    g.translate(this.W / 2, this.H / 2);
    g.scale(this.cam.zoom, this.cam.zoom);
    g.translate(-this.cam.cx, -this.cam.cy);
    this.ensureTerrain();
    g.imageSmoothingEnabled = true;
    g.drawImage(this.terrain!, 0, 0, w.w * TS, w.h * TS);

    // river animation
    const th = s.threat[Math.min(s.day, s.threat.length) - 1];
    const level = th?.level ?? 0;
    for (let y = 0; y < w.h; y++)
      for (let x = 0; x < w.w; x++) {
        if (w.terrain[y * w.w + x] !== 1) continue;
        const px = x * TS;
        const py = y * TS;
        g.fillStyle = `rgba(${40 + level * 6},${110 + level * 4},${170},0.55)`;
        g.fillRect(px, py, TS, TS);
        if (!reduced) {
          g.strokeStyle = 'rgba(190,230,255,0.28)';
          g.lineWidth = 1.2;
          for (let k = 0; k < 2; k++) {
            const off = (t * (14 + level * 3) + k * 15 + nz(x, y, 5) * 20) % TS;
            g.beginPath();
            g.moveTo(px + 4 + k * 9, py + off);
            g.quadraticCurveTo(px + 11 + k * 9, py + off - 3, px + 17 + k * 9, py + off);
            g.stroke();
          }
        }
      }

    // fields under sprites
    for (const l of w.landmarks) if (l.kind === 'field') drawField(g, l, reduced ? 0 : t);

    // forecast overlay
    const fa = this.floodAnim;
    if (fa) {
      const p = ease((now - fa.t0) / 1800);
      const fade = 1 - ease((now - fa.t0 - 4200) / 3500);
      this.drawWater(fa.water, p * fade, t, false);
    } else if (this.opts.showFlood && this.opts.forecast && s.phase === 'planning') {
      this.drawWater(this.opts.forecast, 1, t, true);
    }

    // law zones
    this.drawLawZones(t);

    // bridge
    for (const l of w.landmarks) if (l.kind === 'bridge') drawBridge(g, l, t, l.data.watchers ?? 0);

    // sorted drawables
    type D = { y: number; f: () => void };
    const list: D[] = [];
    const occ = new Map<string, number>();
    for (const v of s.villagers) if (v.status !== 'dead') occ.set(v.place, (occ.get(v.place) ?? 0) + 1);
    const fireAt = (x: number, y: number) => w.fire[y * w.w + x] > 0;
    for (const l of w.landmarks) {
      const x = l.x * TS;
      const y = l.y * TS;
      const wetDepth = this.floodAnim ? Math.round(w.water[l.y * w.w + l.x] * ease((now - this.floodAnim.t0) / 1800)) : 0;
      switch (l.kind) {
        case 'home':
          list.push({ y: y + TS, f: () => drawHome(g, l, x, y, t, fireAt(l.x, l.y), wetDepth) });
          break;
        case 'cabin':
          list.push({ y: y + TS, f: () => drawCabin(g, l, x, y) });
          break;
        case 'mill':
          list.push({ y: y + TS, f: () => drawMill(g, x, y, reduced ? 0 : t) });
          break;
        case 'market':
          list.push({ y: y + TS, f: () => drawMarket(g, x, y) });
          break;
        case 'hall':
          list.push({ y: y + TS, f: () => drawHall(g, x, y) });
          break;
        case 'chapel':
          list.push({ y: y + TS, f: () => drawChapel(g, x, y, l.id.startsWith('green')) });
          break;
        case 'belltower':
          list.push({ y: y + TS, f: () => drawBellTower(g, x, y, reduced ? 0 : t, (l.data.ringing ?? 0) > 0 || this.hasRecent('RITUAL_BELL')) });
          break;
        case 'beacon':
          list.push({ y: y + TS, f: () => drawBeacon(g, l, x, y, reduced ? 0 : t) });
          break;
        case 'shelter':
          list.push({ y: y + TS, f: () => drawShelter(g, l, x, y, occ.get(l.id) ?? 0) });
          break;
      }
    }
    for (let ty = 0; ty < w.h; ty++)
      for (let tx = 0; tx < w.w; tx++) {
        if (w.terrain[ty * w.w + tx] === 4 && !w.burned[ty * w.w + tx]) {
          const k = nz(tx, ty, 7);
          list.push({ y: ty * TS + TS - 2 + k, f: () => drawTree(g, tx * TS, ty * TS, k > 0.5 ? 1 : 0) });
        } else if (w.terrain[ty * w.w + tx] === 3 && nz(tx, ty, 8) > 0.82) {
          list.push({ y: ty * TS + TS - 2, f: () => drawTree(g, tx * TS, ty * TS, 0, true) });
        }
      }
    // fire
    for (let i = 0; i < w.fire.length; i++) {
      if (w.fire[i] <= 0) continue;
      const fx = (i % w.w) * TS + 16;
      const fy = Math.floor(i / w.w) * TS + 26;
      list.push({ y: fy + 20, f: () => { flame(g, fx - 6, fy, reduced ? 0 : t, 1.1); flame(g, fx + 7, fy - 3, reduced ? 0 : t + 1, 0.9); } });
    }
    const sel = this.opts.selection;
    for (const v of s.villagers) {
      const p = this.vv.get(v.id);
      if (!p) continue;
      const moving = Math.abs(p.tx - p.x) > 0.6 || Math.abs(p.ty - p.y) > 0.6;
      const conv = this.opts.activeClaim ? v.beliefs[this.opts.activeClaim]?.conv ?? 0 : null;
      list.push({
        y: p.y,
        f: () => {
          drawVillager(g, {
            v, x: p.x, y: p.y, moving: moving && !reduced, t: reduced ? 0 : t,
            selected: sel?.kind === 'villager' && sel.id === v.id,
            hovered: this.hover?.kind === 'villager' && this.hover.id === v.id,
            ringConv: v.status === 'dead' ? null : conv,
            ringKnown: this.opts.known.has(v.id) || conv === 0,
            hint: this.opts.hints.includes(v.id),
          });
        },
      });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.f();

    // risk markers on homes at risk
    if (this.opts.showFlood && this.opts.forecast && s.phase === 'planning' && !this.floodAnim) {
      for (const l of w.landmarks) {
        if (l.kind !== 'home' || l.hp <= 0) continue;
        const d = this.opts.forecast[l.y * w.w + l.x];
        if (d >= 1) {
          g.fillStyle = d >= 2 ? 'rgba(229,88,106,0.95)' : 'rgba(242,184,75,0.95)';
          g.beginPath();
          const cx = l.x * TS + 16;
          const cy = l.y * TS - 16 + Math.sin(t * 3 + l.x) * (reduced ? 0 : 1.5);
          g.moveTo(cx, cy + 9);
          g.lineTo(cx - 6, cy - 2);
          g.lineTo(cx + 6, cy - 2);
          g.closePath();
          g.fill();
          g.fillStyle = '#0e1626';
          g.font = '800 8px system-ui';
          g.textAlign = 'center';
          g.fillText(String(d), cx, cy + 6);
        }
      }
    }

    if (this.opts.lens === 'social') this.drawLens(t);
    this.drawEffects(now);

    // labels
    const labelAll = this.labelsOn && this.cam.zoom >= 1.15;
    for (const v of s.villagers) {
      const p = this.vv.get(v.id);
      if (!p) continue;
      const isSel = sel?.kind === 'villager' && sel.id === v.id;
      const isHover = this.hover?.kind === 'villager' && this.hover.id === v.id;
      if (labelAll || isSel || isHover || this.opts.hints.includes(v.id)) drawLabel(g, v.name.split(' ')[0] + (v.status === 'dead' ? ' †' : ''), p.x, p.y - 34, isSel ? C.gold : '#f4ecd8');
    }
    if (this.hover?.kind === 'landmark') {
      const l = w.landmarks.find((x) => x.id === this.hover!.id);
      if (l) drawLabel(g, l.name, (l.x + 0.5) * TS, l.y * TS - 20);
    }
    if (sel?.kind === 'landmark') {
      const l = w.landmarks.find((x) => x.id === sel.id);
      if (l) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.setLineDash([5, 4]);
        g.strokeRect(l.x * TS + 1, l.y * TS - 4, TS - 2, TS + 3);
        g.setLineDash([]);
        drawLabel(g, l.name, (l.x + 0.5) * TS, l.y * TS - 22, C.gold);
      }
    }
    // rain
    if (th && th.rain > 0 && !reduced && this.opts.quality === 'high') {
      g.strokeStyle = 'rgba(190,215,240,0.35)';
      g.lineWidth = 1;
      const n = 30 + th.rain * 22;
      const mw = w.w * TS;
      const mh = w.h * TS;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const sx = ((nz(i, 1, this.rainSeed) * mw + t * 60) % mw);
        const sy = ((nz(i, 2, this.rainSeed) * mh + t * 330) % mh);
        g.moveTo(sx, sy);
        g.lineTo(sx - 3, sy + 10);
      }
      g.stroke();
    }
    g.restore();

    // screen-space: vignette, night wash, flashes
    const vg = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.45, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.8);
    vg.addColorStop(0, 'rgba(8,12,24,0)');
    vg.addColorStop(1, 'rgba(8,12,24,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, this.W, this.H);
    if (this.floodAnim) {
      const k = (now - this.floodAnim.t0) / 1000;
      const night = k < 1.2 ? k / 1.2 : Math.max(0, 1 - (k - 1.2) / 2.2);
      if (night > 0 && !reduced) {
        g.fillStyle = `rgba(10,16,40,${0.42 * night})`;
        g.fillRect(0, 0, this.W, this.H);
      }
    } else if (th && th.level >= 4 && s.phase === 'planning') {
      g.fillStyle = 'rgba(24,30,60,0.12)';
      g.fillRect(0, 0, this.W, this.H);
    }
    for (const e of this.effects) {
      if (e.kind !== 'flash' || reduced) continue;
      const p = (now - e.t0) / e.dur;
      if (p < 0 || p > 1) continue;
      g.fillStyle = e.color;
      g.globalAlpha = Math.sin(p * Math.PI);
      g.fillRect(0, 0, this.W, this.H);
      g.globalAlpha = 1;
    }
  }

  private recentBell = 0;
  private hasRecent(_k: string): boolean {
    return this.recentBell > performance.now();
  }

  private drawWater(depths: number[], amount: number, t: number, forecast: boolean): void {
    const s = this.state!;
    const g = this.g;
    const w = s.world;
    if (amount <= 0.01) return;
    for (let i = 0; i < depths.length; i++) {
      const d = depths[i];
      if (d <= 0 || w.terrain[i] === 1) continue;
      const x = (i % w.w) * TS;
      const y = Math.floor(i / w.w) * TS;
      const a = Math.min(0.7, 0.28 + d * 0.1) * amount;
      if (forecast) {
        g.fillStyle = d >= 2 ? `rgba(60,110,200,${a * 0.75})` : `rgba(90,160,230,${a * 0.65})`;
        g.fillRect(x, y, TS, TS);
        g.strokeStyle = d >= 2 ? 'rgba(200,225,255,0.5)' : 'rgba(200,225,255,0.3)';
        g.lineWidth = 1;
        g.beginPath();
        for (let k = -TS; k < TS; k += 8) {
          g.moveTo(x + Math.max(0, k), y + Math.max(0, -k));
          g.lineTo(x + Math.min(TS, k + TS), y + Math.min(TS, TS - k));
        }
        g.stroke();
      } else {
        g.fillStyle = `rgba(50,120,205,${a})`;
        g.fillRect(x, y, TS, TS);
        if (this.opts.reducedMotion) continue;
        g.strokeStyle = `rgba(210,235,255,${0.35 * amount})`;
        g.lineWidth = 1;
        const off = (t * 10 + nz(i, 3, 1) * TS) % TS;
        g.beginPath();
        g.moveTo(x + 3, y + off);
        g.quadraticCurveTo(x + 14, y + off - 3, x + 28, y + off);
        g.stroke();
      }
    }
  }

  private drawLawZones(t: number): void {
    const s = this.state!;
    const g = this.g;
    for (const law of s.laws) {
      if (law.status === 'dormant') continue;
      let def;
      try {
        def = claimDef(s, law.claimId);
      } catch {
        continue;
      }
      const live = law.status === 'active' || law.status === 'wavering';
      const k = def.spec.trigger.kind;
      const srcs = s.world.landmarks.filter((l) => (k === 'lit_beacon' && l.kind === 'beacon' && l.lit && (law.regionId === 'river' || l.district === law.regionId)) || (k === 'smoke_fire' && l.kind === 'campfire' && l.lit));
      const radius = def.spec.radius;
      if (radius > 0) {
        for (const l of srcs) {
          const cx = (l.x + 0.5) * TS;
          const cy = (l.y + 0.5) * TS;
          const r = (radius + 0.5) * TS;
          const gr = g.createRadialGradient(cx, cy, 4, cx, cy, r);
          gr.addColorStop(0, live ? 'rgba(242,184,75,0.22)' : 'rgba(242,184,75,0.08)');
          gr.addColorStop(1, 'rgba(242,184,75,0)');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = live ? 'rgba(242,184,75,0.75)' : 'rgba(242,184,75,0.35)';
          g.lineWidth = live ? 2 : 1.2;
          g.setLineDash([6, 6]);
          g.lineDashOffset = this.opts.reducedMotion ? 0 : -t * 14;
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
        }
      }
      if (k === 'watchers' && live) {
        const br = s.world.landmarks.find((l) => l.kind === 'bridge' && l.hp > 0);
        if (br) {
          g.strokeStyle = 'rgba(242,184,75,0.6)';
          g.lineWidth = 2;
          g.setLineDash([6, 5]);
          g.strokeRect(br.tiles[0][0] * TS - 4, br.y * TS - 2, br.tiles.length * TS + 8, TS + 4);
          g.setLineDash([]);
        }
      }
    }
  }

  private drawLens(t: number): void {
    const s = this.state!;
    const g = this.g;
    const sel = this.opts.selection;
    const alive = s.villagers.filter((v) => v.status !== 'dead');
    for (const e of s.edges) {
      const a = alive.find((v) => v.id === e.a);
      const b = alive.find((v) => v.id === e.b);
      const pa = a && this.vv.get(a.id);
      const pb = b && this.vv.get(b.id);
      if (!a || !b || !pa || !pb) continue;
      const focus = sel?.kind === 'villager' && (sel.id === a.id || sel.id === b.id);
      const dim = sel?.kind === 'villager' && !focus;
      const mean = (e.ab + e.ba) / 2;
      g.strokeStyle = trustColor(mean, dim ? 0.12 : focus ? 0.95 : 0.4);
      g.lineWidth = (focus ? 2.2 : 1.2) + e.rate * 1.4;
      g.setLineDash(mean < 0 ? [3, 4] : []);
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2 - 18 - Math.abs(pa.x - pb.x) * 0.06;
      g.beginPath();
      g.moveTo(pa.x, pa.y - 10);
      g.quadraticCurveTo(mx, my, pb.x, pb.y - 10);
      g.stroke();
      g.setLineDash([]);
      if (focus) {
        const other = sel!.id === a.id ? b : a;
        const trustOfOther = sel!.id === a.id ? e.ab : e.ba;
        void other;
        g.fillStyle = 'rgba(14,22,38,0.88)';
        g.beginPath();
        g.arc(mx, my + 5, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = trustOfOther >= 0 ? '#9be3c0' : '#ff9aa8';
        g.font = '700 9px system-ui';
        g.textAlign = 'center';
        g.fillText(String(Math.round(trustOfOther)), mx, my + 8);
      }
    }
    void t;
  }

  private drawEffects(now: number): void {
    const g = this.g;
    const reduced = this.opts.reducedMotion;
    for (const e of this.effects) {
      const p = (now - e.t0) / e.dur;
      if (p < 0 || p > 1) continue;
      switch (e.kind) {
        case 'pulse': {
          const q = ease(p);
          const x = e.x + (e.x2! - e.x) * q;
          const y = e.y + (e.y2! - e.y) * q - Math.sin(q * Math.PI) * 14;
          g.strokeStyle = e.color;
          g.globalAlpha = 0.5 * (1 - p);
          g.lineWidth = 2;
          g.setLineDash([2, 5]);
          g.beginPath();
          g.moveTo(e.x, e.y);
          g.lineTo(x, y);
          g.stroke();
          g.setLineDash([]);
          g.globalAlpha = 1;
          const glow = g.createRadialGradient(x, y, 0, x, y, 12);
          glow.addColorStop(0, e.color);
          glow.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = glow;
          g.beginPath();
          g.arc(x, y, 12, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(x, y, 2.4, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'ring': {
          const r = (e.r ?? 60) * ease(p);
          g.strokeStyle = e.color;
          g.globalAlpha = (1 - p) * 0.9;
          g.lineWidth = 3 * (1 - p) + 1;
          g.beginPath();
          g.ellipse(e.x, e.y, r, r * 0.62, 0, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'float': {
          g.font = '700 11px system-ui';
          g.textAlign = 'center';
          g.fillStyle = e.color;
          g.globalAlpha = 1 - p * p;
          g.fillText(e.text ?? '', e.x, e.y - p * 16);
          g.globalAlpha = 1;
          break;
        }
        case 'spark': {
          if (reduced) break;
          for (let i = 0; i < 8; i++) {
            const a = i * 0.8 + nz(i, 1, 3) * 2;
            const d = 24 * ease(p) * (0.5 + nz(i, 2, 3));
            g.fillStyle = e.color;
            g.globalAlpha = 1 - p;
            g.beginPath();
            g.arc(e.x + Math.cos(a) * d, e.y - Math.abs(Math.sin(a)) * d - p * 10, 2.2, 0, Math.PI * 2);
            g.fill();
          }
          g.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    }
  }

  /** Sound-effect hook so the bell animates when the Keeper rings it. */
  noteBell(): void {
    this.recentBell = performance.now() + 1800;
    this.dirty = true;
  }

  stats(): { fps: number; effects: number; zoom: number } {
    return { fps: this.fps, effects: this.effects.length, zoom: Math.round(this.cam.zoom * 100) / 100 };
  }
}
