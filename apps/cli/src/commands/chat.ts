import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { chat as apiChat, ApiError, exitCodeForStatus, type ChatMessage } from '../client.js';
import { writeContent, formatError, truncate } from '../output.js';
import { compressHistory } from '../compress.js';

const FULL_DOCS = `
chat — send a message and print the reply

usage: vf chat <msg> [flags]

flags:
  -m, --model <id>        model id (default: config default_model)
  -s, --system <txt>      system prompt text
  -t, --temp <float>      temperature 0-2
  --cache                 enable server-side response cache
  --system-id <id>        server-side prompt-cache id (replaces -s)
  --compress-history      summarize history >20 msgs before sending
  --max-tokens <N>        max output tokens (default 256)
  --head <N>              truncate output to N bytes
  --json                  print full completion JSON
  -q, --quiet             suppress stderr

exit: 0 ok  1 err  2 quota  3 auth
`.trim();

export default defineCommand({
  meta: { name: 'chat', description: 'text gen  -m model -s sys -t temp --cache' },
  args: {
    msg: { type: 'positional', description: 'user message', required: true },
    model: { type: 'string', alias: 'm', description: 'model id' },
    system: { type: 'string', alias: 's', description: 'system prompt' },
    temp: { type: 'string', alias: 't', description: 'temperature' },
    cache: { type: 'boolean', description: 'enable response cache' },
    'system-id': { type: 'string', description: 'server prompt-cache id' },
    'compress-history': { type: 'boolean', description: 'summarize history >20 msgs' },
    'max-tokens': { type: 'string', description: 'max tokens (default 256)' },
    head: { type: 'string', description: 'truncate output to N bytes' },
    json: { type: 'boolean', description: 'output raw JSON' },
    quiet: { type: 'boolean', alias: 'q', description: 'suppress stderr' },
    full: { type: 'boolean', description: 'show full help docs' },
  },
  async run({ args }) {
    if (args.full) { process.stdout.write(FULL_DOCS + '\n'); return; }

    const cfg = getConfig();
    const maxTokens = args['max-tokens'] ? parseInt(args['max-tokens'], 10) : 256;
    const headBytes = args.head ? parseInt(args.head, 10) : 0;

    const messages: ChatMessage[] = [];
    if (args['system-id']) {
      // system-id passed directly to server; no client-side system message
    } else if (args.system) {
      messages.push({ role: 'system', content: args.system });
    }
    messages.push({ role: 'user', content: args.msg });

    const model = args.model ?? cfg.default_model ?? '@cf/meta/llama-3.1-8b-instruct';

    // compress-history: summarize if >20 messages
    if (args['compress-history'] && messages.length > 20) {
      const compressed = await compressHistory(cfg, messages);
      messages.splice(0, messages.length, ...compressed);
    }

    try {
      const result = await apiChat(cfg, {
        model,
        messages,
        max_tokens: maxTokens,
        ...(args.temp ? { temperature: parseFloat(args.temp) } : {}),
        ...(args.cache ? { cache: true } : {}),
        ...(args['system-id'] ? { system_id: args['system-id'] } : {}),
      });

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
