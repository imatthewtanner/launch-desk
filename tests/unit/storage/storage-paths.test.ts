import { describe, expect, it } from 'vitest';

import {
  buildAuthenticatedStoragePath,
  storagePathBelongsToUser,
} from '@/lib/storage/types';

describe('authenticated storage paths', () => {
  it('builds the exact owner-scoped path with a sanitized filename', () => {
    expect(
      buildAuthenticatedStoragePath({
        userId: 'user-1',
        launchId: 'launch-1',
        assetId: 'asset-1',
        filename: ' Launch brief (final).pdf ',
      }),
    ).toBe('users/user-1/launches/launch-1/asset-1/Launch-brief-final.pdf');
  });

  it.each([
    { field: 'userId', value: '..' },
    { field: 'launchId', value: 'launch/other' },
    { field: 'assetId', value: 'asset\\other' },
    { field: 'userId', value: 'user\u0000evil' },
  ])('rejects unsafe $field identifiers', ({ field, value }) => {
    expect(() =>
      buildAuthenticatedStoragePath({
        userId: 'user-1',
        launchId: 'launch-1',
        assetId: 'asset-1',
        filename: 'brief.pdf',
        [field]: value,
      }),
    ).toThrow(/identifier/i);
  });

  it.each(['', '   ', '..', '../brief.pdf', 'brief\u0000.pdf'])(
    'rejects an empty or unsafe filename: %j',
    (filename) => {
      expect(() =>
        buildAuthenticatedStoragePath({
          userId: 'user-1',
          launchId: 'launch-1',
          assetId: 'asset-1',
          filename,
        }),
      ).toThrow(/filename/i);
    },
  );

  it('does not authorize another user or a prefix-collision user', () => {
    const path = 'users/user-10/launches/launch-1/asset-1/brief.pdf';

    expect(storagePathBelongsToUser(path, 'user-10')).toBe(true);
    expect(storagePathBelongsToUser(path, 'user-1')).toBe(false);
    expect(storagePathBelongsToUser(path, 'user-2')).toBe(false);
  });
});
