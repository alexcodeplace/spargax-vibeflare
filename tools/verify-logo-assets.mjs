#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const originals = resolve(root, 'docs/design/logo');
const manifest = JSON.parse(readFileSync(resolve(originals, 'manifest.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.originals.length, 9);
assert.deepEqual(readdirSync(originals).filter(p => p.endsWith('.png')).sort(), manifest.originals.map(x => x.file).sort());
for (const entry of manifest.originals) {
  const bytes = readFileSync(resolve(originals, entry.file));
  assert.equal(bytes.length, entry.bytes, entry.file);
  assert.equal(hash(bytes), entry.sha256, entry.file);
}
let size = 0;
for (const entry of manifest.runtime) {
  assert.ok(!entry.file.includes('..'));
  const bytes = readFileSync(resolve(root, 'apps/ui/public', entry.file));
  assert.equal(hash(bytes), entry.sha256, entry.file);
  assert.equal(bytes.length, entry.bytes, entry.file);
  assert.ok(manifest.originals.some(source => source.file === entry.source));
  size += bytes.length;
}
assert.ok(size < 128 * 1024, 'Runtime logo pack must remain under 128 KB');
assert.equal(hash(readFileSync(resolve(root, manifest.dotField.generatedFile))), manifest.dotField.generatedSha256);
assert.equal(manifest.dotField.sourceSha256, manifest.originals.find(file => file.file === manifest.dotField.source).sha256);
assert.equal(manifest.dotField.totalDots, 3080);
assert.ok(manifest.dotField.markedDots > 400 && manifest.dotField.markedDots < 1200);
console.log(`Verified ${manifest.originals.length} original logos, ${manifest.runtime.length} runtime derivatives (${size} bytes), and sampled dot geometry.`);
