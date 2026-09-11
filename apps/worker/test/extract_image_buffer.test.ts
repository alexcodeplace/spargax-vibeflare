import { describe, it, expect } from 'vitest';
import { extractImageBuffer } from '../src/api/translator';

function makeArrayBuffer(size: number): ArrayBuffer {
  return new Uint8Array(size).fill(42).buffer;
}

describe('extractImageBuffer', () => {
  it('returns ArrayBuffer input unchanged', async () => {
    const buf = makeArrayBuffer(10);
    const result = await extractImageBuffer(buf);
    expect(result).toBe(buf);
    expect(result.byteLength).toBe(10);
  });

  it('decodes { image: base64string } shape', async () => {
    // "hello" base64 encoded
    const original = new TextEncoder().encode('hello');
    const b64 = btoa(String.fromCharCode(...original));
    const result = await extractImageBuffer({ image: b64 });
    expect(result.byteLength).toBe(5);
    expect(new Uint8Array(result)[0]).toBe('h'.charCodeAt(0));
  });

  it('returns { image: ArrayBuffer } shape', async () => {
    const buf = makeArrayBuffer(8);
    const result = await extractImageBuffer({ image: buf });
    expect(result).toBe(buf);
  });

  it('throws on empty ArrayBuffer', async () => {
    await expect(extractImageBuffer(makeArrayBuffer(0))).rejects.toThrow('empty buffer');
  });

  it('throws on unrecognized shape (no .image property)', async () => {
    await expect(extractImageBuffer({ response: 'text' })).rejects.toThrow();
  });

  it('throws on null', async () => {
    await expect(extractImageBuffer(null)).rejects.toThrow();
  });

  it('throws on undefined', async () => {
    await expect(extractImageBuffer(undefined)).rejects.toThrow();
  });

  it('throws when { image: undefined }', async () => {
    await expect(extractImageBuffer({ image: undefined })).rejects.toThrow();
  });

  it('handles ReadableStream by reading it', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const result = await extractImageBuffer(stream);
    expect(result.byteLength).toBe(3);
  });
});
