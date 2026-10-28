/**
 * Runs the 3D world on the real hardware of the machine it is started on, and writes down what it saw. Made for the Apple-silicon macOS
 * runners of CI (`.github/workflows/real-hardware.yml`): there the GPU is Apple's, reached through the virtual machine's paravirtualised
 * graphics device. That is a real GPU, not a software rasteriser, but it is not a phone, and nothing written here claims to be one.
 *
 *   chrome  Chrome (Playwright's Chromium, headed) on the machine's GPU, through the default route (no ?renderer=3d): which renderer the
 *           game chooses there, which GPU WebGL reports, then for a desktop window and an iPhone-sized one, the calm village, a night
 *           of effects (shader programs counted before and after it) and the flood night, each left running in the live loop with its
 *           own frame pacing and quality monitor; the frame times it reports (median and 95th percentile), the tier it settles on, the
 *           scene counts, stalls and video memory, the frame times again while the view turns (the calm village), a back-to-back
 *           benchmark, and a screenshot of each (and the desktop village with no interface, for the art director's test, and its
 *           waterfall close up).
 *   safari  Safari itself, driven through safaridriver (WebDriver; `sudo safaridriver --enable` first): the same calm village and flood
 *           night in a desktop window, the same numbers and screenshots.
 *   ios     Mobile Safari in the iOS Simulator: an iPhone is booted, the game is opened with a link that goes straight into the first day
 *           with the developer monitor on (`&play=1&perf=1`), and the screen is photographed after one and after two minutes. The
 *           Simulator draws through the Mac's GPU, so its frame times say nothing about a phone's; what it shows is iOS WebKit running
 *           the 3D world.
 *
 * Output: `<out>/<mode>.json` and PNG screenshots, and a summary appended to the CI job summary when there is one.
 *   npm run build && npx vite preview --port 4173 &
 *   npx tsx scripts/real-hardware.ts chrome|safari|ios [--url http://127.0.0.1:4173] [--out hw]
 *     [--headless --force3d: to try it on a machine with no display and no GPU, where the game would otherwise choose the classic map]
 */
import { chromium, devices } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { GameSession, serializeRun } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';

const args = process.argv.slice(2);
const mode = args[0];
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const base = arg('url', 'http://127.0.0.1:4173');
/** for trying the script on a machine with no GPU: ask for the 3D world instead of taking the game's own choice */
const force = args.includes('--force3d') ? 'renderer=3d&' : '';
const out = arg('out', 'hw');
mkdirSync(out, { recursive: true });
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const played = (days: number, policy: string, seed: number): string => {
  const g = GameSession.create({ scenarioId: 'redbank', seed });
  const p = policyById(policy);
  for (let i = 0; i < days && !g.state.outcome; i++) p.playDay(g);
  return serializeRun(g.state);
};
const scenes = { calm: played(0, 'noop', 1), flood: played(5, 'threat-aware', 2), night: played(4, 'threat-aware', 2) };

/** what WebGL says it runs on, read in the page */
const GPU_PROBE = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { webgl2: false, vendor: null, renderer: null };
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const r = { webgl2: true, vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)), renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)) };
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  return r;
})()`;

/** the world's own record, read in the page (the classic map has none: then only the renderer the game chose is returned) */
const READ = `(() => {
  const r = window.__beRenderer;
  const stage = document.querySelector('.stage');
  const renderer = stage ? stage.getAttribute('data-renderer') : null;
  if (!r || typeof r.info !== 'function') return { renderer, info: null, memory: null, dpr: window.devicePixelRatio, css: [window.innerWidth, window.innerHeight] };
  return { renderer, info: r.info(), memory: typeof r.memory === 'function' ? r.memory() : null, dpr: window.devicePixelRatio, css: [window.innerWidth, window.innerHeight] };
})()`;
/** a GPU name that is a software rasteriser (the same test the game makes) */
const SOFT = /swiftshader|llvmpipe|softpipe|software|basic render/i;

const summary: string[] = [];
const note = (line: string): void => {
  console.log(line);
  summary.push(line);
};
const finish = (data: unknown): void => {
  writeFileSync(`${out}/${mode}.json`, `${JSON.stringify(data, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${mode}\n\n${summary.map((l) => `- ${l}`).join('\n')}\n\n`);
};

type Reading = { renderer: string | null; info: Record<string, unknown> | null; memory: Record<string, unknown> | null; dpr: number; css: [number, number] } | null;
const brief = (r: Reading): string => {
  if (!r) return 'no world';
  if (!r.info) return `the game chose the ${r.renderer === '2d' ? 'classic map' : `renderer "${r.renderer}"`}`;
  const i = r.info as { tier: string; capFps?: number; scale: number; fps: number; frameP50Ms: number; frameP95Ms: number; drawMs: number; calls: number; triangles: number; programs: number; firstDrawMs: number; worstDrawMs: number; hitches: number; software: boolean };
  const m = r.memory as { textureMB: number; targetMB: number; people: { near: number; far: number } } | null;
  return `${r.renderer} · ${i.software ? 'SOFTWARE GL' : 'hardware GL'} · tier ${i.tier} ×${i.scale}${i.capFps ? ` (cap ${i.capFps})` : ''} · ${Math.round(i.fps)} fps, frame p50 ${i.frameP50Ms} / p95 ${i.frameP95Ms} ms, draw ${i.drawMs} ms · ${i.calls} calls, ${i.triangles} triangles, ${i.programs} programs · first draw ${i.firstDrawMs} ms, worst ${i.worstDrawMs} ms, ${i.hitches} hitches${m ? ` · video ≈ ${m.textureMB} + ${m.targetMB} MB · people ${m.people.far}/${m.people.near + m.people.far} far` : ''}`;
};

// ---------------------------------------------------------------------------------------------------------------------------- chrome

async function chrome(): Promise<void> {
  const results: Record<string, unknown> = {};
  for (const flags of [[], ['--ignore-gpu-blocklist']]) {
    const browser = await chromium.launch({ headless: args.includes('--headless'), args: flags });
    const version = browser.version();
    const label = flags.length ? 'chrome (GPU blocklist ignored)' : 'chrome';
    const run: Record<string, unknown> = { version, flags };
    let software = false;
    const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
    // quality=auto: the tier a player's browser would start on (an automated one otherwise starts low) with the quality monitor free to
    // step down; quality=high: the high tier held, for what it costs on this GPU and for the art director's frame. The night comes before
    // the flood night (since run 6), so it resolves in a page that has drawn only the calm village, as a player's first night does, and
    // not in one whose shaders the flood night has already compiled
    const views: { name: string; opts: object; quality: string; scenes: (keyof typeof scenes)[] }[] = [
      { name: 'desktop', opts: desktop, quality: 'auto', scenes: ['calm', 'night', 'flood'] },
      { name: 'phone', opts: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } }, quality: 'auto', scenes: ['calm', 'night', 'flood'] },
      { name: 'desktop-high', opts: desktop, quality: 'high', scenes: ['calm', 'flood'] },
    ];
    for (const view of views) {
      const ctx = await browser.newContext(view.opts as never);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`${base}/?${force}debug=1&perf=1&quality=${view.quality}`);
      await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief, undefined, { timeout: 60_000 });
      const gpu = (await page.evaluate(GPU_PROBE)) as { webgl2: boolean; vendor: string | null; renderer: string | null };
      software ||= !gpu.webgl2 || SOFT.test(gpu.renderer ?? '');
      const rows: Record<string, unknown> = { gpu };
      note(`${label} ${version}, ${view.name} (quality=${view.quality}): WebGL2 ${gpu.webgl2 ? 'yes' : 'no'}, GPU "${gpu.renderer}"`);
      for (const scene of view.scenes) {
        await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), scenes[scene]);
        await page.waitForSelector('.stage[data-ready="1"]', { timeout: 120_000 });
        // the world's record just before the night ends, so what the night itself compiles (shader programs) shows
        let beforeNight: Reading = null;
        if (scene === 'night') {
          // the night itself: what the engine does at the end of the day, with its effects, in the live loop
          await sleep(4000);
          beforeNight = (await page.evaluate(READ)) as Reading;
          await page.evaluate(() => (window as unknown as { __belief: { store: { endDay: () => void } } }).__belief.store.endDay());
        }
        // the live loop, with its frame pacing and the quality monitor free to step down: what a player on this machine would get. The
        // tier is read every two seconds, so a step down (and when it came) shows
        const timeline: unknown[] = [];
        let at = 0;
        for (const t of [0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 12]) {
          await sleep((t - at) * 1000);
          at = t;
          const r = (await page.evaluate(READ)) as Reading;
          const i = r?.info as { tier: string; capFps?: number; scale: number; fps: number; frameP50Ms: number; frames: number; drawMs: number } | null | undefined;
          if (i) timeline.push({ t, tier: i.tier, cap: i.capFps, scale: i.scale, frames: i.frames, fps: Math.round(i.fps), p50: i.frameP50Ms, draw: i.drawMs });
        }
        const live = (await page.evaluate(READ)) as Reading;
        // (the night's morning report would cover the village in the picture)
        if (scene === 'night') await page.evaluate(() => (window as unknown as { __belief: { store: { closeDigest: () => void } } }).__belief.store.closeDigest());
        await page.screenshot({ path: `${out}/${label.replace(/\W+/g, '-')}-${view.name}-${scene}.png` });
        // the view turning (a slow orbit, as a player turns it): the medium tier draws at up to 60 a second while the view moves and
        // rests at 30 while it is still, so the frame times are read again after five seconds of turning
        let moving: Reading = null;
        if (live?.renderer === '3d' && scene === 'calm') {
          await page.evaluate(`(() => { const r = window.__beRenderer; window.__turn = setInterval(() => r.orbitBy(0.006, 0), 40); })()`);
          await sleep(5000);
          moving = (await page.evaluate(READ)) as Reading;
          await page.evaluate(`(() => { clearInterval(window.__turn); window.__beRenderer.fit(); })()`);
          await sleep(1500);
          note(`${view.name} ${scene} while the view turns: ${brief(moving)}`);
        }
        let bench: unknown = null;
        if (live?.renderer === '3d' && scene !== 'night') bench = await page.evaluate('window.__beRenderer.benchmark(120)');
        // where the high tier's GPU time goes: the same frames with parts of the finishing chain switched off in turn
        let parts: unknown = null;
        if (live?.renderer === '3d' && view.quality === 'high' && scene === 'calm') {
          parts = await page.evaluate(`(async () => {
            const r = window.__beRenderer;
            const out = { full: await r.benchmark(90) };
            r.setPost({ ao: 0 });
            out.noAmbientOcclusion = await r.benchmark(90);
            r.setPost({ ao: 0, bloom: false });
            out.noAmbientOcclusionNoBloom = await r.benchmark(90);
            r.setPost({ enabled: false });
            out.noChainAtAll = await r.benchmark(90);
            r.setPost(null);
            return out;
          })()`);
          note(`${view.name} ${scene} cost by part (median ms back to back): ${Object.entries(parts as Record<string, { medianMs: number }>).map(([k, v]) => `${k} ${v.medianMs}`).join(', ')}`);
        }
        rows[scene] = { live, moving, bench, timeline, parts, beforeNight };
        if (beforeNight?.info && live?.info) note(`${view.name} night: ${String(beforeNight.info.programs)} shader programs before it ended, ${String(live.info.programs)} after`);
        note(`${view.name} ${scene}: ${brief(live)}${bench ? ` · back to back: ${JSON.stringify(bench)}` : ''}`);
        note(`${view.name} ${scene} tier every 2 s: ${timeline.map((x) => `${(x as { tier: string }).tier}×${(x as { scale: number }).scale}`).join(' ')}`);
      }
      if (view.name === 'desktop-high') {
        // the art director's test: Day 1 with no interface at all, on this GPU, at the high tier
        await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), scenes.calm);
        await page.waitForSelector('.stage[data-ready="1"]', { timeout: 120_000 });
        // everything but the world's canvas is hidden (visibility is inherited, so the canvas alone is shown again)
        await page.addStyleTag({ content: 'body * { visibility: hidden !important; } .stage, .stage > canvas { visibility: visible !important; } .stage { position: fixed !important; inset: 0 !important; }' });
        await sleep(6000);
        await page.screenshot({ path: `${out}/${label.replace(/\W+/g, '-')}-desktop-day1-no-interface.png` });
        // the waterfall close up: its mist is point sprites, which drew at half their size at this pixel ratio until they were sized in
        // CSS pixels (run 5's frames showed the mist as dots)
        await page.evaluate('window.__beRenderer.setView({ azimuthDeg: 28, elevationDeg: 30, dist: 9, x: 13.5, z: 17 })');
        await sleep(4000);
        await page.screenshot({ path: `${out}/${label.replace(/\W+/g, '-')}-desktop-falls-close-up.png` });
      }
      rows.errors = errors;
      if (errors.length) note(`${view.name}: console errors: ${errors.slice(0, 3).join(' | ')}`);
      run[view.name] = rows;
      await ctx.close();
    }
    await browser.close();
    results[label] = run;
    // the blocklist pass is only needed when Chrome's own choice was the software rasteriser
    if (!software) break;
  }
  finish(results);
}

// ---------------------------------------------------------------------------------------------------------------------------- safari

async function safari(): Promise<void> {
  const port = 4444;
  const driver = spawn('safaridriver', ['-p', String(port)], { stdio: 'inherit' });
  const wd = async (method: string, path: string, body?: unknown): Promise<{ value: unknown }> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json()) as { value: unknown };
    if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json).slice(0, 400)}`);
    return json;
  };
  for (let i = 0; i < 60; i++) {
    try {
      await wd('GET', '/status');
      break;
    } catch {
      await sleep(500);
    }
  }
  const results: Record<string, unknown> = {};
  const created = (await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })).value as { sessionId: string; capabilities: Record<string, unknown> };
  const sid = created.sessionId;
  const exec = async (script: string, a: unknown[] = []): Promise<unknown> => (await wd('POST', `/session/${sid}/execute/sync`, { script, args: a })).value;
  try {
    results.capabilities = { browserName: created.capabilities.browserName, browserVersion: created.capabilities.browserVersion, platformName: created.capabilities.platformName };
    await wd('POST', `/session/${sid}/window/rect`, { x: 0, y: 0, width: 1440, height: 900 });
    await wd('POST', `/session/${sid}/url`, { url: `${base}/?${force}debug=1&perf=1&quality=auto` });
    for (let i = 0; i < 120 && !(await exec('return !!window.__belief')); i++) await sleep(500);
    const gpu = await exec(`return ${GPU_PROBE}`);
    results.gpu = gpu;
    results.userAgent = await exec('return navigator.userAgent');
    note(`Safari ${String(results.capabilities && (results.capabilities as { browserVersion?: string }).browserVersion)}: GPU ${JSON.stringify(gpu)}`);
    for (const [scene, json] of Object.entries({ calm: scenes.calm, flood: scenes.flood })) {
      await exec('return window.__belief.load(arguments[0])', [json]);
      for (let i = 0; i < 240; i++) {
        const st = (await exec("const s = document.querySelector('.stage'); return s ? s.getAttribute('data-ready') : null")) as string | null;
        if (st === '1') break;
        await sleep(500);
      }
      await sleep(12_000);
      const live = (await exec(`return ${READ}`)) as Reading;
      const shot = (await wd('GET', `/session/${sid}/screenshot`)).value as string;
      writeFileSync(`${out}/safari-desktop-${scene}.png`, Buffer.from(shot, 'base64'));
      let moving: Reading = null;
      if (live?.renderer === '3d' && scene === 'calm') {
        await exec('const r = window.__beRenderer; window.__turn = setInterval(() => r.orbitBy(0.006, 0), 40); return true');
        await sleep(5000);
        moving = (await exec(`return ${READ}`)) as Reading;
        await exec('clearInterval(window.__turn); window.__beRenderer.fit(); return true');
        await sleep(1500);
        note(`safari desktop ${scene} while the view turns: ${brief(moving)}`);
      }
      results[scene] = moving ? { ...live, moving } : live;
      note(`safari desktop ${scene}: ${brief(live)}`);
    }
  } finally {
    await wd('DELETE', `/session/${sid}`).catch(() => undefined);
    driver.kill();
  }
  finish(results);
}

// ---------------------------------------------------------------------------------------------------------------------------- ios

async function ios(): Promise<void> {
  const sim = (...a: string[]): string => execFileSync('xcrun', ['simctl', ...a], { encoding: 'utf8' });
  const list = JSON.parse(sim('list', 'devices', 'available', '--json')) as { devices: Record<string, { name: string; udid: string; state: string }[]> };
  const runtimes = Object.keys(list.devices).filter((k) => /iOS/.test(k)).sort((a, b) => {
    const v = (s: string): number[] => (s.match(/iOS-(\d+)-(\d+)/)?.slice(1) ?? ['0', '0']).map(Number);
    const [a1, a2] = v(a);
    const [b1, b2] = v(b);
    return b1 - a1 || b2 - a2;
  });
  let device: { name: string; udid: string; state: string } | null = null;
  let runtime = '';
  for (const r of runtimes) {
    const phones = list.devices[r].filter((d) => /^iPhone/.test(d.name));
    const pick = phones.find((d) => /^iPhone \d+$/.test(d.name)) ?? phones[0];
    if (pick) {
      device = pick;
      runtime = r;
      break;
    }
  }
  if (!device) throw new Error('no iPhone simulator is installed here');
  note(`iOS Simulator: ${device.name}, ${runtime.replace('com.apple.CoreSimulator.SimRuntime.', '')}`);
  if (device.state !== 'Booted') sim('boot', device.udid);
  sim('bootstatus', device.udid, '-b');
  const link = `${base}/?mode=story&scn=redbank&seed=1&play=1&perf=1`;
  // Mobile Safari's first launch on a fresh simulator does its first-run setup, and an `openurl` sent meanwhile times out (runs 3 and 4
  // timed out four times each): start Safari on its own first and give it time
  try {
    sim('launch', device.udid, 'com.apple.mobilesafari');
  } catch (e) {
    note(`launching Mobile Safari first failed (${String(e).split('\n')[0].slice(0, 120)})`);
  }
  await sleep(45_000);
  let openError: string | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      sim('openurl', device.udid, link);
      openError = null;
      break;
    } catch (e) {
      openError = String(e).split('\n')[0].slice(0, 200);
      note(`openurl attempt ${attempt} failed (${openError.slice(0, 120)})${attempt < 4 ? '; retrying' : ''}`);
      if (attempt < 4) await sleep(20_000);
    }
  }
  // photographed whatever happened: a timed-out openurl can still have opened the page, and if not, the screen says what is there
  const shots: string[] = [];
  for (const [wait, name] of [[60_000, 'ios-after-1-minute.png'], [60_000, 'ios-after-2-minutes.png']] as const) {
    await sleep(wait);
    try {
      sim('io', device.udid, 'screenshot', `${out}/${name}`);
      shots.push(name);
    } catch (e) {
      note(`screenshot ${name} failed (${String(e).split('\n')[0].slice(0, 120)})`);
    }
  }
  note(`${openError ? 'tried to open' : 'opened'} ${link} in Mobile Safari; screenshots: ${shots.join(', ') || 'none'} (read the developer monitor in them)`);
  finish({ device: device.name, runtime, link, shots, openError });
}

if (mode === 'chrome') await chrome();
else if (mode === 'safari') await safari();
else if (mode === 'ios') await ios();
else {
  console.error('usage: npx tsx scripts/real-hardware.ts chrome|safari|ios [--url …] [--out hw]');
  process.exit(2);
}
