import type { BrowserContext } from '@playwright/test';

export type MatrixRole = 'anonymous' | 'owner' | 'user';

export async function applyAuth(
  context: BrowserContext,
  role: MatrixRole,
  baseURL: string,
  route?: string,
): Promise<void> {
  await context.clearCookies();
  const reset = await context.request.post(`${baseURL}/__e2e/reset`);
  if (!reset.ok()) throw new Error(`matrix reset failed: ${reset.status()} ${await reset.text()}`);

  if (role === 'anonymous') {
    // The login screen represents a returning unauthenticated user, so seed an
    // existing installation and then discard its session. Other anonymous
    // routes intentionally keep the database fresh for first-run coverage.
    if (route === '/login') {
      const seeded = await context.request.post(`${baseURL}/__e2e/session`, { data: { role: 'owner' } });
      if (!seeded.ok()) throw new Error(`matrix owner seed failed: ${seeded.status()} ${await seeded.text()}`);
      await context.clearCookies();
    }
    return;
  }

  const session = await context.request.post(`${baseURL}/__e2e/session`, { data: { role } });
  if (!session.ok()) throw new Error(`matrix session seed failed: ${session.status()} ${await session.text()}`);
}
