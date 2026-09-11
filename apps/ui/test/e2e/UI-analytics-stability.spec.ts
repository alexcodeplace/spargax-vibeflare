import { expect, test } from '@playwright/test';

test('analytics mobile layout stays stable and range tabs are touch-safe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addInitScript(() => {
    const shifts: number[] = [];
    Object.assign(globalThis, { __vibeflareLayoutShifts: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) shifts.push(shift.value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.request.post('/__e2e/reset');
  const session = await page.request.post('/__e2e/session', { data: { role: 'owner' } });
  expect(session.ok()).toBe(true);

  let usageRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/admin/usage') usageRequests += 1;
  });

  await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('usage-summary').waitFor();
  await page.getByTestId('audit-table').waitFor();
  await page.locator('canvas').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);

  const cls = await page.evaluate(() => {
    const shifts = (globalThis as typeof globalThis & { __vibeflareLayoutShifts?: number[] }).__vibeflareLayoutShifts ?? [];
    return shifts.reduce((sum, value) => sum + value, 0);
  });
  expect(cls).toBeLessThan(0.01);
  expect(usageRequests).toBe(1);

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  for (const tab of await tabs.all()) {
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  // Content below the initial mobile fold must remain reachable through the
  // application main scroller rather than being clipped by the fixed shell.
  const recentEvents = page.getByText('Recent Events', { exact: true });
  await recentEvents.scrollIntoViewIfNeeded();
  const recentBox = await recentEvents.boundingBox();
  expect(recentBox).not.toBeNull();
  expect(recentBox!.y).toBeGreaterThanOrEqual(56);
  expect(recentBox!.y + recentBox!.height).toBeLessThanOrEqual(844);
  expect(await page.locator('main').evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});
