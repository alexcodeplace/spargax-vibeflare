import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { keys as apiKeys, ApiError, exitCodeForStatus } from '../client.js';
import { writeContent, writeMeta, formatError } from '../output.js';

const ls = defineCommand({
  meta: { name: 'ls', description: 'list API keys' },
  args: {
    json: { type: 'boolean', description: 'output full JSON' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    try {
      const result = await apiKeys.list(cfg) as {
        keys?: Array<{ prefix?: string; label?: string; last_used_at?: number | null }>;
      };
      if (args.json) {
        writeContent(JSON.stringify(result));
      } else {
        const rows = result.keys ?? [];
        const lines = rows.map((k) => {
          const last = k.last_used_at
            ? new Date(k.last_used_at).toISOString().slice(0, 10)
            : 'never';
          return `${k.prefix ?? ''}  ${k.label ?? ''}  ${last}`;
        });
        writeContent(lines.join('\n'));
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});

const newKey = defineCommand({
  meta: { name: 'new', description: 'create API key' },
  args: {
    label: { type: 'positional', description: 'key label', required: true },
    admin: { type: 'boolean', description: 'create admin key (owner only)' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    try {
      const result = await apiKeys.create(cfg, args.label, args.admin ?? false) as {
        full?: string;
      };
      // Print only the key token — no labels, no metadata
      writeContent(result.full ?? '');
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});

const rm = defineCommand({
  meta: { name: 'rm', description: 'revoke API key by id or prefix' },
  args: {
    id: { type: 'positional', description: 'key id or prefix', required: true },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    try {
      await apiKeys.revoke(cfg, args.id);
      if (!args.quiet) writeMeta(`revoked ${args.id}`);
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});

export default defineCommand({
  meta: { name: 'keys', description: 'manage API keys  ls|new|rm' },
  subCommands: { ls, new: newKey, rm },
  run() {
    process.stdout.write('usage: vf keys ls|new <label>|rm <id>\n');
  },
});
