import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as readline from 'node:readline';
import { join } from 'node:path';
import { WranglerProvider } from './wrangler-provider.js';
import type { LifecycleContext } from './lifecycle.js';

export function repoRoot(cwd = process.cwd()): string {
  if (!existsSync(join(cwd, 'package.json')) || !existsSync(join(cwd, 'apps/worker/wrangler.toml'))) {
    throw new Error('run this command from the root of the VibeFlare release folder');
  }
  return cwd;
}

export function resolveWranglerBin(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): string {
  const override = env.VIBEFLARE_WRANGLER_BIN?.trim();
  if (override) return override;

  const executable = platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
  const candidates = [
    join(root, 'node_modules', '.bin', executable),
    join(root, 'apps', 'worker', 'node_modules', '.bin', executable),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? 'wrangler';
}

export function lifecycleContext(cwd = process.cwd()): LifecycleContext {
  const root = repoRoot(cwd);
  return { provider: new WranglerProvider(resolveWranglerBin(root)), repoRoot: root };
}

export async function promptText(question: string, options: { hidden?: boolean; optional?: boolean } = {}): Promise<string> {
  if (!process.stdin.isTTY) {
    if (options.optional) return '';
    throw new Error(`interactive input required for: ${question.trim()}`);
  }
  if (!options.hidden) {
    return await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
    });
  }

  return await new Promise((resolve, reject) => {
    process.stdout.write(question);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    let value = '';
    const cleanup = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
    };
    const onData = (chunk: string) => {
      if (chunk === '\u0003') {
        cleanup();
        process.stdout.write('\n');
        reject(new Error('cancelled'));
      } else if (chunk === '\r' || chunk === '\n' || chunk === '\u0004') {
        cleanup();
        process.stdout.write('\n');
        resolve(value.trim());
      } else if (chunk === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += chunk;
      }
    };
    process.stdin.on('data', onData);
  });
}

export function normalizeOrigin(value: string): string {
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(normalized);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('deployment URL must use https');
  }
  return url.origin;
}

export function rpIdFromOrigin(origin: string): string {
  return new URL(origin).hostname;
}

export function generatedSessionSecret(): string {
  return randomBytes(32).toString('hex');
}
