import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');
const fail = (message: string): never => { throw new Error(`Deploy-to-Cloudflare contract: ${message}`); };
const requireText = (text: string, needle: string, label: string) => {
  if (!text.includes(needle)) fail(`${label} is missing ${JSON.stringify(needle)}`);
};

const readme = read('README.md');
requireText(
  readme,
  '[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/alexcodeplace/spargax-vibeflare)',
  'README',
);

const wrangler = read('wrangler.toml');
for (const required of [
  'main = "apps/worker/src/index.ts"',
  'binding = "DB"',
  'binding = "R2"',
  '[ai]',
  'binding = "AI"',
  'binding = "ASSETS"',
  'run_worker_first = ["/", "/signup", "/signup/*"]',
  'name = "QUOTA"',
  'name = "AUTH_RL"',
  'name = "CRON"',
  'migrations_dir = "apps/worker/src/db/migrations"',
]) requireText(wrangler, required, 'root wrangler.toml');

for (const forbidden of ['SESSION_SECRET', 'CF_API_TOKEN', 'CF_ACCOUNT_ID', 'RP_ID =', 'RP_ORIGIN =']) {
  if (wrangler.includes(forbidden)) fail(`root wrangler.toml must not require ${forbidden}`);
}

const pkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
const scripts = pkg.scripts ?? {};
requireText(scripts.deploy ?? '', 'pnpm db:migrate:cloudflare', 'package.json deploy script');
requireText(scripts.deploy ?? '', 'wrangler deploy --config ../../wrangler.toml', 'package.json deploy script');
requireText(scripts['db:migrate:cloudflare'] ?? '', 'd1 migrations apply DB --remote', 'package.json migration script');

function findRecognizedSecretExamples(dir: string, relative = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.wrangler', 'release-artifacts'].includes(entry.name)) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findRecognizedSecretExamples(full, rel));
    else if (entry.name === '.env.example' || entry.name === '.dev.vars.example') found.push(rel);
  }
  return found;
}
const secretExamples = findRecognizedSecretExamples(repoRoot);
if (secretExamples.length) fail(`recognized secret example files would trigger deploy-time prompts: ${secretExamples.join(', ')}`);
if (!existsSync(join(repoRoot, '.env.cli.example'))) fail('.env.cli.example is required for the advanced CLI path');

process.stdout.write('✓ Deploy to Cloudflare static contract\n');
