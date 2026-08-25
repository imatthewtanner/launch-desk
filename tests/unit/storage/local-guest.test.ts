import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalGuestStorage } from '@/lib/storage/local-guest';
import type { AuthorizedAsset } from '@/lib/storage/types';

describe('LocalGuestStorage', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'launch-desk-storage-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes and reads only within a randomized run-scoped path', async () => {
    const storage = new LocalGuestStorage({
      root,
      ownerId: 'guest-owner',
      sessionId: 'session-1',
      runId: 'run-1',
    });
    const upload = await storage.signUpload({
      ownerId: 'guest-owner',
      launchId: 'launch-1',
      assetId: 'asset-1',
      filename: ' brief.md ',
      mimeType: 'text/markdown',
      byteSize: 5,
    });

    expect(upload.path).toMatch(/^session-1\/run-1\/[0-9a-f-]+-brief\.md$/);
    await storage.write(upload, new TextEncoder().encode('hello'));

    const asset: AuthorizedAsset = {
      id: 'asset-1',
      ownerId: 'guest-owner',
      launchId: 'launch-1',
      storagePath: upload.path,
      filename: 'brief.md',
      mimeType: 'text/markdown',
      byteSize: 5,
    };
    expect(new TextDecoder().decode(await storage.read(asset))).toBe('hello');

    await storage.cleanup({ ownerId: 'guest-owner', sessionId: 'session-1', runId: 'run-1' });
    await expect(storage.read(asset)).rejects.toThrow();
  });

  it('refuses symbolic links even when their link path appears in scope', async () => {
    const storage = new LocalGuestStorage({
      root,
      ownerId: 'guest-owner',
      sessionId: 'session-1',
      runId: 'run-1',
    });
    const outside = path.join(root, 'outside.txt');
    const scopedDirectory = path.join(root, 'session-1', 'run-1');
    await writeFile(outside, 'secret');
    await mkdir(scopedDirectory, { recursive: true });
    await symlink(outside, path.join(scopedDirectory, 'link.txt'));

    await expect(
      storage.read({
        id: 'asset-1',
        ownerId: 'guest-owner',
        launchId: 'launch-1',
        storagePath: 'session-1/run-1/link.txt',
        filename: 'link.txt',
        mimeType: 'text/plain',
        byteSize: 6,
      }),
    ).rejects.toThrow(/symbolic/i);
  });
});
