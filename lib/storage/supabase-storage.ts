import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildAuthenticatedStoragePath,
  storagePathBelongsToUser,
  type AuthorizedAsset,
  type SignUploadInput,
  type SignedUpload,
  type StorageAdapter,
  type StorageScope,
} from '@/lib/storage/types';

const SIGNED_UPLOAD_LIFETIME_MS = 2 * 60 * 60_000;

export class SupabaseStorage implements StorageAdapter {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket = 'launch-assets',
  ) {}

  async signUpload(input: SignUploadInput): Promise<SignedUpload> {
    await this.#assertAuthenticatedOwner(input.ownerId);
    const path = buildAuthenticatedStoragePath({
      userId: input.ownerId,
      launchId: input.launchId,
      assetId: input.assetId,
      filename: input.filename,
    });
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(path, { upsert: false });

    if (error) throw new Error(`Could not sign asset upload: ${error.message}`);
    return {
      assetId: input.assetId,
      path: data.path,
      signedUrl: data.signedUrl,
      token: data.token,
      expiresAt: new Date(Date.now() + SIGNED_UPLOAD_LIFETIME_MS).toISOString(),
    };
  }

  async read(asset: AuthorizedAsset): Promise<Uint8Array> {
    await this.#verifyAsset(asset);
    const { data, error } = await this.client.storage.from(this.bucket).download(asset.storagePath);
    if (error) throw new Error(`Could not read asset: ${error.message}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(asset: AuthorizedAsset): Promise<void> {
    await this.#verifyAsset(asset);
    const { error } = await this.client.storage.from(this.bucket).remove([asset.storagePath]);
    if (error) throw new Error(`Could not remove asset: ${error.message}`);
  }

  async cleanup(scope: StorageScope): Promise<void> {
    await this.#assertAuthenticatedOwner(scope.ownerId);
    let query = this.client
      .from('assets')
      .select('id,storage_path')
      .eq('user_id', scope.ownerId);
    if (scope.launchId) query = query.eq('launch_id', scope.launchId);

    const { data, error } = await query;
    if (error) throw new Error(`Could not list assets for cleanup: ${error.message}`);
    const rows = data as Array<{ id: string; storage_path: string }>;
    const paths = rows
      .map((row) => row.storage_path)
      .filter((storagePath) => storagePathBelongsToUser(storagePath, scope.ownerId));

    if (paths.length > 0) {
      const { error: removeError } = await this.client.storage.from(this.bucket).remove(paths);
      if (removeError) throw new Error(`Could not clean up assets: ${removeError.message}`);
      const { error: metadataError } = await this.client
        .from('assets')
        .delete()
        .in(
          'id',
          rows.map((row) => row.id),
        )
        .eq('user_id', scope.ownerId);
      if (metadataError) {
        throw new Error(`Could not clean up asset records: ${metadataError.message}`);
      }
    }
  }

  async #assertAuthenticatedOwner(ownerId: string): Promise<void> {
    const { data, error } = await this.client.auth.getClaims();
    if (error || data?.claims.sub !== ownerId) {
      throw new Error('Authenticated Supabase user does not match the asset owner.');
    }
  }

  async #verifyAsset(asset: AuthorizedAsset): Promise<void> {
    await this.#assertAuthenticatedOwner(asset.ownerId);
    if (!storagePathBelongsToUser(asset.storagePath, asset.ownerId)) {
      throw new Error('Asset storage path does not belong to the authenticated owner.');
    }

    const { data, error } = await this.client
      .from('assets')
      .select('id,user_id,launch_id,storage_path')
      .eq('id', asset.id)
      .eq('user_id', asset.ownerId)
      .eq('launch_id', asset.launchId)
      .eq('storage_path', asset.storagePath)
      .maybeSingle();
    if (error || !data) {
      throw new Error('Asset record is unavailable or not authorized.');
    }
  }
}
