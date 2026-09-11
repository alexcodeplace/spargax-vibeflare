import { expect, test } from '@playwright/test';
import {
  addVirtualPasskeyAuthenticator,
  createFirstOwner,
  removeVirtualAuthenticator,
  resetE2EState,
  waitForHydratedIsland,
} from './helpers/webauthn';

test('UJ-007 H1/H2/A1/P1 — private file upload, read, isolation, and delete', async ({ page, browser }) => {
  await resetE2EState(page);
  const ownerAuthenticator = await addVirtualPasskeyAuthenticator(page);
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  let memberAuthenticator: Awaited<ReturnType<typeof addVirtualPasskeyAuthenticator>> | null = null;

  try {
    await createFirstOwner(page);

    // Provision a normal second member as a permission-boundary fixture.
    const inviteResponse = await page.request.post('/admin/invites', {
      data: { label: 'file-boundary-member', expires_in_sec: 3600 },
    });
    expect(inviteResponse.status()).toBe(201);
    const invite = await inviteResponse.json() as { full: string };

    memberAuthenticator = await addVirtualPasskeyAuthenticator(memberPage);
    await memberPage.goto(`/signup?token=${encodeURIComponent(invite.full)}`);
    await memberPage.getByRole('button', { name: 'Sign up with passkey' }).click();
    await memberPage.waitForURL(/\/chat(?:\/|$|\?)/, { timeout: 20_000 });

    await page.goto('/files');
    await expect(page.getByRole('heading', { name: 'Uploaded Files' })).toBeVisible();
    await waitForHydratedIsland(page, 'files-page');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello-vibeflare', 'utf8'),
    });

    await expect(page.getByText('Uploaded sample.txt', { exact: true })).toBeVisible();
    await expect(page.getByText('sample.txt', { exact: true })).toBeVisible();
    await expect(page.getByText('15 B', { exact: true })).toBeVisible();
    await expect(page.getByText('text/plain', { exact: true })).toBeVisible();

    const list = await page.request.get('/admin/files');
    expect(list.status()).toBe(200);
    const listBody = await list.json() as { files: Array<{ id: string; name: string; size: number; mime: string }> };
    expect(listBody.files).toHaveLength(1);
    const file = listBody.files[0]!;
    expect(file).toMatchObject({ name: 'sample.txt', size: 15, mime: 'text/plain' });

    const ownerDownload = await page.request.get(`/admin/files/${encodeURIComponent(file.id)}/download`);
    expect(ownerDownload.status()).toBe(200);
    expect(await ownerDownload.text()).toBe('hello-vibeflare');

    // P1: another authenticated member cannot enumerate or retrieve this file.
    const memberList = await memberPage.request.get('/admin/files');
    expect(memberList.status()).toBe(200);
    expect(await memberList.json()).toEqual({ files: [] });
    const memberDownload = await memberPage.request.get(`/admin/files/${encodeURIComponent(file.id)}/download`);
    expect(memberDownload.status()).toBe(404);
    expect(await memberDownload.json()).toEqual({ error: { type: 'not_found', message: 'file not found' } });

    // H2: delete through the UI and prove fresh durable state is empty.
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Deleted sample.txt', { exact: true })).toBeVisible();
    await expect(page.getByText('sample.txt', { exact: true })).toBeHidden();
    const afterDelete = await page.request.get('/admin/files');
    expect(afterDelete.status()).toBe(200);
    expect(await afterDelete.json()).toEqual({ files: [] });

    // A1: repeating the delete is an explicit not-found failure, not silent success.
    const repeatDelete = await page.request.delete(`/admin/files/${encodeURIComponent(file.id)}`);
    expect(repeatDelete.status()).toBe(404);
    expect(await repeatDelete.json()).toEqual({ error: { type: 'not_found', message: 'file not found' } });
  } finally {
    if (memberAuthenticator) await removeVirtualAuthenticator(memberAuthenticator);
    await memberContext.close();
    await removeVirtualAuthenticator(ownerAuthenticator);
  }
});
