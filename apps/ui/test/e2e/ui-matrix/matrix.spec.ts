import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyAuth, type MatrixRole } from './matrix-auth';

type State =
  | 'present' | 'absent' | 'visible' | 'enabled' | 'disabled'
  | 'editable' | 'readonly' | 'required' | 'optional' | 'empty' | 'populated';

type ElementSpec = { testid?: string; role?: string; name?: string; state: State; count?: number };
type Entry = {
  route: string;
  roles: MatrixRole[];
  deniedRoles?: Partial<Record<MatrixRole, 'redirect' | '403'>>;
  expectStatus?: number;
  elements?: ElementSpec[];
};

const matrix = JSON.parse(
  readFileSync(join(process.cwd(), 'test/e2e/ui-matrix/matrix.json'), 'utf8'),
) as Entry[];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

function locate(page: Page, el: ElementSpec): Locator {
  if (el.testid) return page.getByTestId(el.testid);
  if (el.role && el.name) {
    return page.getByRole(el.role as Parameters<Page['getByRole']>[0], { name: el.name, exact: true });
  }
  throw new Error(`element spec needs testid, or role+name: ${JSON.stringify(el)}`);
}

async function assertRequired(loc: Locator, expected: boolean) {
  const native = await loc.getAttribute('required');
  const aria = await loc.getAttribute('aria-required');
  expect(native !== null || aria === 'true', `required=${expected}`).toBe(expected);
}

async function assertState(loc: Locator, spec: ElementSpec) {
  switch (spec.state) {
    case 'absent': return expect(loc).toHaveCount(spec.count ?? 0);
    case 'present': return expect(loc).toHaveCount(spec.count ?? 1);
    case 'visible': return expect(loc).toBeVisible();
    case 'enabled': return expect(loc).toBeEnabled();
    case 'disabled': return expect(loc).toBeDisabled();
    case 'editable': return expect(loc).toBeEditable();
    case 'readonly': return expect(loc).not.toBeEditable();
    case 'required': return assertRequired(loc, true);
    case 'optional': return assertRequired(loc, false);
    case 'empty': return expect(loc).toBeEmpty();
    case 'populated': return expect(loc).not.toBeEmpty();
  }
}

function routeLabel(route: string) {
  return route === '/' ? 'root' : route.slice(1).replaceAll('/', '-');
}

for (const entry of matrix) {
  for (const role of entry.roles) {
    for (const viewport of viewports) {
      test(`${entry.route} | ${role} | ${viewport.name}`, async ({ page, context, baseURL }) => {
        const base = baseURL ?? 'http://localhost:8788';
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await applyAuth(context, role, base, entry.route);

        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];
        const origin = new URL(base).origin;
        page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        page.on('pageerror', (error) => consoleErrors.push(error.message));
        page.on('response', (response) => {
          const url = new URL(response.url());
          if (url.origin === origin && response.status() >= 400) {
            failedRequests.push(`${response.status()} ${url.pathname}`);
          }
        });

        const response = await page.goto(`${base}${entry.route}`, { waitUntil: 'domcontentloaded' });
        expect(response?.status(), `${entry.route} status`).toBe(entry.expectStatus ?? 200);
        await page.locator('[data-vf-hydrated="true"]').first().waitFor({ state: 'attached' });

        for (const el of entry.elements ?? []) await assertState(locate(page, el), el);
        await page.waitForLoadState('networkidle');

        const horizontalOverflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(horizontalOverflow, `${entry.route} must not horizontally overflow at ${viewport.width}px`).toBe(false);
        expect(consoleErrors, `console errors on ${entry.route}`).toEqual([]);
        expect(failedRequests, `failed same-origin requests on ${entry.route}`).toEqual([]);

        await expect(page).toHaveScreenshot(
          `matrix-${routeLabel(entry.route)}-${role}-${viewport.name}.png`,
          { fullPage: true, animations: 'disabled' },
        );
      });
    }
  }

  for (const [role, denial] of Object.entries(entry.deniedRoles ?? {}) as Array<[MatrixRole, 'redirect' | '403']>) {
    test(`${entry.route} | ${role} | denied`, async ({ page, context, baseURL }) => {
      const base = baseURL ?? 'http://localhost:8788';
      await applyAuth(context, role, base, entry.route);
      const response = await page.goto(`${base}${entry.route}`, { waitUntil: 'domcontentloaded' });

      if (denial === '403') {
        expect(response?.status(), `${role} must get 403 on ${entry.route}`).toBe(403);
      } else {
        await page.waitForURL((url) => !url.pathname.startsWith(entry.route), { timeout: 10_000 });
        expect(page.url(), `${role} must be redirected away from ${entry.route}`).not.toContain(entry.route);
        expect(response?.status(), `${role} redirect source must be a real page`).toBe(200);
      }
    });
  }
}
