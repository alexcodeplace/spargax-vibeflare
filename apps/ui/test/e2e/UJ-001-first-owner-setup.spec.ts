import { expect, test } from '@playwright/test';
import {
  addVirtualPasskeyAuthenticator,
  createFirstOwner,
  removeVirtualAuthenticator,
  resetE2EState,
} from './helpers/webauthn';

test('UJ-001 H1/A1 — first owner setup is durable and cannot be repeated', async ({ page }) => {
  await resetE2EState(page);
  const authenticator = await addVirtualPasskeyAuthenticator(page);
  try {
    const methods = await page.request.get('/auth/methods');
    expect(methods.status()).toBe(200);
    expect(await methods.json()).toEqual({ mode: 'standalone', passkey: true, github: false, cf_access: false });

    const { credentialId } = await createFirstOwner(page);
    expect(page.url()).toMatch(/\/chat(?:\/|$|\?)/);

    const me = await page.request.get('/admin/me');
    expect(me.status()).toBe(200);
    const meBody = await me.json() as { user: { id: string; role: string }; authMethod: string };
    expect(meBody.user.role).toBe('owner');
    expect(meBody.authMethod).toBe('session');

    // The first owner must land with an immediately usable model catalog.
    const models = await page.request.get('/admin/models?task=text-generation');
    expect(models.status()).toBe(200);
    expect(((await models.json()) as { models: unknown[] }).models.length).toBeGreaterThan(0);

    const credentials = await page.request.get('/admin/credentials');
    expect(credentials.status()).toBe(200);
    const credentialBody = await credentials.json() as { credentials: Array<{ id: string }> };
    expect(credentialBody.credentials).toHaveLength(1);
    expect(credentialBody.credentials[0]!.id).toBe(credentialId);

    // Fresh browser render must still resolve the durable owner session.
    await page.reload();
    await expect(page.locator('body')).toBeVisible();
    expect((await page.request.get('/admin/me')).status()).toBe(200);

    // A second setup attempt is forbidden and does not create another credential.
    const secondSetup = await page.request.post('/auth/setup/start');
    expect(secondSetup.status()).toBe(403);
    expect(await secondSetup.json()).toEqual({
      error: { type: 'forbidden', message: 'setup already complete' },
    });
    const after = await page.request.get('/admin/credentials');
    expect(((await after.json()) as { credentials: unknown[] }).credentials).toHaveLength(1);
  } finally {
    await removeVirtualAuthenticator(authenticator);
  }
});
