import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { usage as apiUsage, ApiError, exitCodeForStatus } from '../client.js';
import { writeContent, formatError } from '../output.js';

export default defineCommand({
  meta: { name: 'usage', description: 'quota status' },
  args: {
    json: { type: 'boolean', description: 'output full JSON' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    try {
      const result = await apiUsage(cfg) as { used?: number; limit?: number };
      if (args.json) {
        writeContent(JSON.stringify(result));
      } else {
        const used = result.used ?? 0;
        const limit = result.limit ?? 0;
        const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
        writeContent(`${used}/${limit} ${pct}%`);
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});
