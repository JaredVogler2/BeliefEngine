import type { Quality } from './context.ts';

/**
 * How the world judges this machine's speed, kept apart from the renderer so the rules can be tested. Two measures go in: how long a draw
 * takes on the main thread (JS and the driver's submission), and how long frames take to come round (which is what a busy GPU stretches:
 * its time is not in the draw's). Both are medians of the frames since the village was built or the tier last changed, never an average
 * seeded by the first frames, which compile shaders and upload the whole scene: on a real GPU those take a second or two, and an average
 * that starts there once cost every player the high tier (seen on an Apple GPU: drawn in 2-6 ms a frame, stepped down to low anyway).
 */

/** the median of the samples, or 0 while there are fewer than `min` of them (too few to say anything yet) */
export function typicalOf(samples: readonly number[], min: number): number {
  if (samples.length < min) return 0;
  const s = [...samples].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** a draw that takes longer than this on the main thread is too slow for this tier */
export const SLOW_DRAW_MS = 28;
/** frames coming round this many times slower than the pacing asks for: something else (the GPU) cannot keep up */
export const SLOW_LAG = 1.6;

/**
 * One step of the quality monitor. `drawMs` is the typical draw, `lag` the typical frame interval over the interval the pacing asked for
 * (1 when frames come exactly as paced). Too slow: down a tier, and on the lowest tier down in resolution. Comfortably fast at a reduced
 * resolution: back up in resolution. Not enough frames yet (a measure of 0): no change.
 */
export function qualityStep(quality: Quality, scale: number, drawMs: number, lag: number): { quality: Quality; scale: number } {
  if (drawMs === 0 || lag === 0) return { quality, scale };
  if (drawMs > SLOW_DRAW_MS || lag > SLOW_LAG) {
    if (quality === 'high') return { quality: 'medium', scale };
    if (quality === 'medium') return { quality: 'low', scale };
    if (scale > 0.5) return { quality, scale: Math.max(0.5, scale * 0.8) };
    return { quality, scale };
  }
  if (drawMs < 6 && lag < 1.2 && scale < 1) return { quality, scale: Math.min(1, scale * 1.15) };
  return { quality, scale };
}

/**
 * The interval the pacing asks for between frames: the tier's frame cap (a few frames a second on a software rasteriser), and never less
 * than two and a half typical draws, so drawing takes at most about 40% of the main thread whatever the machine.
 */
export function pacedGap(maxFps: number, software: boolean, typicalDrawMs: number): number {
  return Math.max(1000 / (software ? 3 : maxFps) - 2, typicalDrawMs * 2.5);
}

/**
 * How far behind the frames come: the typical interval between frames over the interval paced for, where the paced interval counts as
 * at least 25 ms. A display refreshes on a fixed beat, so a cap that falls between beats (45 frames a second on a 60 Hz screen) is met
 * every other beat, 33 ms; that is the pacing working, not the GPU falling behind. Lagging means frames slower than 40 ms (under 25 a
 * second) where the pacing asked for faster.
 */
export function lagOf(typicalGapMs: number, pacedMs: number): number {
  if (typicalGapMs === 0) return 0;
  return typicalGapMs / Math.max(pacedMs, 25);
}
