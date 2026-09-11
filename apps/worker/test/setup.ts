import { beforeAll } from 'vitest';
import { inject } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';

beforeAll(async () => {
  const migrations = inject('D1_MIGRATIONS');
  await applyD1Migrations(env.DB, migrations);
});
