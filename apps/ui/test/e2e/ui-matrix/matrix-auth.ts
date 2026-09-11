import type { BrowserContext } from '@playwright/test';

export type MatrixRole = 'anonymous' | 'owner' | 'user';

export async function applyAuth(context: BrowserContext, role: MatrixRole, baseURL: string): Promise<void> {
  await context.clearCookies();
  const reset = await context.request.post(`${baseURL}/__e2e/reset`);
  if (!reset.ok()) throw new Error(`matrix reset failed: ${reset.status()} ${await reset.text()}`);
  if (role === 'anonymous') return;

  const session = await context.request.post(`${baseURL}/__e2e/session`, { data: { role } });
  if (!session.ok()) throw new Error(`matrix session seed failed: ${session.status()} ${await session.text()}`);
}
