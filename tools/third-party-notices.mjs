#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(new URL('..', import.meta.url).pathname);
const output = resolve(root, 'THIRD_PARTY_NOTICES.md');
const check = process.argv.includes('--check');

const raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const grouped = JSON.parse(raw);
const rows = [];
for (const [license, entries] of Object.entries(grouped)) {
  if (/unknown|unlicensed/i.test(license)) {
    throw new Error(`dependency graph contains unacceptable license metadata: ${license}`);
  }
  for (const entry of entries) {
    for (const version of entry.versions ?? []) {
      rows.push({
        name: entry.name,
        version,
        license,
        homepage: entry.homepage ?? '',
      });
    }
  }
}
rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version) || a.license.localeCompare(b.license));
const unique = [...new Map(rows.map((row) => [`${row.name}\0${row.version}\0${row.license}`, row])).values()];

const esc = (value) => String(value).replaceAll('|', '\\|');
const lines = [
  '# Third-party notices',
  '',
  'VibeFlare is MIT-licensed. It depends on third-party open-source packages under their own licenses.',
  'This inventory is generated from the locked production dependency graph with `pnpm licenses list --prod --json`.',
  'Package license terms remain authoritative; package homepages/repositories are provided to locate the corresponding source and license text.',
  '',
  '| Package | Version | License | Project |',
  '|---|---:|---|---|',
  ...unique.map((row) => `| ${esc(row.name)} | ${esc(row.version)} | ${esc(row.license)} | ${row.homepage ? `<${esc(row.homepage)}>` : '—'} |`),
  '',
  `Total locked production package/license records: ${unique.length}.`,
  '',
];
const generated = `${lines.join('\n')}`;
if (check) {
  let existing = '';
  try { existing = readFileSync(output, 'utf8'); } catch {}
  if (existing !== generated) {
    console.error('THIRD_PARTY_NOTICES.md is stale. Run: pnpm notices:generate');
    process.exit(1);
  }
  console.log(`✓ third-party notices match ${unique.length} locked production package/license records`);
} else {
  writeFileSync(output, generated);
  console.log(`wrote ${output} (${unique.length} records)`);
}
