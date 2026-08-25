export interface SignUploadInput {
  ownerId: string;
  launchId: string;
  assetId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
}

export interface SignedUpload {
  assetId: string;
  path: string;
  signedUrl: string;
  token?: string;
  expiresAt: string;
}

export interface AuthorizedAsset {
  id: string;
  ownerId: string;
  launchId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  byteSize: number;
}

export interface StorageScope {
  ownerId: string;
  launchId?: string;
  sessionId?: string;
  runId?: string;
}

export interface StorageAdapter {
  signUpload(input: SignUploadInput): Promise<SignedUpload>;
  read(asset: AuthorizedAsset): Promise<Uint8Array>;
  remove(asset: AuthorizedAsset): Promise<void>;
  cleanup(scope: StorageScope): Promise<void>;
}

export interface AuthenticatedStoragePathInput {
  userId: string;
  launchId: string;
  assetId: string;
  filename: string;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function validateIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER.test(value) || value.includes('..')) {
    throw new Error('Storage identifiers may contain only letters, numbers, hyphens, and underscores.');
  }
  return value;
}

export function sanitizeStorageFilename(filename: string): string {
  const trimmed = filename.trim().normalize('NFKC');

  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    CONTROL_CHARACTERS.test(trimmed)
  ) {
    throw new Error('Storage filename is empty or unsafe.');
  }

  const sanitized = trimmed
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 255);

  if (!sanitized) {
    throw new Error('Storage filename is empty after sanitization.');
  }

  return sanitized;
}

export function buildAuthenticatedStoragePath({
  userId,
  launchId,
  assetId,
  filename,
}: AuthenticatedStoragePathInput): string {
  return [
    'users',
    validateIdentifier(userId),
    'launches',
    validateIdentifier(launchId),
    validateIdentifier(assetId),
    sanitizeStorageFilename(filename),
  ].join('/');
}

export function storagePathBelongsToUser(path: string, userId: string): boolean {
  validateIdentifier(userId);
  const segments = path.split('/');
  return segments.length >= 6 && segments[0] === 'users' && segments[1] === userId;
}
