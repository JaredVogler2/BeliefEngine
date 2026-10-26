import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { chooseClaim, selectVillager, startRedbank } from './helpers.ts';

async function audit(page: Page, label: string) {
  const res = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test.describe('accessibility', () => {
  test('no critical or serious axe violations on the main screens', async ({ page }) => {
    await page.goto('/?debug=1');
    await audit(page, 'title');
    await page.getByRole('button', { name: 'How it works' }).click();
    await audit(page, 'how-to');
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await audit(page, 'settings');
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByTestId('play').click();
    await audit(page, 'scenarios');
    await page.getByTestId('begin-redbank').click();
    await audit(page, 'briefing');
    await page.getByTestId('begin').click();
    await chooseClaim(page, 'river_fears_fire');
    await audit(page, 'play');
    await selectVillager(page, 'Old Harl');
    await audit(page, 'play+villager');
    await page.getByTestId('tab-laws').click();
    await audit(page, 'laws');
    await page.getByTestId('tab-forecast').click();
    await audit(page, 'forecast');
  });

  test('a whole turn is playable with the keyboard alone', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'desktop keyboard flow');
    await startRedbank(page, 2);
    await page.locator('canvas').focus();
    await page.keyboard.press('1'); // choose the first story
    await expect(page.locator('[data-claim="river_fears_fire"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('tab-village').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /^Mara Wells/ }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /^Tell Mara Wells/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
    await page.keyboard.press('u'); // undo by shortcut
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 3 of 5/);
    await page.locator('canvas').focus();
    await page.keyboard.press('Enter'); // opens End Day confirmation
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByTestId('end-day').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('confirm-end')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('digest')).toBeVisible();
    await expect(page.getByTestId('digest-continue')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('day-box')).toContainText('2');
    // the screen-reader live region announced the result
    await expect(page.getByTestId('announce')).not.toBeEmpty();
  });

  test('reduced motion setting is honoured and everything stays operable', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.goto('/?debug=1');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();
    await ctx.close();
  });
});
