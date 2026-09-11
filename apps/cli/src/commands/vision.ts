import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { chat as apiChat, ApiError, exitCodeForStatus, type ChatMessage } from '../client.js';
import { writeContent, formatError, truncate } from '../output.js';
import { readFileSync, existsSync } from 'node:fs';

export default defineCommand({
  meta: { name: 'vision', description: 'vision QA  -m model' },
  args: {
    image: { type: 'positional', description: 'image path or URL', required: true },
    question: { type: 'positional', description: 'question about image', required: true },
    model: { type: 'string', alias: 'm', description: 'model id' },
    'max-tokens': { type: 'string', description: 'max tokens (default 256)' },
    head: { type: 'string', description: 'truncate output to N bytes' },
    json: { type: 'boolean', description: 'output full JSON' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    const model = args.model ?? cfg.default_model ?? '@cf/llava-hf/llava-1.5-7b-hf';
    const maxTokens = args['max-tokens'] ? parseInt(args['max-tokens'], 10) : 256;
    const headBytes = args.head ? parseInt(args.head, 10) : 0;

    let imageContent: unknown;
    if (args.image.startsWith('http://') || args.image.startsWith('https://')) {
      imageContent = { type: 'image_url', image_url: { url: args.image } };
    } else if (existsSync(args.image)) {
      const bytes = readFileSync(args.image);
      const b64 = bytes.toString('base64');
      const ext = args.image.split('.').pop() ?? 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      imageContent = { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } };
    } else {
      process.stderr.write(`vf: file not found: ${args.image}\n`);
      process.exit(1);
    }

    const messages: ChatMessage[] = [
      { role: 'user', content: [imageContent, { type: 'text', text: args.question }] },
    ];

    try {
      const result = await apiChat(cfg, { model, messages, max_tokens: maxTokens });
      if (args.json) {
        writeContent(JSON.stringify(result));
      } else {
        const res = result as { choices?: Array<{ message?: { content?: string } }> };
        let content = res.choices?.[0]?.message?.content ?? '';
        if (headBytes > 0) content = truncate(content, headBytes);
        writeContent(content);
      }
    } catch (err) {
      if (!args.quiet) process.stderr.write(formatError(err) + '\n');
      const code = err instanceof ApiError ? exitCodeForStatus(err.statusCode) : 1;
      process.exit(code);
    }
  },
});
