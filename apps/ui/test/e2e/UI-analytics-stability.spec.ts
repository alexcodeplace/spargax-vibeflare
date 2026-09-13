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


test('chart data disclosures retain their position while usage loads', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.request.post('/__e2e/reset');
  const session = await page.request.post('/__e2e/session', { data: { role: 'owner' } });
  expect(session.ok()).toBe(true);
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/admin/usage?*', async route => {
    await held;
    await route.fulfill({ json: { data: [], range: '24h', error_rate: null, top_model: null } });
  });
  try {
    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status', { name: 'Loading usage data' })).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready);
    const summaries = page.locator('.vf-chart-data > summary');
    await expect(summaries).toHaveCount(2);
    const before = await summaries.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
    release();
    await expect(page.getByRole('status', { name: 'Loading usage data' })).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(2);
    const after = await summaries.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
    for (let index = 0; index < before.length; index++) {
      expect(Math.abs(after[index]! - before[index]!)).toBeLessThanOrEqual(1);
    }
    await summaries.first().click();
    await expect(page.getByRole('table', { name: 'Neurons by time period' })).toBeVisible();
    await expect(page.getByText('No usage recorded for this period.').first()).toBeVisible();
  } finally { release(); }
});
