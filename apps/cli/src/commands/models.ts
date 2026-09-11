import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { models as apiModels, ApiError, exitCodeForStatus } from '../client.js';
import { writeContent, formatError } from '../output.js';

export default defineCommand({
  meta: { name: 'models', description: 'list models' },
  args: {
    task: { type: 'positional', description: 'filter by task', required: false },
    json: { type: 'boolean', description: 'output full JSON' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    try {
      const result = await apiModels(cfg, args.task) as {
        data?: Array<{ id?: string }>;
      };
      if (args.json) {
        writeContent(JSON.stringify(result));
      } else {
        const lines = (result.data ?? []).map((m) => m.id ?? '').filter(Boolean);
        writeContent(lines.join('\n'));
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});
