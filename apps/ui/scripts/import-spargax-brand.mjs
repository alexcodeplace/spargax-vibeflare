#!/usr/bin/env node
/** Import only committed, public first-party branding into another product.
 * Usage: node import-canonical.mjs <canonical-checkout> <revision> <public-dir> [dot-module-dir]
 * Never reads the source working tree or copies application/private state.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [source, revision, destination, dotModule] = process.argv.slice(2);
if (!source || !revision || !destination || ![5, 6].includes(process.argv.length)) throw new Error('Usage: node import-canonical.mjs <canonical-checkout> <revision> <public-dir> [dot-module-dir]');
const git = (...args) => execFileSync('git', ['-C', resolve(source), ...args], { maxBuffer: 4 * 1024 * 1024 });
const commit = git('rev-parse', '--verify', `${revision}^{commit}`).toString().trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Source is not an exact committed revision');
const blob = path => git('show', `${commit}:${path}`);
const hash = data => createHash('sha256').update(data).digest('hex');
const originalManifest = blob('assets/brand/manifest.json');
const original = JSON.parse(originalManifest);
for (const [name, expected] of Object.entries(original.sources)) {
  if (!/^spargax-(?:full-)?logo\.png$/.test(name) || hash(blob(`assets/${name}`)) !== expected) throw new Error(`Invalid original source receipt: ${name}`);
}
if (hash(blob('scripts/brand/build-logo-assets.py')) !== original.generatorSha256) throw new Error('Canonical recipe differs from the asset receipt');
const manifest = { ...original, files: original.files.filter(file => file.role !== 'master-transparent-mark') };
const root = resolve(destination);
const write = (relative, data) => { const path = resolve(root, relative); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };
for (const file of manifest.files) {
  if (!new RegExp(`^brand/${original.version}/[a-zA-Z0-9_.-]+$`).test(file.path)) throw new Error('Unexpected canonical output path');
  const data = blob(`assets/${file.path}`);
  if (data.length !== file.bytes || hash(data) !== file.sha256) throw new Error(`Invalid canonical output: ${file.path}`);
  write(`assets/${file.path}`, data);
}
const distribution = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
write('assets/brand/manifest.json', distribution);
write('assets/brand/provenance.json', JSON.stringify({ schemaVersion: 1, sourceRepository: 'alexcodeplace/vibeclub', sourceCommit: commit, sourceManifestSha256: hash(originalManifest), distributionManifestSha256: hash(distribution) }, null, 2) + '\n');
write('favicon.ico', blob(`assets/brand/${manifest.version}/favicon.ico`));
write('favicon.png', blob(`assets/brand/${manifest.version}/spargax-mark-32.png`));
const verifier = resolve(root, '../scripts/verify-spargax-brand.mjs');
mkdirSync(dirname(verifier), { recursive: true });
writeFileSync(verifier, blob('scripts/brand/verify-distribution.mjs'));
if (dotModule) {
  const target = resolve(dotModule);
  const files = [];
  for (const name of ['physics.ts', 'element.ts', 'spargax-dots.json', 'LICENSE', 'README.md']) {
    const data = blob(`packages/spargax-brand/dot-grid/${name}`);
    if (name === 'spargax-dots.json' && hash(data) !== manifest.files.find(file => file.name === name).sha256) throw new Error('Dot geometry differs from the canonical logo');
    mkdirSync(target, { recursive: true }); writeFileSync(resolve(target, name), data);
    files.push({ name, sha256: hash(data), bytes: data.length });
  }
  writeFileSync(resolve(target, 'provenance.json'), JSON.stringify({ schemaVersion: 1, sourceRepository: 'alexcodeplace/vibeclub', sourceCommit: commit, files }, null, 2) + '\n');
}
const importer = resolve(root, '../scripts/import-spargax-brand.mjs');
writeFileSync(importer, blob('scripts/brand/import-canonical.mjs'));
const { verifyBrand } = await import(pathToFileURL(verifier).href);
verifyBrand(root, dotModule);
console.log(`Imported ${manifest.files.length} public Spargax assets from ${commit} into ${root}.`);
