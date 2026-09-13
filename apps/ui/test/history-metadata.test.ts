import { describe, expect, it } from 'vitest';
import { parseHistoryMetadata } from '@vibeflare/shared';

const metadata = { version: 1, task: 'text-to-image', files: [{ id: 'owned-file_123', kind: 'image', name: 'result.png', mime: 'image/png' }] };
describe('backward-compatible history attachment decoding', () => {
  it('decodes structured output without interpreting ordinary chat content', () => {
    expect(parseHistoryMetadata(JSON.stringify(metadata))).toEqual(metadata);
    expect(parseHistoryMetadata({ ...metadata, task: 'text-embeddings', dimensions: 4, count: 1 })).toMatchObject({ dimensions: 4, count: 1 });
  });
  it.each([null, undefined, '', 'old text', '[]', '{broken', { version: 2, task: 'text-to-image', files: [] }, { ...metadata, files: [null] }, { ...metadata, files: [{ ...metadata.files[0], id: '../../another-account' }] }, { ...metadata, dimensions: -1 }])('leaves legacy or malformed metadata alone: %j', value => {
    expect(parseHistoryMetadata(value)).toBeNull();
  });
});
