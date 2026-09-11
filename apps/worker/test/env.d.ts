import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';
import type { Env as VibeFlareEnv } from '../src/env';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends VibeFlareEnv {}
}

declare module 'vitest' {
  export interface ProvidedContext {
    D1_MIGRATIONS: D1Migration[];
  }
}
