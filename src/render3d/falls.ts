import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLATE_BASE } from './cliff.ts';
import type { Layer, WorldContext } from './context.ts';
import { rockGeometry } from './foliage.ts';
import { Particles } from './particles.ts';
import type { Rng } from './rand.ts';
import type { SceneChanges, SceneSnapshot } from './snapshot.ts';
import { SUB, TERRAIN } from './terrain.ts';

/**
 * Where the river meets the plate's cut edge. Downstream it falls: a sheet of water pours over the lip, whitens as it drops past the
 * strata and the root, and breaks up into strands and mist above the cloud sea. Upstream it rises: a spring among boulders, so the
 * river starts somewhere instead of at a cut. Before this the water simply stopped at the cut, with the bank's notch showing under it.
 * Purely visual; the sheet's top follows the engine's water at the lip, so a flood swells it, and it runs on the river's own clock.
 */

const VERT = /* glsl */ `
  attribute float aT;
  attribute float aA;
  attribute float aQ;
  varying float vT;
  varying float vA;
  varying float vQ;
  #include <fog_pars_vertex>
  void main() {
    vT = aT;
    vA = aA;
    vQ = aQ;
    vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  varying float vT;
  varying float vA;
  varying float vQ;
  uniform float uFlowT;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform vec3 uTint;
  #include <fog_pars_fragment>
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    // streaks run down the sheet, quicker than the river runs (it is falling), on the river's own clock
    float fall = vT * 7.0 - uFlowT * 3.4;
    float s1 = vn(vec2(vQ * 6.0, fall * 0.7));
    float s2 = vn(vec2(vQ * 15.0 + 7.0, fall * 1.5 - uFlowT * 0.6));
    float streak = s1 * 0.6 + s2 * 0.4;
    // the river's own colour at the lip (as deep as the channel there); aerated to white within a few lengths of falling
    float white = smoothstep(0.02, 0.34, vT) * 0.82 + smoothstep(0.6, 0.9, streak) * 0.3 * smoothstep(0.0, 0.08, vT);
    vec3 col = mix(mix(uShallow, uDeep, 0.5), vec3(0.93, 0.96, 0.97), clamp(white, 0.0, 1.0));
    col = mix(col, uSky, 0.1) * mix(0.55, 1.0, clamp(dot(uSunColor, vec3(0.33)) * 1.6, 0.0, 1.0));
    col *= uTint;
    // a solid sheet over the lip, then strands with gaps between them, then nothing: the rest is spray and mist
    float strands = mix(1.0, smoothstep(0.3, 0.68, streak), smoothstep(0.12, 0.7, vT));
    float alpha = vA * strands * (1.0 - smoothstep(0.6, 1.0, vT)) * 0.94;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** an edge of the plate: where along it runs, and which way is out */
interface Edge {
  /** the world point at `q` along the edge (x or z), just on the cut */
  at(q: number): { x: number; z: number };
  out: [number, number];
  /** how long the edge is (q runs from 0 to this) */
  len: number;
}

/** one place the river crosses the cut: tiles a..b along the edge (inclusive) */
interface Run {
  edge: Edge;
  a: number;
  b: number;
}

interface Fall {
  run: Run;
  geo: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  /** along-the-edge coordinate of each column, and the lip height it was last built for */
  qs: number[];
  lip: number[];
  alpha: number[];
  /** the columns with water enough to throw mist */
  wet: number[];
  /** the water at the middle of the lip when the sheet was last shaped (a flood swells it) */
  level: number;
}

const ROWS = 18;
const G = 9.8;
/** where the sheet has broken up entirely: down past the root, just above the cloud sea (clouds.ts) it vanishes into */
const BOTTOM = PLATE_BASE - 5.6;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class FallsLayer implements Layer {
  readonly group = new THREE.Group();
  private falls: Fall[] = [];
  private mat: THREE.ShaderMaterial | null = null;
  private rocks: THREE.Mesh | null = null;
  private mist: Particles | null = null;
  private mistDue = 0;
  private r: Rng;
  /** the river's light, to dim the mist at night and in storm (the sheet reads the same uniforms in its shader) */
  private sun: THREE.Color | null = null;

  constructor(ctx: WorldContext) {
    this.group.name = 'falls';
    this.r = ctx.rng('falls');
  }

  update(snap: SceneSnapshot, changes: SceneChanges, ctx: WorldContext): void {
    if (changes.rebuild) {
      this.clear();
      this.build(snap, ctx);
    }
    if (changes.water || changes.rebuild) for (const f of this.falls) this.shape(f, ctx);
  }

  /** the river's crossings of the cut, along each of the four edges */
  private runs(snap: SceneSnapshot): Record<'N' | 'S' | 'W' | 'E', Run[]> {
    const { w, h } = snap;
    const river = (x: number, y: number): boolean => snap.terrain[y * w + x] === TERRAIN.RIVER;
    const edges: Record<'N' | 'S' | 'W' | 'E', { edge: Edge; n: number; tile: (i: number) => [number, number] }> = {
      N: { edge: { at: (q) => ({ x: q, z: 0 }), out: [0, -1], len: w }, n: w, tile: (i) => [i, 0] },
      S: { edge: { at: (q) => ({ x: q, z: h }), out: [0, 1], len: w }, n: w, tile: (i) => [i, h - 1] },
      W: { edge: { at: (q) => ({ x: 0, z: q }), out: [-1, 0], len: h }, n: h, tile: (i) => [0, i] },
      E: { edge: { at: (q) => ({ x: w, z: q }), out: [1, 0], len: h }, n: h, tile: (i) => [w - 1, i] },
    };
    const out = { N: [] as Run[], S: [] as Run[], W: [] as Run[], E: [] as Run[] };
    for (const k of ['N', 'S', 'W', 'E'] as const) {
      const e = edges[k];
      let start = -1;
      for (let i = 0; i <= e.n; i++) {
        const wet = i < e.n && river(...e.tile(i));
        if (wet && start < 0) start = i;
        if (!wet && start >= 0) {
          out[k].push({ edge: e.edge, a: start, b: i - 1 });
          start = -1;
        }
      }
    }
    return out;
  }

  private build(snap: SceneSnapshot, ctx: WorldContext): void {
    const runs = this.runs(snap);
    const f = ctx.water.flow;
    // the river runs south or east (water.ts): it leaves the plate on that side and rises on the other
    const down = f.x > 0.5 ? runs.E : runs.S;
    const up = f.x > 0.5 ? runs.W : runs.N;
    if (down.length) {
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      });
      // the river's own uniforms, the same objects: one clock, one colour, one light
      const shared = ctx.water.sharedUniforms();
      Object.assign(this.mat.uniforms, shared);
      this.sun = shared.uSunColor.value as THREE.Color;
      for (const run of down) this.falls.push(this.sheet(run, this.mat));
      this.mist = new Particles(Math.round(60 + 160 * ctx.profile.particles), false, true);
      this.mist.points.name = 'falls-mist';
      this.group.add(this.mist.points);
    }
    if (up.length) this.spring(up, ctx);
  }

  /** the sheet's mesh for one crossing: columns across it every quarter tile (a tile of margin each side, for a flood), rows down it */
  private sheet(run: Run, mat: THREE.ShaderMaterial): Fall {
    // (never past the plate's corner, where there is nothing for it to pour from)
    const q0 = Math.max(0, run.a - 1);
    const q1 = Math.min(run.edge.len, run.b + 2);
    const cols = (q1 - q0) * SUB + 1;
    const qs = Array.from({ length: cols }, (_, i) => q0 + i / SUB);
    const n = cols * (ROWS + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const aT = new Float32Array(n);
    const aQ = new Float32Array(n);
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k <= ROWS; k++) {
        aT[c * (ROWS + 1) + k] = k / ROWS;
        aQ[c * (ROWS + 1) + k] = qs[c];
      }
    }
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aQ', new THREE.BufferAttribute(aQ, 1));
    geo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(n), 1));
    const index: number[] = [];
    for (let c = 0; c < cols - 1; c++) {
      for (let k = 0; k < ROWS; k++) {
        const a = c * (ROWS + 1) + k;
        const b = a + ROWS + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.setIndex(index);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'waterfall';
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return { run, geo, mesh, qs, lip: qs.map(() => 0), alpha: qs.map(() => 0), wet: [], level: Number.NaN };
  }

  /** shape a sheet to the water at its lip now: its top on the surface, its width where there is water, thrown out by the current */
  private shape(fall: Fall, ctx: WorldContext): void {
    const { edge } = fall.run;
    const pos = fall.geo.getAttribute('position') as THREE.BufferAttribute;
    const alpha = fall.geo.getAttribute('aA') as THREE.BufferAttribute;
    const mid = (fall.qs[0] + fall.qs[fall.qs.length - 1]) / 2;
    const throwSpeed = 0.5 + 0.45 * ctx.water.speed;
    fall.level = this.levelAt(fall, ctx);
    fall.qs.forEach((q, c) => {
      const p = edge.at(q);
      // sampled just inside the cut, where the river's surface still is
      const ix = p.x - edge.out[0] * 0.02;
      const iz = p.z - edge.out[1] * 0.02;
      const surface = ctx.water.surfaceAt(ix, iz);
      const ground = ctx.terrain.heightAt(ix, iz);
      const depth = surface - ground;
      const top = depth > 0 ? surface : ground;
      fall.lip[c] = top;
      fall.alpha[c] = smoothstep(0.01, 0.12, depth);
      const T = Math.sqrt((2 * Math.max(1, top - BOTTOM)) / G);
      for (let k = 0; k <= ROWS; k++) {
        const t = k / ROWS;
        const tau = t * T;
        const outward = 0.012 + throwSpeed * tau;
        // the sheet spreads a little as it falls
        const along = mid + (q - mid) * (1 + 0.14 * t);
        const at = edge.at(along);
        const i = c * (ROWS + 1) + k;
        pos.setXYZ(i, at.x + edge.out[0] * outward, top - 0.5 * G * tau * tau, at.z + edge.out[1] * outward);
        alpha.setX(i, fall.alpha[c]);
      }
    });
    fall.wet = fall.qs.map((_, i) => i).filter((i) => fall.alpha[i] > 0.35);
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  /** boulders where the river rises at the upstream cut, so it springs from somewhere */
  private spring(runs: Run[], ctx: WorldContext): void {
    const r = this.r;
    const parts: THREE.BufferGeometry[] = [];
    const tones = [0x8d897d, 0x7b776c, 0x9a9585, 0x6f6c63].map((c) => new THREE.Color(c));
    const moss = new THREE.Color(0x6d7f45);
    for (const run of runs) {
      const width = run.b - run.a + 1;
      const count = Math.round(4 + width * 2.4);
      for (let i = 0; i < count; i++) {
        // across the crossing, a couple on each bank; most just inside the cut, a few on its lip
        const q = Math.min(run.edge.len - 0.2, Math.max(0.2, i < 2 ? run.a - 0.3 + i * (width + 0.6) : run.a + 0.1 + r() * (width - 0.2)));
        const inward = i < 4 ? 0.02 + r() * 0.12 : 0.15 + r() * r() * 0.85;
        const p = run.edge.at(q);
        const x = p.x - run.edge.out[0] * inward;
        const z = p.z - run.edge.out[1] * inward;
        const size = (0.14 + r() * 0.22) * (inward < 0.3 ? 1.1 : 0.8);
        const ground = ctx.terrain.heightAt(Math.max(0.01, Math.min(ctx.terrain.w - 0.01, x)), Math.max(0.01, Math.min(ctx.terrain.h - 0.01, z)));
        const surface = ctx.water.surfaceAt(x, z);
        const g = rockGeometry(r);
        g.scale(size * (0.9 + r() * 0.5), size * (0.75 + r() * 0.5), size * (0.9 + r() * 0.5));
        g.rotateY(r() * Math.PI * 2);
        g.translate(x, Math.max(ground, surface - 0.04) - size * 0.32, z);
        const tone = tones[Math.floor(r() * tones.length)];
        const col = new Float32Array(g.getAttribute('position').count * 3);
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v++) {
          // moss on the tops, darker where it stands in the water
          const c = tone.clone().lerp(moss, Math.max(0, nrm.getY(v) - 0.55) * 0.9);
          const wet = pos.getY(v) < surface ? 0.72 : 1;
          col[v * 3] = c.r * wet;
          col[v * 3 + 1] = c.g * wet;
          col[v * 3 + 2] = c.b * wet;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(g.index ? g.toNonIndexed() : g);
        if (g.index) g.dispose();
      }
    }
    if (!parts.length) return;
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) return;
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }));
    mesh.name = 'spring-rocks';
    mesh.castShadow = ctx.profile.shadow > 0;
    mesh.receiveShadow = true;
    this.rocks = mesh;
    this.group.add(mesh);
  }

  tick(dt: number, _time: number, ctx: WorldContext): void {
    // a flood rising or falling at the lip reshapes the sheet as it goes
    for (const f of this.falls) if (Math.abs(this.levelAt(f, ctx) - f.level) > 0.003) this.shape(f, ctx);
    if (!this.mist) return;
    if (!ctx.reducedMotion && this.falls.length) {
      // mist rises off the lower sheet and drifts out from the falls; more of it when the river runs hard
      this.mistDue += dt * (22 + 22 * ctx.water.speed) * this.falls.length;
      // as bright as the light on the river: white in the sun, a dim grey at night (it must not glow in the dark)
      const bright = 0.25 + 0.75 * Math.min(1, Math.max(0, ((this.sun?.r ?? 1) + (this.sun?.g ?? 1) + (this.sun?.b ?? 1)) * 0.5));
      const c0 = new THREE.Color(0.95 * bright, 0.97 * bright, 0.98 * bright);
      const c1 = new THREE.Color(0.88 * bright, 0.92 * bright, 0.95 * bright);
      while (this.mistDue >= 1) {
        this.mistDue -= 1;
        this.emitMist(c0, c1);
      }
    }
    this.mist.update(dt);
  }

  /** the water's height at the middle of a sheet's lip, now */
  private levelAt(f: Fall, ctx: WorldContext): number {
    const p = f.run.edge.at((f.run.a + f.run.b + 1) / 2);
    return ctx.water.surfaceAt(p.x - f.run.edge.out[0] * 0.02, p.z - f.run.edge.out[1] * 0.02);
  }

  private emitMist(c0: THREE.Color, c1: THREE.Color): void {
    const r = this.r;
    const f = this.falls[Math.floor(r() * this.falls.length)];
    if (!f.wet.length || !this.mist) return;
    const c = f.wet[Math.floor(r() * f.wet.length)];
    const pos = f.geo.getAttribute('position') as THREE.BufferAttribute;
    // off the lower half of the sheet, most of it where the strands give out: a broad, thin plume drifting out from the falls
    const k = Math.min(ROWS, Math.round((0.5 + r() * 0.5) * ROWS));
    const i = c * (ROWS + 1) + k;
    const o = f.run.edge.out;
    const drift = 0.25 + r() * 0.45;
    const side = (r() - 0.5) * 0.9;
    this.mist.emit(
      pos.getX(i) + o[0] * 0.15 + side * Math.abs(o[1]), pos.getY(i), pos.getZ(i) + o[1] * 0.15 + side * Math.abs(o[0]),
      o[0] * drift + side * 0.25 * Math.abs(o[1]), 0.04 + r() * 0.16, o[1] * drift + side * 0.25 * Math.abs(o[0]),
      3.5 + r() * 2.5, 1.1, 4 + r() * 3.2, c0, c1, 0.1, 0.4, 0.04,
    );
  }

  private clear(): void {
    for (const f of this.falls) {
      this.group.remove(f.mesh);
      f.geo.dispose();
    }
    this.falls = [];
    this.mat?.dispose();
    this.mat = null;
    this.sun = null;
    if (this.rocks) {
      this.group.remove(this.rocks);
      this.rocks.geometry.dispose();
      (this.rocks.material as THREE.Material).dispose();
      this.rocks = null;
    }
    if (this.mist) {
      this.group.remove(this.mist.points);
      this.mist.dispose();
      this.mist = null;
    }
  }

  dispose(): void {
    this.clear();
  }
}
