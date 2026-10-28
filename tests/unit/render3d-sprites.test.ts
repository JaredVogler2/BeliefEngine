import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Particles, pixelRatio } from '../../src/render3d/particles.ts';

/**
 * A point sprite's size is in the drawing buffer's pixels. The world works out every sprite's size in CSS pixels and multiplies it by the
 * renderer's pixel ratio, so a sprite keeps its size on screen at any pixel ratio. Without that, the waterfall's mist drew as dots on a
 * screen of pixel ratio 2 (seen on a real GPU), and the gold markers and the coach's call-out shrank on phones.
 */
const DIR = 'src/render3d';

describe('point sprites keep their size on a sharp screen', () => {
  it('every point sprite the 3D world draws multiplies its size by the shared pixel ratio', () => {
    let shaders = 0;
    for (const file of readdirSync(DIR).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(DIR, file), 'utf8');
      const sizes = src.split('\n').filter((l) => l.includes('gl_PointSize ='));
      if (!sizes.length) continue;
      shaders += sizes.length;
      for (const l of sizes) expect(l, `${file}: ${l.trim()}`).toMatch(/\* uDpr;\s*$/);
      expect(src.match(/uniform float uDpr;/g)?.length, file).toBe(sizes.length);
      expect(src, file).toContain('uDpr: pixelRatio');
    }
    // the particles (smoke, flame, sparks, mist), the proof sites, the people's marks and the evacuation route
    expect(shaders).toBe(4);
  });

  it('the particles read the one pixel ratio the world sets before each frame', () => {
    const p = new Particles(4, false, true);
    const uniforms = (p as unknown as { mat: { uniforms: Record<string, { value: number }> } }).mat.uniforms;
    expect(uniforms.uDpr).toBe(pixelRatio);
    pixelRatio.value = 2;
    expect(uniforms.uDpr.value).toBe(2);
    pixelRatio.value = 1;
  });
});
