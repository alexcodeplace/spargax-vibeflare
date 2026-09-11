import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { embed as apiEmbed, ApiError, exitCodeForStatus } from '../client.js';
import { writeContent, formatError } from '../output.js';

export default defineCommand({
  meta: { name: 'embed', description: 'embedding  -m model' },
  args: {
    txt: { type: 'positional', description: 'text to embed', required: true },
    model: { type: 'string', alias: 'm', description: 'model id' },
    json: { type: 'boolean', description: 'output full JSON' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    const model = args.model ?? cfg.default_model ?? '@cf/baai/bge-small-en-v1.5';
    try {
      const result = await apiEmbed(cfg, model, args.txt) as {
        data?: Array<{ embedding?: number[] }>;
      };
      if (args.json) {
        writeContent(JSON.stringify(result));
      } else {
        const vec = result.data?.[0]?.embedding ?? [];
        writeContent(vec.join(','));
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});
