import { expect, test } from '@playwright/test';
import {
  addVirtualPasskeyAuthenticator,
  createFirstOwner,
  removeVirtualAuthenticator,
  resetE2EState,
} from './helpers/webauthn';

test('UJ-002 H1/P1 — existing passkey user signs in once without a redirect loop', async ({ page }) => {
  await resetE2EState(page);
  const authenticator = await addVirtualPasskeyAuthenticator(page);
  try {
    // Fixture creation uses the same real browser/Worker registration path as UJ-001.
    await createFirstOwner(page);
    const beforeCredentials = await page.request.get('/admin/credentials');
    const before = await beforeCredentials.json() as { credentials: Array<{ id: string; last_used_at: number | null }> };
    expect(before.credentials).toHaveLength(1);
    expect(before.credentials[0]!.last_used_at).toBeNull();

    const logout = await page.request.post('/auth/logout');
    expect(logout.status()).toBe(200);

    // P1: identity is not disclosed after the session is cleared.
    const anonymousMe = await page.request.get('/admin/me');
    expect(anonymousMe.status()).toBe(401);
    expect(await anonymousMe.json()).toEqual({
      error: { type: 'auth', message: 'authentication required' },
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in with passkey' }).click();
    await page.waitForURL(/\/chat(?:\/|$|\?)/, { timeout: 20_000 });

    const me = await page.request.get('/admin/me');
    expect(me.status()).toBe(200);
    const meBody = await me.json() as { user: { id: string; role: string }; authMethod: string };
    expect(meBody.user.role).toBe('owner');
    expect(meBody.authMethod).toBe('session');

    const afterCredentials = await page.request.get('/admin/credentials');
    const after = await afterCredentials.json() as { credentials: Array<{ id: string; last_used_at: number | null }> };
    expect(after.credentials).toHaveLength(1);
    expect(after.credentials[0]!.last_used_at).not.toBeNull();

    // Regression gate for the reported loop: navigating through / must settle in
    // authenticated app state and must not return to /login or another IdP.
    await page.goto('/');
    await page.waitForURL(/\/chat(?:\/|$|\?)/, { timeout: 10_000 });
    expect(new URL(page.url()).hostname).toBe('localhost');
    expect(page.url()).not.toContain('/login');
    expect((await page.request.get('/admin/me')).status()).toBe(200);
  } finally {
    await removeVirtualAuthenticator(authenticator);
  }
});
