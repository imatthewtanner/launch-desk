import { describe, expect, it } from 'vitest';

import {
  MAX_ASSET_BYTES,
  validateAssetBatch,
  validateAssetMetadata,
} from '@/lib/assets/validation';

const acceptedAssets = [
  { filename: 'brief.pdf', mimeType: 'application/pdf', byteSize: 1 },
  { filename: 'notes.txt', mimeType: 'text/plain', byteSize: 1 },
  { filename: 'plan.md', mimeType: 'text/markdown', byteSize: 1 },
  { filename: 'plan.markdown', mimeType: 'text/markdown', byteSize: 1 },
  { filename: 'cohorts.csv', mimeType: 'text/csv', byteSize: 1 },
  { filename: 'config.json', mimeType: 'application/json', byteSize: 1 },
  { filename: 'screen.png', mimeType: 'image/png', byteSize: 1 },
  { filename: 'photo.jpg', mimeType: 'image/jpeg', byteSize: 1 },
  { filename: 'photo.jpeg', mimeType: 'image/jpeg', byteSize: 1 },
  { filename: 'hero.webp', mimeType: 'image/webp', byteSize: 1 },
];

describe('asset metadata validation', () => {
  it('accepts ten supported files', () => {
    expect(validateAssetBatch(acceptedAssets)).toHaveLength(10);
  });

  it('rejects an eleventh asset', () => {
    expect(() =>
      validateAssetBatch([...acceptedAssets, acceptedAssets[0]]),
    ).toThrow(/10 assets/i);
  });

  it('accepts exactly 20 MB and rejects one byte more', () => {
    expect(
      validateAssetMetadata({
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
        byteSize: MAX_ASSET_BYTES,
      }).byteSize,
    ).toBe(MAX_ASSET_BYTES);

    expect(() =>
      validateAssetMetadata({
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
        byteSize: MAX_ASSET_BYTES + 1,
      }),
    ).toThrow(/20 MB/i);
  });

  it('rejects extension and MIME mismatches', () => {
    expect(() =>
      validateAssetMetadata({
        filename: 'brief.pdf',
        mimeType: 'image/png',
        byteSize: 10,
      }),
    ).toThrow(/match/i);
  });

  it('rejects executable content types and extensions', () => {
    expect(() =>
      validateAssetMetadata({
        filename: 'installer.exe',
        mimeType: 'application/x-msdownload',
        byteSize: 10,
      }),
    ).toThrow(/supported/i);
  });

  it('sanitizes the basename while preserving a safe extension', () => {
    expect(
      validateAssetMetadata({
        filename: ' Launch brief (final).PDF ',
        mimeType: 'application/pdf',
        byteSize: 10,
      }).filename,
    ).toBe('Launch-brief-final.pdf');
  });
});
