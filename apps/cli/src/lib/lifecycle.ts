import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generatedWranglerPath,
  newInstallReceipt,
  readInstallReceipt,
  updateReceipt,
  writeInstallReceipt,
  type BrowserAuthMode,
  type InstallReceipt,
  type ResourceReceipt,
} from './install-state.js';
import { renderGeneratedWrangler, writeGeneratedWrangler } from './generated-wrangler.js';
import type { LifecycleProvider } from './wrangler-provider.js';

export interface LifecycleContext {
  provider: LifecycleProvider;
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
}

export interface SetupInput {
  installation: string;
  accountId?: string;
  mode: BrowserAuthMode;
  origin: string;
  rpId: string;
  secrets?: Record<string, string>;
}

export interface LifecycleResourceNames {
  worker: string;
  d1: string;
  r2: string;
}

export function resourceNames(installation: string): LifecycleResourceNames {
  return { worker: installation, d1: `${installation}-db`, r2: `${installation}-files` };
}

export function releaseVersion(repoRoot: string): string {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version?: string };
  if (!pkg.version) throw new Error('release package is missing a version');
  return pkg.version;
}

function now(context: LifecycleContext): string {
  return context.now?.() ?? new Date().toISOString();
}

function selectAccount(accounts: Array<{ id: string; name: string }>, requested?: string): string {
  if (requested) {
    const exact = accounts.find((account) => account.id === requested || account.name === requested);
    if (!exact) throw new Error(`Cloudflare account '${requested}' is not available to the current Wrangler identity`);
    return exact.id;
  }
  if (accounts.length !== 1) throw new Error('multiple Cloudflare accounts are available; pass --account=<id-or-name>');
  return accounts[0]!.id;
}

function writeConfig(context: LifecycleContext, receipt: InstallReceipt): string {
  const path = generatedWranglerPath(receipt.installation, context.env);
  const template = join(context.repoRoot, 'apps/worker/wrangler.toml');
  writeGeneratedWrangler(path, renderGeneratedWrangler(template, receipt, context.repoRoot));
  return path;
}

function save(context: LifecycleContext, receipt: InstallReceipt): InstallReceipt {
  writeInstallReceipt(receipt, context.env);
  return receipt;
}

function owned(name: string, id?: string): ResourceReceipt {
  return { name, status: 'owned', ...(id ? { id } : {}) };
}

function ensureAccount(context: LifecycleContext, receipt: InstallReceipt): void {
  const identity = context.provider.identity();
  if (!identity.accounts.some((account) => account.id === receipt.accountId)) {
    throw new Error(`current Wrangler identity does not have access to receipt account ${receipt.accountId}`);
  }
}

export async function setupInstallation(context: LifecycleContext, input: SetupInput): Promise<InstallReceipt> {
  if (input.mode === 'cf_access' && (!input.origin || !input.rpId)) {
    throw new Error('custom-domain setup requires --origin (or an equivalent interactive value)');
  }
  const existing = readInstallReceipt(input.installation, context.env);
  if (existing?.status === 'installed') return existing;
  if (existing?.status === 'removed') throw new Error(`installation '${input.installation}' was removed; choose a new installation name`);
  if (existing?.status === 'uninstall-incomplete') {
    throw new Error(`installation '${input.installation}' has an unfinished uninstall; finish uninstall before running setup again`);
  }

  const identity = context.provider.identity();
  const accountId = existing?.accountId ?? selectAccount(identity.accounts, input.accountId);
  if (existing && !identity.accounts.some((account) => account.id === accountId)) {
    throw new Error(`current Wrangler identity does not have access to receipt account ${accountId}`);
  }

  const names = resourceNames(input.installation);
  let receipt = existing ?? newInstallReceipt({
    installation: input.installation,
    accountId,
    mode: input.mode,
    origin: input.origin,
    rpId: input.rpId,
    now: now(context),
  });

  const existingOwnedWorkerIsDeployed = Boolean(
    existing?.resources.worker && context.provider.workerExists(names.worker, accountId),
  );

  if (!existing) {
    // Preflight resources that Wrangler can inspect without mutation. R2 create is
    // deliberately fail-closed on "already exists"; it is never adopted by name.
    if (context.provider.workerExists(names.worker, accountId)) throw new Error(`Worker '${names.worker}' already exists and is not owned by this installation`);
    if (context.provider.d1Exists(names.d1, accountId)) throw new Error(`D1 '${names.d1}' already exists and is not owned by this installation`);
    save(context, receipt);
  }

  try {
    if (!receipt.resources.d1) {
      const created = context.provider.createD1(names.d1, accountId);
      receipt = save(context, updateReceipt(receipt, {
        resources: { ...receipt.resources, d1: owned(names.d1, created.id) },
        lastError: undefined,
      }, now(context)));
    }

    if (!receipt.resources.r2) {
      context.provider.createR2(names.r2, accountId);
      receipt = save(context, updateReceipt(receipt, {
        resources: { ...receipt.resources, r2: owned(names.r2) },
        lastError: undefined,
      }, now(context)));
    }

    // Never adopt a Worker by name. Re-check on resumed partial installs before
    // recording ownership; after this receipt is written, retries may trust it.
    if (!receipt.resources.worker) {
      if (context.provider.workerExists(names.worker, accountId)) {
        throw new Error(`Worker '${names.worker}' already exists and is not owned by this installation`);
      }
      // Record the exact intended Worker name before deployment. If Wrangler creates
      // it and then exits non-zero, the receipt still carries the only deletion authority.
      receipt = save(context, updateReceipt(receipt, {
        resources: { ...receipt.resources, worker: owned(names.worker) },
      }, now(context)));
    }

    let configPath = writeConfig(context, receipt);
    context.provider.buildUi(context.repoRoot);
    const migrationsApplied = context.provider.applyMigrations(configPath, receipt.resources.d1!.name);
    if (migrationsApplied.length > 0) {
      receipt = save(context, updateReceipt(receipt, {
        migrationsApplied: [...new Set([...receipt.migrationsApplied, ...migrationsApplied])].sort(),
      }, now(context)));
    }
    const secrets = input.secrets ?? {};
    let deployment = context.provider.deploy(configPath, context.repoRoot, secrets);

    // For workers.dev, the account subdomain is not known before first deploy.
    // Learn it from Wrangler's deployment URL, persist it, then redeploy once so
    // WebAuthn gets the exact RP_ID/RP_ORIGIN without asking the user to know it.
    if (receipt.browserAuth.mode === 'standalone' && !receipt.browserAuth.origin) {
      if (!deployment.url) throw new Error('Wrangler did not report a deployment URL; pass --origin explicitly');
      const discovered = new URL(deployment.url);
      receipt = save(context, updateReceipt(receipt, {
        browserAuth: { mode: 'standalone', origin: discovered.origin, rpId: discovered.hostname },
      }, now(context)));
      configPath = writeConfig(context, receipt);
      deployment = context.provider.deploy(configPath, context.repoRoot, secrets);
    }

    const healthUrl = receipt.browserAuth.origin || deployment.url;
    if (!healthUrl) throw new Error('deployment URL is unknown; pass --origin explicitly');
    const health = await context.provider.health(healthUrl);
    if (!health.ok) throw new Error(`deployment health check failed at ${healthUrl}/health`);

    const version = releaseVersion(context.repoRoot);
    receipt = updateReceipt(receipt, {
      status: 'installed',
      release: { installed: version },
      deployment: { ...deployment, url: healthUrl, deployedAt: now(context) },
      migrationsApplied: [...new Set([...receipt.migrationsApplied, ...migrationsApplied])].sort(),
      lastError: undefined,
    }, now(context));
    return save(context, receipt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    save(context, updateReceipt(receipt, { status: 'provisioning', lastError: message }, now(context)));
    throw error;
  }
}

export interface UpdateResult {
  receipt: InstallReceipt;
  sourceRelease: string;
  targetRelease: string;
  migrationsApplied: string[];
}

export async function updateInstallation(context: LifecycleContext, installation: string): Promise<UpdateResult> {
  let receipt = readInstallReceipt(installation, context.env);
  if (!receipt) throw new Error(`ownership unknown for '${installation}'; no VibeFlare install receipt exists`);
  if (receipt.status === 'removed') throw new Error(`installation '${installation}' has been removed`);
  const worker = receipt.resources.worker;
  const d1 = receipt.resources.d1;
  const r2 = receipt.resources.r2;
  if (!worker || !d1?.id || !r2) throw new Error(`installation '${installation}' has an incomplete ownership receipt`);
  ensureAccount(context, receipt);

  const sourceRelease = receipt.release.installed ?? 'unknown';
  const targetRelease = releaseVersion(context.repoRoot);
  receipt = save(context, updateReceipt(receipt, {
    status: 'update-failed',
    release: { ...receipt.release, source: sourceRelease, target: targetRelease },
    lastError: 'update in progress',
  }, now(context)));

  try {
    const configPath = writeConfig(context, receipt);
    context.provider.buildUi(context.repoRoot);
    const migrationsApplied = context.provider.applyMigrations(configPath, d1.name);
    if (migrationsApplied.length > 0) {
      receipt = save(context, updateReceipt(receipt, {
        migrationsApplied: [...new Set([...receipt.migrationsApplied, ...migrationsApplied])].sort(),
      }, now(context)));
    }
    const deployment = context.provider.deploy(configPath, context.repoRoot);
    const healthUrl = receipt.browserAuth.origin || deployment.url || receipt.deployment?.url;
    if (!healthUrl) throw new Error('deployment URL is unknown; repair the install receipt or rerun setup');
    const health = await context.provider.health(healthUrl);
    if (!health.ok) throw new Error(`deployment health check failed at ${healthUrl}/health`);

    receipt = updateReceipt(receipt, {
      status: 'installed',
      release: { installed: targetRelease, source: sourceRelease, target: targetRelease },
      deployment: { ...receipt.deployment, ...deployment, url: healthUrl, deployedAt: now(context) },
      migrationsApplied: [...new Set([...receipt.migrationsApplied, ...migrationsApplied])].sort(),
      lastError: undefined,
    }, now(context));
    save(context, receipt);
    return { receipt, sourceRelease, targetRelease, migrationsApplied };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    save(context, updateReceipt(receipt, { status: 'update-failed', lastError: message }, now(context)));
    throw error;
  }
}

export interface UninstallPreview {
  installation: string;
  resources: Array<{ kind: 'worker' | 'd1' | 'r2'; name: string; id?: string }>;
}

export function previewUninstall(context: Pick<LifecycleContext, 'env'>, installation: string): UninstallPreview {
  const receipt = readInstallReceipt(installation, context.env);
  if (!receipt) throw new Error(`ownership unknown for '${installation}'; no VibeFlare install receipt exists; inspect Cloudflare resources manually`);
  const resources: UninstallPreview['resources'] = [];
  const worker = receipt.resources.worker;
  const d1 = receipt.resources.d1;
  const r2 = receipt.resources.r2;
  if (worker && worker.status !== 'removed') resources.push({ kind: 'worker', name: worker.name, ...(worker.id ? { id: worker.id } : {}) });
  if (r2 && r2.status !== 'removed') resources.push({ kind: 'r2', name: r2.name, ...(r2.id ? { id: r2.id } : {}) });
  if (d1 && d1.status !== 'removed') resources.push({ kind: 'd1', name: d1.name, ...(d1.id ? { id: d1.id } : {}) });
  return { installation, resources };
}

export interface UninstallResult {
  receipt: InstallReceipt;
  removed: string[];
  failed: Array<{ kind: 'worker' | 'd1' | 'r2'; name: string; error: string }>;
}

export function uninstallInstallation(context: LifecycleContext, installation: string, confirmation: string): UninstallResult {
  let receipt = readInstallReceipt(installation, context.env);
  if (!receipt) throw new Error(`ownership unknown for '${installation}'; no VibeFlare install receipt exists; refusing deletion`);
  if (confirmation !== installation) throw new Error(`confirmation mismatch; pass --confirm=${installation}`);
  if (receipt.status === 'removed') return { receipt, removed: [], failed: [] };
  ensureAccount(context, receipt);

  const removed: string[] = [];
  const failed: UninstallResult['failed'] = [];
  const fail = (kind: 'worker' | 'r2' | 'd1', resource: ResourceReceipt, error: unknown): UninstallResult => {
    const message = error instanceof Error ? error.message : String(error);
    const updated = { ...resource, status: 'delete-failed' as const, lastError: message };
    receipt = updateReceipt(receipt!, {
      resources: { ...receipt!.resources, [kind]: updated },
      status: 'uninstall-incomplete',
      lastError: message,
    }, now(context));
    save(context, receipt);
    failed.push({ kind, name: resource.name, error: message });
    return { receipt, removed, failed };
  };
  const markRemoved = (kind: 'worker' | 'r2' | 'd1', resource: ResourceReceipt): void => {
    const updated = { ...resource, status: 'removed' as const, lastError: undefined };
    receipt = updateReceipt(receipt!, {
      resources: { ...receipt!.resources, [kind]: updated },
      status: 'uninstall-incomplete',
      lastError: undefined,
    }, now(context));
    save(context, receipt);
    removed.push(`${kind}:${resource.name}`);
  };

  // Generate the provider config before deleting anything. It is needed to enumerate
  // exactly the R2 keys recorded by this installation's D1 database.
  let configPath: string | undefined;
  if (receipt.resources.r2?.status !== 'removed' && receipt.resources.d1?.status !== 'removed') {
    try {
      configPath = writeConfig(context, receipt);
    } catch (error) {
      return fail('r2', receipt.resources.r2!, error);
    }
  }

  const worker = receipt.resources.worker;
  if (worker && worker.status !== 'removed') {
    try {
      context.provider.deleteWorker(worker.name, receipt.accountId);
      markRemoved('worker', worker);
    } catch (error) {
      return fail('worker', worker, error);
    }
  }

  const r2 = receipt.resources.r2;
  if (r2 && r2.status !== 'removed') {
    try {
      const d1 = receipt.resources.d1;
      if (d1 && d1.status !== 'removed' && configPath) {
        context.provider.purgeR2(configPath, d1.name, r2.name);
      }
      context.provider.deleteR2(r2.name, receipt.accountId);
      markRemoved('r2', r2);
    } catch (error) {
      return fail('r2', r2, error);
    }
  }

  const d1 = receipt.resources.d1;
  if (d1 && d1.status !== 'removed') {
    try {
      context.provider.deleteD1(d1.name, receipt.accountId);
      markRemoved('d1', d1);
    } catch (error) {
      return fail('d1', d1, error);
    }
  }

  receipt = updateReceipt(receipt, { status: 'removed', lastError: undefined }, now(context));
  save(context, receipt);
  return { receipt, removed, failed };
}
