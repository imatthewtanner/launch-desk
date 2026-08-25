import { z } from 'zod';

import {
  MAX_ASSET_BYTES,
  MAX_ASSETS,
  SUPPORTED_ASSET_MIME_TYPES,
} from '@/lib/contracts/launch';
import { sanitizeStorageFilename } from '@/lib/storage/types';

export { MAX_ASSET_BYTES, MAX_ASSETS };

export const ASSET_EXTENSION_MIME_TYPES = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const;

const AssetMetadataInputSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().trim().toLowerCase(),
  byteSize: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_ASSET_BYTES, 'Assets must be 20 MB or smaller.'),
});

export interface AssetMetadataInput {
  filename: string;
  mimeType: string;
  byteSize: number;
}

export interface ValidatedAssetMetadata {
  filename: string;
  extension: keyof typeof ASSET_EXTENSION_MIME_TYPES;
  mimeType: (typeof SUPPORTED_ASSET_MIME_TYPES)[number];
  byteSize: number;
}

function extensionFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 && dot < filename.length - 1 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function validateAssetMetadata(input: AssetMetadataInput): ValidatedAssetMetadata {
  const parsed = AssetMetadataInputSchema.parse(input);
  const sanitized = sanitizeStorageFilename(parsed.filename);
  const extension = extensionFromFilename(sanitized);

  if (!(extension in ASSET_EXTENSION_MIME_TYPES)) {
    throw new Error('Asset extension is not supported.');
  }

  const expectedMime = ASSET_EXTENSION_MIME_TYPES[
    extension as keyof typeof ASSET_EXTENSION_MIME_TYPES
  ];
  if (parsed.mimeType !== expectedMime) {
    throw new Error(`Asset MIME type must match the .${extension} extension.`);
  }

  const filenameWithoutExtension = sanitized.slice(0, -(extension.length + 1));
  const normalizedFilename = `${filenameWithoutExtension}.${extension}`;

  return {
    filename: normalizedFilename,
    extension: extension as keyof typeof ASSET_EXTENSION_MIME_TYPES,
    mimeType: expectedMime,
    byteSize: parsed.byteSize,
  };
}

export function validateAssetBatch(
  assets: AssetMetadataInput[],
): ValidatedAssetMetadata[] {
  if (assets.length > MAX_ASSETS) {
    throw new Error('A launch can include at most 10 assets.');
  }
  return assets.map(validateAssetMetadata);
}
