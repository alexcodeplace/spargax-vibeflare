import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { applyAuth } from './ui-matrix/matrix-auth';
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('public accessibility statement and login expose labelled controls', async ({ page, context, baseURL }) => {
  await applyAuth(context, 'anonymous', baseURL!, '/login');
  for (const route of ['/login/', '/accessibility/']) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(route.replace(/\/$/, ''));
    await expect(page.locator('.pm-a11y-launcher')).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations, route).toEqual([]);
  }
});

test('shared controls survive Astro navigation and retain accessible contrast and reflow', async ({ page, context, baseURL }) => {
  await applyAuth(context, 'owner', baseURL!, '/settings');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/settings/');
  const launcher = page.locator('.pm-a11y-launcher');
  await launcher.focus(); await page.keyboard.press('Enter');
  const panel = page.locator('.pm-a11y-panel');
  for (const key of ['Tab', 'Shift+Tab']) for (let i = 0; i < 20; i++) {
    await page.keyboard.press(key);
    expect(await panel.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await panel.locator('[id$="-contrast"]').selectOption('yellow');
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await launcher.click();
  await panel.locator('[id$="-textScale"]').selectOption('200');
  await panel.locator('[id$="-textSpacing"]').check();
  await page.setViewportSize({ width: 320, height: 800 });
  for (const locale of ['en', 'he', 'es']) {
    await panel.locator('[id$="-panelLanguage"]').selectOption(locale);
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  }
  await panel.locator('.pm-a11y-reset').click(); await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-a11y-motion', 'true');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Projects', exact: true }).first().click();
  await expect(page.locator('.pm-a11y-launcher')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Browse:/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

for (const route of ['/chat/', '/history/', '/files/', '/analytics/', '/keys/', '/settings/']) {
  test(`default signed-in page accessibility: ${route}`, async ({ page, context, baseURL }) => {
    await applyAuth(context, 'owner', baseURL!, route);
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(route.replace(/\/$/, ''));
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('.pm-a11y-launcher')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
  });
}
