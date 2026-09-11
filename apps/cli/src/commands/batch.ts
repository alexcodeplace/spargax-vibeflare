import { defineCommand } from 'citty';
import { getConfig } from '../config.js';
import { chat as apiChat, embed as apiEmbed, ApiError, type ChatMessage } from '../client.js';
import { formatError } from '../output.js';
import { createInterface } from 'node:readline';

interface BatchItem {
  kind: 'chat' | 'embed';
  id?: string;
  model?: string;
  messages?: ChatMessage[];
  input?: string;
  max_tokens?: number;
  system_id?: string;
  cache?: boolean;
}

export default defineCommand({
  meta: { name: 'batch', description: 'jsonl pipe — read from stdin, write results to stdout' },
  args: {
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run({ args }) {
    const cfg = getConfig();
    const rl = createInterface({ input: process.stdin, terminal: false });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let item: BatchItem;
      try {
        item = JSON.parse(trimmed) as BatchItem;
      } catch (e) {
        process.stdout.write(JSON.stringify({ error: `invalid json: ${String(e)}` }) + '\n');
        continue;
      }

      try {
        let result: unknown;
        if (item.kind === 'chat') {
          result = await apiChat(cfg, {
            model: item.model ?? cfg.default_model ?? '@cf/meta/llama-3.1-8b-instruct',
            messages: item.messages ?? [],
            max_tokens: item.max_tokens ?? 256,
            ...(item.system_id ? { system_id: item.system_id } : {}),
            ...(item.cache ? { cache: true } : {}),
          });
        } else if (item.kind === 'embed') {
          result = await apiEmbed(
            cfg,
            item.model ?? cfg.default_model ?? '@cf/baai/bge-small-en-v1.5',
            item.input ?? ''
          );
        } else {
          process.stdout.write(JSON.stringify({ id: item.id, error: `unknown kind: ${(item as BatchItem).kind}` }) + '\n');
          continue;
        }
        process.stdout.write(JSON.stringify({ id: item.id, result }) + '\n');
      } catch (err) {
        if (!args.quiet) process.stderr.write(formatError(err) + '\n');
        const statusCode = err instanceof ApiError ? err.statusCode : 500;
        process.stdout.write(JSON.stringify({ id: item.id, error: formatError(err), statusCode }) + '\n');
      }
    }
  },
});
