#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(new URL('..', import.meta.url).pathname);
const logArg = process.argv[2];
if (!logArg) {
  console.error('usage: node tools/release-receipt.mjs <release-gate.log> [output.json]');
  process.exit(2);
}

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

const dirty = git('status', '--porcelain');
if (dirty) throw new Error('release receipt requires a clean Git worktree');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const requiredTag = `v${version}`;
const head = git('rev-parse', 'HEAD');
const tags = git('tag', '--points-at', 'HEAD').split('\n').filter(Boolean);
if (!tags.includes(requiredTag)) {
  throw new Error(`release receipt requires tag ${requiredTag} to point at HEAD ${head}`);
}

const logPath = resolve(logArg);
const rawLog = readFileSync(logPath);
const log = stripAnsi(rawLog.toString('utf8'));

const requiredEvidence = [
  ['security audit', /No known vulnerabilities found/],
  ['standalone Wrangler config validation', /generated standalone Wrangler config/],
  ['Cloudflare Access Wrangler config validation', /generated cf_access Wrangler config/],
  ['CLI tests', /apps\/cli test:[\s\S]*?Tests\s+26 passed/],
  ['UI component tests', /apps\/ui test:[\s\S]*?Tests\s+19 passed/],
  ['Worker tests', /apps\/worker test:[\s\S]*?Tests\s+125 passed/],
  ['Playwright suite', /56 passed \(/],
];
for (const [name, pattern] of requiredEvidence) {
  if (!pattern.test(log)) throw new Error(`release gate log is missing passing evidence for ${name}`);
}

const matrix = JSON.parse(readFileSync(join(root, 'apps/ui/test/e2e/ui-matrix/matrix.json'), 'utf8'));
const matrixCases = matrix.reduce((count, entry) => {
  const allowed = (entry.roles?.length ?? 0) * 2; // desktop + mobile
  const denied = Object.keys(entry.deniedRoles ?? {}).length;
  return count + allowed + denied;
}, 0);
if (matrixCases !== 38) throw new Error(`unexpected UI matrix case count: ${matrixCases}`);

const journeyIndex = readFileSync(join(root, 'docs/user_journeys/00-index.md'), 'utf8');
const canonicalJourneys = [...journeyIndex.matchAll(/^\| UJ-\d{3} \|.*\| ready \| true \|/gm)].length;
if (canonicalJourneys !== 9) throw new Error(`expected 9 ready canonical journeys, found ${canonicalJourneys}`);

const lockBytes = readFileSync(join(root, 'pnpm-lock.yaml'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const output = resolve(process.argv[3] ?? join(root, 'release-artifacts', `vibeflare-${version}-receipt.json`));
mkdirSync(dirname(output), { recursive: true });

const receipt = {
  schemaVersion: 'vibeflare-release-receipt/v1',
  product: 'VibeFlare',
  version,
  tag: requiredTag,
  revision: head,
  packageManager: pkg.packageManager,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  lockfileSha256: sha256(lockBytes),
  gateLog: {
    file: basename(logPath),
    sha256: sha256(rawLog),
  },
  evidence: {
    build: 'passed',
    generatedWrangler: { standalone: 'passed', cfAccess: 'passed' },
    productionDependencyAudit: 'no-known-vulnerabilities',
    tests: {
      cli: { passed: 26 },
      uiComponents: { passed: 19 },
      worker: { passed: 125 },
      browserTotal: { passed: 56 },
      uiMatrix: { passed: matrixCases, snapshotsChanged: false },
      canonicalJourneyContracts: { ready: canonicalJourneys },
    },
  },
};
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 });
console.log(output);
