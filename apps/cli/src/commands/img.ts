import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { imgGen, download, ApiError, exitCodeForStatus } from '../client.js';
import { writeMeta, formatError } from '../output.js';
import { writeFileSync } from 'node:fs';

export default defineCommand({
  meta: { name: 'img', description: 'image gen  -m model -o file -n N' },
  args: {
    prompt: { type: 'positional', description: 'image prompt', required: true },
    model: { type: 'string', alias: 'm', description: 'model id' },
    out: { type: 'string', alias: 'o', description: 'output file path (use _ for index placeholder)' },
    n: { type: 'string', description: 'number of images (default 1)' },
    size: { type: 'string', description: 'image size e.g. 512x512' },
    json: { type: 'boolean', description: 'output full JSON' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    const model = args.model ?? cfg.default_model ?? '@cf/black-forest-labs/flux-1-schnell';
    const n = args.n ? parseInt(args.n, 10) : 1;
    try {
      const result = await imgGen(cfg, model, args.prompt, n, args.size) as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };

      if (args.json) {
        process.stdout.write(JSON.stringify(result) + '\n');
        return;
      }

      const items = result.data ?? [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const outBase = args.out ?? `image.png`;
        const outPath = items.length > 1
          ? outBase.replace(/(\.[^.]+)$/, `_${i + 1}$1`)
          : outBase;

        if (item?.b64_json) {
          const buf = Buffer.from(item.b64_json, 'base64');
          writeFileSync(outPath, buf);
          if (!args.quiet) writeMeta(`wrote ${buf.length} bytes → ${outPath}`);
        } else if (item?.url) {
          const buf = Buffer.from(await download(cfg, item.url));
          writeFileSync(outPath, buf);
          if (!args.quiet) writeMeta(`wrote ${buf.length} bytes → ${outPath}`);
        }
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});
