#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../../..');
const outDir = resolve(root, 'docs/screenshots');
const baseUrl = (process.env.VIBEFLARE_SCREENSHOT_BASE_URL ?? 'http://localhost:8788').replace(/\/$/, '');
mkdirSync(outDir, { recursive: true });

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed: ${response.status()} ${await response.text()}`);
  return response;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let tempRoot = '';

try {
  await requireOk(await context.request.get(`${baseUrl}/health`), 'health');
  await requireOk(await context.request.post(`${baseUrl}/__e2e/reset`), 'reset');
  await requireOk(await context.request.post(`${baseUrl}/__e2e/session`, { data: { role: 'owner' } }), 'owner session');
  await requireOk(await context.request.post(`${baseUrl}/__e2e/seed-model`, {
    data: { name: '@cf/meta/e2e-chat', task: 'text-generation' },
  }), 'model seed');

  await page.goto(`${baseUrl}/chat`, { waitUntil: 'networkidle' });
  await page.getByText('What do you want to make?').waitFor();
  await page.screenshot({ path: join(outDir, 'vibeflare-landing.png'), fullPage: true });

  const modelSelector = page.getByLabel(/Select a Model/i);
  await modelSelector.click();
  await page.getByText('@cf/meta/e2e-chat', { exact: true }).last().click();
  const composer = page.getByLabel('Message input');
  await composer.fill('Show me how VibeFlare keeps my AI gateway private.');
  await composer.press('Enter');
  await page.getByText('Hello from VibeFlare E2E', { exact: true }).waitFor({ timeout: 15_000 });
  await page.screenshot({ path: join(outDir, 'vibeflare-chat.png'), fullPage: true });

  await requireOk(await context.request.post(`${baseUrl}/__e2e/reset`), 'reset before key capture');
  await requireOk(await context.request.post(`${baseUrl}/__e2e/session`, { data: { role: 'owner' } }), 'owner session before key capture');
  await requireOk(await context.request.post(`${baseUrl}/__e2e/seed-model`, {
    data: { name: '@cf/meta/e2e-chat', task: 'text-generation' },
  }), 'model seed before key capture');

  await page.goto(`${baseUrl}/keys`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create key' }).click();
  await page.getByLabel('Label').fill('my-coding-agent');
  const createPromise = page.waitForResponse((response) =>
    response.url().endsWith('/admin/keys') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const createdResponse = await createPromise;
  if (createdResponse.status() !== 201) throw new Error(`key creation failed: ${createdResponse.status()}`);
  await page.getByText('Copy this key now — it will not be shown again.').waitFor();
  await page.screenshot({ path: join(outDir, 'vibeflare-key-creation.png'), fullPage: true });

  const adminResponse = await context.request.post(`${baseUrl}/admin/keys`, {
    data: { label: 'release-doctor', is_admin: true },
  });
  await requireOk(adminResponse, 'admin key creation');
  const adminKey = (await adminResponse.json()).full;
  if (typeof adminKey !== 'string' || !adminKey.startsWith('vf-')) throw new Error('admin key response did not include a VibeFlare key');

  tempRoot = mkdtempSync(join(tmpdir(), 'vibeflare-release-screenshot-'));
  const stateDir = join(tempRoot, 'state', 'installations');
  mkdirSync(stateDir, { recursive: true });
  const now = '2026-09-10T00:00:00.000Z';
  const receipt = {
    schemaVersion: 'vibeflare-install/v1',
    installation: 'release-demo',
    accountId: 'local-release-verification',
    status: 'installed',
    browserAuth: { mode: 'standalone', origin: baseUrl, rpId: 'localhost' },
    resources: {
      worker: { name: 'release-demo', status: 'owned' },
      d1: { name: 'release-demo-db', status: 'owned' },
      r2: { name: 'release-demo-files', status: 'owned' },
    },
    release: { installed: '0.9.5', source: 'release-candidate' },
    deployment: { url: baseUrl, versionId: 'local-e2e', deployedAt: now },
    migrationsApplied: ['0001_init.sql', '0002_auth_invites.sql', '0006_model_health.sql'],
    createdAt: now,
    updatedAt: now,
  };
  writeFileSync(join(stateDir, 'release-demo.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });

  const cli = join(root, 'apps/cli/src/index.ts');
  const cliEnv = {
    ...process.env,
    HOME: join(tempRoot, 'home'),
    VIBEFLARE_STATE_DIR: stateDir,
    VIBEFLARE_URL: baseUrl,
    VIBEFLARE_KEY: adminKey,
  };
  const status = execFileSync('bun', [cli, 'status', '--name=release-demo'], { cwd: root, env: cliEnv, encoding: 'utf8' }).trim();
  const doctor = execFileSync('bun', [cli, 'doctor', '--name=release-demo'], { cwd: root, env: cliEnv, encoding: 'utf8' }).trim();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;min-height:100%;background:#080b12;color:#e7eaf0;font-family:Inter,system-ui,sans-serif}
main{box-sizing:border-box;min-height:900px;padding:88px 120px;background:radial-gradient(circle at 20% 0%,#171b2c 0,#080b12 45%)}
.eyebrow{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:#9aa4ba;margin-bottom:14px}
h1{font-size:42px;line-height:1.1;margin:0 0 28px;font-weight:650}.terminal{border:1px solid #2a3040;border-radius:16px;overflow:hidden;background:#0d111b;box-shadow:0 28px 80px rgba(0,0,0,.38)}
.bar{height:44px;display:flex;align-items:center;gap:8px;padding:0 16px;background:#121725;border-bottom:1px solid #262d3d}.dot{width:10px;height:10px;border-radius:50%;background:#394256}.title{margin-left:10px;color:#9aa4ba;font-size:13px}
pre{margin:0;padding:26px 30px 30px;font:15px/1.72 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;color:#dce4f4}.prompt{color:#a9b6ff}.ok{color:#9ce6b4}.dim{color:#8490a8}
</style></head><body><main><div class="eyebrow">VibeFlare CLI</div><h1>Know what is running before you change it.</h1><section class="terminal"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="title">status + doctor</span></div><pre><span class="prompt">$ vf status --name=release-demo</span>\n${escapeHtml(status)}\n\n<span class="prompt">$ vf doctor --name=release-demo</span>\n<span class="ok">${escapeHtml(doctor)}</span></pre></section></main></body></html>`, { waitUntil: 'load' });
  await page.screenshot({ path: join(outDir, 'vibeflare-status-doctor.png'), fullPage: true });

  console.log(`captured release screenshots in ${outDir}`);
} finally {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  await browser.close();
}
