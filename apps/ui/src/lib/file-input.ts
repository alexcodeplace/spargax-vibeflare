export const TEXT_FILE_ACCEPT = '.txt,.md,.markdown,.csv,.json';
export const PROMPT_FILE_ACCEPT = '.txt,.md,.markdown';
export const MAX_TEXT_FILE_BYTES = 64 * 1024;
export const MAX_IMPORTED_CHARACTERS = 16_000;

export function fileMatchesAccept(file: Pick<File, 'name' | 'type'>, accept?: string): boolean {
  if (!accept) return true;
  return accept.split(',').some(raw => {
    const rule = raw.trim().toLowerCase();
    if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule);
    if (rule.endsWith('/*')) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
    return file.type.toLowerCase() === rule;
  });
}

/** A text import is actual prompt input, not a stored attachment the model ignores. */
export async function readPromptFile(file: File): Promise<string> {
  if (!fileMatchesAccept(file, TEXT_FILE_ACCEPT)) throw new Error('Import a UTF-8 text, Markdown, CSV or JSON file. PDFs and images are not text inputs here.');
  if (!file.size) throw new Error('This file is empty. Choose a file containing text.');
  if (file.size > MAX_TEXT_FILE_BYTES) throw new Error('Choose a text file smaller than 64 KB.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new Error('This is not a UTF-8 text file. Save it as UTF-8 and try again.'); }
  if (text.includes('\0') || !text.trim()) throw new Error('This file does not contain readable text.');
  if (text.length > MAX_IMPORTED_CHARACTERS) throw new Error('Import up to 16,000 characters at a time. Split this file into smaller parts.');
  return text.trim();
}
