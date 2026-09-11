import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { stt as apiStt, ApiError, exitCodeForStatus } from '../client.js';
import { writeContent, formatError } from '../output.js';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export default defineCommand({
  meta: { name: 'stt', description: 'speech→text  -m model' },
  args: {
    file: { type: 'positional', description: 'audio file path', required: true },
    model: { type: 'string', alias: 'm', description: 'model id' },
    json: { type: 'boolean', description: 'output full JSON' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    const model = args.model ?? cfg.default_model ?? '@cf/openai/whisper';
    try {
      const bytes = readFileSync(args.file);
      const form = new FormData();
      form.append('file', new Blob([bytes]), basename(args.file));
      form.append('model', model);
      const result = await apiStt(cfg, form) as { text?: string };
      if (args.json) {
        writeContent(JSON.stringify(result));
      } else {
        writeContent(result.text ?? '');
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});
