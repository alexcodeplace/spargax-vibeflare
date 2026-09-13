#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'docs/screenshots');
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const guide = readFileSync(join(directory, 'README.md'), 'utf8');
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
assert.equal(manifest.schemaVersion, 1);
assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
assert.ok(Number.isFinite(Date.parse(manifest.capturedAt)));
assert.equal(manifest.version, packageVersion, 'Capture the new version before publishing its README');
assert.match(manifest.environment, /isolated local/);
assert.match(manifest.inference, /fixture/);
assert.match(manifest.privacy, /masked/);

const files = manifest.screenshots.map(image => image.file);
assert.equal(new Set(files).size, files.length, 'Duplicate screenshot entries');
assert.deepEqual([...files].sort(), readdirSync(directory).filter(file => file.endsWith('.png')).sort(), 'Every PNG must have provenance');
assert.ok(files.length >= 8, 'Capture the complete documented screen set');
for (const image of manifest.screenshots) {
  assert.match(image.file, /^vibeflare-[a-z-]+\.png$/);
  assert.ok(image.description && image.route && image.theme);
  assert.ok(image.viewport.width > 0 && image.viewport.height > 0);
  const bytes = readFileSync(join(directory, image.file));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${image.file}: PNG signature`);
  assert.equal(bytes.subarray(12, 16).toString(), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), image.viewport.width, `${image.file}: capture width`);
  assert.ok(bytes.readUInt32BE(20) >= image.viewport.height, `${image.file}: full-page height`);
  assert.equal(bytes.length, image.bytes, `${image.file}: byte length`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256, `${image.file}: checksum`);
  assert.ok(readme.includes(`docs/screenshots/${image.file}`), `${image.file}: absent from README`);
  assert.ok(guide.includes(image.file), `${image.file}: absent from capture guide`);
}
for (const reference of readme.matchAll(/docs\/screenshots\/(vibeflare-[a-z-]+\.png)/g)) {
  assert.ok(files.includes(reference[1]), `Untracked README screenshot: ${reference[1]}`);
}
assert.ok(manifest.screenshots.some(image => image.theme === 'light'));
assert.ok(manifest.screenshots.some(image => image.theme === 'dark'));
assert.ok(manifest.screenshots.some(image => image.viewport.width === 390));
for (const [route, digest] of Object.entries(manifest.buildHtmlSha256)) {
  assert.ok(route && !route.includes('..'));
  assert.match(digest, /^[0-9a-f]{64}$/);
}
console.log(`Verified ${files.length} README screenshots for v${manifest.version}, captured from ${manifest.sourceCommit.slice(0, 12)}.`);
