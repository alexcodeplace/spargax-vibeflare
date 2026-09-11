const isTTY = process.stdout.isTTY ?? false;

/** Write content to stdout. No trailing newline if piped; trailing newline if TTY. */
export function writeContent(s: string): void {
  if (isTTY) {
    process.stdout.write(s.endsWith('\n') ? s : s + '\n');
  } else {
    process.stdout.write(s);
  }
}

/** Write metadata/progress to stderr (always newline terminated). */
export function writeMeta(s: string): void {
  process.stderr.write(s.endsWith('\n') ? s : s + '\n');
}

/** Exit with typed code. 0=ok 1=err 2=quota 3=auth */
export function exit(code: 0 | 1 | 2 | 3): never {
  process.exit(code);
}

/** Format ApiError or unknown error to one line. Never include key material. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Byte-truncate string to n bytes (UTF-8). */
export function truncate(s: string, n: number): string {
  const buf = Buffer.from(s, 'utf8');
  if (buf.length <= n) return s;
  return buf.subarray(0, n).toString('utf8');
}
