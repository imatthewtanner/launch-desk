import {
  AssetReferenceSchema,
  type AssetReference,
} from '@/lib/contracts/launch';
import type { AuthorizedAsset, StorageAdapter } from '@/lib/storage/types';

export const MAX_TEXT_CHARACTERS_PER_ASSET = 50_000;
export const MAX_AGGREGATE_TEXT_CHARACTERS = 200_000;

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export type PortableAssetPart =
  | {
      kind: 'text';
      assetId: string;
      filename: string;
      text: string;
    }
  | {
      kind: 'file';
      assetId: string;
      filename: string;
      mimeType: 'application/pdf';
      base64: string;
    }
  | {
      kind: 'image';
      assetId: string;
      filename: string;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
      base64: string;
    };

export interface PreparedAssetContext {
  parts: PortableAssetPart[];
  warnings: string[];
  references: AssetReference[];
}

function toReference(asset: AuthorizedAsset): AssetReference {
  return AssetReferenceSchema.parse({
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    storagePath: asset.storagePath,
  });
}

export async function prepareAssetContext(
  assets: AuthorizedAsset[],
  storage: StorageAdapter,
): Promise<PreparedAssetContext> {
  const parts: PortableAssetPart[] = [];
  const warnings: string[] = [];
  const references = assets.map(toReference);
  let aggregateTextCharacters = 0;

  for (const asset of assets) {
    let bytes: Uint8Array;
    try {
      bytes = await storage.read(asset);
    } catch {
      warnings.push(`Could not read asset "${asset.filename}"; it was omitted from context.`);
      continue;
    }

    if (TEXT_MIME_TYPES.has(asset.mimeType)) {
      let decoded: string;
      try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        warnings.push(`Asset "${asset.filename}" is not valid UTF-8 and was omitted.`);
        continue;
      }

      if (decoded.length > MAX_TEXT_CHARACTERS_PER_ASSET) {
        decoded = decoded.slice(0, MAX_TEXT_CHARACTERS_PER_ASSET);
        warnings.push(
          `Asset "${asset.filename}" was truncated to ${MAX_TEXT_CHARACTERS_PER_ASSET.toLocaleString()} characters.`,
        );
      }

      const remaining = MAX_AGGREGATE_TEXT_CHARACTERS - aggregateTextCharacters;
      if (remaining <= 0) {
        warnings.push(
          `Asset "${asset.filename}" was omitted because the aggregate text limit was reached.`,
        );
        continue;
      }
      if (decoded.length > remaining) {
        decoded = decoded.slice(0, remaining);
        warnings.push(
          `Asset "${asset.filename}" was truncated by the aggregate text limit.`,
        );
      }
      if (!decoded) {
        warnings.push(`Asset "${asset.filename}" was empty and was omitted.`);
        continue;
      }

      aggregateTextCharacters += decoded.length;
      parts.push({
        kind: 'text',
        assetId: asset.id,
        filename: asset.filename,
        text: decoded,
      });
      continue;
    }

    const base64 = Buffer.from(bytes).toString('base64');
    if (asset.mimeType === 'application/pdf') {
      parts.push({
        kind: 'file',
        assetId: asset.id,
        filename: asset.filename,
        mimeType: 'application/pdf',
        base64,
      });
      continue;
    }
    if (IMAGE_MIME_TYPES.has(asset.mimeType)) {
      parts.push({
        kind: 'image',
        assetId: asset.id,
        filename: asset.filename,
        mimeType: asset.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
        base64,
      });
      continue;
    }

    warnings.push(`Asset "${asset.filename}" has an unsupported content type and was omitted.`);
  }

  return { parts, warnings, references };
}
