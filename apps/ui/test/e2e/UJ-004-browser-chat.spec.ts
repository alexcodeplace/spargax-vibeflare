import { expect, test } from '@playwright/test';
import {
  addVirtualPasskeyAuthenticator,
  createFirstOwner,
  removeVirtualAuthenticator,
  resetE2EState,
} from './helpers/webauthn';

test('UJ-004 H1/A1/P1 — browser chat streams and persists real history', async ({ page }) => {
  await resetE2EState(page);
  const authenticator = await addVirtualPasskeyAuthenticator(page);
  try {
    await createFirstOwner(page);
    const seed = await page.request.post('/__e2e/seed-model', { data: { name: '@cf/meta/e2e-chat', task: 'text-generation' } });
    expect(seed.status()).toBe(200);

    await page.goto('/chat');
    await expect(page.getByText('What do you want to make?')).toBeVisible();
    await expect(page.getByTestId('task-workspace')).toBeVisible();
    await expect(page.getByTestId('chat-conversation')).toHaveCount(0);

    // ModelPicker is a real Astryx Selector. Choose the deterministic local model.
    const modelSelector = page.getByLabel(/Select a Model/i);
    await modelSelector.click();
    await page.getByText('@cf/meta/e2e-chat', { exact: true }).last().click();

    const composer = page.getByLabel('Message input');
    await composer.fill('Hello VibeFlare');
    await composer.press('Enter');

    await expect(page.getByTestId('vibeflare-chat').getByText('Hello VibeFlare', { exact: true })).toBeVisible();
    await expect(page.getByText('Hello from VibeFlare E2E', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-conversation')).toBeVisible();
    await expect(page.getByTestId('task-workspace')).toHaveCount(0);
    const lastReply = await page.getByText('Hello from VibeFlare E2E', { exact: true }).boundingBox();
    const activeComposer = await page.getByLabel('Message input').boundingBox();
    expect(lastReply).not.toBeNull();
    expect(activeComposer).not.toBeNull();
    expect(lastReply!.y + lastReply!.height).toBeLessThan(activeComposer!.y);
    expect(activeComposer!.y - (lastReply!.y + lastReply!.height)).toBeLessThan(220);

    const url = new URL(page.url());
    const chatId = url.searchParams.get('chat_id');
    expect(chatId).toBeTruthy();

    // Persistence completes in waitUntil after the final stream chunk.
    await expect.poll(async () => {
      const read = await page.request.get(`/admin/chats/${encodeURIComponent(chatId!)}/messages`);
      return (await read.json() as { messages: unknown[] }).messages.length;
    }).toBe(2);

    // Persistence completes in waitUntil after the final stream chunk.
    await expect.poll(async () => {
      const read = await page.request.get(`/admin/chats/${encodeURIComponent(chatId!)}/messages`);
      return (await read.json() as { messages: unknown[] }).messages.length;
    }).toBe(2);

    const fresh = await page.request.get(`/admin/chats/${encodeURIComponent(chatId!)}/messages`);
    expect(fresh.status()).toBe(200);
    const persisted = await fresh.json() as { chat: { id: string }; messages: Array<{ role: string; content: string }> };
    expect(persisted.chat.id).toBe(chatId);
    expect(persisted.messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Hello VibeFlare'],
      ['assistant', 'Hello from VibeFlare E2E'],
    ]);

    await page.reload();
    await expect(page.getByTestId('chat-conversation')).toBeVisible();
    await expect(page.getByTestId('task-workspace')).toHaveCount(0);
    await expect(page.getByTestId('vibeflare-chat').getByText('Hello VibeFlare', { exact: true })).toBeVisible();
    await expect(page.getByText('Hello from VibeFlare E2E', { exact: true })).toBeVisible();

    // A1: rejected body cannot create another chat.
    const stateBefore = await page.request.get('/__e2e/state');
    const beforeCount = (await stateBefore.json() as { counts: { chats: number } }).counts.chats;
    const invalid = await page.request.post('/v1/chat/completions?chat_id=invalid-chat', {
      headers: { 'x-vf-browser': '1' },
      data: { messages: [{ role: 'user', content: 'missing model' }] },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toEqual({ error: { type: 'invalid_request', message: 'model and messages required' } });
    const stateAfter = await page.request.get('/__e2e/state');
    expect((await stateAfter.json() as { counts: { chats: number } }).counts.chats).toBe(beforeCount);

    // P1: x-vf-browser does not bypass auth.
    await page.request.post('/auth/logout');
    const anonymous = await page.request.post('/v1/chat/completions?chat_id=anonymous-chat', {
      headers: { 'x-vf-browser': '1' },
      data: { model: '@cf/meta/e2e-chat', messages: [{ role: 'user', content: 'no session' }] },
    });
    expect(anonymous.status()).toBe(401);
    expect(await anonymous.json()).toEqual({ error: { type: 'auth', message: 'session required' } });
  } finally {
    await removeVirtualAuthenticator(authenticator);
  }
});
