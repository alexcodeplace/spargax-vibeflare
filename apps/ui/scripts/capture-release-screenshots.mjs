#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { resolveScreenshotTarget } from './screenshot-target.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = join(root, 'docs/screenshots');
const baseUrl = resolveScreenshotTarget(
  process.env.VIBEFLARE_SCREENSHOT_BASE_URL ?? 'http://localhost:8788',
  process.env.VIBEFLARE_SCREENSHOT_ALLOW_RESET,
);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const capturedAt = new Date().toISOString();
const temporary = mkdtempSync(join(tmpdir(), 'vibeflare-readme-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const screenshots = [];
const problems = [];
let fixtureReady = false;

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function requireOk(response, label) {
  // Never dump response bodies that could contain a session or one-time key.
  if (!response.ok()) throw new Error(`${label} failed: HTTP ${response.status()}`);
  return response;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await context.addInitScript(() => localStorage.setItem('vf-theme', 'dark'));
const page = await context.newPage();
page.on('pageerror', error => problems.push(error.message));
page.on('response', response => {
  if (new URL(response.url()).origin === baseUrl && /\/(assets|_astro)\//.test(response.url()) && response.status() >= 400) {
    problems.push(`Asset failed: ${response.status()} ${new URL(response.url()).pathname}`);
  }
});

async function post(path, data) {
  return requireOk(await context.request.post(baseUrl + path, { data }), path);
}

async function visit(path, testid) {
  const response = await page.goto(baseUrl + path, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, `${path} must load`);
  await expect(page.getByTestId(testid)).toBeVisible();
  await expect(page.locator('[data-vf-hydrated="true"]').first()).toBeAttached();
}

async function capture(file, route, description, options = {}) {
  await page.evaluate(() => document.fonts.ready);
  const obsoleteProductName = ['spar', 'gax'].join('');
  assert.ok(!(await page.locator('body').innerText()).toLowerCase().includes(obsoleteProductName), `${file}: obsolete external product branding is visible`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${file}: horizontal overflow`);
  assert.deepEqual(problems, [], `${file}: browser/asset failures`);
  const flare = page.getByTestId('flare-logo');
  if (await flare.count()) {
    await expect(flare).toHaveAttribute('data-ready', 'true');
    await expect(flare).toHaveAttribute('data-state', /^(idle|paused|reduced)$/);
  }
  await page.screenshot({ path: join(temporary, file), fullPage: true, animations: 'disabled', ...options });
  const bytes = readFileSync(join(temporary, file));
  assert.ok(bytes.length > 10_000, `${file}: implausibly empty capture`);
  screenshots.push({
    file, route, description,
    viewport: page.viewportSize(),
    theme: route === 'cli' ? 'terminal' : await page.locator('html').getAttribute('data-theme'),
    sha256: hash(bytes), bytes: bytes.length,
  });
}

try {
  const health = await (await requireOk(await context.request.get(baseUrl + '/health'), 'health')).json();
  assert.equal(health.version, version, 'Serve the current build before capturing');
  const state = await (await requireOk(await context.request.get(baseUrl + '/__e2e/state'), 'E2E fixture identity')).json();
  assert.equal(typeof state.counts?.auth_users, 'number', 'Target is not the isolated E2E Worker');
  fixtureReady = true;
  // Verify the served HTML is the actual checkout build, not an older dev server.
  const buildHashes = {};
  for (const route of ['chat', 'login', 'keys', 'settings/models', 'settings/cache']) {
    const response = await requireOk(await context.request.get(`${baseUrl}/${route}/`), route);
    const served = hash(await response.body());
    const local = hash(readFileSync(join(root, 'apps/ui/dist', route, 'index.html')));
    assert.equal(served, local, `${route}: served HTML differs from this worktree's build`);
    buildHashes[route] = local;
  }

  await post('/__e2e/reset');
  await post('/__e2e/session', { role: 'owner' });
  // These are fixture entries, not a claim about the live catalog or model access.
  for (const model of [
    { name: '@cf/meta/llama-3.2-3b-instruct', task: 'text-generation' },
    { name: '@cf/meta/llama-3.1-8b-instruct-fp8', task: 'text-generation' },
    { name: '@cf/black-forest-labs/flux-1-schnell', task: 'text-to-image' },
    { name: '@cf/baai/bge-base-en-v1.5', task: 'text-embeddings' },
    { name: '@cf/openai/whisper', task: 'automatic-speech-recognition' },
  ]) await post('/__e2e/seed-model', { ...model, paid_required: false });

  await visit('/chat/', 'vibeflare-chat');
  await expect(page.getByText('What do you want to make?', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Select a Model/ })).toContainText('@cf/meta/llama-3.2-3b-instruct');
  await capture('vibeflare-landing.png', '/chat/', 'Dark workspace with shared Club assets and distinct task controls.');

  await visit('/settings/models/', 'settings-page');
  const selectedModels = page.getByRole('link', { name: 'Models', exact: true });
  await expect(selectedModels).toHaveAttribute('aria-current', 'true');
  assert.ok(await selectedModels.evaluate(el => getComputedStyle(el, '::before').borderImageSource.includes('language-segment-active.svg')));
  const deselect = page.waitForResponse(r => r.url().endsWith('/admin/models/visibility') && r.request().method() === 'PATCH');
  await page.getByRole('checkbox', { name: '@cf/meta/llama-3.1-8b-instruct-fp8', exact: true }).uncheck();
  await requireOk(await deselect, 'model preference save');
  const hiddenModel = page.getByRole('checkbox', { name: '@cf/meta/llama-3.1-8b-instruct-fp8', exact: true });
  await expect(hiddenModel).toBeEnabled();
  await expect(hiddenModel).not.toBeChecked();
  await expect(page.getByText('Model hidden from chat', { exact: true })).not.toBeVisible({ timeout: 15_000 });
  await capture('vibeflare-settings-models.png', '/settings/models/', 'Personal model checkboxes, paid-model policy and linkable selected Settings section.');

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Cache', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/cache\/$/);
  await capture('vibeflare-settings-light.png', '/settings/cache/', 'Light-theme Settings, response-cache controls and prompt-template inputs.');

  await page.setViewportSize({ width: 390, height: 950 });
  await page.getByRole('link', { name: 'Models', exact: true }).click();
  for (const name of ['Account', 'Devices', 'Auth', 'Models', 'Cache', 'Invites']) {
    const link = page.getByRole('link', { name, exact: true });
    const bounds = await link.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.height >= 44, `${name}: mobile target`);
  }
  await capture('vibeflare-settings-mobile.png', '/settings/models/', '390px light-theme Settings with wrapped navigation and full-size targets.');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await visit('/chat/', 'vibeflare-chat');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const composer = page.getByLabel('Message input');
  await composer.fill('Show me a sample conversation in my AI workspace.');
  await composer.press('Enter');
  await expect(page.getByText('Hello from VibeFlare E2E', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Workspace chats' }).getByRole('link')).toHaveCount(1);
  await capture('vibeflare-chat.png', '/chat/?chat_id=<fixture>', 'Persisted browser conversation and Workspace history; response is explicitly the local E2E fixture.');

  await visit('/keys/', 'keys-page');
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await page.getByLabel('Label', { exact: true }).fill('my-coding-agent');
  const createResponse = page.waitForResponse(r => r.url().endsWith('/admin/keys') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const created = await requireOk(await createResponse, 'key creation');
  assert.equal(created.status(), 201);
  const secret = (await created.json()).full;
  assert.equal(typeof secret, 'string');
  const secretBlock = page.locator('pre').filter({ hasText: secret });
  await expect(secretBlock).toBeVisible();
  await capture('vibeflare-key-creation.png', '/keys/', 'One-time local API-key reveal with the secret block deliberately masked.', { mask: [secretBlock], maskColor: '#344b67' });

  const admin = await (await post('/admin/keys', { label: 'screenshot-doctor', is_admin: true })).json();
  assert.ok(typeof admin.full === 'string' && admin.full.startsWith('vf-'));
  const stateDir = join(temporary, 'state/installations');
  mkdirSync(stateDir, { recursive: true });
  const receipt = {
    schemaVersion: 'vibeflare-install/v1', installation: 'screenshot-demo',
    accountId: 'local-screenshot-fixture', status: 'installed',
    browserAuth: { mode: 'standalone', origin: baseUrl, rpId: new URL(baseUrl).hostname },
    resources: {
      worker: { name: 'screenshot-demo', status: 'owned' },
      d1: { name: 'screenshot-demo-db', status: 'owned' },
      r2: { name: 'screenshot-demo-files', status: 'owned' },
    },
    release: { installed: version, source: sourceCommit },
    deployment: { url: baseUrl, versionId: 'local-e2e-fixture', deployedAt: capturedAt },
    migrationsApplied: readdirSync(join(root, 'apps/worker/src/db/migrations')).filter(name => name.endsWith('.sql')).sort(),
    createdAt: capturedAt, updatedAt: capturedAt,
  };
  writeFileSync(join(stateDir, 'screenshot-demo.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  const cliEnv = { ...process.env, HOME: join(temporary, 'home'), VIBEFLARE_STATE_DIR: stateDir, VIBEFLARE_URL: baseUrl, VIBEFLARE_KEY: admin.full };
  const cli = join(root, 'apps/cli/src/index.ts');
  const runCli = command => execFileSync('bun', [cli, command, '--name=screenshot-demo'], { cwd: root, env: cliEnv, encoding: 'utf8', timeout: 30_000 }).trim();
  const status = runCli('status');
  const doctor = runCli('doctor');
  assert.ok(!status.includes(admin.full) && !doctor.includes(admin.full), 'CLI output must not reveal the key');
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#061329;color:#edf5ff;font-family:system-ui,sans-serif}main{box-sizing:border-box;min-height:1000px;padding:70px 90px}.label{color:#afc7e5;font-size:14px;letter-spacing:.1em}h1{font-size:36px;font-weight:600;margin:14px 0 30px}.terminal{border:1px solid #527da2;border-radius:18px;overflow:hidden;background:#0b203d}.bar{padding:16px 24px;border-bottom:1px solid #315777;color:#afc7e5}pre{margin:0;padding:24px;font:14px/1.65 ui-monospace,monospace;white-space:pre-wrap}.prompt{color:#7bccff}.note{color:#afc7e5;font-size:13px;margin-top:20px}
  </style></head><body><main><div class="label">VIBEFLARE CLI</div><h1>Inspect your installation before changing it.</h1><section class="terminal"><div class="bar">Actual CLI output against an isolated local fixture</div><pre><span class="prompt">$ vf status --name=screenshot-demo</span>\n${escapeHtml(status)}\n\n<span class="prompt">$ vf doctor --name=screenshot-demo</span>\n${escapeHtml(doctor)}</pre></section><p class="note">Local test installation with a synthetic ownership receipt. This is not a production health report.</p></main></body></html>`);
  await capture('vibeflare-status-doctor.png', 'cli', 'Unedited status and doctor output, rendered in terminal-style HTML using a synthetic local ownership receipt.');

  await context.clearCookies();
  await visit('/login/', 'login-page');
  await expect(page.getByRole('button', { name: 'Sign in with passkey', exact: true })).toBeVisible();
  await capture('vibeflare-login.png', '/login/', 'Branded sign-in page; the local fixture offers passkey login.');

  mkdirSync(outDir, { recursive: true });
  for (const screenshot of screenshots) copyFileSync(join(temporary, screenshot.file), join(outDir, screenshot.file));
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, capturedAt, version, sourceCommit,
    environment: 'isolated local E2E Worker; not a deployed production environment',
    inference: 'deterministic fakeAI fixture; no paid or production inference',
    catalog: 'small seeded demonstration catalog; not a live availability or billing claim',
    privacy: 'local fixture accounts only; one-time key masked; fixture reset after capture',
    buildHtmlSha256: buildHashes, screenshots,
  }, null, 2) + '\n');
  console.log(`Captured ${screenshots.length} verified screenshots in ${outDir}`);
} finally {
  if (fixtureReady) await context.request.post(baseUrl + '/__e2e/reset').catch(() => {});
  await browser.close();
  rmSync(temporary, { recursive: true, force: true });
}
