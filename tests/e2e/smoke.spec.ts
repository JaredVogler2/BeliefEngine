import { expect, test } from '@playwright/test';
import { mapPainted, selectVillager, watchConsole } from './helpers.ts';

/**
 * A short, browser-neutral smoke test that runs in every configured project (Chromium, Firefox, WebKit, and the phone profiles):
 * title -> briefing -> play -> tell a story -> end the day -> read the morning digest -> the map is painted -> save and resume.
 * The longer flows live in the other specs and run on Chromium only.
 */
test.describe('smoke', () => {
  test('a first day can be played, resolved, saved and resumed', async ({ page }, info) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await expect(page.getByTestId('title')).toBeVisible();
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();

    // the map really painted something (a failed canvas context would leave a flat colour); slow software renderers get a few seconds
    const painted = mapPainted(page);
    await expect.poll(painted, { message: `${info.project.name}: map is painted`, timeout: 8000 }).toBeGreaterThan(0.2);

    await page.locator('[data-claim="river_fears_fire"]').click();
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);

    // reload mid-day: the autosave restores the exact plan
    await page.reload();
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);

    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await page.getByTestId('digest-continue').click();
    await expect(page.getByTestId('day-box')).toContainText('2');
    expect(errors).toEqual([]);
  });

  test('the 3D world boots, draws a real scene and picks a person by a tap in this browser engine (or, without WebGL2, says so and plays on)', async ({ page }, info) => {
    test.skip(!['firefox', 'webkit', 'iphone'].includes(info.project.name), 'the other browser engines: Chromium runs the whole 3D suite on its own projects');
    test.setTimeout(240_000);
    const errors = watchConsole(page);
    // asked for by name, as a machine with only a software rasteriser would otherwise be given the classic map
    await page.goto('/?debug=1&renderer=3d&quality=low&scale=0.5');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    const stage = page.locator('.stage[data-ready="1"]');
    await expect(stage).toBeVisible({ timeout: 150_000 });
    if ((await stage.getAttribute('data-renderer')) === '2d') {
      // no WebGL2 in this engine here (headless Firefox, for one): the page must say exactly that and play on, on the classic map
      await expect(page.getByTestId('renderer-note')).toContainText('WebGL2 is not available');
      test.info().annotations.push({ type: 'fallback', description: `${info.project.name}: no WebGL2, classic map` });
      expect(errors).toEqual([]);
      return;
    }
    type R = { info: () => { frames: number; triangles: number }; focusVillager: (id: string) => void; advance: (s: number) => void; entityScreen: (k: string, id: string) => { x: number; y: number } | null };
    const r3 = <T,>(fn: (r: R) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__beRenderer)`) as Promise<T>;
    await expect.poll(() => r3((r) => r.info().frames), { timeout: 60_000 }).toBeGreaterThan(0);
    expect(await r3((r) => r.info().triangles), 'a modelled village, not a few boxes').toBeGreaterThan(50_000);
    await expect.poll(mapPainted(page), { message: `${info.project.name}: the 3D canvas holds a picture`, timeout: 30_000 }).toBeGreaterThan(0.2);
    // a tap on a person picks them through the 3D raycast
    await r3((r) => {
      r.focusVillager('mara');
      r.advance(3);
    });
    await page.waitForTimeout(800);
    const at = await page.evaluate(() => {
      const r = (window as unknown as { __beRenderer: { advance: (s: number) => void; entityScreen: (k: string, id: string) => { x: number; y: number } | null } }).__beRenderer;
      r.advance(2);
      const p = r.entityScreen('villager', 'mara');
      const b = document.querySelector('canvas')!.getBoundingClientRect();
      return p ? { x: p.x + b.left, y: p.y + b.top } : null;
    });
    expect(at).not.toBeNull();
    if (info.project.name === 'iphone') await page.touchscreen.tap(at!.x, at!.y);
    else await page.mouse.click(at!.x, at!.y);
    const picked = page.getByTestId('selection-pop').or(page.getByTestId('crowd-picker'));
    await expect(picked).toBeVisible();
    if (await page.getByTestId('crowd-picker').count()) await page.getByTestId('crowd-picker').locator('[data-id="mara"]').click();
    await expect(page.getByTestId('selection-pop')).toContainText('Mara Wells');
    expect(errors.filter((e) => !/GL Driver Message|GPU stall/i.test(e))).toEqual([]);
  });

  test('a finished run shows its debrief with the end-of-run scene', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    for (let d = 0; d < 7; d++) {
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await expect(page.getByTestId('debrief')).toBeVisible();
    await expect(page.getByTestId('debrief-scene')).toHaveAttribute('data-result', 'defeat');
    await expect(page.getByTestId('verdict')).toHaveText('Defeat');
    expect(errors).toEqual([]);
  });
});
