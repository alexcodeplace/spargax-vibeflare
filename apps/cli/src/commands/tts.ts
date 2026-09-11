import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { tts as apiTts, ApiError, exitCodeForStatus } from '../client.js';
import { writeMeta, formatError } from '../output.js';
import { writeFileSync } from 'node:fs';

export default defineCommand({
  meta: { name: 'tts', description: 'text→speech  -m model -o file -v voice' },
  args: {
    txt: { type: 'positional', description: 'text to synthesize', required: true },
    model: { type: 'string', alias: 'm', description: 'model id' },
    out: { type: 'string', alias: 'o', description: 'output file path (- for stdout)' },
    voice: { type: 'string', alias: 'v', description: 'voice id' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    const model = args.model ?? cfg.default_model ?? '@cf/myshell-ai/melotts';
    try {
      const buf = await apiTts(cfg, model, args.txt, args.voice);
      const bytes = Buffer.from(buf);
      const outPath = args.out ?? '-';
      if (outPath === '-') {
        process.stdout.write(bytes);
      } else {
        writeFileSync(outPath, bytes);
        if (!args.quiet) writeMeta(`wrote ${bytes.length} bytes → ${outPath}`);
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});
