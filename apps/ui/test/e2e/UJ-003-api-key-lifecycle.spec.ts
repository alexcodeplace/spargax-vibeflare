import { expect, test } from '@playwright/test';
import {
  addVirtualPasskeyAuthenticator,
  createFirstOwner,
  removeVirtualAuthenticator,
  resetE2EState,
  waitForHydratedIsland,
} from './helpers/webauthn';

test('UJ-003 H1/H2/P1 — API key is shown once, works, and revokes cleanly', async ({ page }) => {
  await resetE2EState(page);
  const authenticator = await addVirtualPasskeyAuthenticator(page);
  try {
    await createFirstOwner(page);
    await page.request.post('/__e2e/seed-model', { data: { name: '@cf/meta/e2e-chat', task: 'text-generation' } });

    await page.goto('/keys');
    await waitForHydratedIsland(page, 'keys-page');
    await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible();
    await page.getByRole('button', { name: 'Create key' }).click();
    await page.getByLabel('Label').fill('member-tool');

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/admin/keys') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json() as { id: string; label: string; full: string; prefix: string };
    expect(created.label).toBe('member-tool');
    expect(created.full).toMatch(/^vf-/);

    await expect(page.getByText('Copy this key now — it will not be shown again.')).toBeVisible();
    await expect(page.getByText(created.full, { exact: true })).toBeVisible();

    const list = await page.request.get('/admin/keys');
    expect(list.status()).toBe(200);
    const listed = await list.json() as { keys: Array<Record<string, unknown>> };
    expect(listed.keys).toHaveLength(1);
    expect(listed.keys[0]?.label).toBe('member-tool');
    expect(listed.keys[0]).not.toHaveProperty('full');
    expect(listed.keys[0]).not.toHaveProperty('key_hash');

    const modelList = await page.request.get('/v1/models', {
      headers: { Authorization: `Bearer ${created.full}` },
    });
    expect(modelList.status()).toBe(200);
    expect((await modelList.json() as { data: Array<{ id: string }> }).data.map((model) => model.id)).toContain('@cf/meta/e2e-chat');

    const quota = await page.request.get('/v1/quota', {
      headers: { Authorization: `Bearer ${created.full}` },
    });
    expect(quota.status()).toBe(200);
    expect(await quota.json()).toMatchObject({ used: expect.any(Number), limit: expect.any(Number) });

    await page.getByText('member-tool', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Revoke' }).first().click();
    await page.getByRole('button', { name: 'Revoke', exact: true }).last().click();
    await expect(page.getByText('member-tool', { exact: true })).toBeVisible();
    await expect(page.getByText('revoked', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(0);

    const revoked = await page.request.get('/v1/models', {
      headers: { Authorization: `Bearer ${created.full}` },
    });
    expect(revoked.status()).toBe(401);
    expect(await revoked.json()).toEqual({ error: { type: 'auth', message: 'invalid api key' } });
    const revokedQuota = await page.request.get('/v1/quota', {
      headers: { Authorization: `Bearer ${created.full}` },
    });
    expect(revokedQuota.status()).toBe(401);

    await page.request.post('/auth/logout');
    const anonymousCreate = await page.request.post('/admin/keys', { data: { label: 'should-not-exist' } });
    expect(anonymousCreate.status()).toBe(401);
  } finally {
    await removeVirtualAuthenticator(authenticator);
  }
});
