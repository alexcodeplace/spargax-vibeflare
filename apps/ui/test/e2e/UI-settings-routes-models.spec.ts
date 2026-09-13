import { expect, test } from '@playwright/test';
import { resetE2EState, waitForHydratedIsland } from './helpers/webauthn';

const preferred = '@cf/meta/llama-3.2-3b-instruct';
const fallback = '@cf/meta/e2e-chat';
const tabs = ['Account', 'Devices', 'Auth', 'Models', 'Cache', 'Invites'];

async function owner(page: import('@playwright/test').Page) {
  await resetE2EState(page);
  expect((await page.request.post('/__e2e/session', { data: { role: 'owner' } })).ok()).toBe(true);
  expect((await page.request.post('/__e2e/seed-model', { data: { name: preferred, task: 'text-generation', paid_required: false } })).ok()).toBe(true);
}

for (const width of [1440, 390]) {
  test(`Settings routes support deep links, reload and history at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 950 });
    await owner(page);
    for (const name of tabs) {
      const res = await page.goto(`/settings/${name.toLowerCase()}/`);
      expect(res?.status()).toBe(200);
      await waitForHydratedIsland(page, 'settings-page');
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'true');
      await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
    }
    await page.goto('/settings/models/');
    await waitForHydratedIsland(page, 'settings-page');
    await page.getByRole('link', { name: 'Cache', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/cache\/$/);
    await page.goBack();
    await expect(page.getByRole('link', { name: 'Models', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.goForward();
    await expect(page.getByRole('link', { name: 'Cache', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.reload();
    await waitForHydratedIsland(page, 'settings-page');
    await expect(page.getByRole('region', { name: 'Cache', exact: true })).toBeVisible();
    // Copy/open-in-new-tab is a real link, not a button that only edits the address bar.
    const nextPage = context.waitForEvent('page');
    await page.getByRole('link', { name: 'Models', exact: true }).click({ modifiers: ['Control'] });
    const opened = await nextPage;
    await opened.waitForLoadState();
    await expect(opened).toHaveURL(/\/settings\/models\/$/);
    await expect(opened.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
    await opened.close();
    await page.goto('/settings/');
    await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('aria-current', 'true');
    expect((await page.request.get('/settings/not-a-real-tab/')).status()).toBe(404);
  });

  test(`Model checkboxes persist, update another chat tab, and restore an empty picker at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 950 });
    await owner(page);
    await page.goto('/settings/models/');
    await waitForHydratedIsland(page, 'settings-page');
    const checkbox = (name: string) => page.getByRole('checkbox', { name, exact: true });
    await expect(checkbox(preferred)).toBeChecked();
    const chat = await context.newPage();
    await chat.goto('/chat');
    await waitForHydratedIsland(chat, 'vibeflare-chat');
    const picker = chat.getByRole('combobox', { name: /Select a Model/ });
    await expect(picker).toContainText(preferred);

    const save = page.waitForResponse(r => r.url().endsWith('/admin/models/visibility') && r.request().method() === 'PATCH');
    await checkbox(preferred).click();
    expect((await save).status()).toBe(200);
    await expect(picker).toContainText(fallback);
    await picker.click();
    await expect(chat.getByText(preferred, { exact: true })).toHaveCount(0);
    await chat.keyboard.press('Escape');
    await page.reload();
    await waitForHydratedIsland(page, 'settings-page');
    await expect(checkbox(preferred)).not.toBeChecked();
    // Hidden entries must remain available in Settings for re-selection.
    await expect(checkbox(preferred)).toBeVisible();
    const empty = page.waitForResponse(r => r.url().endsWith('/admin/models/visibility') && r.request().method() === 'PATCH');
    await checkbox(fallback).click();
    expect((await empty).status()).toBe(200);
    await expect(chat.getByText('No models selected for this tab.', { exact: false })).toBeVisible();
    await expect(chat.getByRole('link', { name: 'Choose models in Settings' })).toHaveAttribute('href', '/settings/models/');
    await expect(chat.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(page.getByText('0 of 2 models shown in your chat')).toBeVisible();

    const restore = page.waitForResponse(r => r.url().endsWith('/admin/models/visibility') && r.request().method() === 'PATCH');
    await checkbox(preferred).click();
    expect((await restore).status()).toBe(200);
    await expect(picker).toContainText(preferred);
    await page.getByRole('textbox', { name: 'Search models', exact: true }).fill('llama');
    await expect(checkbox(preferred)).toBeVisible();
    await expect(checkbox(fallback)).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Search models', exact: true }).fill('');
    await page.screenshot({ path: `test-results/settings-model-choices-${width}.png`, fullPage: true, animations: 'disabled' });
    await chat.close();
  });
}

test('a failed model-visibility save rolls its checkbox back instead of pretending success', async ({ page }) => {
  await owner(page);
  await page.goto('/settings/models/');
  await waitForHydratedIsland(page, 'settings-page');
  await page.route('**/admin/models/visibility', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Save temporarily unavailable' } }) }));
  const box = page.getByRole('checkbox', { name: preferred, exact: true });
  await box.click();
  await expect(page.getByText('Save temporarily unavailable', { exact: true })).toBeVisible();
  await expect(box).toBeChecked();
  await expect(box).toBeEnabled();
  await page.reload();
  await expect(box).toBeChecked();
});

test('deep links preserve owner-only tab restrictions and signed-out behavior', async ({ page }) => {
  await owner(page);
  await page.context().clearCookies();
  expect((await page.request.post('/__e2e/session', { data: { role: 'user' } })).ok()).toBe(true);
  await page.goto('/settings/invites/');
  await expect(page).toHaveURL(/\/settings\/account\/$/);
  await expect(page.getByRole('link', { name: 'Invites', exact: true })).toHaveCount(0);
  await page.context().clearCookies();
  await page.goto('/settings/models/');
  await expect(page).toHaveURL(/\/login\/?$/);
});
