// wrangler uploads the [assets] directory without complaint when it is empty,
// which deploys a worker that serves a blank site.
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../../ui/dist/index.html', import.meta.url));

let size = 0;
try {
  size = statSync(entry).size;
} catch {
  size = 0;
}

if (size === 0) {
  console.error(`deploy aborted: ${entry} is missing or empty`);
  process.exit(1);
}
