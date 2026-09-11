import { defineConfig, devices } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  retries: 0,
  reporter: 'list',
  fullyParallel: false,
  workers: 1, // E2E uses one deterministic local D1/R2/DO fixture namespace.
  use: {
    baseURL: 'http://localhost:8788',
    headless: true,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'bash scripts/start-e2e.sh',
    url: 'http://localhost:8788/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
