import { describe, expect, it } from 'vitest';
import { PROFILES, type Quality } from '../../src/render3d/context.ts';
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

  it('a GPU that keeps every other beat of a 60 Hz screen gives a steady 30 a second, and that is not lag', () => {
    // asked for 60, drawn in 20 ms: each frame waits for the next beat, 33 ms apart
    expect(lagOf(33.3, pacedGap(60, false, 3))).toBeLessThan(1.6);
    expect(session('medium', steady(600, 3, 33.3), 60)).toEqual({ quality: 'medium', scale: 1, changes: 0 });
    // and the resting cap of 30 a second is simply met
    expect(session('low', steady(600, 3, 33.3), 30)).toEqual({ quality: 'low', scale: 1, changes: 0 });
  });

  it('every tier’s frame caps divide a 60 Hz display’s rate evenly: a 45 cap could only ever be shown as 30', () => {
    // seen on a real GPU at an iPhone's size: 12-14 ms a frame back to back, yet 30 a second in the live loop under the old cap of 45
    for (const [tier, p] of Object.entries(PROFILES)) {
      expect(60 % p.maxFps, `${tier} while the view moves`).toBe(0);
      expect(60 % p.idleFps, `${tier} at rest`).toBe(0);
      expect(p.idleFps, `${tier} rests at no more than its moving cap`).toBeLessThanOrEqual(p.maxFps);
    }
    // a phone's tier is smooth while the player moves the view, and rests at 30 a second while it is still
    expect([PROFILES.medium.maxFps, PROFILES.medium.idleFps]).toEqual([60, 30]);
    expect(PROFILES.high.idleFps).toBe(60);
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
