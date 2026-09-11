import { expect, test } from '@playwright/test';
import {
  addVirtualPasskeyAuthenticator,
  createFirstOwner,
  removeVirtualAuthenticator,
  resetE2EState,
} from './helpers/webauthn';

test('UJ-005 H1/A1/P1 — owner invite creates exactly one normal member', async ({ page, browser }) => {
  await resetE2EState(page);
  const ownerAuthenticator = await addVirtualPasskeyAuthenticator(page);
  const memberContext = await browser.newContext();
  const replayContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const replayPage = await replayContext.newPage();
  let memberAuthenticator: Awaited<ReturnType<typeof addVirtualPasskeyAuthenticator>> | null = null;

  try {
    await createFirstOwner(page);

    await page.goto('/settings');
    await expect(page.getByRole('tab', { name: 'Invites' })).toBeVisible();
    await page.getByRole('tab', { name: 'Invites' }).click();
    await expect(page.getByRole('heading', { name: 'Invites' })).toBeVisible();
    await page.getByRole('button', { name: 'New invite' }).click();
    await page.getByLabel('Label (optional)').fill('second-member');

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/admin/invites') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json() as { id: string; full: string; prefix: string };
    expect(created.full).toMatch(/^vfi-/);
    await expect(page.getByText(created.full, { exact: true })).toBeVisible();

    memberAuthenticator = await addVirtualPasskeyAuthenticator(memberPage);
    await memberPage.goto(`/signup?token=${encodeURIComponent(created.full)}`);
    await expect(memberPage).toHaveURL(/\/signup\/?$/);
    await expect(memberPage.getByRole('button', { name: 'Sign up with passkey' })).toBeVisible();
    await memberPage.getByRole('button', { name: 'Sign up with passkey' }).click();
    await memberPage.waitForURL(/\/chat(?:\/|$|\?)/, { timeout: 20_000 });

    const memberMe = await memberPage.request.get('/admin/me');
    expect(memberMe.status()).toBe(200);
    const member = await memberMe.json() as { user: { id: string; role: string }; authMethod: string };
    expect(member.user.role).toBe('user');
    expect(member.authMethod).toBe('session');

    const ownerInvites = await page.request.get('/admin/invites');
    expect(ownerInvites.status()).toBe(200);
    const invites = await ownerInvites.json() as { invites: Array<{ id: string; used_at: number | null; used_by: string | null }> };
    const redeemed = invites.invites.find((invite) => invite.id === created.id);
    expect(redeemed?.used_at).not.toBeNull();
    expect(redeemed?.used_by).toBe(member.user.id);

    // P1: a normal member cannot administer invites.
    const forbidden = await memberPage.request.post('/admin/invites', {
      data: { label: 'forbidden-member-invite', expires_in_sec: 3600 },
    });
    expect(forbidden.status()).toBe(403);
    expect(await forbidden.json()).toEqual({ error: { type: 'forbidden', message: 'owner role required' } });

    // A1: replaying the same invite in a third browser must not create a user.
    await replayPage.goto(`/signup?token=${encodeURIComponent(created.full)}`);
    await expect(replayPage.getByText('Invite invalid or expired. Ask your administrator for a new one.')).toBeVisible();
    const users = await page.request.get('/admin/users');
    expect(users.status()).toBe(200);
    expect((await users.json() as { users: unknown[] }).users).toHaveLength(2);
  } finally {
    if (memberAuthenticator) await removeVirtualAuthenticator(memberAuthenticator);
    await memberContext.close();
    await replayContext.close();
    await removeVirtualAuthenticator(ownerAuthenticator);
  }
});
