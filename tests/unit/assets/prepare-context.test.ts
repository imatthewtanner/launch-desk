import { describe, expect, it } from 'vitest';

import {
  MAX_AGGREGATE_TEXT_CHARACTERS,
  MAX_TEXT_CHARACTERS_PER_ASSET,
  prepareAssetContext,
} from '@/lib/assets/prepare-context';
import { toOpenAIInputParts } from '@/lib/assets/openai-parts';
import type { AuthorizedAsset, StorageAdapter } from '@/lib/storage/types';

function asset(
  id: string,
  filename: string,
  mimeType: AuthorizedAsset['mimeType'],
): AuthorizedAsset {
  return {
    id,
    ownerId: 'owner-1',
    launchId: 'launch-1',
    storagePath: `users/owner-1/launches/launch-1/${id}/${filename}`,
    filename,
    mimeType,
    byteSize: 100,
  };
}

function fakeStorage(contents: Map<string, string | Uint8Array | Error>): StorageAdapter {
  return {
    async read(reference) {
      const value = contents.get(reference.id);
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error('missing fixture');
      return typeof value === 'string' ? new TextEncoder().encode(value) : value;
    },
    async signUpload() {
      throw new Error('not used');
    },
    async remove() {},
    async cleanup() {},
  };
}

describe('prepareAssetContext', () => {
  it('decodes UTF-8 text, Markdown, CSV, and JSON into portable text parts', async () => {
    const references = [
      asset('text', 'brief.txt', 'text/plain'),
      asset('markdown', 'plan.md', 'text/markdown'),
      asset('csv', 'cohorts.csv', 'text/csv'),
      asset('json', 'config.json', 'application/json'),
    ];
    const storage = fakeStorage(
      new Map([
        ['text', 'Résumé launch brief'],
        ['markdown', '# Rollout\nStart at 10%.'],
        ['csv', 'cohort,percent\nbeta,10'],
        ['json', '{"rollout":"staged"}'],
      ]),
    );

    const context = await prepareAssetContext(references, storage);

    expect(context.parts.map((part) => part.kind)).toEqual(['text', 'text', 'text', 'text']);
    expect(context.parts.map((part) => (part.kind === 'text' ? part.text : ''))).toEqual([
      'Résumé launch brief',
      '# Rollout\nStart at 10%.',
      'cohort,percent\nbeta,10',
      '{"rollout":"staged"}',
    ]);
    expect(context.references.map((reference) => reference.id)).toEqual([
      'text',
      'markdown',
      'csv',
      'json',
    ]);
  });

  it('caps each text asset and the aggregate text budget', async () => {
    const references = Array.from({ length: 5 }, (_, index) =>
      asset(`text-${index}`, `brief-${index}.txt`, 'text/plain'),
    );
    const storage = fakeStorage(
      new Map(
        references.map((reference) => [
          reference.id,
          'x'.repeat(MAX_TEXT_CHARACTERS_PER_ASSET + 10),
        ]),
      ),
    );

    const context = await prepareAssetContext(references, storage);
    const totalCharacters = context.parts.reduce(
      (total, part) => total + (part.kind === 'text' ? part.text.length : 0),
      0,
    );

    expect(context.parts[0]).toMatchObject({ kind: 'text' });
    expect(
      context.parts[0].kind === 'text' ? context.parts[0].text.length : 0,
    ).toBe(MAX_TEXT_CHARACTERS_PER_ASSET);
    expect(totalCharacters).toBeLessThanOrEqual(MAX_AGGREGATE_TEXT_CHARACTERS);
    expect(context.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/truncated/i),
        expect.stringMatching(/aggregate/i),
      ]),
    );
  });

  it('warns and continues when an asset cannot be read', async () => {
    const references = [
      asset('broken', 'broken.txt', 'text/plain'),
      asset('healthy', 'healthy.txt', 'text/plain'),
    ];
    const context = await prepareAssetContext(
      references,
      fakeStorage(
        new Map<string, string | Uint8Array | Error>([
          ['broken', new Error('disk unavailable')],
          ['healthy', 'usable context'],
        ]),
      ),
    );

    expect(context.parts).toHaveLength(1);
    expect(context.warnings[0]).toMatch(/broken\.txt/i);
    expect(context.warnings[0]).not.toMatch(/disk unavailable/i);
  });

  it('produces portable file/image parts without paths, owners, or credentials', async () => {
    const references = [
      asset('pdf', 'brief.pdf', 'application/pdf'),
      asset('image', 'screen.png', 'image/png'),
    ];
    const context = await prepareAssetContext(
      references,
      fakeStorage(
        new Map([
          ['pdf', new Uint8Array([37, 80, 68, 70])],
          ['image', new Uint8Array([137, 80, 78, 71])],
        ]),
      ),
    );

    expect(context.parts.map((part) => part.kind)).toEqual(['file', 'image']);
    const serialized = JSON.stringify(context.parts);
    expect(serialized).not.toContain('owner-1');
    expect(serialized).not.toContain('storagePath');
    expect(serialized).not.toContain('token');

    expect(toOpenAIInputParts(context)).toEqual([
      {
        type: 'input_file',
        file: 'data:application/pdf;base64,JVBERg==',
        filename: 'brief.pdf',
      },
      {
        type: 'input_image',
        image: 'data:image/png;base64,iVBORw==',
        detail: 'auto',
      },
    ]);
  });
});
