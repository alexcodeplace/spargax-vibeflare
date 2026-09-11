import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface CloudflareIdentity {
  accounts: Array<{ id: string; name: string }>;
}

export interface DeploymentResult {
  url?: string;
  versionId?: string;
}

export interface LifecycleProvider {
  identity(): CloudflareIdentity;
  workerExists(name: string, accountId: string): boolean;
  d1Exists(name: string, accountId: string): boolean;
  createD1(name: string, accountId: string): { id: string };
  createR2(name: string, accountId: string): void;
  buildUi(repoRoot: string): void;
  deploy(configPath: string, repoRoot: string, secrets?: Record<string, string>): DeploymentResult;
  applyMigrations(configPath: string, databaseName: string): string[];
  health(url: string): Promise<{ ok: boolean; version?: string }>;
  deleteWorker(name: string, accountId: string): void;
  purgeR2(configPath: string, databaseName: string, bucketName: string): number;
  deleteD1(name: string, accountId: string): void;
  deleteR2(name: string, accountId: string): void;
}

type CommandResult = { stdout: string; stderr: string; status: number };

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function run(command: string, args: string[], options: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {}): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: 'utf8',
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  return {
    stdout: stripAnsi(result.stdout ?? ''),
    stderr: stripAnsi(result.stderr ?? ''),
    status: result.status ?? 1,
  };
}

function runInteractive(command: string, args: string[], env: NodeJS.ProcessEnv): number {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function expectOk(result: CommandResult, action: string): string {
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(`${action} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function parseJson<T>(text: string, action: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${action} returned invalid JSON`);
  }
}

function extractUuid(text: string): string | undefined {
  return text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
}

function deploymentFromOutput(text: string): DeploymentResult {
  const url = text.match(/https:\/\/[^\s)]+/)?.[0]?.replace(/[.,]$/, '');
  const versionId = extractUuid(text);
  return { ...(url ? { url } : {}), ...(versionId ? { versionId } : {}) };
}

function accountEnv(accountId: string): NodeJS.ProcessEnv {
  return { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId };
}

export class WranglerProvider implements LifecycleProvider {
  constructor(private readonly wrangler = process.env.VIBEFLARE_WRANGLER_BIN ?? 'wrangler') {}

  identity(): CloudflareIdentity {
    const out = expectOk(run(this.wrangler, ['whoami', '--json']), 'Cloudflare authentication');
    const parsed = parseJson<{ loggedIn?: boolean; accounts?: Array<{ id?: string; name?: string }> }>(out, 'wrangler whoami');
    if (parsed.loggedIn !== true) throw new Error('not logged into Cloudflare; run `wrangler login` then retry');
    const accounts = (parsed.accounts ?? []).filter((entry): entry is { id: string; name: string } => Boolean(entry.id && entry.name));
    if (accounts.length === 0) throw new Error('Cloudflare account list is empty; verify Wrangler account access');
    return { accounts };
  }

  workerExists(name: string, accountId: string): boolean {
    const result = run(this.wrangler, ['deployments', 'list', '--name', name, '--json'], { env: accountEnv(accountId) });
    if (result.status !== 0) {
      const detail = `${result.stderr}\n${result.stdout}`.trim();
      // Wrangler uses a non-zero status for a genuinely missing script. Only that
      // narrow condition is absence; auth/network/permission failures are unknown.
      if (/no deployments|not found|does not exist|could(?:n't| not) find|10090/i.test(detail)) return false;
      throw new Error(`cannot verify whether Worker '${name}' exists: ${detail || `wrangler exited ${result.status}`}`);
    }
    const parsed = parseJson<unknown>(result.stdout, 'wrangler deployments list');
    return Array.isArray(parsed) && parsed.length > 0;
  }

  d1Exists(name: string, accountId: string): boolean {
    const out = expectOk(run(this.wrangler, ['d1', 'list', '--json'], { env: accountEnv(accountId) }), 'list D1 databases');
    const entries = parseJson<Array<{ name?: string }>>(out, 'wrangler d1 list');
    return entries.some((entry) => entry.name === name);
  }

  createD1(name: string, accountId: string): { id: string } {
    const result = run(this.wrangler, ['d1', 'create', name], { env: accountEnv(accountId) });
    const out = expectOk(result, `create D1 ${name}`);
    const id = extractUuid(out);
    if (!id) throw new Error(`create D1 ${name} succeeded but returned no database UUID`);
    return { id };
  }

  createR2(name: string, accountId: string): void {
    expectOk(run(this.wrangler, ['r2', 'bucket', 'create', name], { env: accountEnv(accountId) }), `create R2 ${name}`);
  }

  buildUi(repoRoot: string): void {
    expectOk(run('pnpm', ['--filter', '@vibeflare/ui', 'build'], { cwd: repoRoot }), 'build VibeFlare UI');
  }

  deploy(configPath: string, repoRoot: string, secrets?: Record<string, string>): DeploymentResult {
    const args = ['deploy', '--config', configPath, '--strict'];
    let secretDir: string | undefined;
    try {
      if (secrets && Object.keys(secrets).length > 0) {
        secretDir = mkdtempSync(join(tmpdir(), 'vibeflare-secrets-'));
        const path = join(secretDir, 'secrets.json');
        writeFileSync(path, JSON.stringify(secrets), { mode: 0o600 });
        args.push('--secrets-file', path);
      }
      const result = run(this.wrangler, args, { cwd: repoRoot });
      return deploymentFromOutput(expectOk(result, 'deploy Worker'));
    } finally {
      if (secretDir) rmSync(secretDir, { recursive: true, force: true });
    }
  }

  applyMigrations(configPath: string, databaseName: string): string[] {
    const out = expectOk(
      run(this.wrangler, ['d1', 'migrations', 'apply', databaseName, '--remote', '--config', configPath], { input: 'y\n' }),
      `apply D1 migrations for ${databaseName}`,
    );
    return [...new Set(out.match(/\b\d{4}_[A-Za-z0-9_.-]+\.sql\b/g) ?? [])].sort();
  }

  async health(url: string): Promise<{ ok: boolean; version?: string }> {
    const endpoint = `${url.replace(/\/$/, '')}/health`;
    const attempts = 15;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
        if (response.ok) {
          const body = await response.json() as { ok?: boolean; version?: string };
          if (body.ok === true) return { ok: true, ...(body.version ? { version: body.version } : {}) };
        }
      } catch {
        // workers.dev can briefly refuse/reset requests while a new deployment propagates.
      }
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    return { ok: false };
  }

  deleteWorker(name: string, accountId: string): void {
    // Wrangler 4.x auto-confirms both the normal delete prompt and dependency
    // warnings when stdin/stdout are not TTYs. That can turn a scripted uninstall
    // into a forced dependency break. Only run this operation with a real terminal
    // so Wrangler's own reference checks remain visible and authoritative.
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error(
        `refusing non-interactive Worker deletion for '${name}'; rerun the confirmed uninstall in a terminal so Cloudflare dependency warnings cannot be auto-accepted`,
      );
    }
    const status = runInteractive(this.wrangler, ['delete', name], accountEnv(accountId));
    if (status !== 0) throw new Error(`delete Worker ${name} failed (wrangler exited ${status})`);
    if (this.workerExists(name, accountId)) {
      throw new Error(`Worker '${name}' still exists after Wrangler delete; deletion was cancelled or blocked by dependencies`);
    }
  }


  purgeR2(configPath: string, databaseName: string, bucketName: string): number {
    const out = expectOk(
      run(this.wrangler, ['d1', 'execute', databaseName, '--remote', '--json', '--config', configPath, '--command', 'SELECT r2_key FROM files ORDER BY r2_key']),
      `list R2 object keys from ${databaseName}`,
    );
    const blocks = parseJson<Array<{ results?: Array<{ r2_key?: string }> }>>(out, 'wrangler d1 execute');
    const keys = blocks.flatMap((block) => block.results ?? []).map((row) => row.r2_key).filter((key): key is string => Boolean(key));
    for (const key of keys) {
      expectOk(
        run(this.wrangler, ['r2', 'object', 'delete', `${bucketName}/${key}`, '--remote', '--force', '--config', configPath]),
        `delete R2 object ${key}`,
      );
    }
    return keys.length;
  }

  deleteD1(name: string, accountId: string): void {
    expectOk(run(this.wrangler, ['d1', 'delete', name, '--skip-confirmation'], { env: accountEnv(accountId) }), `delete D1 ${name}`);
  }

  deleteR2(name: string, accountId: string): void {
    expectOk(run(this.wrangler, ['r2', 'bucket', 'delete', name], { env: accountEnv(accountId) }), `delete R2 ${name}`);
  }
}
