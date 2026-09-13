import { expect, test } from '@playwright/test';
import { applyAuth } from './ui-matrix/matrix-auth';
import { expectSingleControlEdge, renderedControlContrast } from './helpers/control-invariants';

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`Login contrast ${theme} ${width}: passkey and GitHub remain readable in every enabled state`, async ({ page, context, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(mode => localStorage.setItem('vf-theme', mode), theme);
      await applyAuth(context, 'anonymous', baseURL!, '/login');
      await page.route('**/auth/methods', route => route.fulfill({ json: {
        passkey: true, github: true, github_flow: 'oauth', cf_access: false, setup_required: false,
      } }));
      await page.goto('/login');
      const measurements: Record<string, number> = {};
      for (const name of ['Sign in with passkey', 'Sign in with GitHub']) {
        const action = page.getByRole('button', { name, exact: true });
        await expect(action).toBeVisible();
        for (const state of ['idle', 'hover', 'pressed']) {
          if (state !== 'idle') await action.hover();
          if (state === 'pressed') await page.mouse.down();
          try {
            const ratio = await renderedControlContrast(action);
            measurements[`${name}: ${state}`] = ratio;
            expect.soft(ratio, `${name} ${state}: rendered text contrast`).toBeGreaterThanOrEqual(4.5);
          } finally {
            // Release outside the control: checking pressed styling must not start sign-in.
            await page.mouse.move(0, 0);
            if (state === 'pressed') await page.mouse.up();
          }
        }
      }
      await testInfo.attach('rendered-contrast', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath(`login-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
    });

    test(`Control edges ${theme} ${width}: login and workspace use one perimeter without losing keyboard focus`, async ({ page, context, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(mode => localStorage.setItem('vf-theme', mode), theme);
      await applyAuth(context, 'anonymous', baseURL!, '/login');
      await page.goto('/login');
      const action = page.getByRole('button', { name: 'Sign in with passkey', exact: true });
      await expect(action).toBeVisible();
      await expectSingleControlEdge(action);
      await expect(action).toHaveCSS('outline-width', '0px');
      await page.keyboard.press('Tab');
      await action.focus();
      await expect(action).toHaveCSS('outline-width', '3px');
      await expect(action).toHaveCSS('outline-style', 'solid');
      await expectSingleControlEdge(action);

      await applyAuth(context, 'owner', baseURL!, '/chat');
      await page.goto('/chat');
      await expect(page.getByTestId('vibeflare-chat')).toBeVisible();
      const tabs = page.locator('.vf-task-tabs').getByRole('tab');
      await expect(tabs).toHaveCount(4);
      for (const tab of await tabs.all()) {
        await expectSingleControlEdge(tab);
        expect(await renderedControlContrast(tab)).toBeGreaterThanOrEqual(4.5);
      }
      const refresh = page.getByRole('button', { name: 'Refresh models', exact: true });
      await expectSingleControlEdge(refresh);
      await refresh.hover();
      await expectSingleControlEdge(refresh);
      await page.mouse.move(0, 0);
      await page.locator('.vf-chat-toolbar').screenshot({ path: testInfo.outputPath(`workspace-controls-${theme}-${width}.png`), animations: 'disabled' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }
}
