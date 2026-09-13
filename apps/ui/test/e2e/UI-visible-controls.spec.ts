import { expect, test, type Locator, type Page } from '@playwright/test';
import { applyAuth } from './ui-matrix/matrix-auth';

async function artwork(control: Locator) {
  return control.evaluate(el => getComputedStyle(el, '::before').borderImageSource);
}

async function checkBounds(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const tabs = await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link').evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, padding: parseFloat(s.paddingInlineStart), border: s.borderTopStyle };
  }));
  const width = page.viewportSize()!.width;
  for (const [index, tab] of tabs.entries()) {
    expect(tab.left).toBeGreaterThanOrEqual(0);
    expect(tab.right).toBeLessThanOrEqual(width);
    expect(tab.height).toBeGreaterThanOrEqual(44);
    expect(tab.padding).toBeGreaterThanOrEqual(12);
    expect(tab.border).toBe('solid');
    for (const next of tabs.slice(index + 1)) {
      const sameRow = Math.abs(tab.top - next.top) < 1;
      if (sameRow) expect(next.left - tab.right).toBeGreaterThanOrEqual(7);
      else expect(next.top - tab.bottom).toBeGreaterThanOrEqual(7);
    }
  }
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1440, 390, 320]) {
    test(`Settings controls ${theme} ${width}: visible assets, separated targets, all sections reachable`, async ({ page, context, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(mode => localStorage.setItem('vf-theme', mode), theme);
      await applyAuth(context, 'owner', baseURL!, '/settings');
      const errors: string[] = [];
      const failedAssets: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (/\/assets\/club\//.test(response.url()) && response.status() >= 400) failedAssets.push(response.url());
      });
      await page.goto('/settings/');
      await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link')).toHaveCount(6);
      await checkBounds(page);
      const account = page.getByRole('link', { name: 'Account', exact: true });
      const models = page.getByRole('link', { name: 'Models', exact: true });
      expect(await artwork(account)).toContain(`/${theme}/surfaces/language-segment-active.svg`);
      expect(await artwork(models)).toContain(`/${theme}/surfaces/button-secondary-idle.svg`);
      await models.click();
      await expect(models).toHaveAttribute('aria-current', 'true');
      await expect(page.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
      expect(await artwork(models)).toContain(`/${theme}/surfaces/language-segment-active.svg`);
      const sync = page.getByRole('button', { name: 'Sync now', exact: true });
      await expect(sync).toHaveCSS('border-top-style', 'solid');
      expect(await artwork(sync)).toContain(`/${theme}/surfaces/button-secondary-idle.svg`);
      await expect(sync).toHaveCSS('padding-left', '14px');
      await page.screenshot({ path: testInfo.outputPath(`settings-models-${theme}-${width}.png`), animations: 'disabled' });

      await page.getByRole('link', { name: 'Cache', exact: true }).click();
      const save = page.getByRole('button', { name: 'Save TTL', exact: true });
      await expect(save).toHaveCSS('color', 'rgb(255, 255, 255)');
      expect(await artwork(save)).toContain(`/${theme}/surfaces/button-primary-idle.svg`);
      await expect(page.getByRole('button', { name: 'Add prompt', exact: true })).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath(`settings-cache-${theme}-${width}.png`), animations: 'disabled' });
      await page.getByRole('link', { name: 'Invites', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Invites', exact: true })).toBeVisible();
      await checkBounds(page);
      expect(errors).toEqual([]);
      expect(failedAssets).toEqual([]);
    });
  }

  test(`Shared buttons ${theme}: every variant and size, hover, press, loading and disabled`, async ({ page, context, baseURL }, testInfo) => {
    await page.addInitScript(mode => localStorage.setItem('vf-theme', mode), theme);
    await applyAuth(context, 'owner', baseURL!, '/design-system');
    await page.goto('/design-system/');
    // Demos must not trap the entire gallery behind an initially open dialog.
    await expect(page.getByRole('button', { name: 'Open invite form', exact: true })).toBeAttached();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const variant of ['primary', 'secondary', 'outline', 'ghost', 'danger']) {
      for (const size of ['sm', 'md', 'lg']) {
        const control = page.getByRole('button', { name: `${variant} ${size}`, exact: true });
        // Flex items blockify inline-flex to flex in computed styles.
        await expect(control).toHaveCSS('display', /^(inline-)?flex$/);
        await expect(control).toHaveCSS('border-top-style', 'solid');
        await expect(control).toHaveCSS('border-radius', '12px');
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(size === 'sm' ? 40 : size === 'md' ? 44 : 48);
        if (variant !== 'danger') await expect.poll(() => artwork(control), { message: `Hydrated ${variant} ${size} artwork` }).toContain(`/assets/club/${theme}/surfaces/button-`);
      }
    }
    const primary = page.getByRole('button', { name: 'primary md', exact: true });
    await primary.hover();
    expect(await artwork(primary)).toContain('button-primary-hover.svg');
    await page.mouse.down();
    expect(await artwork(primary)).toContain('button-primary-pressed.svg');
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Disabled', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Loading', exact: true })).toBeDisabled();
    await page.getByRole('heading', { name: 'Button', exact: true }).locator('xpath=ancestor::section[1]').screenshot({ path: testInfo.outputPath(`buttons-${theme}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: 'Open invite form', exact: true }).click();
    const inviteDemo = page.getByRole('dialog', { name: 'New invite', exact: true });
    await expect(inviteDemo).toBeVisible();
    await inviteDemo.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(inviteDemo).not.toBeVisible();
  });
}

test('Settings tabs keep roving keyboard focus and labelled panels; buttons keep keyboard rings', async ({ page, context, baseURL }) => {
  await applyAuth(context, 'owner', baseURL!, '/settings');
  await page.goto('/settings/');
  const account = page.getByRole('link', { name: 'Account', exact: true });
  await account.focus();
  await page.keyboard.press('ArrowRight');
  const devices = page.getByRole('link', { name: 'Devices', exact: true });
  await expect(devices).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(devices).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('End');
  await expect(page.getByRole('link', { name: 'Invites', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(account).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('region', { name: 'Account', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  const signout = page.getByRole('button', { name: 'Sign out', exact: true });
  await expect(signout).toBeFocused();
  await expect(signout).toHaveCSS('outline-style', 'solid');
  await expect(signout).toHaveCSS('outline-width', '3px');
});

test('Asset failures still leave bounded, usable controls; forced colors keeps selected state', async ({ page, context, baseURL }) => {
  await applyAuth(context, 'owner', baseURL!, '/settings');
  await page.route('**/assets/club/*/surfaces/*.svg', route => route.abort());
  await page.goto('/settings/');
  const models = page.getByRole('link', { name: 'Models', exact: true });
  await models.click();
  await expect(models).toHaveAttribute('aria-current', 'true');
  await expect(models).toHaveCSS('border-top-style', 'solid');
  await expect(models).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(models).toHaveCSS('outline-style', 'solid');
  await expect(models).toHaveCSS('outline-width', '2px');
});
