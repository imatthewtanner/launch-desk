import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rm, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
  sanitizeStorageFilename,
  type AuthorizedAsset,
  type SignUploadInput,
  type SignedUpload,
  type StorageAdapter,
  type StorageScope,
} from '@/lib/storage/types';

interface LocalGuestStorageOptions {
  ownerId: string;
  sessionId: string;
  runId: string;
  root?: string;
}

const SAFE_SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function safeScopeId(value: string): string {
  if (!SAFE_SCOPE_ID.test(value) || value.includes('..')) {
    throw new Error('Guest storage scope identifiers are invalid.');
  }
  return value;
}

export class LocalGuestStorage implements StorageAdapter {
  readonly #root: string;
  readonly #scopeRoot: string;
  readonly #ownerId: string;
  readonly #sessionId: string;
  readonly #runId: string;

  constructor(options: LocalGuestStorageOptions) {
    this.#root = options.root
      ? path.resolve(/* turbopackIgnore: true */ options.root)
      : path.join(process.cwd(), '.launch-desk-tmp');
    this.#ownerId = safeScopeId(options.ownerId);
    this.#sessionId = safeScopeId(options.sessionId);
    this.#runId = safeScopeId(options.runId);
    this.#scopeRoot = this.#withinRoot(path.join(this.#root, this.#sessionId, this.#runId));
  }

  async signUpload(input: SignUploadInput): Promise<SignedUpload> {
    this.#assertOwner(input.ownerId);
    await mkdir(this.#scopeRoot, { recursive: true, mode: 0o700 });
    const identifier = randomUUID();
    const filename = sanitizeStorageFilename(input.filename);
    // Public storage paths are portable identifiers, so keep them POSIX-style.
    const relativePath = path.posix.join(this.#sessionId, this.#runId, `${identifier}-${filename}`);

    return {
      assetId: input.assetId,
      path: relativePath,
      signedUrl: `local://launch-desk-upload/${identifier}`,
      token: identifier,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }

  async write(upload: SignedUpload, contents: Uint8Array): Promise<void> {
    const destination = this.#resolveScopedPath(upload.path);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const file = await open(destination, 'wx', 0o600);
    try {
      await file.writeFile(contents);
    } finally {
      await file.close();
    }
  }

  async read(asset: AuthorizedAsset): Promise<Uint8Array> {
    this.#assertOwner(asset.ownerId);
    const source = this.#resolveScopedPath(asset.storagePath);
    const stats = await lstat(source);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error('Guest assets must be regular files, not symbolic links.');
    }
    const resolved = this.#withinRoot(await realpath(source));
    if (!resolved.startsWith(`${this.#scopeRoot}${path.sep}`)) {
      throw new Error('Guest asset escaped its run-scoped directory.');
    }
    return new Uint8Array(await readFile(resolved));
  }

  async remove(asset: AuthorizedAsset): Promise<void> {
    this.#assertOwner(asset.ownerId);
    const source = this.#resolveScopedPath(asset.storagePath);
    const stats = await lstat(source);
    if (stats.isSymbolicLink()) {
      throw new Error('Refusing to remove a symbolic-link guest asset.');
    }
    await unlink(source);
  }

  async cleanup(scope: StorageScope): Promise<void> {
    this.#assertOwner(scope.ownerId);
    if (
      (scope.sessionId && scope.sessionId !== this.#sessionId) ||
      (scope.runId && scope.runId !== this.#runId)
    ) {
      throw new Error('Cleanup scope does not match this guest storage run.');
    }
    await rm(this.#scopeRoot, { recursive: true, force: true });
  }

  #assertOwner(ownerId: string): void {
    if (ownerId !== this.#ownerId) {
      throw new Error('Guest asset owner does not match this storage scope.');
    }
  }

  #resolveScopedPath(relativePath: string): string {
    const candidate = this.#withinRoot(path.resolve(this.#root, relativePath));
    if (candidate !== this.#scopeRoot && !candidate.startsWith(`${this.#scopeRoot}${path.sep}`)) {
      throw new Error('Guest asset path is outside its run-scoped directory.');
    }
    return candidate;
  }

  #withinRoot(candidate: string): string {
    const relative = path.relative(this.#root, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Guest storage path is outside the configured root.');
    }
    return candidate;
  }
}
