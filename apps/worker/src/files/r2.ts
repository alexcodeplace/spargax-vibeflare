import { nanoid } from 'nanoid';

export async function putFile(
  r2: R2Bucket,
  userId: string,
  filename: string,
  mime: string,
  body: ArrayBuffer | ReadableStream
): Promise<{ key: string }> {
  const key = `${userId}/${Date.now()}-${nanoid(8)}-${filename}`;
  await r2.put(key, body, { httpMetadata: { contentType: mime } });
  return { key };
}

export async function getFile(r2: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return await r2.get(key);
}

export async function deleteFile(r2: R2Bucket, key: string): Promise<void> {
  await r2.delete(key);
}

export function publicUrl(host: string, key: string): string {
  return `https://${host}/files/${encodeURIComponent(key)}`;
}
