import * as THREE from 'three';
import { fbm, makeNoise, rng, type Rng } from './rand.ts';
import type { TerrainData } from './terrain.ts';

/**
 * The diorama's cut edge: the four faces where the plate is cut through its ground, and the craggy root of rock it hangs from.
 *
 * The faces are painted, not shaded with a few colours: a turf lip with grass hanging over it, dark topsoil threaded with roots and
 * pebbles, clay, bedded sandstone and cracked grey rock, on a canvas made here from the seed (no image files). The geometry has relief
 * to match: the turf overhangs, the soil is tucked in under it, and the rock juts out in ledges. Earlier the faces were seven bands of
 * vertex colour, which the GPU smeared into one soft gradient; on a real GPU at full resolution the plate's side read as a slice of
 * cake (`docs/3D_QUALITY_REPORT.md`, iteration 8).
 */

/** the plate is cut down to here; below it the island narrows to a root of rock */
export const PLATE_BASE = -1.6;

const TEX_W = 1024;
const TEX_H = 320;
/** about this many world units of the plate's rim per repeat of the painted face (adjusted so whole repeats go round) */
const REPEAT = 7;
/** turf and topsoil are this deep everywhere; the layers below share whatever height the face has left down to the base */
const SOIL = 0.36;
/** where each layer starts on the painted face (v, 0 at the top), and so on the wall */
const LAYER = { soil: 0.05, clay: 0.24, sand: 0.5, rock: 0.66 } as const;

type RGB = [number, number, number];
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const PAL = {
  turf: hex(0x557236), turfLight: hex(0x7b9748), turfDark: hex(0x3c5527),
  soil: hex(0x4a3524), soilDark: hex(0x34251a), root: hex(0x9a7a52),
  clay: hex(0x7c5a39), clayLight: hex(0x93704a),
  sand: hex(0xab8f62), sandLine: hex(0x8a7150),
  rock: hex(0x7a766c), rockLight: hex(0x939083), rockDark: hex(0x58554e),
  pebble: hex(0xa59a86),
};

/** where a layer boundary runs across the face, in pixels from the top: a few waves of whole periods, so the face repeats seamlessly */
function boundary(r: Rng, v: number, wave: number): (x: number) => number {
  const parts = [2, 5, 11, 23].map((f, i) => ({ f, a: (wave * (1 + r())) / (1 + i * 1.6), p: r() * Math.PI * 2 }));
  return (x) => v * TEX_H + parts.reduce((s, q) => s + q.a * Math.sin((q.f * 2 * Math.PI * x) / TEX_W + q.p), 0);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c: RGB, k = 1, a = 1): string => `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;

/** the painted face: turf, topsoil with roots, clay, sandstone, rock; top to bottom, repeating left to right */
function paintFace(seed: number): HTMLCanvasElement {
  const W = TEX_W;
  const H = TEX_H;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable for the plate edge');
  const r = rng(seed);
  const nA = makeNoise(seed ^ 0x2545f491);
  const nB = makeNoise(seed ^ 0x68e31da4);
  // noise that repeats across the face: blended with its own copy one width along
  const wrap = (n: (x: number, y: number) => number, f: number, x: number, y: number): number => {
    const t = x / W;
    return n(x * f, y * f) * (1 - t) + n((x - W) * f, y * f) * t;
  };
  const bSoil = boundary(r, LAYER.soil, 2.2);
  const bClay = boundary(r, LAYER.clay, 5);
  const bSand = boundary(r, LAYER.sand, 7);
  const bRock = boundary(r, LAYER.rock, 6);
  const cols = Array.from({ length: W }, (_, x) => [bSoil(x), bClay(x), bSand(x), bRock(x)]);
  const img = g.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [ys, yc, yd, yr] = cols[x];
      let c0: RGB;
      let k: number;
      const grain = wrap(nA, 0.35, x, y);
      if (y < ys) {
        // turf: blades, streaked up and down
        const blade = wrap(nB, 0.5, x, y * 0.2);
        c0 = blade > 0.55 ? PAL.turfLight : blade < 0.35 ? PAL.turfDark : PAL.turf;
        k = 0.9 + 0.2 * grain;
      } else if (y < yc) {
        // topsoil: dark and crumbly, darker still just under the turf
        c0 = grain > 0.62 ? PAL.soilDark : PAL.soil;
        k = 0.82 + 0.3 * wrap(nB, 0.6, x, y) - 0.25 * Math.max(0, 1 - (y - ys) / 10);
      } else if (y < yd) {
        // clay: long horizontal streaks
        const streak = wrap(nB, 0.02, x, y * 30);
        c0 = streak > 0.55 ? PAL.clayLight : PAL.clay;
        k = 0.86 + 0.24 * grain;
      } else if (y < yr) {
        // sandstone: thin bedding lines that wander
        const bed = Math.sin(y * 0.85 + wrap(nA, 0.012, x, y) * 9);
        c0 = bed > 0.82 ? PAL.sandLine : PAL.sand;
        k = 0.88 + 0.2 * grain;
      } else {
        // rock: weathered grey in broad soft patches, split by bedding planes, each lit along its upper lip and dark underneath
        const patch = wrap(nB, 0.035, x, y * 1.6);
        const bed = Math.sin((y - yr) * 0.23 + wrap(nA, 0.01, x, y) * 6);
        c0 = patch < 0.5 ? mix(PAL.rockDark, PAL.rock, patch * 2) : mix(PAL.rock, PAL.rockLight, (patch - 0.5) * 2);
        k = 0.86 + 0.22 * grain + (bed > 0.95 ? -0.38 : bed > 0.85 ? 0.1 : 0);
      }
      // each boundary: a shadow line above it (the layer above overhangs) and a lit edge below it
      for (const yb of [ys, yc, yd, yr]) {
        const d = y - yb;
        if (d > -3 && d <= 0) k *= 0.62 + 0.12 * (d + 3);
        else if (d > 0 && d < 2) k *= 1.12;
      }
      const o = (y * W + x) * 4;
      px[o] = Math.min(255, c0[0] * k);
      px[o + 1] = Math.min(255, c0[1] * k);
      px[o + 2] = Math.min(255, c0[2] * k);
      px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // everything drawn from here is drawn again one width to either side, so features crossing the seam continue on the other side
  const wrapped = (x: number, draw: (dx: number) => void): void => {
    draw(0);
    if (x < 60) draw(W);
    if (x > W - 60) draw(-W);
  };
  const ys = (x: number): number[] => cols[Math.max(0, Math.min(W - 1, Math.floor(((x % W) + W) % W)))];
  g.lineCap = 'round';
  // the rock's joints: dark cracks with a lit lip on one side
  for (let i = 0; i < 42; i++) {
    const x0 = r() * W;
    wrapped(x0, (dx) => {
      const top = ys(x0)[3] + 3 + r() * 8;
      g.beginPath();
      let x = x0 + dx;
      g.moveTo(x, top);
      for (let y = top; y < H; y += 8 + r() * 10) {
        x += (r() - 0.5) * 6;
        g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(38,36,32,0.7)';
      g.lineWidth = 1.6;
      g.stroke();
      g.translate(1.4, 0);
      g.strokeStyle = 'rgba(205,198,182,0.22)';
      g.lineWidth = 1;
      g.stroke();
      g.translate(-1.4, 0);
    });
  }
  // a few long partings across the rock
  for (let i = 0; i < 3; i++) {
    const level = r();
    g.beginPath();
    for (let x = -4; x <= W + 4; x += 8) {
      const y = ys(x)[3] + 8 + level * (H - ys(x)[3] - 12) + Math.sin((x / W) * Math.PI * 2 * (2 + i)) * 4;
      if (x === -4) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(42,40,36,0.55)';
    g.lineWidth = 1.4;
    g.stroke();
  }
  // pebbles in the soil and the clay: a lit stone with its own shadow under it
  for (let i = 0; i < 190; i++) {
    const x = r() * W;
    const [, yc, yd] = ys(x);
    const y = ys(x)[0] + 4 + r() * (yd - ys(x)[0] - 6);
    const rx = 1.5 + r() * 3.6;
    const ry = rx * (0.55 + r() * 0.3);
    const k = 0.75 + r() * 0.45;
    wrapped(x, (dx) => {
      g.fillStyle = 'rgba(30,22,16,0.55)';
      g.beginPath();
      g.ellipse(x + dx + 0.6, y + 1.2, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rgb(PAL.pebble, y < yc ? k * 0.8 : k);
      g.beginPath();
      g.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  // roots: thin and pale, wandering down out of the turf through the topsoil, a few reaching the clay
  for (let i = 0; i < 46; i++) {
    const x0 = r() * W;
    const len = 12 + r() * (r() < 0.25 ? 70 : 34);
    wrapped(x0, (dx) => {
      let x = x0 + dx;
      let y = ys(x0)[0] - 1;
      g.beginPath();
      g.moveTo(x, y);
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const nx = x + (r() - 0.5) * 9;
        const ny = y + len / steps;
        g.quadraticCurveTo((x + nx) / 2 + (r() - 0.5) * 6, (y + ny) / 2, nx, ny);
        x = nx;
        y = ny;
      }
      g.strokeStyle = rgb(PAL.root, 0.8 + r() * 0.3, 0.75);
      g.lineWidth = 0.8 + r() * 1.3;
      g.stroke();
    });
  }
  // grass hanging over the lip, ragged
  for (let i = 0; i < 520; i++) {
    const x = r() * W;
    const y0 = ys(x)[0] - 2;
    const len = 3 + r() * r() * 16;
    const lean = (r() - 0.5) * 5;
    const tone = r();
    wrapped(x, (dx) => {
      g.beginPath();
      g.moveTo(x + dx, y0);
      g.quadraticCurveTo(x + dx + lean * 0.3, y0 + len * 0.6, x + dx + lean, y0 + len);
      g.strokeStyle = rgb(tone > 0.6 ? PAL.turfLight : tone < 0.25 ? PAL.turfDark : PAL.turf, 0.95, 0.9);
      g.lineWidth = 1 + r() * 1.2;
      g.stroke();
    });
  }
  return c;
}

export interface PlateEdge {
  group: THREE.Group;
  dispose(): void;
}

/** the plate's cut faces and the root of rock under them, for the height field `data` */
export function buildPlateEdge(data: TerrainData, seedNum: number, maxAniso: number, sub: number): PlateEdge {
  const { w, h, nx, nz, heights } = data;
  const noise = makeNoise(seedNum ^ 0x3c6ef372);
  const group = new THREE.Group();
  const face = paintFace(seedNum ^ 0x7c3e9a1d);
  const texture = new THREE.CanvasTexture(face);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = maxAniso;
  texture.needsUpdate = true;

  /**
   * Where the face ends and the root begins at a point of the rim: crags of rock hang below the cut, so its lower line is never ruled;
   * none where the river crosses it (water wears a lip back, it does not leave a crag under the falls).
   */
  const baseAt = (p: { x: number; z: number; k: number }): number => {
    const n1 = fbm(noise, p.x * 0.55 + 3.3, p.z * 0.55 - 1.1, 3);
    return PLATE_BASE - 0.04 - 0.5 * Math.max(0, n1 - 0.38) ** 1.3 * 2.4 * (1 - data.wet[p.k]);
  };
  const rim = 2 * (w + h);
  const repeats = Math.max(1, Math.round(rim / REPEAT));
  const perRepeat = rim / repeats;
  const sp: number[] = [];
  const su: number[] = [];
  const sc: number[] = [];
  const si: number[] = [];
  /**
   * One face. `edge` runs along the cut in the direction the rim is measured (`s0` is where along the rim it starts), `out` is the
   * face's outward direction. Rows go down from the ground's own edge: the turf lip, the tuck under it, the topsoil, then the deeper
   * layers spread evenly to the base. (The faces are drawn double-sided, so their winding does not matter.)
   */
  const addFace = (edge: { x: number; z: number; y: number; k: number }[], out: [number, number], s0: number): void => {
    const start = sp.length / 3;
    const len = (edge.length - 1) / sub;
    let rows = 0;
    edge.forEach((p, ci) => {
      const along = ci / sub;
      const s = s0 + along;
      // the face always reaches the base, where the root takes over; a face too short for the full soil gets a thinner one
      const depthAll = Math.max(0.3, p.y - baseAt(p));
      const soil = Math.min(SOIL, depthAll * 0.45);
      const depths = [0, 0.025, 0.06, 0.14, 0.24].map((d) => (d * soil) / SOIL);
      depths.push(soil);
      const deep = 7;
      for (let k = 1; k <= deep; k++) depths.push(soil + ((depthAll - soil) * k) / deep);
      rows = depths.length;
      // relief fades out at the corners, where two faces meet, so they always meet edge to edge
      const corner = Math.min(1, Math.min(along, len - along) / 0.6);
      // where the river crosses the cut the rock is wet: darker and a little cooler (it shows behind the falls)
      const wet = data.wet[p.k];
      depths.forEach((d, ri) => {
        const y = p.y - d;
        let off: number;
        let shade = 1;
        if (ri === 0) off = 0;
        else if (ri === 1) off = 0.045 + 0.02 * noise(s * 3.1, 1.7);
        else if (ri === 2) {
          off = -0.006;
          shade = 0.7;
        } else if (ri === rows - 1) off = 0;
        else {
          const t = Math.max(0, (d - soil) / (depthAll - soil));
          const amp = d <= soil ? 0.018 : 0.035 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.15));
          off = amp * (fbm(noise, s * 0.75, y * 1.25 + 9, 3) - 0.42) * 2.2;
          off = Math.min(0.2, Math.max(-0.04, off));
          shade = 1 + Math.max(-0.05, Math.min(0.14, off)) * 1.3 - 0.08 * t;
        }
        off *= corner;
        sp.push(p.x + out[0] * off, y, p.z + out[1] * off);
        const v = d <= soil ? (LAYER.clay * d) / soil : LAYER.clay + ((1 - LAYER.clay) * (d - soil)) / (depthAll - soil);
        su.push(s / perRepeat, 1 - v);
        const g = shade * (0.92 + 0.12 * noise(s * 1.3, ri * 0.7)) * (1 - 0.42 * wet);
        sc.push(g * (1 - 0.06 * wet), g, g * (1 + 0.08 * wet));
      });
    });
    for (let c = 0; c < edge.length - 1; c++) {
      for (let r = 0; r < rows - 1; r++) {
        const a = start + c * rows + r;
        const b = a + rows;
        const cc = a + 1;
        const d = b + 1;
        si.push(a, b, cc, b, d, cc);
      }
    }
  };
  // the rim is measured clockwise seen from above: along the north cut eastwards, down the east, back along the south, up the west
  // each point of the rim, with the index of the height-field vertex it is (`k`)
  type RimPoint = { x: number; z: number; y: number; k: number };
  const north: RimPoint[] = [];
  const south: RimPoint[] = [];
  for (let i = 0; i < nx; i++) {
    north.push({ x: i / sub, z: 0, y: heights[i], k: i });
    const ks = (nz - 1) * nx + (nx - 1 - i);
    south.push({ x: (nx - 1 - i) / sub, z: h, y: heights[ks], k: ks });
  }
  const west: RimPoint[] = [];
  const east: RimPoint[] = [];
  for (let j = 0; j < nz; j++) {
    const ke = j * nx + nx - 1;
    east.push({ x: w, z: j / sub, y: heights[ke], k: ke });
    const kw = (nz - 1 - j) * nx;
    west.push({ x: 0, z: (nz - 1 - j) / sub, y: heights[kw], k: kw });
  }
  addFace(north, [0, -1], 0);
  addFace(east, [1, 0], w);
  addFace(south, [0, 1], w + h);
  addFace(west, [-1, 0], 2 * w + h);
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
  faceGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  faceGeo.setIndex(si);
  faceGeo.computeVertexNormals();
  const faceMat = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 0.97, metalness: 0, side: THREE.DoubleSide });
  const faces = new THREE.Mesh(faceGeo, faceMat);
  faces.receiveShadow = true;
  faces.castShadow = true;
  faces.name = 'plate-edge';
  group.add(faces);

  // below the cut: the island narrows to a craggy root of rock, so the village hangs in the sky instead of resting on a slab
  const loop: RimPoint[] = [...north, ...east.slice(1), ...south.slice(1), ...west.slice(1, -1)];
  const rings: { y: number; k: number }[] = [
    { y: PLATE_BASE, k: 1 }, { y: PLATE_BASE - 0.95, k: 0.96 }, { y: PLATE_BASE - 1.7, k: 0.86 }, { y: PLATE_BASE - 2.6, k: 0.68 }, { y: PLATE_BASE - 3.6, k: 0.43 }, { y: PLATE_BASE - 4.6, k: 0.12 },
  ];
  const cx = w / 2;
  const cz = h / 2;
  const n = loop.length;
  const up: number[] = [];
  const uc: number[] = [];
  const ui: number[] = [];
  const rock = [0x58554e, 0x57524a, 0x45413c, 0x3a3733, 0x302e2b, 0x2a2826].map((c) => new THREE.Color(c));
  rings.forEach((ring, ri) => {
    loop.forEach((p, i) => {
      // crags only ever bite inwards, so the root never sticks out past the cut above it
      const bite = ri === 0 ? 0 : 1 - 0.16 * noise(p.x * 0.9 + ri * 7, p.z * 0.9 - ri * 3);
      const jy = ri === 0 ? 0 : (noise(p.x * 1.3 + ri, p.z * 1.3 - ri) - 0.5) * 0.6;
      // the top ring is the faces' own lower line, crags and all
      const y = ri === 0 ? baseAt(p) : ring.y + jy;
      up.push(cx + (p.x - cx) * ring.k * (ri === 0 ? 1 : bite), y, cz + (p.z - cz) * ring.k * (ri === 0 ? 1 : bite));
      const g = 0.82 + 0.4 * noise(i * 0.31 + ri * 3, ri * 1.7);
      const c = rock[ri];
      uc.push(c.r * g, c.g * g, c.b * g);
    });
  });
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i;
      const d = (r + 1) * n + ((i + 1) % n);
      ui.push(a, c, b, b, c, d);
    }
  }
  const rootGeo = new THREE.BufferGeometry();
  rootGeo.setAttribute('position', new THREE.Float32BufferAttribute(up, 3));
  rootGeo.setAttribute('color', new THREE.Float32BufferAttribute(uc, 3));
  rootGeo.setIndex(ui);
  const flat = rootGeo.toNonIndexed();
  rootGeo.dispose();
  flat.computeVertexNormals();
  const rootMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  const root = new THREE.Mesh(flat, rootMat);
  root.name = 'island-root';
  group.add(root);
  // the working arrays share this function's closure scope with dispose() below, which lives as long as the village: let them go now
  for (const a of [sp, su, sc, si, up, uc, ui, loop, north, south, east, west]) a.length = 0;
  return {
    group,
    dispose() {
      faceGeo.dispose();
      faceMat.dispose();
      texture.dispose();
      flat.dispose();
      rootMat.dispose();
    },
  };
}
