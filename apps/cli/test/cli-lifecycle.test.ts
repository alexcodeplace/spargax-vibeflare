import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readInstallReceipt } from '../src/lib/install-state.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
let tempRoot = '';
let baseEnv: NodeJS.ProcessEnv;
let healthUrl = '';
let closeServer: (() => Promise<void>) | undefined;

function executable(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o755 });
  chmodSync(path, 0o755);
}

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolveRun, reject) => {
    const child = spawn('bun', [join(repoRoot, 'apps/cli/src/index.ts'), ...args], {
      cwd: repoRoot,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code: code ?? 1, stdout, stderr }));
  });
}

beforeEach(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'vibeflare-cli-journey-'));
  const fakeBin = join(tempRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  const commandLog = join(tempRoot, 'provider.log');

  executable(join(fakeBin, 'wrangler'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${commandLog}"
case "$1 $2" in
  "whoami --json")
    printf '%s\\n' '{"loggedIn":true,"accounts":[{"id":"acct-1","name":"Primary"}]}'
    ;;
  "deployments list")
    printf '%s\\n' '[]'
    ;;
  "d1 list")
    printf '%s\\n' '[]'
    ;;
  "d1 create")
    printf '%s\\n' 'database_id = "11111111-1111-4111-8111-111111111111"'
    ;;
  "r2 bucket")
    if [ "$3" = "create" ] || [ "$3" = "delete" ]; then :; else exit 9; fi
    ;;
  "d1 migrations")
    printf '%s\\n' '0001_init.sql 0002_auth_invites.sql 0006_model_health.sql'
    ;;
  "d1 execute")
    printf '%s\\n' '[{"results":[{"r2_key":"owner/one-file.txt"}],"success":true}]'
    ;;
  "r2 object")
    [ "$3" = "delete" ]
    ;;
  "delete binary-test")
    ;;
  "d1 delete")
    ;;
  "deploy --config")
    printf '%s\\n' 'Uploaded VibeFlare'
    printf '%s\\n' 'Deployed binary-test triggers'
    printf '%s\\n' 'https://binary-test.example.workers.dev'
    printf '%s\\n' 'Current Version ID: 22222222-2222-4222-8222-222222222222'
    ;;
  *)
    printf 'unexpected fake wrangler invocation: %s\\n' "$*" >&2
    exit 9
    ;;
esac
`);

  executable(join(fakeBin, 'pnpm'), `#!/usr/bin/env bash
set -euo pipefail
printf 'pnpm %s\\n' "$*" >> "${commandLog}"
`);

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '0.9.6-test' }));
      return;
    }
    if (req.headers.authorization === 'Bearer vf-test-doctor-key' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: '@cf/meta/e2e-chat' }] }));
      return;
    }
    if (req.headers.authorization === 'Bearer vf-test-doctor-key' && req.url === '/v1/quota') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, used: 9, limit: 10000 }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test health server failed to bind');
  healthUrl = `http://127.0.0.1:${address.port}`;
  closeServer = async () => await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));

  baseEnv = {
    ...process.env,
    HOME: join(tempRoot, 'home'),
    XDG_CONFIG_HOME: join(tempRoot, 'config'),
    XDG_STATE_HOME: join(tempRoot, 'state'),
    VIBEFLARE_STATE_DIR: join(tempRoot, 'state', 'vibeflare', 'installations'),
    VIBEFLARE_WRANGLER_BIN: join(fakeBin, 'wrangler'),
    PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
  };
});

afterEach(async () => {
  if (closeServer) await closeServer();
  closeServer = undefined;
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

describe('UJ-008/UJ-009 CLI journey', () => {
  it('runs setup → status → doctor → update → preview → confirmed uninstall from durable receipt state', async () => {
    const setup = await runCli(['setup', '--name=binary-test', `--origin=${healthUrl}`]);
    expect(setup.code, setup.stderr).toBe(0);
    expect(setup.stdout).toContain('Setup complete.');
    expect(setup.stdout).toContain('Installation: binary-test');

    const receipt = readInstallReceipt('binary-test', baseEnv);
    expect(receipt?.status).toBe('installed');
    expect(receipt?.resources.d1?.id).toBe('11111111-1111-4111-8111-111111111111');

    const setupAgain = await runCli(['setup', '--name=binary-test']);
    expect(setupAgain.code, setupAgain.stderr).toBe(0);
    expect(setupAgain.stdout).toContain('Setup complete.');

    const status = await runCli(['status', '--name=binary-test']);
    expect(status.code, status.stderr).toBe(0);
    expect(status.stdout).toContain('State: installed');
    expect(status.stdout).toContain('Health: healthy');
    expect(status.stdout).toContain('D1: binary-test-db');

    const doctor = await runCli(['doctor', '--name=binary-test']);
    expect(doctor.code, doctor.stderr).toBe(0);
    expect(doctor.stdout).toContain('✓ installation: installed v0.9.6');
    expect(doctor.stdout).toContain('✓ server: v0.9.6-test');
    expect(doctor.stdout).toContain('○ api-client: not configured yet');

    baseEnv.VIBEFLARE_URL = healthUrl;
    baseEnv.VIBEFLARE_KEY = 'vf-test-doctor-key';
    const configuredDoctor = await runCli(['doctor', '--name=binary-test']);
    expect(configuredDoctor.code, configuredDoctor.stderr).toBe(0);
    expect(configuredDoctor.stdout).toContain('✓ api-auth: 1 models');
    expect(configuredDoctor.stdout).toContain('✓ quota: 9/10000 0%');
    delete baseEnv.VIBEFLARE_URL;
    delete baseEnv.VIBEFLARE_KEY;

    const update = await runCli(['update', '--name=binary-test']);
    expect(update.code, update.stderr).toBe(0);
    expect(update.stdout).toContain('Updated binary-test: 0.9.6 → 0.9.6');

    const logPath = join(tempRoot, 'provider.log');
    const beforePreview = readFileSync(logPath, 'utf8');
    const preview = await runCli(['uninstall', '--name=binary-test', '--preview']);
    expect(preview.code, preview.stderr).toBe(0);
    expect(preview.stdout).toContain('No deletion was performed.');
    expect(preview.stdout).toContain('worker: binary-test');
    expect(readFileSync(logPath, 'utf8')).toBe(beforePreview);

    const removed = await runCli(['uninstall', '--name=binary-test', '--confirm=binary-test']);
    expect(removed.code).toBe(1);
    expect(removed.stderr).toContain('refusing non-interactive Worker deletion');
    expect(removed.stdout).toContain('State: uninstall-incomplete');

    const providerLog = readFileSync(logPath, 'utf8');
    expect(providerLog).not.toContain('r2 object delete');
    expect(providerLog).not.toContain('r2 bucket delete');
    expect(providerLog).not.toContain('d1 delete');
    expect(readInstallReceipt('binary-test', baseEnv)?.resources.worker?.status).toBe('delete-failed');
  });
});
