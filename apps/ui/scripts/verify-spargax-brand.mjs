#!/usr/bin/env node
// Public design-only verifier. No sibling checkout or network is needed in builds.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export function verifyBrand(publicRoot = 'public', dotModule) {
  const root = resolve(publicRoot, 'assets');
  const manifest = JSON.parse(readFileSync(resolve(root, 'brand/manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.sourceRepository !== 'alexcodeplace/vibeclub' || !/^v-[a-f0-9]{16}$/.test(manifest.version)) throw new Error('Unrecognized Spargax brand provenance');
  if (manifest.sources['spargax-logo.png'] !== '4ed5e6d25c5791215efc758752e310ec0b126dcbc8438d1a2dbbcd7b567cb9e4' || manifest.sources['spargax-full-logo.png'] !== 'ccf16744ab89a82c7abc21db1a9c3806dc6f8fa1f20be0f71a69e8a048c2c265') throw new Error('Unapproved logo originals');
  const paths = new Set();
  for (const file of manifest.files) {
    if (!file.path.startsWith(`brand/${manifest.version}/`) || !/^[a-zA-Z0-9/_.-]+$/.test(file.path)) throw new Error('Invalid logo path');
    const path = resolve(root, file.path);
    if (!path.startsWith(root + sep) || paths.has(file.path)) throw new Error('Unsafe or duplicate logo path');
    paths.add(file.path);
    const data = readFileSync(path);
    if (data.length !== file.bytes || createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error(`Stale Spargax logo: ${file.path}`);
  }
  for (const name of readdirSync(resolve(root, 'brand', manifest.version))) {
    if (!paths.has(`brand/${manifest.version}/${name}`) || !statSync(resolve(root, 'brand', manifest.version, name)).isFile()) throw new Error(`Unmanifested logo file: ${name}`);
  }
  for (const name of ['spargax-mark-128.webp', 'spargax-wordmark-light-320.webp', 'spargax-wordmark-dark-320.webp', 'favicon.ico']) {
    if (!manifest.files.some(file => file.name === name)) throw new Error(`Missing required logo: ${name}`);
  }
  const icon = readFileSync(resolve(publicRoot, 'favicon.ico'));
  const expected = manifest.files.find(file => file.name === 'favicon.ico');
  if (createHash('sha256').update(icon).digest('hex') !== expected.sha256) throw new Error('Stale browser favicon');
  const provenancePath = resolve(root, 'brand/provenance.json');
  if (existsSync(provenancePath)) {
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    if (!/^[0-9a-f]{40}$/.test(provenance.sourceCommit) || provenance.sourceRepository !== manifest.sourceRepository || provenance.distributionManifestSha256 !== createHash('sha256').update(readFileSync(resolve(root, 'brand/manifest.json'))).digest('hex')) throw new Error('Logo import provenance does not match the distribution');
  }
  if (dotModule) {
    const directory = resolve(dotModule);
    const receipt = JSON.parse(readFileSync(resolve(directory, 'provenance.json'), 'utf8'));
    if (receipt.sourceRepository !== manifest.sourceRepository || !/^[0-9a-f]{40}$/.test(receipt.sourceCommit)) throw new Error('Unrecognized dot-grid source');
    const allowed = new Set(['physics.ts', 'element.ts', 'spargax-dots.json', 'LICENSE', 'README.md']);
    for (const file of receipt.files) {
      if (!allowed.delete(file.name)) throw new Error('Unexpected or duplicate dot-grid source');
      const data = readFileSync(resolve(directory, file.name));
      if (data.length !== file.bytes || createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error(`Changed dot-grid source: ${file.name}`);
      if (file.name === 'spargax-dots.json' && file.sha256 !== manifest.files.find(entry => entry.name === file.name).sha256) throw new Error('Dot geometry no longer matches the logo');
    }
    if (allowed.size) throw new Error('Missing canonical dot-grid source');
  }
  console.log(`Verified ${manifest.files.length} canonical Spargax assets (${manifest.version}).`);
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) verifyBrand(process.argv[2], process.argv[3]);
