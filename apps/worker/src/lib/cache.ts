import type { Context } from 'hono';

/**
 * Compute a 16-char hex ETag from stringified body using Web Crypto SHA-256.
 */
async function computeETag(body: unknown): Promise<string> {
  const text = JSON.stringify(body);
  const buf = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `"${hex.slice(0, 16)}"`;
}

/**
 * Return cached JSON response with ETag + Cache-Control.
 * Sends 304 if client ETag matches.
 */
export async function withCache<T>(
  c: Context,
  body: T,
  cacheControl: string,
): Promise<Response> {
  const etag = await computeETag(body);
  const ifNoneMatch = c.req.header('If-None-Match');

  if (ifNoneMatch) {
    const tags = ifNoneMatch.split(',').map((s) => s.trim());
    if (tags.includes('*') || tags.includes(etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': cacheControl,
        },
      });
    }
  }

  return c.json(body, 200, {
    ETag: etag,
    'Cache-Control': cacheControl,
  });
}
