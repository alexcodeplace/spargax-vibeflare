import { expect, test, type Page } from '@playwright/test';
import { applyAuth } from './ui-matrix/matrix-auth';

type Diagnostics = { state: string; frames: number; pulses: number; pendingFrame: boolean; points: number; markedPoints: number; targetFps: number; backingWidth: number; backingHeight: number; paintP95Ms: number; maxDisplacement: number };
const diagnostic = (page: Page) => page.getByTestId('flare-logo').evaluate(el => (el as HTMLElement & { getDiagnostics: () => Diagnostics }).getDiagnostics());
async function load(page: Page, baseURL: string, theme = 'dark') {
  await page.addInitScript(mode => localStorage.setItem('vf-theme', mode), theme);
  await applyAuth(page.context(), 'anonymous', baseURL, '/login');
  await page.goto('/login');
  await expect(page.getByTestId('flare-logo')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('flare-logo').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('flare-logo')).toHaveAttribute('data-state', 'idle', { timeout: 7000 });
}

for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
  test(`Logo responds, reforms and stays still at ${width}px in ${theme}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await load(page, baseURL!, theme);
    const logo = page.getByTestId('flare-logo'); const canvas = logo.locator('canvas');
    await expect(page.locator('.vf-auth-art img[src*="workflow-panels"]')).toHaveCount(0);
    expect((await diagnostic(page)).points).toBe(3080);
    expect((await diagnostic(page)).markedPoints).toBe(941);
    await logo.screenshot({ path: info.outputPath(`logo-rest-${theme}-${width}.png`) });
    const before = await canvas.screenshot();
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * .43, bounds.y + bounds.height * .52, { steps: 12 });
    await expect.poll(async () => (await diagnostic(page)).maxDisplacement).toBeGreaterThan(8);
    expect((await canvas.screenshot()).equals(before)).toBe(false);
    await logo.screenshot({ path: info.outputPath(`logo-hover-${theme}-${width}.png`) });
    await page.mouse.move(1, 1);
    await expect(logo).toHaveAttribute('data-state', 'idle', { timeout: 7000 });
    expect((await diagnostic(page)).maxDisplacement).toBe(0);
    const idleFrames = (await diagnostic(page)).frames;
    await page.waitForTimeout(450);
    expect((await diagnostic(page)).frames).toBe(idleFrames);
    expect((await diagnostic(page)).pendingFrame).toBe(false);
    await logo.getByRole('button', { name: 'Replay the VibeFlare dot animation' }).focus();
    const pulses = (await diagnostic(page)).pulses;
    await page.keyboard.press('Enter');
    expect((await diagnostic(page)).pulses).toBe(pulses + 1);
    await expect.poll(async () => (await diagnostic(page)).maxDisplacement).toBeGreaterThan(1);
    await expect(logo).toHaveAttribute('data-state', 'idle', { timeout: 7000 });
    await page.getByRole('button', { name: 'Sign in with passkey', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Sign in with passkey', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await info.attach('dotfield-metrics', { body: JSON.stringify(await diagnostic(page)), contentType: 'application/json' });
  });
}

test('Reduced motion and forced colors keep an unanimated, accessible logo', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await applyAuth(page.context(), 'anonymous', baseURL!, '/login');
  await page.goto('/login');
  const logo = page.getByTestId('flare-logo'); await logo.scrollIntoViewIfNeeded();
  await expect(logo).toHaveAttribute('data-reduced', 'true');
  await expect(logo.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'VibeFlare logo in red, orange and gold dots' })).toBeAttached();
  await page.waitForTimeout(200); const frames = (await diagnostic(page)).frames;
  await logo.locator('canvas').hover(); await page.waitForTimeout(300);
  expect((await diagnostic(page)).frames).toBe(frames);
  expect((await diagnostic(page)).maxDisplacement).toBe(0);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'no-preference' });
  await expect(logo).toHaveAttribute('data-reduced', 'true');
  await expect(logo.locator('canvas')).toHaveCSS('opacity', '0');
  await expect(logo.locator('svg.vf-dot-fallback')).toHaveCSS('opacity', '1');
});

test('No-JavaScript and unavailable-canvas fallbacks preserve the logo and page layout', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await applyAuth(context, 'anonymous', baseURL!, '/login');
  const page = await context.newPage(); await page.goto(baseURL! + '/login');
  await expect(page.getByRole('img', { name: 'VibeFlare logo in red, orange and gold dots' })).toBeVisible();
  await expect(page.locator('.vf-dot-fallback > circle')).toHaveCount(941);
  await expect(page.locator('[data-flare-replay]')).toBeHidden();
  await context.close();
  const fail = await browser.newContext();
  await fail.addInitScript(() => { HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext; });
  await applyAuth(fail, 'anonymous', baseURL!, '/login');
  const fallback = await fail.newPage(); await fallback.goto(baseURL! + '/login');
  await expect(fallback.locator('.vf-dot-fallback')).toBeVisible();
  await expect(fallback.getByTestId('flare-logo')).toHaveAttribute('data-state', 'static');
  await fail.close();
});

test('Hidden pages and removed Astro elements cancel animation work', async ({ page, baseURL }) => {
  await load(page, baseURL!);
  await page.getByRole('button', { name: 'Replay the VibeFlare dot animation' }).click();
  await expect.poll(async () => (await diagnostic(page)).maxDisplacement).toBeGreaterThan(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('flare-logo')).toHaveAttribute('data-state', 'paused');
  const frames = (await diagnostic(page)).frames; await page.waitForTimeout(300);
  expect((await diagnostic(page)).frames).toBe(frames); expect((await diagnostic(page)).pendingFrame).toBe(false);
  await page.evaluate(() => { delete (document as unknown as Record<string, unknown>).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByTestId('flare-logo')).toHaveAttribute('data-state', 'idle');
  const detached = await page.evaluateHandle(() => { const el = document.querySelector('vf-dot-flare')!; el.remove(); return el; });
  expect(await detached.evaluate(el => (el as HTMLElement & { getDiagnostics: () => Diagnostics }).getDiagnostics().pendingFrame)).toBe(false);
  expect(await detached.evaluate(el => (el as HTMLElement).dataset.state)).toBe('disposed');
  await detached.dispose();
});

test('A touch ripple does not intercept normal vertical scrolling', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage(); await load(page, baseURL!);
  const canvas = page.getByTestId('flare-logo').locator('canvas');
  await expect(canvas).toHaveCSS('touch-action', 'pan-y');
  const bounds = (await canvas.boundingBox())!; await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect.poll(async () => (await diagnostic(page)).maxDisplacement).toBeGreaterThan(1);
  const metrics = await diagnostic(page); expect(metrics.backingWidth).toBeLessThanOrEqual(900); expect(metrics.backingHeight).toBeLessThanOrEqual(570);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByTestId('flare-logo')).toHaveAttribute('data-state', 'paused');
  const frames = (await diagnostic(page)).frames; await page.waitForTimeout(300);
  expect((await diagnostic(page)).frames).toBe(frames);
  await context.close();
});

test('Pointer effect keeps bounded paint work under CPU throttling', async ({ page, baseURL }, info) => {
  await load(page, baseURL!);
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const box = (await page.getByTestId('flare-logo').locator('canvas').boundingBox())!;
  for (let i = 0; i < 36; i++) {
    await page.mouse.move(box.x + box.width * (.15 + .7 * i / 36), box.y + box.height * (.5 + .18 * Math.sin(i / 5)));
  }
  await page.mouse.move(1, 1);
  await expect(page.getByTestId('flare-logo')).toHaveAttribute('data-state', 'idle', { timeout: 10_000 });
  const metrics = await diagnostic(page);
  expect(metrics.pendingFrame).toBe(false); expect(metrics.points).toBeLessThanOrEqual(3100);
  expect(metrics.backingWidth * metrics.backingHeight).toBeLessThanOrEqual(513_000);
  await info.attach('throttled-performance', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach();
});
