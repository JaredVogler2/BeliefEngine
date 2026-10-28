import { describe, expect, it } from 'vitest';
import type { Quality } from '../../src/render3d/context.ts';
import { lagOf, pacedGap, qualityStep, typicalOf } from '../../src/render3d/pacing.ts';

/**
 * The quality monitor and the frame pacing, as rules. The case that matters most came from a real GPU (an Apple GPU, through the CI's
 * macOS runner): the first frames of a village compile shaders and upload the scene and took 0.3 to 2.3 s, every frame after them 2 to
 * 6 ms, and the old monitor, which went by an average seeded with those first frames, stepped every session down to the low tier.
 */
type Frame = { draw: number; gap: number };

/** run the monitor's rule over a session's frames the way the world does: every 1.5 s of frames, on the frames since the last change */
function session(start: Quality, frames: Frame[], maxFps = 60): { quality: Quality; scale: number; changes: number } {
  let quality = start;
  let scale = 1;
  let draws: number[] = [];
  let gaps: number[] = [];
  let t = 0;
  let changes = 0;
  for (const f of frames) {
    draws.push(f.draw);
    gaps.push(f.gap);
    t += f.gap / 1000;
    if (t < 1.5) continue;
    const draw = typicalOf(draws.slice(-30), 5);
    const lag = lagOf(typicalOf(gaps.slice(-120), 20), pacedGap(maxFps, false, draw));
    if (draw === 0 || lag === 0) continue;
    t = 0;
    const next = qualityStep(quality, scale, draw, lag);
    if (next.quality !== quality || next.scale !== scale) {
      quality = next.quality;
      scale = next.scale;
      changes++;
      draws = [];
      gaps = [];
    }
  }
  return { quality, scale, changes };
}

const steady = (n: number, draw: number, gap: number): Frame[] => Array.from({ length: n }, () => ({ draw, gap }));

describe('the quality monitor judges the machine, not the first frames of a village', () => {
  it('the medians need enough frames: nothing is judged from fewer than five draws or twenty intervals', () => {
    expect(typicalOf([700, 500, 3, 3], 5)).toBe(0);
    expect(typicalOf([700, 500, 3, 3, 3], 5)).toBe(3);
    expect(typicalOf([4, 9, 2, 30, 5], 5)).toBe(5);
    expect(qualityStep('high', 1, 0, 1)).toEqual({ quality: 'high', scale: 1 });
  });

  it('a GPU that compiles for a second and then draws in a few milliseconds keeps the high tier (it used to fall to low)', () => {
    // as measured on the Apple GPU: two slow first frames, then 2-6 ms draws at the 60 fps pace
    const frames = [{ draw: 694, gap: 700 }, { draw: 509, gap: 520 }, ...steady(600, 3, 16.7)];
    expect(session('high', frames)).toEqual({ quality: 'high', scale: 1, changes: 0 });
  });

  it('a machine whose draws stay slow steps down a tier at a time, then in resolution, and stops there', () => {
    const slow = session('high', steady(2000, 40, 100), 60);
    expect(slow.quality).toBe('low');
    expect(slow.scale).toBe(0.5);
  });

  it('a busy GPU shows in late frames even when the draws themselves are quick, and costs a tier', () => {
    // 4 ms on the main thread, but frames only every 55 ms (18 a second) where 60 were asked for
    expect(session('high', steady(400, 4, 55)).quality).not.toBe('high');
    expect(lagOf(55, pacedGap(60, false, 4))).toBeGreaterThan(1.6);
  });

  it('a frame cap that falls between the display’s beats is not lag: 45 a second on a 60 Hz screen comes every other beat', () => {
    // the medium tier asks for 45 a second; a 60 Hz display can give 30 (every other beat, 33 ms)
    expect(lagOf(33.3, pacedGap(45, false, 3))).toBeLessThan(1.6);
    expect(session('medium', steady(600, 3, 33.3), 45)).toEqual({ quality: 'medium', scale: 1, changes: 0 });
    // and the low tier's 30 a second is simply met
    expect(session('low', steady(600, 3, 33.3), 30)).toEqual({ quality: 'low', scale: 1, changes: 0 });
  });

  it('at a reduced resolution, quick draws and frames on time bring the resolution back up, one step at a time', () => {
    expect(qualityStep('low', 0.5, 3, 1)).toEqual({ quality: 'low', scale: 0.575 });
    expect(qualityStep('low', 0.95, 3, 1).scale).toBe(1);
    // but not while the frames are late
    expect(qualityStep('low', 0.5, 3, 1.4)).toEqual({ quality: 'low', scale: 0.5 });
  });

  it('the pacing asks for the tier’s frame cap, or more rest for a slow machine (drawing takes at most about 40% of the main thread)', () => {
    expect(pacedGap(60, false, 0)).toBeCloseTo(14.67, 1);
    expect(pacedGap(60, false, 10)).toBe(25);
    expect(pacedGap(60, true, 0)).toBeCloseTo(331.3, 0);
    // a first frame of 700 ms no longer holds up the next: before five draws are seen the pace is the cap
    expect(pacedGap(60, false, typicalOf([700], 5))).toBeCloseTo(14.67, 1);
  });
});
