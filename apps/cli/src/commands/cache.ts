import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { cache as apiCache, ApiError, exitCodeForStatus } from '../client.js';
import { writeContent, writeMeta, formatError } from '../output.js';

const ls = defineCommand({
  meta: { name: 'ls', description: 'list response cache entries' },
  args: {
    json: { type: 'boolean', description: 'output full JSON' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    try {
      const result = await apiCache.list(cfg) as {
        entries?: Array<{ hash?: string; model?: string; hit_count?: number; expires_at?: number }>;
      };
      if (args.json) {
        writeContent(JSON.stringify(result));
      } else {
        const entries = result.entries ?? [];
        if (entries.length === 0) {
          writeContent('(empty)');
          return;
        }
        const lines = entries.map((e) =>
          `${e.hash?.slice(0, 8) ?? '?'}  ${e.model ?? '?'}  hits:${e.hit_count ?? 0}`
        );
        writeContent(lines.join('\n'));
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});

const clear = defineCommand({
  meta: { name: 'clear', description: 'clear all response cache entries' },
  args: {
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    try {
      const result = await apiCache.clear(cfg) as { deleted?: number };
      if (!args.quiet) writeMeta(`cleared ${result.deleted ?? 0} entries`);
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});

export default defineCommand({
  meta: { name: 'cache', description: 'manage response cache  ls|clear' },
  subCommands: { ls, clear },
  run() {
    process.stdout.write('usage: vf cache ls|clear\n');
  },
});
