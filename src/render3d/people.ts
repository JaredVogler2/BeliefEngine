import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bridgeSpecOf, deckHeight, type BridgeSpec } from './civic.ts';
import type { Layer, WorldContext } from './context.ts';
import { engineToWorld } from './coords.ts';
import { viewScale } from './particles.ts';
import { DISPLAY_GLSL, displayUniforms } from './post.ts';
import { seedFrom } from './rand.ts';
import type { SceneChanges, SceneSnapshot, SceneVillager } from './snapshot.ts';

/**
 * The villagers: one small hand-built person each, with a costume that follows their role, their faction's colour and their own
 * `look` from the engine, so Ivo the storyteller is always Ivo. Each is a few primitive limbs on pivots, animated by procedural
 * walk, work, watch and flight cycles. Where a person stands is the engine's answer; where they walk from and to follows the
 * engine's own passable tiles (the river blocks unless the bridge stands), and the walk only ever connects two places the
 * simulation put them. Nothing here decides anything.
 */
const SKIN = [0xf1c9a5, 0xe0ac85, 0xc68a62, 0x8d5a3c];
const HAIR = [0x2b1d14, 0x6b4226, 0xb5783a, 0xd8c9a8, 0x9a9a9a];
const PANTS = [0x4a3c2e, 0x3a4252, 0x5a4a3a, 0x3c3a36];
/** hip height, which is also the length of a leg from the hip pivot to the sole; the knee is this far below the hip */
const LEG = 0.16;
const KNEE = 0.08;
const SHIRT = 0xece4d2;
const LEATHER = 0x4a3426;
const BOOT = 0x2e241c;
const WOOD = 0x6a4a30;
const IRON = 0x7c838c;
const GOLD = 0xd4b25a;

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  /** the hem of a tunic or the skirt of a gown: it sways a little as the person walks */
  skirt: THREE.Mesh;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** the lower legs, pivoted at the knee: the swinging leg bends to clear the ground */
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  scale: number;
  child: boolean;
  /** a gown, robe or long coat: the legs swing less under it */
  robe: boolean;
}

interface Walker {
  v: SceneVillager;
  rig: Rig;
  pos: THREE.Vector3;
  path: THREE.Vector3[];
  /** where the engine put them last */
  tile: { x: number; y: number };
  slot: THREE.Vector2;
  heading: number;
  phase: number;
  speed: number;
  gesture: { kind: string; until: number } | null;
  look: THREE.Vector3 | null;
  lookUntil: number;
  marker: THREE.Mesh | null;
  proxy: THREE.Mesh;
  /** 0 standing, 1 fully fled (hands up, hunched) */
  alarm: number;
  dead: boolean;
  /** the way they face when they have nothing to look at (out from the building they wait at), or null */
  rest: number | null;
  /** seconds to stand before setting off along the path (the morning walk to work starts at a different moment for each person) */
  wait: number;
}

/** template shapes, shared by every figure; they are only ever copied into a figure's own geometry, never drawn */
const geoCache = new Map<string, THREE.BufferGeometry>();
const geo = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};
/** a turned shape (a garment's silhouette) from [radius, height] pairs, bottom to top */
const lathe = (key: string, pts: [number, number][], dy: number): THREE.BufferGeometry => geo(key, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y + dy)), 14));

let peopleMat: THREE.MeshStandardMaterial | null = null;
/** one material for every person: each part's colour is baked into its vertices, so a whole figure is a handful of draw calls */
const peopleMaterial = (): THREE.MeshStandardMaterial => {
  peopleMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
  return peopleMat;
};

let lanternMat: THREE.MeshStandardMaterial | null = null;
const lanternGlass = (): THREE.MeshStandardMaterial => {
  lanternMat ??= new THREE.MeshStandardMaterial({ color: 0xffd98f, emissive: 0xffb84d, emissiveIntensity: 1.8 });
  return lanternMat;
};

/** the coloured pieces of one moving part of a figure (its head, an arm, its coat), baked into a single geometry with the colours in its vertices */
class Parts {
  private list: { g: THREE.BufferGeometry; color: THREE.Color; m: THREE.Matrix4 }[] = [];

  add(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rot?: THREE.Euler, sx = 1, sy = 1, sz = 1): this {
    const q = rot ? new THREE.Quaternion().setFromEuler(rot) : new THREE.Quaternion();
    this.list.push({ g, color: new THREE.Color(color), m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)) });
    return this;
  }

  bake(): THREE.BufferGeometry {
    const geos = this.list.map(({ g, color, m }) => {
      const c = g.index ? g.toNonIndexed() : g.clone();
      for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k);
      c.applyMatrix4(m);
      const n = c.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = color.r;
        col[i * 3 + 1] = color.g;
        col[i * 3 + 2] = color.b;
      }
      c.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return c;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) throw new Error('a villager part could not be baked');
    merged.computeBoundingSphere();
    return merged;
  }
}

/** a mesh of a figure's own baked geometry (freed with the figure) in the shared material */
const owned = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g, peopleMaterial());
  o.position.set(x, y, z);
  o.castShadow = true;
  o.userData.owned = true;
  return o;
};

/** free the geometry a figure owns (the shared material and the template shapes stay) */
function disposeRig(rig: Rig): void {
  rig.root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.owned) o.geometry.dispose();
  });
}

function garment(v: SceneVillager): number {
  const c = new THREE.Color();
  // the person's own hue in a deep, dyed-cloth tone (it must stand apart from skin), pulled towards their faction's colour so a faction
  // reads at a distance
  c.setHSL(v.look.hue / 360, 0.48, 0.4, THREE.SRGBColorSpace);
  const f = new THREE.Color(v.factionColor);
  c.lerp(f, 0.3);
  return c.getHex();
}

const shade = (hex: number, toward: number, k: number): number => new THREE.Color(hex).lerp(new THREE.Color(toward), k).getHex();

type Hat = 'straw' | 'cap' | 'hood' | 'flat' | 'scarf' | 'none' | 'tall' | 'beanie';
type Held = 'lantern' | 'staff' | 'crook' | 'bell' | 'basket' | 'satchel' | 'axe' | 'sack' | 'notebook' | 'book' | 'pitchfork' | 'hoe' | 'rod' | 'hammer' | 'yarn';
type Extra = 'apron' | 'cape' | 'beard' | 'chain' | 'spectacles' | 'rope' | 'vest' | 'pouch';
/** tunic: a short coat over breeches and boots; robe: a gown, habit or long coat to the ankles */
interface RoleLook { hat: Hat; coat: 'tunic' | 'robe'; held?: Held; extra?: Extra[] }

/** every role the scenarios use, so that each person's trade can be read from their silhouette */
const ROLE_LOOK: Record<string, RoleLook> = {
  farmer: { hat: 'straw', coat: 'tunic', held: 'pitchfork' },
  farmhand: { hat: 'straw', coat: 'tunic', held: 'hoe' },
  miller: { hat: 'cap', coat: 'tunic', held: 'sack', extra: ['apron'] },
  bridgekeeper: { hat: 'cap', coat: 'tunic', held: 'lantern', extra: ['pouch'] },
  'bell-keeper': { hat: 'hood', coat: 'robe', held: 'bell', extra: ['rope'] },
  warden: { hat: 'hood', coat: 'tunic', held: 'lantern', extra: ['pouch'] },
  'well-warden': { hat: 'cap', coat: 'tunic', held: 'lantern' },
  storyteller: { hat: 'tall', coat: 'robe', held: 'book', extra: ['cape'] },
  elder: { hat: 'none', coat: 'robe', held: 'staff', extra: ['beard'] },
  trader: { hat: 'flat', coat: 'tunic', held: 'satchel', extra: ['vest'] },
  'grain trader': { hat: 'flat', coat: 'tunic', held: 'satchel', extra: ['vest'] },
  shepherd: { hat: 'straw', coat: 'tunic', held: 'crook' },
  herder: { hat: 'straw', coat: 'tunic', held: 'crook' },
  reeve: { hat: 'flat', coat: 'robe', held: 'notebook', extra: ['chain'] },
  mother: { hat: 'scarf', coat: 'robe', held: 'basket', extra: ['apron'] },
  healer: { hat: 'hood', coat: 'robe', held: 'satchel' },
  physician: { hat: 'cap', coat: 'robe', held: 'satchel', extra: ['spectacles'] },
  woodcutter: { hat: 'beanie', coat: 'tunic', held: 'axe' },
  hunter: { hat: 'hood', coat: 'tunic', held: 'staff', extra: ['pouch'] },
  tracker: { hat: 'hood', coat: 'tunic', held: 'staff', extra: ['pouch'] },
  hermit: { hat: 'hood', coat: 'robe', held: 'staff', extra: ['beard'] },
  fisher: { hat: 'beanie', coat: 'tunic', held: 'rod' },
  weaver: { hat: 'scarf', coat: 'robe', held: 'yarn', extra: ['apron'] },
  tinker: { hat: 'cap', coat: 'tunic', held: 'hammer', extra: ['vest', 'pouch'] },
  scribe: { hat: 'flat', coat: 'robe', held: 'book', extra: ['spectacles'] },
  orphan: { hat: 'scarf', coat: 'tunic' },
  child: { hat: 'none', coat: 'tunic' },
};

/**
 * One person, built from turned and rounded shapes: a shaped coat or gown with a belt, the faction's sash, a shirt collar, sleeves with
 * cuffs, breeches and boots; a face with ears, brows, cheeks and a mouth; a hairstyle and the hat and tools of their trade. Each moving part
 * (the coat, the skirt, the head, each arm and leg) is one mesh, pivoted where the walk and work animations turn it.
 */
export function buildRig(v: SceneVillager): Rig {
  const roleKey = v.role.toLowerCase();
  const role: RoleLook = ROLE_LOOK[roleKey] ?? { hat: 'none', coat: 'tunic' };
  // a child by archetype or role; the engine's `build` is how slight or stout a person is, not their age (a slight hermit is no child)
  const child = v.archetype === 'child' || roleKey === 'child' || roleKey === 'orphan';
  const S = child ? 0.76 : 1;
  const W = [0.9, 1, 1.13][Math.min(2, Math.max(0, v.look.build))];
  const D = 0.8 * W;
  const robe = role.coat === 'robe' && !child;
  const has = (e: Extra): boolean => !!role.extra?.includes(e);
  const id = seedFrom(v.id);
  const skin = SKIN[v.look.skin % SKIN.length];
  const cloth = garment(v);
  const pants = PANTS[(id >>> 3) % PANTS.length];
  const faction = new THREE.Color(v.factionColor).getHex();
  const elderly = roleKey === 'elder' || roleKey === 'hermit' || v.archetype === 'elder';
  const hair = elderly ? shade(HAIR[v.look.hair % HAIR.length], 0xe6e2da, 0.55) : HAIR[v.look.hair % HAIR.length];
  const apronCol = role.hat === 'cap' ? 0xf3efe4 : 0xd8c8a6;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // legs, pivoted at the hip, with a knee half way down: breeches above it, the shin and the boot below
  const thighGeo = new Parts().add(geo('pThigh', () => new THREE.CapsuleGeometry(0.027, 0.05, 3, 8)), pants, 0, -0.04, 0).bake();
  const shinGeo = new Parts()
    .add(geo('pShin', () => new THREE.CapsuleGeometry(0.025, 0.03, 3, 8)), pants, 0, -0.02, 0)
    .add(geo('pBootShaft', () => new THREE.CylinderGeometry(0.03, 0.028, 0.045, 8)), BOOT, 0, -0.044, 0)
    .add(geo('pBootToe', () => new THREE.CapsuleGeometry(0.023, 0.04, 3, 8)), BOOT, 0, -0.066, 0.016, new THREE.Euler(Math.PI / 2, 0, 0), 1.1, 1, 0.82)
    .bake();
  const mkLeg = (x: number): [THREE.Group, THREE.Group] => {
    const g = new THREE.Group();
    g.position.set(x * W, LEG, 0);
    g.add(owned(thighGeo));
    const knee = new THREE.Group();
    knee.position.y = -KNEE;
    knee.add(owned(shinGeo));
    g.add(knee);
    return [g, knee];
  };
  const [legL, kneeL] = mkLeg(-0.034);
  const [legR, kneeR] = mkLeg(0.034);
  body.add(legL, legR);

  // the hem of the tunic, or the gown down to the ankles, pivoted at the waist
  const skirtParts = new Parts().add(
    robe
      ? lathe('pSkirtRobe', [[0.106, 0.025], [0.1, 0.055], [0.088, 0.1], [0.076, 0.15], [0.068, 0.19], [0.066, 0.205], [0, 0.205]], -0.2)
      : lathe('pSkirtTunic', [[0.08, 0.112], [0.077, 0.135], [0.071, 0.168], [0.066, 0.2], [0, 0.2]], -0.2),
    cloth, 0, 0, 0, undefined, W, 1, D,
  );
  if (has('apron')) {
    if (robe) skirtParts.add(geo('pApronRobe', () => new THREE.CylinderGeometry(0.071, 0.099, 0.12, 10, 1, true, -0.7, 1.4)), apronCol, 0, -0.07, 0, undefined, W, 1, D);
    else skirtParts.add(geo('pApronTunic', () => new THREE.CylinderGeometry(0.069, 0.083, 0.095, 10, 1, true, -0.7, 1.4)), apronCol, 0, -0.0525, 0, undefined, W, 1, D);
  }
  const skirt = owned(skirtParts.bake(), 0, 0.2, 0);
  body.add(skirt);

  // the coat: shoulders to waist, with a shirt collar, a belt (or a friar's rope) and the faction's sash worn from the shoulder
  const torsoParts = new Parts()
    .add(lathe('pTorso', [[0.064, 0.193], [0.066, 0.22], [0.072, 0.255], [0.074, 0.285], [0.068, 0.31], [0.05, 0.328], [0.03, 0.338], [0, 0.341]], -0.27), cloth, 0, 0, 0, undefined, W, 1, D)
    .add(geo('pCollar', () => new THREE.TorusGeometry(0.033, 0.007, 4, 12)), SHIRT, 0, 0.064, 0, new THREE.Euler(Math.PI / 2, 0, 0), W, D, 1)
    .add(geo('pSash', () => new THREE.TorusGeometry(0.082, 0.011, 4, 20)), faction, 0, 0, 0, new THREE.Euler(Math.PI / 2, 0, 0.62, 'ZXY'), W, D * 1.06, 1)
    .add(geo('pBelt', () => new THREE.TorusGeometry(0.066, 0.0085, 5, 18)), has('rope') ? 0xcdb98a : LEATHER, 0, -0.072, 0, new THREE.Euler(Math.PI / 2, 0, 0), W, D, 1);
  if (has('rope')) torsoParts.add(geo('pCord', () => new THREE.CylinderGeometry(0.0045, 0.0045, 0.085, 4)), 0xcdb98a, 0.022 * W, -0.11, 0.072 * D);
  else torsoParts.add(geo('pBuckle', () => new THREE.BoxGeometry(0.018, 0.016, 0.006)), GOLD, 0, -0.072, 0.0745 * D + 0.002);
  if (has('vest')) torsoParts.add(geo('pVest', () => new THREE.CylinderGeometry(0.079, 0.073, 0.105, 14, 1, true, 0.42, Math.PI * 2 - 0.84)), shade(cloth, 0x1c1610, 0.5), 0, -0.005, 0, undefined, W, 1, D);
  if (has('apron')) torsoParts.add(geo('pBib', () => new THREE.BoxGeometry(0.066, 0.075, 0.005)), apronCol, 0, -0.025, 0.07 * D + 0.002, new THREE.Euler(-0.08, 0, 0));
  if (has('cape')) {
    torsoParts.add(geo('pCape', () => new THREE.CylinderGeometry(0.072, 0.118, 0.27, 12, 1, true, Math.PI - 1.2, 2.4)), 0x5a2f4a, 0, -0.065, 0, undefined, W, 1, D * 1.05);
    torsoParts.add(geo('pClasp', () => new THREE.SphereGeometry(0.011, 6, 5)), GOLD, 0, 0.058, 0.05 * W);
  }
  if (has('chain')) {
    torsoParts.add(geo('pChain', () => new THREE.TorusGeometry(0.05, 0.0055, 4, 16)), 0xd8b44a, 0, 0.04, 0.026 * W, new THREE.Euler(Math.PI / 2.4, 0, 0), W, 1, 1);
    torsoParts.add(geo('pMedal', () => new THREE.CylinderGeometry(0.013, 0.013, 0.005, 10)), 0xe6c45a, 0, 0.022, 0.073 * D + 0.004, new THREE.Euler(Math.PI / 2, 0, 0));
  }
  if (has('pouch')) torsoParts.add(geo('pPouch', () => new THREE.BoxGeometry(0.03, 0.036, 0.022)), LEATHER, 0.06 * W, -0.09, 0.03 * W);
  if (role.held === 'satchel') torsoParts.add(geo('pSatchel', () => new THREE.BoxGeometry(0.072, 0.06, 0.03)), 0x7a5a3a, -0.072 * W, -0.075, 0.04 * W);
  if (role.held === 'sack') torsoParts.add(geo('pSack', () => new THREE.SphereGeometry(0.05, 8, 6)), 0xc9b58a, 0, -0.01, -0.078 * W, undefined, 1, 1.12, 0.8);
  const torso = owned(torsoParts.bake(), 0, 0.27, 0);
  body.add(torso);

  // arms, pivoted at the shoulder: a rounded shoulder, the sleeve, a shirt cuff and the hand
  const armParts = (): Parts =>
    new Parts()
      .add(geo('pShoulder', () => new THREE.SphereGeometry(0.03, 8, 6)), cloth, 0, -0.004, 0)
      .add(geo('pSleeve', () => new THREE.CapsuleGeometry(0.021, 0.085, 3, 8)), cloth, 0, -0.058, 0)
      .add(geo('pCuff', () => new THREE.TorusGeometry(0.02, 0.006, 4, 10)), SHIRT, 0, -0.103, 0, new THREE.Euler(Math.PI / 2, 0, 0))
      .add(geo('pHand', () => new THREE.SphereGeometry(0.02, 7, 5)), skin, 0, -0.125, 0);
  // what they carry, in the right hand (at 0, -0.125, 0 of the arm)
  const hand = armParts();
  let glass: THREE.Mesh | null = null;
  const pole = (key: string, len: number): void => {
    hand.add(geo(key, () => new THREE.CylinderGeometry(0.007, 0.009, len, 6)), WOOD, 0, -0.125 + len * 0.18, 0.012);
  };
  switch (role.held) {
    case 'lantern':
      hand
        .add(geo('pLanBase', () => new THREE.BoxGeometry(0.038, 0.006, 0.038)), 0x2c2f34, 0, -0.176, 0.02)
        .add(geo('pLanCap', () => new THREE.ConeGeometry(0.028, 0.02, 4)), 0x2c2f34, 0, -0.128, 0.02, new THREE.Euler(0, Math.PI / 4, 0))
        .add(geo('pLanRing', () => new THREE.TorusGeometry(0.01, 0.003, 4, 8)), 0x2c2f34, 0, -0.113, 0.02);
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) hand.add(geo('pLanPost', () => new THREE.BoxGeometry(0.004, 0.036, 0.004)), 0x2c2f34, px * 0.016, -0.155, 0.02 + pz * 0.016);
      glass = new THREE.Mesh(geo('pLanGlass', () => new THREE.BoxGeometry(0.03, 0.034, 0.03)), lanternGlass());
      glass.position.set(0, -0.155, 0.02);
      break;
    case 'staff':
      pole('pStaff', 0.44);
      break;
    case 'crook':
      pole('pStaff', 0.44);
      hand.add(geo('pCrook', () => new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI)), WOOD, 0.03, 0.172, 0.012);
      break;
    case 'pitchfork':
      pole('pFork', 0.46);
      hand.add(geo('pForkBar', () => new THREE.BoxGeometry(0.05, 0.007, 0.007)), IRON, 0, 0.192, 0.012);
      for (const x of [-0.02, 0, 0.02]) hand.add(geo('pTine', () => new THREE.CylinderGeometry(0.003, 0.0018, 0.06, 4)), IRON, x, 0.225, 0.012);
      break;
    case 'hoe':
      pole('pHoe', 0.44);
      hand.add(geo('pHoeBlade', () => new THREE.BoxGeometry(0.045, 0.032, 0.006)), IRON, 0, 0.19, 0.03, new THREE.Euler(0.6, 0, 0));
      break;
    case 'rod':
      // held high and out over the water: the butt in the hand, the tip far out in front
      hand.add(geo('pRod', () => new THREE.CylinderGeometry(0.0035, 0.0075, 0.62, 5)), 0x8a6a40, 0, -0.125 + 0.31 * Math.cos(0.55), 0.02 + 0.31 * Math.sin(0.55), new THREE.Euler(0.55, 0, 0));
      hand.add(geo('pReel', () => new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8)), IRON, 0.012, -0.08, 0.045, new THREE.Euler(0, 0, Math.PI / 2));
      break;
    case 'hammer':
      hand.add(geo('pHammerH', () => new THREE.CylinderGeometry(0.006, 0.006, 0.11, 5)), WOOD, 0, -0.17, 0.02);
      hand.add(geo('pHammerHead', () => new THREE.BoxGeometry(0.042, 0.022, 0.022)), IRON, 0, -0.225, 0.02);
      break;
    case 'bell':
      hand.add(geo('pBellH', () => new THREE.CylinderGeometry(0.006, 0.006, 0.03, 5)), WOOD, 0, -0.135, 0.02);
      hand.add(geo('pBell', () => new THREE.ConeGeometry(0.03, 0.05, 10)), 0xc4a24a, 0, -0.172, 0.02);
      break;
    case 'basket':
    case 'yarn':
      hand.add(geo('pBasket', () => new THREE.CylinderGeometry(0.037, 0.029, 0.036, 9)), 0x9a7a4a, 0, -0.16, 0.02);
      hand.add(geo('pBasketH', () => new THREE.TorusGeometry(0.03, 0.004, 4, 10, Math.PI)), 0x8a6a3a, 0, -0.142, 0.02);
      if (role.held === 'yarn') for (const [x, c] of [[-0.012, faction], [0.013, 0xc96a4a]] as const) hand.add(geo('pYarn', () => new THREE.SphereGeometry(0.017, 7, 5)), c, x, -0.138, 0.02);
      else hand.add(geo('pLoaf', () => new THREE.SphereGeometry(0.02, 7, 5)), 0xc8924a, 0, -0.138, 0.02, undefined, 1.3, 0.8, 1);
      break;
    case 'axe':
      hand.add(geo('pAxeH', () => new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5)), WOOD, 0, -0.145, 0.01);
      hand.add(geo('pAxeB', () => new THREE.BoxGeometry(0.06, 0.04, 0.008)), 0x9aa0a8, 0.03, -0.065, 0.01);
      break;
    case 'book':
    case 'notebook': {
      const k = role.held === 'book' ? 1 : 0.8;
      hand.add(geo(`pCover${k}`, () => new THREE.BoxGeometry(0.048 * k, 0.012, 0.064 * k)), 0x6b3a2a, 0, -0.145, 0.03);
      hand.add(geo(`pPages${k}`, () => new THREE.BoxGeometry(0.044 * k, 0.009, 0.058 * k)), 0xf0e6cf, 0.003, -0.145, 0.03);
      break;
    }
    default:
      break;
  }
  const mkArm = (x: number, parts: Parts): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x * W, 0.3, 0);
    g.add(owned(parts.bake()));
    return g;
  };
  const armL = mkArm(-0.095, armParts());
  const armR = mkArm(0.095, hand);
  if (glass) armR.add(glass);
  body.add(armL, armR);

  // head: a big round head reads better from above; a face that is a face (ears, brows, cheeks, a mouth)
  const head = new THREE.Group();
  head.position.set(0, 0.385, 0);
  const hp = new Parts().add(geo('pHead', () => new THREE.SphereGeometry(0.072, 14, 10)), skin, 0, 0, 0, undefined, 1, 0.97, 0.98);
  for (const s of [-1, 1]) {
    hp.add(geo('pEar', () => new THREE.SphereGeometry(0.016, 6, 5)), skin, s * 0.07, -0.004, -0.004, undefined, 0.55, 1, 0.9)
      .add(geo('pEye', () => new THREE.SphereGeometry(0.0095, 6, 5)), 0x1a1612, s * 0.026, 0.004, 0.064)
      .add(geo('pBrow', () => new THREE.BoxGeometry(0.024, 0.0055, 0.007)), shade(hair, 0x000000, 0.35), s * 0.027, 0.025, 0.065, new THREE.Euler(0, 0, s * 0.12))
      .add(geo('pCheek', () => new THREE.SphereGeometry(0.014, 6, 4)), shade(skin, 0xd9706a, 0.45), s * 0.041, -0.017, 0.057, undefined, 1, 0.65, 0.45);
  }
  hp.add(geo('pNose', () => new THREE.SphereGeometry(0.0115, 6, 5)), shade(skin, 0x8a4a3a, 0.08), 0, -0.008, 0.072)
    .add(geo('pMouth', () => new THREE.BoxGeometry(0.022, 0.0045, 0.005)), 0x6a3428, 0, -0.034, 0.066);
  // hair: cropped, long, a bun, curls; braids for the children, a grey fringe round a bald crown for the old
  const cap = (theta: number): void => {
    hp.add(geo(`pHair${theta}`, () => new THREE.SphereGeometry(0.078, 12, 8, 0, Math.PI * 2, 0, Math.PI * theta)), hair, 0, 0.008, -0.004);
  };
  // under a hat or a hood only a crop or long hair (curls and a bun would push through it)
  const free = role.hat === 'none';
  const pickStyle = (['crop', 'long', 'bun', 'curly', 'crop'] as const)[(v.look.hair + (id % 5)) % 5];
  const style = child ? (id % 2 ? 'braids' : 'crop') : elderly ? 'fringe' : free || pickStyle === 'crop' || pickStyle === 'long' ? pickStyle : 'crop';
  switch (style) {
    case 'crop':
      cap(0.46);
      break;
    case 'long':
      cap(0.55);
      hp.add(geo('pHairBack', () => new THREE.SphereGeometry(0.076, 10, 8, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.5)), hair, 0, -0.012, -0.006, undefined, 1.04, 1.3, 1);
      break;
    case 'bun':
      cap(0.58);
      hp.add(geo('pBun', () => new THREE.SphereGeometry(0.03, 7, 5)), hair, 0, 0.062, -0.05);
      break;
    case 'curly':
      cap(0.5);
      for (const [x, y, z] of [[0, 0.07, -0.01], [0.045, 0.05, -0.03], [-0.045, 0.05, -0.03], [0.03, 0.06, 0.03], [-0.03, 0.06, 0.03], [0, 0.03, -0.06], [0.055, 0.015, -0.04], [-0.055, 0.015, -0.04]]) {
        hp.add(geo('pCurl', () => new THREE.SphereGeometry(0.026, 6, 5)), hair, x, y, z);
      }
      break;
    case 'braids':
      cap(0.55);
      for (const s of [-1, 1]) {
        hp.add(geo('pBraid', () => new THREE.CapsuleGeometry(0.016, 0.04, 3, 6)), hair, s * 0.068, -0.045, -0.012);
        hp.add(geo('pTie', () => new THREE.SphereGeometry(0.009, 5, 4)), faction, s * 0.069, -0.022, -0.012);
      }
      break;
    case 'fringe':
      hp.add(geo('pFringe', () => new THREE.SphereGeometry(0.077, 12, 7, Math.PI, Math.PI, Math.PI * 0.36, Math.PI * 0.3)), hair, 0, 0.002, -0.002);
      break;
  }
  if (has('beard')) hp.add(geo('pBeard', () => new THREE.SphereGeometry(0.056, 10, 7, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58)), shade(hair, 0xf0ece4, 0.3), 0, -0.032, 0.03, undefined, 1, 1.08, 1);
  if (has('spectacles')) {
    for (const s of [-1, 1]) hp.add(geo('pLens', () => new THREE.TorusGeometry(0.0145, 0.0026, 4, 12)), 0x2e2620, s * 0.026, 0.004, 0.071);
    hp.add(geo('pBridge', () => new THREE.BoxGeometry(0.016, 0.0028, 0.0028)), 0x2e2620, 0, 0.008, 0.073);
  }
  // hats; a hood or a headscarf leaves the face open
  const faceOpen = (r: number, key: string, theta: number, gap: number): THREE.BufferGeometry =>
    geo(key, () => new THREE.SphereGeometry(r, 12, 8, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, 0, Math.PI * theta));
  switch (role.hat) {
    case 'straw':
      hp.add(geo('pBrim', () => new THREE.CylinderGeometry(0.135, 0.135, 0.008, 16)), 0xd8b75a, 0, 0.045, 0)
        .add(geo('pDome', () => new THREE.SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)), 0xd8b75a, 0, 0.045, 0)
        .add(geo('pBand', () => new THREE.CylinderGeometry(0.0765, 0.0765, 0.014, 16, 1, true)), 0x9a3a2e, 0, 0.053, 0);
      break;
    case 'cap':
      hp.add(geo('pCapD', () => new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45)), garment({ ...v, look: { ...v.look, hue: v.look.hue + 40 } }), 0, 0.02, 0)
        .add(geo('pCapB', () => new THREE.BoxGeometry(0.1, 0.01, 0.05)), 0x3a2f26, 0, 0.034, 0.075);
      break;
    case 'flat':
      hp.add(geo('pFlat', () => new THREE.CylinderGeometry(0.085, 0.09, 0.035, 14)), 0x4a3a30, 0, 0.058, 0);
      break;
    case 'tall':
      hp.add(geo('pTall', () => new THREE.CylinderGeometry(0.05, 0.07, 0.11, 12)), 0x3b2f52, 0, 0.1, 0)
        .add(geo('pTallB', () => new THREE.CylinderGeometry(0.1, 0.1, 0.008, 14)), 0x3b2f52, 0, 0.048, 0)
        .add(geo('pFeather', () => new THREE.ConeGeometry(0.008, 0.12, 4)), 0xe05a4a, 0.045, 0.15, 0, new THREE.Euler(0, 0, -0.5));
      break;
    case 'hood': {
      // a shade darker than the coat, so the hood frames the face instead of melting into it
      const hood = shade(garment({ ...v, look: { ...v.look, hue: v.look.hue + 20 } }), 0x140e0a, 0.35);
      hp.add(faceOpen(0.088, 'pHood', 0.62, 0.78), hood, 0, 0.005, -0.012)
        .add(geo('pHoodDrape', () => new THREE.SphereGeometry(0.088, 10, 6, Math.PI, Math.PI, Math.PI * 0.55, Math.PI * 0.3)), hood, 0, -0.02, -0.02, undefined, 1.05, 1.2, 1);
      break;
    }
    case 'scarf':
      hp.add(faceOpen(0.082, 'pScarf', 0.56, 0.86), faction, 0, 0.01, -0.01)
        .add(geo('pKnot', () => new THREE.SphereGeometry(0.018, 6, 5)), faction, 0, -0.03, -0.072);
      break;
    case 'beanie':
      hp.add(geo('pBeanie', () => new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.46)), 0x8a3b2e, 0, 0.02, 0)
        .add(geo('pBeanieCuff', () => new THREE.TorusGeometry(0.074, 0.01, 4, 16)), 0x7a3026, 0, 0.03, 0, new THREE.Euler(Math.PI / 2, 0, 0))
        .add(geo('pPom', () => new THREE.SphereGeometry(0.017, 6, 5)), 0xe8dcc8, 0, 0.1, 0);
      break;
    default:
      break;
  }
  head.add(owned(hp.bake()));
  body.add(head);

  root.scale.setScalar(S * 1.05);
  return { root, body, torso, skirt, head, armL, armR, legL, legR, kneeL, kneeR, scale: S, child, robe };
}

const MARKS = 160;
const ROUTE_DOTS = 220;
const ROUTE_VERT = /* glsl */ `
  attribute float aIdx;
  varying float vPulse;
  uniform float uScale;
  uniform float uTime;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    vPulse = pow(0.5 + 0.5 * sin(aIdx * 0.55 - uTime * 5.0), 2.0);
    gl_PointSize = clamp(0.2 * uScale / d, 5.0, 12.0) * (0.6 + 0.6 * vPulse);
  }
`;
const ROUTE_FRAG = /* glsl */ `
  ${DISPLAY_GLSL}
  varying float vPulse;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;
    float a = (0.35 + 0.65 * vPulse) * (1.0 - smoothstep(0.55, 1.0, r));
    // (held just under white so the route gives off only a faint glow)
    gl_FragColor = vec4(postDisplay(vec3(0.9, 0.76, 0.4)), a);
    #include <colorspace_fragment>
  }
`;
const MARK_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vFade;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    gl_PointSize = clamp(aSize * uScale / d, 6.0, 20.0) * step(0.001, aSize);
    vFade = smoothstep(8.0, 17.0, d);
    vColor = aColor;
  }
`;
const MARK_FRAG = /* glsl */ `
  ${DISPLAY_GLSL}
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    // a diamond with a pale rim, so it reads on grass, water and roofs alike
    float r = abs(p.x) + abs(p.y);
    if (r > 0.5) discard;
    vec3 c = mix(vColor, vec3(1.0), smoothstep(0.3, 0.42, r));
    float a = vFade * 0.9;
    if (a < 0.02) discard;
    // (held under white: a mark is a label, it must not glow)
    gl_FragColor = vec4(postDisplay(min(c, vec3(0.8))), a);
    #include <colorspace_fragment>
  }
`;

export class PeopleLayer implements Layer {
  readonly group = new THREE.Group();
  private walkers = new Map<string, Walker>();
  private ctx: WorldContext;
  private bridge: BridgeSpec | null = null;
  private bridgeStanding = true;
  private proxyList: THREE.Object3D[] = [];
  private ring: THREE.Mesh;
  private ringHover: THREE.Mesh;
  private beliefRings = new Map<string, THREE.Mesh>();
  private selection: { kind: string; id: string } | null = null;
  private hover: { kind: string; id: string } | null = null;
  private activeClaim: string | null = null;
  private known = new Set<string>();
  private hints = new Set<string>();
  private time = 0;
  private graves = new THREE.Group();
  private celebrating = false;
  /** a small faction-coloured pennant over every person, sized in pixels so it stays readable from far away and fades as the camera comes in */
  private marks: THREE.Points;
  private markPos = new Float32Array(MARKS * 3);
  /** how much larger than true size the people are drawn at the current camera distance */
  private legible = 1;
  private markCol = new Float32Array(MARKS * 3);
  private markSize = new Float32Array(MARKS);
  /** the way out from a selected house to the nearest shelter, as a line of pulsing gold dots over the engine's own passable tiles */
  private routeDots: THREE.Points;
  private routePos = new Float32Array(ROUTE_DOTS * 3);
  private routeIdx = new Float32Array(ROUTE_DOTS);
  private routeFor = '';
  private snapRef: SceneSnapshot | null = null;
  /** the day the people were last laid out for: a new morning, seen live, sends them from home to their work */
  private day: number | null = null;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.group.name = 'people';
    this.group.add(this.graves);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 8;
    this.ring.visible = false;
    this.ringHover = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.21, 24), new THREE.MeshBasicMaterial({ color: 0xf0d58a, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    this.ringHover.rotation.x = -Math.PI / 2;
    this.ringHover.renderOrder = 8;
    this.ringHover.visible = false;
    this.group.add(this.ring, this.ringHover);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.markPos, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aColor', new THREE.BufferAttribute(this.markCol, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aSize', new THREE.BufferAttribute(this.markSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.marks = new THREE.Points(mg, new THREE.ShaderMaterial({ vertexShader: MARK_VERT, fragmentShader: MARK_FRAG, transparent: true, depthWrite: false, depthTest: false, uniforms: { uScale: viewScale, ...displayUniforms } }));
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 9;
    this.marks.name = 'people-marks';
    this.group.add(this.marks);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.routePos, 3).setUsage(THREE.DynamicDrawUsage));
    rg.setAttribute('aIdx', new THREE.BufferAttribute(this.routeIdx, 1));
    rg.setDrawRange(0, 0);
    this.routeDots = new THREE.Points(rg, new THREE.ShaderMaterial({ vertexShader: ROUTE_VERT, fragmentShader: ROUTE_FRAG, transparent: true, depthWrite: false, depthTest: false, uniforms: { uScale: viewScale, uTime: { value: 0 }, ...displayUniforms } }));
    this.routeDots.frustumCulled = false;
    this.routeDots.renderOrder = 9;
    this.routeDots.name = 'evacuation-route';
    this.group.add(this.routeDots);
  }

  setOptions(o: { selection: { kind: string; id: string } | null; activeClaim: string | null; known: Set<string>; hints: string[] }): void {
    this.selection = o.selection;
    this.activeClaim = o.activeClaim;
    this.known = o.known;
    this.hints = new Set(o.hints);
  }

  setHover(h: { kind: string; id: string } | null): void {
    this.hover = h;
  }

  /** the ground height people stand on: terrain, or the bridge deck while they are on it */
  private walkY(x: number, z: number): number {
    const b = this.bridge;
    if (b && this.bridgeStanding && z > b.row + 0.2 && z < b.row + 0.8 && x > b.x0 - 0.5 && x < b.x1 + 1.5) return Math.max(this.ctx.heightAt(x, z), deckHeight(b, x) + this.ctx.bridgeLift);
    return this.ctx.heightAt(x, z);
  }

  /** a walk from one tile to another over the engine's passable tiles, as smooth waypoints (empty if there is no way) */
  private route(from: { x: number; y: number }, to: { x: number; y: number }, snap: SceneSnapshot): THREE.Vector3[] {
    const { w, h } = snap;
    const ok = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && snap.passable[y * w + x] === 1;
    const sx = Math.round(from.x);
    const sy = Math.round(from.y);
    const tx = Math.round(to.x);
    const ty = Math.round(to.y);
    if (sx === tx && sy === ty) return [];
    const prev = new Int16Array(w * h).fill(-2);
    const q: number[] = [sy * w + sx];
    prev[sy * w + sx] = -1;
    let found = false;
    for (let i = 0; i < q.length && !found; i++) {
      const cur = q[i];
      const cx = cur % w;
      const cy = (cur - cx) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!ok(nx, ny) && !(nx === tx && ny === ty)) continue;
        // no cutting a corner through a blocked tile
        if (dx !== 0 && dy !== 0 && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
        const ni = ny * w + nx;
        if (prev[ni] !== -2) continue;
        prev[ni] = cur;
        q.push(ni);
        if (nx === tx && ny === ty) {
          found = true;
          break;
        }
      }
    }
    if (!found) return [];
    const tiles: [number, number][] = [];
    for (let c = ty * w + tx; c >= 0; c = prev[c]) tiles.push([c % w, (c - (c % w)) / w]);
    tiles.reverse();
    const pts: THREE.Vector3[] = [];
    for (const [x, y] of tiles) {
      const p = engineToWorld(x, y);
      pts.push(new THREE.Vector3(p.x, 0, p.z));
    }
    // a gentle smoothing so people do not turn at right angles
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[i];
      const c = pts[Math.min(pts.length - 1, i + 1)];
      out.push(new THREE.Vector3((a.x + b.x * 2 + c.x) / 4, 0, (a.z + b.z * 2 + c.z) / 4));
    }
    return out;
  }

  /** where on the tile this person stands: crowds spread on a small ring, always in the same order */
  /** the way each person faces when idle outside a building (filled by slots()) */
  private rests = new Map<string, number>();

  private slots(snap: SceneSnapshot, ctx: WorldContext): Map<string, THREE.Vector2> {
    this.rests.clear();
    const by = new Map<string, SceneVillager[]>();
    for (const v of snap.villagers) {
      const k = `${Math.round(v.x)},${Math.round(v.y)}`;
      const arr = by.get(k) ?? [];
      arr.push(v);
      by.set(k, arr);
    }
    const out = new Map<string, THREE.Vector2>();
    for (const [key, arr] of by) {
      arr.sort((a, b) => (a.id < b.id ? -1 : 1));
      // on the tile of a building with walls, the engine's "here" is drawn waiting outside it: a row facing out, where the view can see them
      const [tx, ty] = key.split(',').map(Number);
      const lm = snap.landmarks.find((l) => l.tiles.some((t) => t[0] === tx && t[1] === ty) || (l.x === tx && l.y === ty));
      const door = lm ? ctx.visitSpot?.(lm.id) : null;
      if (door) {
        const c = engineToWorld(tx, ty);
        const sx = Math.cos(door.ry);
        const sz = -Math.sin(door.ry);
        // three abreast, shoulder to shoulder without an arm through a neighbour (a body is about 0.3 across); a second row stands a
        // step further out, half a place across, so the faces behind show between the ones in front
        arr.forEach((v, i) => {
          const row = Math.floor(i / 3);
          const inRow = Math.min(3, arr.length - row * 3);
          const lat = ((i % 3) - (inRow - 1) / 2 + (row % 2) * 0.5) * 0.34;
          const fwd = row * 0.3;
          out.set(v.id, new THREE.Vector2(door.x - c.x + sx * lat + Math.sin(door.ry) * fwd, door.z - c.z + sz * lat + Math.cos(door.ry) * fwd));
          this.rests.set(v.id, door.ry + (((seedFrom(v.id) % 60) - 30) / 100));
        });
        continue;
      }
      // a ring that widens with the group, so neighbours keep a body's width apart
      const ring = Math.max(0.24, (arr.length * 0.34) / (Math.PI * 2));
      arr.forEach((v, i) => {
        if (arr.length === 1) out.set(v.id, new THREE.Vector2(0, 0.06));
        else {
          const a = (i / arr.length) * Math.PI * 2 + 0.6;
          out.set(v.id, new THREE.Vector2(Math.cos(a) * ring, Math.sin(a) * ring * 0.85));
        }
      });
    }
    return out;
  }

  update(snap: SceneSnapshot, changes: SceneChanges, ctx: WorldContext): void {
    this.snapRef = snap;
    this.routeFor = ''; // the passable tiles may have changed: lay the way out again
    const bridge = snap.landmarks.find((l) => l.kind === 'bridge');
    this.bridge = bridge ? bridgeSpecOf(bridge.tiles, ctx) : null;
    this.bridgeStanding = !!bridge && bridge.hp > 0;
    this.celebrating = snap.outcome === 'victory';
    if (changes.rebuild) this.clear();
    const dawn = !changes.rebuild && this.day !== null && snap.day > this.day && !snap.outcome && !ctx.reducedMotion;
    this.day = snap.day;
    const slots = this.slots(snap, ctx);
    const live = new Set<string>();
    for (const v of snap.villagers) {
      live.add(v.id);
      let wk = this.walkers.get(v.id);
      const slot = slots.get(v.id) ?? new THREE.Vector2();
      if (!wk) {
        wk = this.spawn(v, slot, ctx);
        this.walkers.set(v.id, wk);
      } else {
        const moved = Math.round(v.x) !== wk.tile.x || Math.round(v.y) !== wk.tile.y;
        wk.v = v;
        wk.slot.copy(slot);
        wk.rest = this.rests.get(v.id) ?? null;
        if (moved && v.status !== 'dead') {
          const from = { x: wk.pos.x - 0.5, y: wk.pos.z - 0.5 };
          const route = this.route({ x: Math.round(from.x), y: Math.round(from.y) }, { x: v.x, y: v.y }, snap);
          const center = engineToWorld(v.x, v.y);
          if (ctx.reducedMotion) {
            wk.path = [];
            wk.pos.set(center.x + slot.x, 0, center.z + slot.y);
          } else {
            wk.path = route;
            if (route.length) route.push(new THREE.Vector3(center.x + slot.x, 0, center.z + slot.y));
            else wk.path = [new THREE.Vector3(center.x + slot.x, 0, center.z + slot.y)];
          }
        } else if (dawn && v.duty === 'work' && v.status !== 'dead') {
          this.walkToWork(wk, v, slot, snap, ctx);
        }
        wk.tile = { x: Math.round(v.x), y: Math.round(v.y) };
        if (v.status === 'dead' && !wk.dead) this.bury(wk);
        if (v.status !== 'dead' && wk.dead) this.revive(wk);
      }
    }
    for (const [id, wk] of this.walkers) {
      if (!live.has(id)) {
        this.group.remove(wk.rig.root);
        disposeRig(wk.rig);
        wk.proxy.geometry.dispose();
        (wk.proxy.material as THREE.Material).dispose();
        this.walkers.delete(id);
      }
    }
    this.proxyList = [...this.walkers.values()].map((w) => w.proxy);
  }

  /**
   * A new morning: someone whose day is work again sets out from their own front door and walks to it, by the engine's walkable tiles
   * (over the bridge only while it stands), each at their own moment. The engine has them at work all day; this is only the way there,
   * between two places the engine puts them, and nobody whose home is out of reach or who works at home goes anywhere.
   */
  private walkToWork(wk: Walker, v: SceneVillager, slot: THREE.Vector2, snap: SceneSnapshot, ctx: WorldContext): void {
    const home = snap.landmarks.find((l) => l.id === v.homeId && l.hp > 0);
    if (!home || (home.x === Math.round(v.x) && home.y === Math.round(v.y))) return;
    const door = ctx.visitSpot?.(home.id);
    const start = door ?? engineToWorld(home.x, home.y);
    const route = this.route({ x: home.x, y: home.y }, { x: v.x, y: v.y }, snap);
    if (!route.length) return;
    const center = engineToWorld(v.x, v.y);
    wk.pos.set(start.x, 0, start.z);
    wk.path = [...route, new THREE.Vector3(center.x + slot.x, 0, center.z + slot.y)];
    wk.wait = (seedFrom(v.id, `dawn${snap.day}`) % 50) / 10;
    if (door) wk.heading = door.ry;
  }

  private clear(): void {
    for (const wk of this.walkers.values()) {
      this.group.remove(wk.rig.root);
      disposeRig(wk.rig);
      wk.proxy.geometry.dispose();
      (wk.proxy.material as THREE.Material).dispose();
    }
    this.walkers.clear();
    for (const m of this.beliefRings.values()) {
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.beliefRings.clear();
    while (this.graves.children.length) {
      const g = this.graves.children[0];
      this.graves.remove(g);
    }
  }

  private spawn(v: SceneVillager, slot: THREE.Vector2, ctx: WorldContext): Walker {
    const rig = buildRig(v);
    const c = engineToWorld(v.x, v.y);
    const pos = new THREE.Vector3(c.x + slot.x, 0, c.z + slot.y);
    rig.root.position.set(pos.x, this.walkY(pos.x, pos.z), pos.z);
    this.group.add(rig.root);
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.62, 8), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = 0.3;
    proxy.userData.entity = { kind: 'villager', id: v.id };
    rig.root.add(proxy);
    const wk: Walker = {
      v, rig, pos, path: [], tile: { x: Math.round(v.x), y: Math.round(v.y) }, slot: slot.clone(), heading: ((seedFrom(v.id) % 628) / 100) - 3.14, phase: (seedFrom(v.id) % 100) / 16,
      speed: 0.75 + (seedFrom(v.id, 'sp') % 40) / 100, gesture: null, look: null, lookUntil: 0, marker: null, proxy, alarm: 0, dead: false, rest: this.rests.get(v.id) ?? null,
      wait: 0,
    };
    if (wk.rest !== null) wk.heading = wk.rest;
    rig.root.rotation.y = wk.heading;
    if (v.status === 'dead') this.bury(wk);
    void ctx;
    return wk;
  }

  /** a villager who died is not drawn lying there: a small stone marks the place, and the story says the rest */
  private bury(wk: Walker): void {
    wk.dead = true;
    wk.rig.root.visible = false;
    if (!wk.marker) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: 0xa9a699, roughness: 1 }));
      m.position.set(wk.pos.x, this.walkY(wk.pos.x, wk.pos.z) + 0.08, wk.pos.z);
      m.castShadow = true;
      this.graves.add(m);
      wk.marker = m;
    }
    wk.proxy.userData.entity = { kind: 'villager', id: wk.v.id };
  }

  private revive(wk: Walker): void {
    wk.dead = false;
    wk.rig.root.visible = true;
    if (wk.marker) {
      this.graves.remove(wk.marker);
      wk.marker = null;
    }
  }

  /** a small, readable gesture driven by a real event: talk, listen, nod, doubt, point, think, cheer or alarm */
  gesture(id: string, kind: string, seconds = 1.6): void {
    const wk = this.walkers.get(id);
    if (wk && !wk.dead) wk.gesture = { kind, until: this.time + seconds };
  }

  /** turn to face a point for a while: the listener turning to the friend who told them */
  faceToward(id: string, x: number, z: number, seconds = 1.5): void {
    const wk = this.walkers.get(id);
    if (!wk || wk.dead) return;
    wk.look = new THREE.Vector3(x, 0, z);
    wk.lookUntil = this.time + seconds;
  }

  position(id: string): THREE.Vector3 | null {
    const wk = this.walkers.get(id);
    return wk ? wk.rig.root.position.clone() : null;
  }

  isMoving(id: string): boolean {
    const wk = this.walkers.get(id);
    return !!wk && wk.path.length > 0;
  }

  tick(dt: number, time: number, ctx: WorldContext): void {
    this.time = time;
    const reduced = ctx.reducedMotion;
    // true size up close; up to a third larger at the overview, so a person is a person and not a speck (their tap volume grows with them)
    const t = Math.min(1, Math.max(0, (ctx.viewDistance - 12) / 22));
    const legible = 1 + 0.32 * t * t * (3 - 2 * t);
    this.legible = legible;
    for (const wk of this.walkers.values()) {
      if (wk.dead) continue;
      const root = wk.rig.root;
      const v = wk.v;
      root.scale.setScalar(wk.rig.scale * 1.05 * legible);
      // ---- movement along the route
      let moving = false;
      let moved = 0;
      if (wk.wait > 0) wk.wait -= dt;
      else if (wk.path.length) {
        const next = wk.path[0];
        const dx = next.x - wk.pos.x;
        const dz = next.z - wk.pos.z;
        const d = Math.hypot(dx, dz);
        const urgent = v.duty === 'evacuate' || v.duty === 'hide' || v.duty === 'trapped';
        // a walk, or a run when the water is coming (slower when hurt or ill)
        const sp = (urgent ? 1.25 : 0.62) * wk.speed * (v.status === 'injured' || v.status === 'sick' ? 0.7 : 1);
        const step = sp * dt;
        if (d <= step) {
          wk.pos.x = next.x;
          wk.pos.z = next.z;
          wk.path.shift();
          moved = d;
        } else {
          wk.pos.x += (dx / d) * step;
          wk.pos.z += (dz / d) * step;
          moved = step;
        }
        if (d > 0.02) {
          const want = Math.atan2(dx, dz);
          wk.heading += angleDiff(want, wk.heading) * Math.min(1, dt * 9);
        }
        moving = true;
      } else {
        // standing: turn to face whoever they are looking at, or the thing their duty is about
        let faceAt: THREE.Vector3 | null = time < wk.lookUntil ? wk.look : null;
        if (!faceAt && v.duty === 'watch' && this.bridge) faceAt = new THREE.Vector3(this.bridge.x0 + 1.5, 0, this.bridge.row + 0.5);
        if (faceAt) {
          const want = Math.atan2(faceAt.x - wk.pos.x, faceAt.z - wk.pos.z);
          wk.heading += angleDiff(want, wk.heading) * Math.min(1, dt * 6);
        } else if (wk.rest !== null) wk.heading += angleDiff(wk.rest, wk.heading) * Math.min(1, dt * 3);
      }
      root.position.set(wk.pos.x, this.walkY(wk.pos.x, wk.pos.z), wk.pos.z);
      root.rotation.y = wk.heading;
      // ---- pose
      const r = wk.rig;
      const urgent = v.duty === 'evacuate' || v.duty === 'hide' || v.duty === 'trapped';
      wk.alarm += ((urgent || (wk.gesture?.kind === 'alarm' && time < wk.gesture.until) ? 1 : 0) - wk.alarm) * Math.min(1, dt * 3);
      // the legs cycle with the ground covered, one step for each stride's length, so a planted foot stays where it was put (a stride is
      // what two legs a hip-height long cover swinging through the angle, at the size the person is drawn); under a gown the stride is
      // shorter, and the skirt swings a little with each step
      const amp = urgent ? 0.95 : 0.7;
      const legAmp = r.robe ? amp * 0.75 : amp;
      const strideLen = 2 * LEG * Math.sin(legAmp) * root.scale.x;
      wk.phase += moving ? (moved / strideLen) * Math.PI : dt * 1.6;
      const swing = moving ? Math.sin(wk.phase) * amp : 0;
      // the foot's reach ahead of the hip runs almost straight through the step (mostly a triangle wave, a little rounded), so the
      // planted foot keeps pace with the ground instead of sliding as a pure sine swing makes it do
      const reach = moving ? 0.7 * (2 / Math.PI) * Math.asin(Math.sin(wk.phase)) + 0.3 * Math.sin(wk.phase) : 0;
      const stride = Math.asin(Math.sin(legAmp) * reach);
      r.legL.rotation.x = stride;
      r.legR.rotation.x = -stride;
      // the swinging leg bends at the knee and clears the ground (the left swings while cos(phase) < 0, the right while it is > 0); the leg
      // in stance stays straight, and the hips ride only as high as it reaches, so both soles stay on or above the ground
      r.kneeL.rotation.x = moving ? Math.max(0, -Math.cos(wk.phase)) * 0.95 : 0;
      r.kneeR.rotation.x = moving ? Math.max(0, Math.cos(wk.phase)) * 0.95 : 0;
      r.skirt.rotation.x = moving && !reduced ? Math.sin(wk.phase * 2) * (r.robe ? 0.05 : 0.025) : 0;
      r.armL.rotation.x = -swing * 0.9;
      r.armR.rotation.x = swing * 0.9;
      r.armL.rotation.z = 0.08;
      r.armR.rotation.z = -0.08;
      const bob = moving ? -LEG * (1 - Math.cos(stride)) : Math.sin(wk.phase * 0.8) * 0.004;
      r.body.position.y = bob;
      r.body.rotation.x = moving ? (urgent ? 0.18 : 0.06) : 0;
      r.torso.scale.y = 1 + (moving ? 0 : Math.sin(wk.phase * 0.8) * 0.02);
      r.head.rotation.y = !moving && !reduced ? Math.sin(time * 0.7 + wk.phase) * 0.35 : 0;
      r.head.rotation.x = 0;
      // ---- what the person is doing, by the engine's own duty
      if (!moving) {
        if (v.duty === 'work') {
          // tending: bend and swing an arm
          const w = Math.sin(time * 3.2 + wk.phase);
          r.body.rotation.x = 0.28 + w * 0.08;
          r.armR.rotation.x = -0.9 + w * 0.7;
          r.armL.rotation.x = -0.5 - w * 0.5;
          r.head.rotation.x = 0.15;
        } else if (v.duty === 'watch') {
          r.head.rotation.y = Math.sin(time * 0.9 + wk.phase) * 0.6;
          r.armR.rotation.x = -0.5;
          r.armR.rotation.z = -0.2;
        } else if (v.duty === 'guard') {
          r.armR.rotation.x = -0.1;
        } else if (v.duty === 'messenger') {
          r.armR.rotation.x = -1.2;
        } else if (v.duty === 'shelter' || v.duty === 'rest') {
          r.body.rotation.x = 0.04;
          r.armL.rotation.x = -0.15;
        }
      }
      if (v.duty === 'trapped' || wk.alarm > 0.5) {
        const wave = Math.sin(time * 9 + wk.phase);
        r.armL.rotation.x = -2.6 + wave * 0.3;
        r.armR.rotation.x = -2.6 - wave * 0.3;
        r.armL.rotation.z = 0.35;
        r.armR.rotation.z = -0.35;
      }
      if (v.status === 'injured' || v.status === 'sick') {
        r.body.rotation.x += 0.18;
        r.head.rotation.x = 0.2;
      }
      if (this.celebrating && !reduced) {
        const hop = Math.abs(Math.sin(time * 5 + wk.phase));
        r.body.position.y += hop * 0.04;
        r.armL.rotation.x = -2.6;
        r.armR.rotation.x = -2.6;
      }
      const g = wk.gesture;
      if (g && time < g.until) {
        const k = Math.sin(((g.until - time) * 7));
        // (each pose answers what an event did to this person: see EffectsLayer.react; under reduced motion it is held, not shaken)
        const w = reduced ? 0.5 : k;
        if (g.kind === 'talk') {
          r.armR.rotation.x = -0.9 + w * 0.4;
          r.head.rotation.x = 0.1 + Math.abs(w) * 0.1;
        } else if (g.kind === 'listen') {
          // listening: the head tilted toward the speaker
          r.head.rotation.z = 0.16;
          r.head.rotation.x = 0.06;
        } else if (g.kind === 'nod') {
          // convinced: a nod, a hand raised to the heart
          r.head.rotation.x = 0.1 + Math.max(0, w) * 0.3;
          r.armR.rotation.x = -1.05;
          r.armR.rotation.z = 0.55;
        } else if (g.kind === 'doubt') {
          // not having it: hands on hips and a shake of the head
          r.head.rotation.y = reduced ? 0.3 : Math.sin((g.until - time) * 11) * 0.38;
          r.armL.rotation.x = 0.15;
          r.armR.rotation.x = 0.15;
          r.armL.rotation.z = 0.5;
          r.armR.rotation.z = -0.5;
        } else if (g.kind === 'point') {
          // arguing: a jabbing hand and a lean in
          r.armR.rotation.x = -1.45 + w * 0.14;
          r.armR.rotation.z = -0.15;
          r.body.rotation.x += 0.08;
        } else if (g.kind === 'cheer') {
          r.armL.rotation.x = -2.8 + w * 0.2;
          r.armR.rotation.x = -2.8 - w * 0.2;
          r.body.position.y += Math.abs(w) * 0.03;
        } else if (g.kind === 'think') {
          r.armR.rotation.x = -1.9;
          r.head.rotation.x = 0.2;
        }
      } else if (g) wk.gesture = null;
    }
    this.updateRings(time);
  }

  /** a selected house shows the way its people would go to the nearest shelter, only over tiles the engine says can be walked */
  private updateRoute(time: number): void {
    const snap = this.snapRef;
    const sel = this.selection;
    const home = snap && sel?.kind === 'landmark' ? snap.landmarks.find((l) => l.id === sel.id && (l.kind === 'home' || l.kind === 'cabin')) : null;
    const key = home ? `${home.id}:${snap?.revision}` : '';
    this.routeDots.visible = !!home;
    (this.routeDots.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    if (!snap || !home) {
      this.routeFor = '';
      return;
    }
    if (key === this.routeFor) return;
    this.routeFor = key;
    let shelter: { x: number; y: number } | null = null;
    let best = 1e9;
    for (const l of snap.landmarks) {
      if (l.kind !== 'shelter' || l.hp <= 0) continue;
      const d = Math.hypot(l.x - home.x, l.y - home.y);
      if (d < best) {
        best = d;
        shelter = l;
      }
    }
    const pts = shelter ? this.route({ x: home.x, y: home.y }, { x: shelter.x, y: shelter.y }, snap) : [];
    let n = 0;
    for (let i = 0; i + 1 < pts.length && n < ROUTE_DOTS; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.round(len / 0.22));
      for (let k = 0; k < steps && n < ROUTE_DOTS; k++) {
        const t = k / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        this.routePos[n * 3] = x;
        this.routePos[n * 3 + 1] = this.walkY(x, z) + 0.07;
        this.routePos[n * 3 + 2] = z;
        this.routeIdx[n] = n;
        n++;
      }
    }
    const g = this.routeDots.geometry;
    g.setDrawRange(0, n);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aIdx') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateMarks(): void {
    let i = 0;
    const tmp = new THREE.Color();
    for (const wk of this.walkers.values()) {
      if (i >= MARKS) break;
      const show = !wk.dead && wk.rig.root.visible;
      this.markPos[i * 3] = wk.pos.x;
      this.markPos[i * 3 + 1] = this.walkY(wk.pos.x, wk.pos.z) + 0.62 * this.legible;
      this.markPos[i * 3 + 2] = wk.pos.z;
      tmp.set(wk.v.factionColor);
      this.markCol[i * 3] = tmp.r;
      this.markCol[i * 3 + 1] = tmp.g;
      this.markCol[i * 3 + 2] = tmp.b;
      this.markSize[i] = show ? (this.selection?.kind === 'villager' && this.selection.id === wk.v.id ? 0.62 : 0.4) : 0;
      i++;
    }
    for (; i < MARKS; i++) this.markSize[i] = 0;
    const g = this.marks.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateRings(time: number): void {
    this.updateMarks();
    this.updateRoute(time);
    const sel = this.selection?.kind === 'villager' ? this.walkers.get(this.selection.id) : null;
    this.ring.visible = !!sel && !sel.dead;
    if (sel && !sel.dead) {
      this.ring.position.set(sel.pos.x, this.walkY(sel.pos.x, sel.pos.z) + 0.02, sel.pos.z);
      const s = 1 + Math.sin(time * 4) * 0.05;
      this.ring.scale.set(s, s, s);
    }
    const hv = this.hover?.kind === 'villager' ? this.walkers.get(this.hover.id) : null;
    this.ringHover.visible = !!hv && !hv.dead && hv !== sel;
    if (hv && !hv.dead) this.ringHover.position.set(hv.pos.x, this.walkY(hv.pos.x, hv.pos.z) + 0.02, hv.pos.z);
    // belief rings for the active story: gold when they believe, red when they reject, grey when not yet scouted
    for (const wk of this.walkers.values()) {
      let m = this.beliefRings.get(wk.v.id);
      const conv = this.activeClaim ? wk.v.conv[this.activeClaim] : undefined;
      const hint = this.hints.has(wk.v.id);
      if ((conv === undefined && !hint) || wk.dead) {
        if (m) m.visible = false;
        continue;
      }
      if (!m) {
        m = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.18, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 7;
        this.group.add(m);
        this.beliefRings.set(wk.v.id, m);
      }
      m.visible = true;
      m.position.set(wk.pos.x, this.walkY(wk.pos.x, wk.pos.z) + 0.015, wk.pos.z);
      const known = this.known.has(wk.v.id);
      const mm = m.material as THREE.MeshBasicMaterial;
      if (hint) {
        mm.color.set(0xf2b84b);
        const p = 1 + Math.sin(time * 5) * 0.12;
        m.scale.set(p * 1.2, p * 1.2, p * 1.2);
        mm.opacity = 0.95;
      } else if (conv !== undefined) {
        m.scale.set(1, 1, 1);
        if (!known) {
          mm.color.set(0xaab6c6);
          mm.opacity = 0.45;
        } else if (conv > 0) {
          mm.color.set(0xf2b84b);
          mm.opacity = 0.35 + Math.min(0.65, conv / 90);
        } else if (conv < 0) {
          mm.color.set(0xe5586a);
          mm.opacity = 0.85;
        } else {
          mm.color.set(0x96aabe);
          mm.opacity = 0.5;
        }
      }
    }
  }

  /** how many dots of the way out are on show (0 when no house is selected): a hook for tests */
  routeLength(): number {
    return this.routeDots.visible ? this.routeDots.geometry.drawRange.count : 0;
  }

  pickables(): THREE.Object3D[] {
    return this.proxyList;
  }

  locate(kind: 'villager' | 'landmark', id: string): THREE.Vector3 | null {
    if (kind !== 'villager') return null;
    const wk = this.walkers.get(id);
    if (!wk) return null;
    return new THREE.Vector3(wk.pos.x, this.walkY(wk.pos.x, wk.pos.z) + 0.34, wk.pos.z);
  }

  headPosition(id: string): THREE.Vector3 | null {
    const p = this.locate('villager', id);
    return p ? p.add(new THREE.Vector3(0, 0.12, 0)) : null;
  }

  effectCount(): number {
    return 0;
  }

  dispose(): void {
    this.clear();
    this.marks.geometry.dispose();
    (this.marks.material as THREE.Material).dispose();
    this.routeDots.geometry.dispose();
    (this.routeDots.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.ringHover.geometry.dispose();
    (this.ringHover.material as THREE.Material).dispose();
    for (const g of geoCache.values()) g.dispose();
    geoCache.clear();
    lanternMat?.dispose();
    lanternMat = null;
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
