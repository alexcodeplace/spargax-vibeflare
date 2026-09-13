import { expect, test } from '@playwright/test';
import { resetE2EState, waitForHydratedIsland } from './helpers/webauthn';

test('metadata refresh failure retains a usable picker without billing uncertainty labels', async ({ page }) => {
  await resetE2EState(page);
  expect((await page.request.post('/__e2e/session', { data: { role: 'owner' } })).ok()).toBe(true);
  await page.goto('/chat');
  await waitForHydratedIsland(page, 'vibeflare-chat');
  const picker = page.getByRole('combobox', { name: /Select a Model/ });
  await expect(picker).toBeVisible();
  await expect(picker).toContainText('@cf/meta/e2e-chat');
  await page.route('**/admin/models/sync', route => route.fulfill({
    status: 502, contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'Registry unavailable' } }),
  }));
  await page.getByRole('button', { name: 'Fetch the latest model catalog from Cloudflare' }).click();
  await expect(page.getByText('Could not refresh. Showing saved models.')).toBeVisible();
  await expect(picker).toBeVisible();
  await expect(picker).toContainText('@cf/meta/e2e-chat');
  await expect(page.getByText(/billing unknown|metadata unavailable/i)).toHaveCount(0);
});
