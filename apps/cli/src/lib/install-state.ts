import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const INSTALL_RECEIPT_VERSION = 'vibeflare-install/v1' as const;
export type InstallStatus = 'provisioning' | 'installed' | 'update-failed' | 'uninstall-incomplete' | 'removed';
export type OwnedResourceStatus = 'owned' | 'removed' | 'delete-failed';
export type BrowserAuthMode = 'standalone' | 'cf_access';

export interface ResourceReceipt {
  name: string;
  status: OwnedResourceStatus;
  id?: string;
  lastError?: string;
}

export interface InstallReceipt {
  schemaVersion: typeof INSTALL_RECEIPT_VERSION;
  installation: string;
  accountId: string;
  status: InstallStatus;
  browserAuth: {
    mode: BrowserAuthMode;
    origin: string;
    rpId: string;
  };
  resources: {
    worker?: ResourceReceipt;
    d1?: ResourceReceipt;
    r2?: ResourceReceipt;
  };
  release: {
    installed?: string;
    source?: string;
    target?: string;
  };
  deployment?: {
    url?: string;
    versionId?: string;
    deployedAt: string;
  };
  migrationsApplied: string[];
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

const INSTALLATION_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function assertInstallationName(name: string): void {
  if (!INSTALLATION_RE.test(name)) {
    throw new Error('installation name must be 1-63 lowercase letters, digits, or hyphens and start/end alphanumeric');
  }
}

export function installationStateRoot(env = process.env): string {
  if (env.VIBEFLARE_STATE_DIR) return resolve(env.VIBEFLARE_STATE_DIR);
  const xdg = env.XDG_STATE_HOME ? resolve(env.XDG_STATE_HOME) : join(homedir(), '.local', 'state');
  return join(xdg, 'vibeflare', 'installations');
}

export function receiptPath(name: string, env = process.env): string {
  assertInstallationName(name);
  return join(installationStateRoot(env), `${name}.json`);
}

export function generatedWranglerPath(name: string, env = process.env): string {
  assertInstallationName(name);
  return join(installationStateRoot(env), name, 'wrangler.generated.toml');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseResource(value: unknown, field: string): ResourceReceipt | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value) || typeof value.name !== 'string' || typeof value.status !== 'string') {
    throw new Error(`corrupt install receipt: ${field}`);
  }
  if (!['owned', 'removed', 'delete-failed'].includes(value.status)) throw new Error(`corrupt install receipt: ${field}.status`);
  return {
    name: value.name,
    status: value.status as OwnedResourceStatus,
    ...(typeof value.id === 'string' ? { id: value.id } : {}),
    ...(typeof value.lastError === 'string' ? { lastError: value.lastError } : {}),
  };
}

export function parseInstallReceipt(value: unknown): InstallReceipt {
  if (!isObject(value) || value.schemaVersion !== INSTALL_RECEIPT_VERSION) throw new Error('corrupt or unsupported VibeFlare install receipt');
  const browserAuth = value.browserAuth;
  const resources = value.resources;
  const release = value.release;
  if (
    typeof value.installation !== 'string' || typeof value.accountId !== 'string' || typeof value.status !== 'string' ||
    !['provisioning', 'installed', 'update-failed', 'uninstall-incomplete', 'removed'].includes(value.status) ||
    !isObject(browserAuth) || !['standalone', 'cf_access'].includes(String(browserAuth.mode)) ||
    typeof browserAuth.origin !== 'string' || typeof browserAuth.rpId !== 'string' ||
    !isObject(resources) || !isObject(release) || !Array.isArray(value.migrationsApplied) ||
    !value.migrationsApplied.every((entry) => typeof entry === 'string') ||
    typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string'
  ) {
    throw new Error('corrupt VibeFlare install receipt');
  }
  assertInstallationName(value.installation);
  return {
    schemaVersion: INSTALL_RECEIPT_VERSION,
    installation: value.installation,
    accountId: value.accountId,
    status: value.status as InstallStatus,
    browserAuth: { mode: browserAuth.mode as BrowserAuthMode, origin: browserAuth.origin, rpId: browserAuth.rpId },
    resources: {
      ...(parseResource(resources.worker, 'resources.worker') ? { worker: parseResource(resources.worker, 'resources.worker') } : {}),
      ...(parseResource(resources.d1, 'resources.d1') ? { d1: parseResource(resources.d1, 'resources.d1') } : {}),
      ...(parseResource(resources.r2, 'resources.r2') ? { r2: parseResource(resources.r2, 'resources.r2') } : {}),
    },
    release: {
      ...(typeof release.installed === 'string' ? { installed: release.installed } : {}),
      ...(typeof release.source === 'string' ? { source: release.source } : {}),
      ...(typeof release.target === 'string' ? { target: release.target } : {}),
    },
    ...(isObject(value.deployment) && typeof value.deployment.deployedAt === 'string' ? {
      deployment: {
        deployedAt: value.deployment.deployedAt,
        ...(typeof value.deployment.url === 'string' ? { url: value.deployment.url } : {}),
        ...(typeof value.deployment.versionId === 'string' ? { versionId: value.deployment.versionId } : {}),
      },
    } : {}),
    migrationsApplied: [...value.migrationsApplied],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(typeof value.lastError === 'string' ? { lastError: value.lastError } : {}),
  };
}

export function readInstallReceipt(name: string, env = process.env): InstallReceipt | null {
  const path = receiptPath(name, env);
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read install receipt ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseInstallReceipt(parsed);
}

export function writeInstallReceipt(receipt: InstallReceipt, env = process.env): void {
  assertInstallationName(receipt.installation);
  const path = receiptPath(receipt.installation, env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, path);
    chmodSync(path, 0o600);
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
  }
}

export function newInstallReceipt(input: {
  installation: string;
  accountId: string;
  mode: BrowserAuthMode;
  origin: string;
  rpId: string;
  now?: string;
}): InstallReceipt {
  assertInstallationName(input.installation);
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: INSTALL_RECEIPT_VERSION,
    installation: input.installation,
    accountId: input.accountId,
    status: 'provisioning',
    browserAuth: { mode: input.mode, origin: input.origin.replace(/\/$/, ''), rpId: input.rpId },
    resources: {},
    release: {},
    migrationsApplied: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateReceipt(receipt: InstallReceipt, patch: Partial<InstallReceipt>, now = new Date().toISOString()): InstallReceipt {
  return { ...receipt, ...patch, updatedAt: now };
}
