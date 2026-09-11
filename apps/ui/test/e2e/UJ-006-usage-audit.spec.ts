import { expect, test } from '@playwright/test';
import {
  addVirtualPasskeyAuthenticator,
  createFirstOwner,
  removeVirtualAuthenticator,
  resetE2EState,
} from './helpers/webauthn';

test('UJ-006 H1/A1/P1 — analytics reflects durable audit data without fake metrics', async ({ page }) => {
  await resetE2EState(page);
  const authenticator = await addVirtualPasskeyAuthenticator(page);
  try {
    const { userId } = await createFirstOwner(page);

    // A1: no activity must render an honest empty summary.
    await page.goto('/analytics');
    await expect(page.getByText('Requests (24h)', { exact: true })).toBeVisible();
    const requestsCard = page.getByText('Requests (24h)', { exact: true }).locator('..');
    await expect(requestsCard.getByText('0', { exact: true })).toBeVisible();
    const errorCard = page.getByText('Error Rate', { exact: true }).locator('..');
    await expect(errorCard.getByText('N/A', { exact: true })).toBeVisible();
    const topModelCard = page.getByText('Top Model', { exact: true }).locator('..');
    await expect(topModelCard.getByText('N/A', { exact: true })).toBeVisible();
    await expect(page.getByText('No entries.', { exact: true })).toBeVisible();

    // H1: seed one durable request receipt, then prove summary + audit render it.
    const seed = await page.request.post('/__e2e/seed-audit', {
      data: { userId, model: 'model-alpha', status: 200 },
    });
    expect(seed.status()).toBe(200);
    await page.reload();

    const populatedRequestsCard = page.getByText('Requests (24h)', { exact: true }).locator('..');
    await expect(populatedRequestsCard.getByText('1', { exact: true })).toBeVisible();
    const populatedErrorCard = page.getByText('Error Rate', { exact: true }).locator('..');
    await expect(populatedErrorCard.getByText('0.0%', { exact: true })).toBeVisible();
    const populatedTopModelCard = page.getByText('Top Model', { exact: true }).locator('..');
    await expect(populatedTopModelCard.getByText('model-alpha', { exact: true })).toBeVisible();
    const auditSection = page.getByText('Recent Events', { exact: true }).locator('..');
    await expect(auditSection.getByText('model-alpha', { exact: true })).toBeVisible();
    await expect(auditSection.getByText('200', { exact: true })).toBeVisible();

    const usage = await page.request.get('/admin/usage?range=24h');
    expect(usage.status()).toBe(200);
    const usageBody = await usage.json() as {
      data: Array<{ requests: number }>;
      error_rate: number | null;
      top_model: string | null;
    };
    expect(usageBody.data.reduce((sum, point) => sum + point.requests, 0)).toBe(1);
    expect(usageBody.error_rate).toBe(0);
    expect(usageBody.top_model).toBe('model-alpha');

    const audit = await page.request.get('/admin/audit');
    expect(audit.status()).toBe(200);
    const auditBody = await audit.json() as { events: Array<{ user_id: string; model: string; status: number }> };
    expect(auditBody.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: userId, model: 'model-alpha', status: 200 }),
    ]));

    // P1: anonymous reads are rejected.
    await page.request.post('/auth/logout');
    const anonymousUsage = await page.request.get('/admin/usage?range=24h');
    expect(anonymousUsage.status()).toBe(401);
    const anonymousAudit = await page.request.get('/admin/audit');
    expect(anonymousAudit.status()).toBe(401);
  } finally {
    await removeVirtualAuthenticator(authenticator);
  }
});
