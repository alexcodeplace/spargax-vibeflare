import type { Config } from './config.js';
import { chat as apiChat, type ChatMessage } from './client.js';

const SUMMARIZE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const KEEP_TAIL = 6; // keep last N messages verbatim
const SUMMARIZE_PROMPT = 'Summarize the following conversation history concisely in 3-5 sentences. Preserve key facts, decisions, and context that would help continue the conversation.';

/**
 * If messages.length > 20, summarize the older portion via a cheap AI call
 * and return a compacted message list: [system?, summary-as-user, ...last KEEP_TAIL].
 * Always preserves existing system message at position 0.
 */
export async function compressHistory(cfg: Config, messages: ChatMessage[]): Promise<ChatMessage[]> {
  if (messages.length <= 20) return messages;

  const systemMsgs = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  const toSummarize = nonSystem.slice(0, nonSystem.length - KEEP_TAIL);
  const tail = nonSystem.slice(nonSystem.length - KEEP_TAIL);

  const historyText = toSummarize
    .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n');

  let summaryContent = '';
  try {
    const result = await apiChat(cfg, {
      model: SUMMARIZE_MODEL,
      messages: [
        { role: 'system', content: SUMMARIZE_PROMPT },
        { role: 'user', content: historyText },
      ],
      max_tokens: 200,
      stream: false,
    });
    const res = result as { choices?: Array<{ message?: { content?: string } }> };
    summaryContent = res.choices?.[0]?.message?.content ?? '';
  } catch {
    // summarize failed — fall back to no compression
    return messages;
  }

  return [
    ...systemMsgs,
    { role: 'user', content: `[Prior conversation summary]: ${summaryContent}` },
    { role: 'assistant', content: 'Understood, I have the context from our prior conversation.' },
    ...tail,
  ];
}
