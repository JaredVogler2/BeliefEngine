/**
 * A clip of the real world in motion, rendered offline frame by frame. The live loop is frozen and the animation clock is stepped by
 * exactly one frame (1/fps of a second) with advance(), the same simulate-then-draw the live loop does, and the canvas is photographed
 * after each step: the clip plays at true speed however slowly a software rasteriser draws it. ffmpeg joins the frames into a small
 * animated WebP (for the docs) and, with --mp4, an H.264 clip; a strip of consecutive frames is written too.
 *
 * It also measures the motion. Between every pair of neighbouring frames it takes the mean difference of the whole picture (a pop or a
 * flicker shows as one pair far above the rest), and it keeps, pixel by pixel, the largest change seen over the clip: an image that is
 * dark wherever nothing moved and bright where something did, so shimmer on ground that should be still can be seen at a glance.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npx tsx scripts/capture-sequence.ts --shot river|people|storm|village [--frames 48] [--fps 24] [--size 960x600] [--out docs/3d-rebuild/video]
 *     [--mp4] [--forecast 0] [--params post=0] [--keep]
 *
 * Shots: river (the water under the bridge on Day 1 of Redbank, seed 1), people (the next morning loaded on top of the first, as the game
 * does when a day ends, framed on whoever has the farthest to walk), storm (a recorded run in its flood: rain, wind and high water),
 * village (the opening view of Day 1 as it is, where shimmer or popping anywhere in the scene would show).
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { GameSession, serializeRun } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const shot = arg('shot', 'river');
const base = arg('url', 'http://127.0.0.1:4173');
const frames = Number(arg('frames', '48'));
const fps = Number(arg('fps', '24'));
const [W, H] = arg('size', '960x600').split('x').map(Number);
const out = arg('out', 'docs/3d-rebuild/video');
const mp4 = args.includes('--mp4');
/** extra page parameters, for comparisons (for example `post=0`, the world drawn without its finishing chain) */
const extra = arg('params', '');
/** --forecast 0 turns tonight's flood forecast off the ground (it hatches the banks the water may reach), to judge the water alone */
const forecast = arg('forecast', '1') !== '0';
const work = `${out}/.frames-${shot}`;

/** a run played by one of the bots for some days (0: the first morning) */
function played(seed: number, days: number, policy: string): string {
  const g = GameSession.create({ scenarioId: 'redbank', seed });
  const p = policyById(policy);
  for (let i = 0; i < days && !g.state.outcome; i++) p.playDay(g);
  return serializeRun(g.state);
}
// the storm: a run the threat-aware bot played into its flood (seed 2, day 6). The others start on the first morning of seed 1; for
// the people, the next morning is then loaded on top, as the game does when a day ends, and everyone walks to where that day puts them
const first = shot === 'storm' ? played(2, 5, 'threat-aware') : played(1, 0, 'evidence-first');
const next = shot === 'people' ? played(1, 1, 'evidence-first') : null;

mkdirSync(work, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`${base}/?debug=1&renderer=3d&quality=high&scale=1${extra ? `&${extra}` : ''}`);
await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), first);
await page.waitForSelector('.stage[data-ready="1"]', { timeout: 120000 });
await page.addStyleTag({ content: '.hud, .topbar, .side, .claims, .hand, .tray, .modes, .map-tools, .corner, .coach, .stage-note, .pop, .hover-tip, .digest, header, footer { visibility: hidden !important; }' });
if (!forecast) await page.evaluate(() => (window as unknown as { __belief: { store: { setSettings: (p: unknown) => void } } }).__belief.store.setSettings({ showFlood: false }));
await page.waitForTimeout(1500);
if (next) {
  await page.evaluate('window.__beRenderer.setFrozen(true)');
  await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), next);
  await page.waitForTimeout(800);
}
// freeze the live loop, so only advance() moves time, and aim the camera; then run the clock until the camera has arrived
const aimed = await page.evaluate(`(() => {
  const r = window.__beRenderer;
  const st = window.__belief.state;
  r.setFrozen(true);
  r.advance(0.5);
  const shot = ${JSON.stringify(shot)};
  let v;
  if (shot === 'people') {
    // everyone has set off by now; follow whoever has the farthest still to walk, from the side, close enough to see each step land
    r.advance(5);
    const all = [...r.layers.find((l) => l.walkers).walkers.values()];
    const len = (w) => w.path.reduce((s, q, i) => s + Math.hypot(q.x - (i ? w.path[i - 1].x : w.pos.x), q.z - (i ? w.path[i - 1].z : w.pos.z)), 0);
    const walking = all.filter((w) => w.path && w.path.length && !(w.wait > 0)).sort((a, b) => len(b) - len(a));
    const w = walking[0] ?? all[0];
    window.__follow = w.v.id;
    const q = w.path[0] ?? w.pos;
    const side = (Math.atan2(q.x - w.pos.x, q.z - w.pos.z) * 180) / Math.PI + 90;
    r.cam.minDist = 2;
    v = { x: w.pos.x, z: w.pos.z, dist: 3.4, azimuthDeg: side, elevationDeg: 34, follow: w.v.id, walking: walking.length, left: Math.round(len(w) * 10) / 10 };
  } else if (shot === 'village') {
    // the opening view itself, untouched: where shimmer or popping anywhere in the scene would show
    v = r.describeView();
  } else {
    const br = st.world.landmarks.find((l) => l.kind === 'bridge');
    const t = br.tiles[Math.floor(br.tiles.length / 2)];
    v = shot === 'storm'
      ? { x: t[0] + 0.5, z: t[1] + 0.5, dist: 16, azimuthDeg: 40, elevationDeg: 34 }
      : { x: t[0] + 0.5, z: t[1] + 0.5, dist: 7.5, azimuthDeg: 52, elevationDeg: 30 };
  }
  r.setView(v);
  r.advance(4);
  return v;
})()`);
console.log(`${shot}: view ${JSON.stringify(aimed)}`);

const files: string[] = [];
for (let i = 0; i < frames; i++) {
  // (the people shot keeps the camera on the person it follows)
  if (shot === 'people') await page.evaluate(`(() => { const r = window.__beRenderer; const w = r.layers.find((l) => l.walkers).walkers.get(window.__follow); r.setView({ x: w.pos.x, z: w.pos.z }); })()`);
  if (i > 0) await page.evaluate(`window.__beRenderer.advance(${1 / fps})`);
  await page.evaluate('window.__beRenderer.renderNow()');
  const f = `${work}/f${String(i).padStart(3, '0')}.png`;
  await page.screenshot({ path: f, clip: { x: 0, y: 0, width: W, height: H } });
  files.push(f);
}
await browser.close();

// ---- the motion, measured: mean change between neighbours (as a fraction of full range), and the largest change per pixel
const mae = (a: string, b: string): number => {
  let text = '';
  try {
    execFileSync('compare', ['-metric', 'MAE', a, b, 'null:'], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    text = String((e as { stderr?: Buffer }).stderr ?? '');
  }
  const m = /\(([\d.e+-]+)\)/.exec(text);
  return m ? Number(m[1]) : 0;
};
const pairs: number[] = [];
for (let i = 1; i < files.length; i++) pairs.push(mae(files[i - 1], files[i]));
const sorted = [...pairs].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
const worst = sorted[sorted.length - 1] ?? 0;
const diffs: string[] = [];
for (let i = 1; i < files.length; i++) {
  const d = `${work}/d${String(i).padStart(3, '0')}.png`;
  execFileSync('convert', [files[i - 1], files[i], '-compose', 'difference', '-composite', '-colorspace', 'gray', d]);
  diffs.push(d);
}
// brightened so a change of a few levels is visible; the frame itself is laid faintly underneath, to say where things are
execFileSync('convert', [...diffs, '-evaluate-sequence', 'max', '-level', '0%,25%', `${work}/max.png`]);
execFileSync('convert', [files[0], '-colorspace', 'gray', '-level', '0%,400%', `${work}/max.png`, '-compose', 'lighten', '-composite', '-resize', '50%', '-quality', '86', `${out}/${shot}-change.jpg`]);
// twelve neighbouring frames (half a second at 24 fps) side by side, two rows, at a third of the size
const strip = files.slice(0, 12);
if (strip.length >= 12) {
  execFileSync('convert', [...strip.slice(0, 6), '+append', '-resize', '33%', `${work}/row1.png`]);
  execFileSync('convert', [...strip.slice(6, 12), '+append', '-resize', '33%', `${work}/row2.png`]);
  execFileSync('convert', [`${work}/row1.png`, `${work}/row2.png`, '-append', '-quality', '84', `${out}/${shot}-frames.jpg`]);
}
// the clip: a small animated WebP that loops (for the docs), and the full-size H.264 when asked
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${work}/f%03d.png`, '-vf', `scale=${Math.round(W / 2)}:-1`, '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '70', '-loop', '0', `${out}/${shot}.webp`]);
if (mp4) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${work}/f%03d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', `${out}/${shot}.mp4`]);
writeFileSync(
  `${out}/${shot}.json`,
  JSON.stringify(
    {
      shot,
      measuredWith: 'headless Chromium, software WebGL (SwiftShader); the live loop frozen and the animation clock stepped one frame at a time with advance()',
      frames,
      fps,
      size: `${W}x${H}`,
      view: aimed,
      meanChangeBetweenNeighbours: { median: Math.round(median * 1e5) / 1e5, worst: Math.round(worst * 1e5) / 1e5, worstOverMedian: median ? Math.round((worst / median) * 100) / 100 : null },
      everyPair: pairs.map((p) => Math.round(p * 1e5) / 1e5),
    },
    null,
    2,
  ),
);
if (!args.includes('--keep')) rmSync(work, { recursive: true, force: true });
console.log(`${shot}: change between neighbouring frames median ${median.toFixed(4)}, worst ${worst.toFixed(4)} (${median ? (worst / median).toFixed(2) : '-'}x the median)`);
console.log(`wrote ${out}/${shot}.webp, ${shot}-frames.jpg, ${shot}-change.jpg, ${shot}.json${mp4 ? `, ${shot}.mp4` : ''}`);
