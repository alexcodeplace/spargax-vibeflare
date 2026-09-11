import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

declare module 'vitest' {
  export interface ProvidedContext {
    D1_MIGRATIONS: D1Migration[];
  }
}

const migrations = await readD1Migrations('./src/db/migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: './wrangler.test.toml' },
      miniflare: {
        bindings: { SESSION_SECRET: 'test-secret-for-vitest' },
        // Stub the AI binding — it points to an external Worker that workerd
        // cannot resolve during offline tests.
        workers: [
          {
            name: '__WRANGLER_EXTERNAL_AI_WORKER',
            modules: true,
            script: `export default {
              async fetch() { return new Response('{}'); },
              async run() { return { response: '' }; },
            };`,
          },
        ],
      },
    }),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
    provide: {
      D1_MIGRATIONS: migrations,
    },
  },
});
