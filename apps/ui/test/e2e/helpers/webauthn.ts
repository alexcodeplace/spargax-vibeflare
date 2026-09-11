import type { CDPSession, Page } from '@playwright/test';

export interface VirtualAuthenticator {
  client: CDPSession;
  authenticatorId: string;
}

export async function addVirtualPasskeyAuthenticator(page: Page): Promise<VirtualAuthenticator> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { client, authenticatorId };
}

export async function removeVirtualAuthenticator(auth: VirtualAuthenticator): Promise<void> {
  try {
    await auth.client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: auth.authenticatorId });
  } catch {
    // Cleanup must not mask the primary assertion/timeout if the page already closed.
  }
  try {
    await auth.client.detach();
  } catch {
    // The browser/context may already be gone after a failed test.
  }
}

export async function resetE2EState(page: Page): Promise<void> {
  const res = await page.request.post('/__e2e/reset');
  if (!res.ok()) throw new Error(`E2E reset failed: ${res.status()} ${await res.text()}`);
  await page.context().clearCookies();
}

export async function createFirstOwner(page: Page): Promise<{ credentialId: string; userId: string }> {
  await page.goto('/setup');
  await page.getByRole('heading', { name: 'Welcome to VibeFlare' }).waitFor();
  await page.getByRole('button', { name: 'Register passkey' }).click();
  await page.waitForURL(/\/chat(?:\/|$|\?)/, { timeout: 20_000 });

  const me = await page.request.get('/admin/me');
  if (!me.ok()) throw new Error(`owner session missing after setup: ${me.status()} ${await me.text()}`);
  const meBody = await me.json() as { user: { id: string; role: string }; authMethod: string };
  if (meBody.user.role !== 'owner' || meBody.authMethod !== 'session') {
    throw new Error(`unexpected owner state: ${JSON.stringify(meBody)}`);
  }

  const creds = await page.request.get('/admin/credentials');
  if (!creds.ok()) throw new Error(`credential read failed: ${creds.status()} ${await creds.text()}`);
  const body = await creds.json() as { credentials: Array<{ id: string }> };
  if (body.credentials.length !== 1) throw new Error(`expected 1 credential, got ${body.credentials.length}`);
  return { credentialId: body.credentials[0]!.id, userId: meBody.user.id };
}

export async function waitForHydratedIsland(page: Page, containsTestId?: string): Promise<void> {
  let hydrated = page.locator('[data-vf-hydrated="true"]');
  if (containsTestId) hydrated = hydrated.filter({ has: page.getByTestId(containsTestId) });
  await hydrated.first().waitFor({ state: 'attached' });
}
