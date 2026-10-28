import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseQuality } from '../../src/render3d/World3D.ts';

/**
 * The tier the 3D world starts on. An automated browser (a test suite: `navigator.webdriver`) starts on the low tier to keep its runs
 * quick, which is also why the first real-hardware runs measured only the low tier. `?quality=auto` asks for the choice a player's browser
 * gets, so the hardware measurements see what a player sees; a tier named in the address is used as it is.
 */
function at(search: string, webdriver: boolean, coarse = false): void {
  vi.stubGlobal('window', { location: { search } });
  vi.stubGlobal('navigator', { webdriver });
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }));
}

describe('the tier the 3D world starts on', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a tier named in the address is used as it is, by any browser', () => {
    at('?quality=medium', true);
    expect(chooseQuality('high', 1440)).toBe('medium');
    at('?quality=high', false);
    expect(chooseQuality('high', 390)).toBe('high');
  });

  it('a player’s browser starts high on a wide screen with a mouse, medium on a narrow or touch screen, low when the settings say so', () => {
    at('', false);
    expect(chooseQuality('high', 1440)).toBe('high');
    expect(chooseQuality('high', 600)).toBe('medium');
    at('', false, true);
    expect(chooseQuality('high', 1440)).toBe('medium');
    at('', false);
    expect(chooseQuality('low', 1440)).toBe('low');
  });

  it('an automated browser starts low, unless the address asks for a player’s choice with quality=auto', () => {
    at('', true);
    expect(chooseQuality('high', 1440)).toBe('low');
    at('?quality=auto', true);
    expect(chooseQuality('high', 1440)).toBe('high');
    at('?quality=auto', true, true);
    expect(chooseQuality('high', 390)).toBe('medium');
  });
});
