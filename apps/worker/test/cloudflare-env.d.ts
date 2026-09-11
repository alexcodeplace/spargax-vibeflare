import type { Env as VibeFlareEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends VibeFlareEnv {}
  }
}

export {};
