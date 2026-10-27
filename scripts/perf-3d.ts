/**
 * Measure the 3D world on whatever this machine can run it on, per quality tier, for the calm village and the flood night:
 * scene cost (triangles, draw calls, geometries, textures), time from loading a run to the first drawn frame, the page's JS heap,
 * and the real frame intervals over a few seconds (p50 / p95).
 *
 * Honest limit: in a container the only WebGL is a software rasteriser (SwiftShader), so the frame times below are a CPU
 * rasteriser's, useful for comparing tiers and for catching regressions, and nothing like a GPU's. The numbers that do carry over to
 * real hardware are the scene counts and the memory. Output: a table on stdout and docs/3d-rebuild/data/perf.json.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npx tsx scripts/perf-3d.ts [--url http://127.0.0.1:4173] [--seconds 6] [--size 1366x768]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GameSession, serializeRun } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const base = arg('url', 'http://127.0.0.1:4173');
const seconds = Number(arg('seconds', '6'));
const [W, H] = arg('size', '1366x768').split('x').map(Number);

const played = (days: number, policy: string, seed: number): string => {
  const g = GameSession.create({ scenarioId: 'redbank', seed });
  const p = policyById(policy);
  for (let i = 0; i < days && !g.state.outcome; i++) p.playDay(g);
  return serializeRun(g.state);
};
const scenes = { calm: played(0, 'noop', 1), flood: played(5, 'threat-aware', 2) } as const;

interface Row {
  tier: string;
  scene: string;
  scale: number;
  triangles: number;
  calls: number;
  geometries: number;
  textures: number;
  buildMs: number;
  heapMb: number;
  p50: number;
  p95: number;
  drawn: number;
  drawMs: number;
  tierEnd: string;
}

const browser = await chromium.launch();
const rows: Row[] = [];
for (const tier of ['low', 'medium', 'high']) {
  for (const [name, json] of Object.entries(scenes)) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    await page.goto(`${base}/?debug=1&renderer=3d&quality=${tier}&scale=${tier === 'high' ? 0.5 : 0.5}`);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
    const t0 = Date.now();
    await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), json);
    await page.waitForSelector('.stage[data-ready="1"]', { timeout: 120000 });
    await page.waitForFunction(() => ((window as unknown as { __beRenderer?: { info: () => { frames: number } } }).__beRenderer?.info().frames ?? 0) > 0, undefined, { timeout: 120000 });
    const buildMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    // a string, not a function: tsx's name-keeping helper does not exist in the page
    const m = (await page.evaluate(`(async () => {
      const r = window.__beRenderer;
      const stamps = [];
      const frames0 = r.info().frames;
      const t0 = performance.now();
      const end = performance.now() + ${seconds} * 1000;
      await new Promise((done) => {
        const tick = (t) => {
          stamps.push(t);
          if (t < end) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      const d = stamps.slice(1).map((v, i) => v - stamps[i]).sort((a, b) => a - b);
      const q = (p) => d[Math.min(d.length - 1, Math.floor(p * d.length))] || 0;
      const mem = performance.memory;
      const info = r.info();
      return { p50: q(0.5), p95: q(0.95), drawn: (info.frames - frames0) / ((performance.now() - t0) / 1000), fps: d.length / (d.reduce((a, b) => a + b, 0) / 1000), heap: mem ? mem.usedJSHeapSize / 1048576 : 0, ...info };
    })()`)) as { p50: number; p95: number; drawn: number; tier: string; drawMs: number; fps: number; heap: number; scale: number; triangles: number; calls: number; geometries: number; textures: number; buildMs: number };
    rows.push({ tier, scene: name, scale: m.scale, triangles: m.triangles, calls: m.calls, geometries: m.geometries, textures: m.textures, buildMs: m.buildMs || buildMs, heapMb: Math.round(m.heap * 10) / 10, p50: Math.round(m.p50), p95: Math.round(m.p95), drawn: Math.round(m.drawn * 10) / 10, drawMs: m.drawMs, tierEnd: m.tier });
    await ctx.close();
  }
}
await browser.close();

console.log('tier    scene  scale  triangles  calls  geoms  tex  build(ms)  heap(MB)  drawn/s  draw(ms)  tier-end  rAF p50  rAF p95');
for (const r of rows) console.log(`${r.tier.padEnd(7)} ${r.scene.padEnd(6)} ${String(r.scale).padEnd(6)} ${String(r.triangles).padEnd(10)} ${String(r.calls).padEnd(6)} ${String(r.geometries).padEnd(6)} ${String(r.textures).padEnd(4)} ${String(r.buildMs).padEnd(10)} ${String(r.heapMb).padEnd(9)} ${String(r.drawn).padEnd(8)} ${String(r.drawMs).padEnd(9)} ${r.tierEnd.padEnd(9)} ${String(r.p50).padEnd(8)} ${r.p95}`);
mkdirSync('docs/3d-rebuild/data', { recursive: true });
writeFileSync('docs/3d-rebuild/data/perf.json', JSON.stringify({ measuredWith: 'headless Chromium, software WebGL (SwiftShader); not a GPU', viewport: `${W}x${H}`, seconds, rows }, null, 2));
