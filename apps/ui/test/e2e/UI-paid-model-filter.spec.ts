import { expect, test } from '@playwright/test';
import {
  addVirtualPasskeyAuthenticator,
  createFirstOwner,
  removeVirtualAuthenticator,
  resetE2EState,
  waitForHydratedIsland,
} from './helpers/webauthn';

const PAID_MODEL = '@cf/deepseek-ai/deepseek-v4-flash-0731';

test('paid models are excluded by default and tagged when explicitly included', async ({ page }) => {
  await resetE2EState(page);
  const authenticator = await addVirtualPasskeyAuthenticator(page);
  try {
    await createFirstOwner(page);
    const seed = await page.request.post('/__e2e/seed-model', {
      data: { name: PAID_MODEL, task: 'text-generation', paid_required: true },
    });
    expect(seed.status()).toBe(200);
    expect((await page.request.post('/__e2e/seed-model', {
      data: { name: '@cf/test/metadata-gap', paid_required: null },
    })).status()).toBe(200);
    expect((await page.request.post('/__e2e/seed-model', {
      data: { name: '@cf/google/embeddinggemma-300m', task: 'text-embeddings', paid_required: false },
    })).status()).toBe(200);


    const defaultList = await page.request.get('/admin/models?task=text-generation');
    expect(defaultList.status()).toBe(200);
    const defaultBody = await defaultList.json() as {
      exclude_paid: boolean;
      models: Array<{ name: string; paid_required: boolean }>;
    };
    expect(defaultBody.exclude_paid).toBe(true);
    expect(defaultBody.models.every(m => typeof m.paid_required === 'boolean')).toBe(true);
    expect(defaultBody.models.some(m => m.name === '@cf/test/metadata-gap')).toBe(false);
    expect(defaultBody.models.some((model) => model.name === PAID_MODEL)).toBe(false);

    await page.goto('/settings');
    await waitForHydratedIsland(page, 'settings-page');
    await page.getByRole('link', { name: 'Models' }).click();
    const excludePaid = page.getByRole('checkbox', { name: 'Exclude paid' });
    await expect(excludePaid).toBeChecked();
    await page.screenshot({ path: 'test-results/exclude-paid-settings.png', fullPage: true, animations: 'disabled' });

    const save = page.waitForResponse((response) =>
      response.url().endsWith('/admin/settings') && response.request().method() === 'PUT');
    await excludePaid.click();
    expect((await save).status()).toBe(200);
    await expect(excludePaid).not.toBeChecked();

    const includedList = await page.request.get('/admin/models?task=text-generation');
    expect(includedList.status()).toBe(200);
    const includedBody = await includedList.json() as {
      exclude_paid: boolean;
      models: Array<{ name: string; paid_required: boolean }>;
    };
    expect(includedBody.exclude_paid).toBe(false);
    expect(includedBody.models.some(m => m.name === '@cf/test/metadata-gap')).toBe(false);
    expect(includedBody.models).toContainEqual(expect.objectContaining({
      name: PAID_MODEL,
      paid_required: true,
    }));

    await page.goto('/chat');
    await waitForHydratedIsland(page, 'vibeflare-chat');
    await page.getByRole('combobox', { name: /Select a Model/i }).click();
    await expect(page.getByText(`💲 Paid · ${PAID_MODEL}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/billing unknown|metadata-gap/i)).toHaveCount(0);
    await page.screenshot({ path: 'test-results/paid-model-tag.png', fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.goto('/settings');
    await waitForHydratedIsland(page, 'settings-page');
    await page.getByRole('link', { name: 'Models' }).click();
    await expect(page.getByRole('checkbox', { name: 'Exclude paid' })).not.toBeChecked();
    const restore = page.waitForResponse(r => r.url().endsWith('/admin/settings') && r.request().method() === 'PUT');
    await page.getByRole('checkbox', { name: 'Exclude paid' }).click();
    expect((await restore).status()).toBe(200);
    await page.reload();
    await waitForHydratedIsland(page, 'settings-page');
    await page.getByRole('link', { name: 'Models' }).click();
    await expect(page.getByRole('checkbox', { name: 'Exclude paid' })).toBeChecked();
    const excluded = await page.request.get('/admin/models');
    expect((await excluded.json()).models.some((m: { name: string }) => m.name === PAID_MODEL)).toBe(false);

  } finally {
    await removeVirtualAuthenticator(authenticator);
  }
});
