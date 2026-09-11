import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`model picker is accessible and on-screen at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.request.post('/__e2e/reset');
    const session = await page.request.post('/__e2e/session', { data: { role: 'owner' } });
    expect(session.ok()).toBe(true);
    const seeded = await page.request.post('/__e2e/seed-model', {
      data: { name: '@cf/meta/e2e-chat', task: 'text-generation' },
    });
    expect(seeded.ok()).toBe(true);

    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    const picker = page.getByLabel('Select a Model…');
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAccessibleName('Select a Model…');

    const box = await picker.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(1);
    expect(box!.height).toBeGreaterThan(1);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(56);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  });
}
