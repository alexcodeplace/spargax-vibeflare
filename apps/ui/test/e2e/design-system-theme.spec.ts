import { expect, test, type Page } from '@playwright/test';

const ALIASES = {
  'color-bg': 'color-background-body',
  'color-surface': 'color-background-surface',
  'color-surface-hover': 'color-background-muted',
  'color-text': 'color-text-primary',
  'color-muted': 'color-text-secondary',
  'color-accent-text': 'color-on-accent',
  'color-warn': 'color-warning',
  'color-danger': 'color-error',
  'color-info': 'color-text-blue',
} as const;

async function cssVars(page: Page, names: string[]) {
  return page.evaluate((tokens) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(tokens.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]));
  }, names);
}

async function rootTheme(page: Page) {
  return page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    theme: document.documentElement.getAttribute('data-astryx-theme'),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
  }));
}

test.describe('Design System: VibeFlare over Astryx semantics', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('vf-theme'));
  });

  test('compatibility aliases resolve to Astryx semantic tokens', async ({ page }) => {
    await page.goto('/design-system');
    // Astro's ClientRouter may replace the execution context once immediately
    // after first load. Poll through that swap rather than racing page.evaluate.
    await expect.poll(async () => {
      const aliasValues = await cssVars(page, Object.keys(ALIASES));
      const semanticValues = await cssVars(page, Object.values(ALIASES));
      return Object.entries(ALIASES).every(([alias, semantic]) =>
        aliasValues[alias] === semanticValues[semantic]
      );
    }).toBe(true);
  });

  test('defaults to explicit neutral dark mode and resolves its palette', async ({ page }) => {
    await page.goto('/design-system');
    await expect.poll(() => rootTheme(page)).toEqual({
      mode: 'dark',
      theme: 'neutral',
      scheme: 'dark',
      background: 'rgb(6, 19, 41)',
      text: 'rgb(237, 245, 255)',
    });
  });

  test('explicit light mode resolves the VibeFlare light palette', async ({ page }) => {
    await page.goto('/design-system');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect.poll(() => rootTheme(page)).toEqual({
      mode: 'light',
      theme: 'neutral',
      scheme: 'light',
      background: 'rgb(237, 244, 252)',
      text: 'rgb(19, 46, 80)',
    });
  });

  test('theme toggle persists both modes and never falls through to system mode', async ({ page }) => {
    await page.request.post('/__e2e/reset');
    const session = await page.request.post('/__e2e/session', { data: { role: 'owner' } });
    expect(session.ok()).toBe(true);
    await page.goto('/chat');

    const toggle = page.getByRole('button', { name: 'Toggle theme' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect.poll(() => rootTheme(page)).toMatchObject({ mode: 'light', theme: 'neutral', scheme: 'light' });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('vf-theme'))).toBe('light');

    await toggle.click();
    await expect.poll(() => rootTheme(page)).toMatchObject({ mode: 'dark', theme: 'neutral', scheme: 'dark' });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('vf-theme'))).toBe('dark');
  });
});
