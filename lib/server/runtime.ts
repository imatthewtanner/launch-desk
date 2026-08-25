import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServerEnv } from '@/lib/config/env';
import type {
  GuestPlanContext,
  RequestActor,
} from '@/lib/server/create-plan-handler';
import {
  InMemoryLaunchRepository,
  SupabaseLaunchRepository,
  type LaunchRepository,
} from '@/lib/server/persistence';
import { LocalGuestStorage } from '@/lib/storage/local-guest';
import { SupabaseStorage } from '@/lib/storage/supabase-storage';
import type {
  AuthorizedAsset,
  StorageAdapter,
} from '@/lib/storage/types';
import type { AssetReference } from '@/lib/contracts/launch';

export const guestLaunchRepository = new InMemoryLaunchRepository();

function authenticatedClient(actor: RequestActor): SupabaseClient {
  if (actor.mode !== 'authenticated' || !actor.authContext) {
    throw new Error('An authenticated Supabase client is required.');
  }
  return actor.authContext as SupabaseClient;
}

function accessError(
  publicMessage: string,
  status: number,
  category: 'validation' | 'unknown' = 'validation',
): Error {
  return Object.assign(new Error(publicMessage), {
    status,
    category,
    publicMessage,
  });
}

export async function resolveRuntimeActor(
  guest: GuestPlanContext | null,
  env: ServerEnv,
): Promise<RequestActor | null> {
  if (env.LAUNCH_DESK_GUEST_MODE) {
    if (!guest) return null;
    return {
      mode: 'guest',
      ownerId: guest.ownerId,
      sessionId: guest.sessionId,
      uploadRunId: guest.runId,
    };
  }

  if (guest) return null;
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  const ownerId = data?.claims.sub;
  if (error || !ownerId) return null;
  return { mode: 'authenticated', ownerId, authContext: client };
}

export function getRuntimeRepository(actor: RequestActor): LaunchRepository {
  return actor.mode === 'guest'
    ? guestLaunchRepository
    : new SupabaseLaunchRepository(authenticatedClient(actor));
}

function guestAsset(
  actor: Extract<RequestActor, { mode: 'guest' }>,
  launchId: string,
  reference: AssetReference,
): AuthorizedAsset {
  const expectedPrefix = `${actor.sessionId}/${actor.uploadRunId}/`;
  if (!reference.storagePath.startsWith(expectedPrefix)) {
    throw accessError('One or more assets are not authorized for this launch.', 403);
  }

  return {
    id: reference.id,
    ownerId: actor.ownerId,
    launchId,
    filename: reference.filename,
    mimeType: reference.mimeType,
    byteSize: reference.byteSize,
    storagePath: reference.storagePath,
  };
}

interface AssetRow {
  id: string;
  user_id: string;
  launch_id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  byte_size: number;
}

function rowMatchesReference(row: AssetRow, reference: AssetReference): boolean {
  return (
    row.id === reference.id &&
    row.storage_path === reference.storagePath &&
    row.filename === reference.filename &&
    row.mime_type === reference.mimeType &&
    Number(row.byte_size) === reference.byteSize
  );
}

export async function authorizeRuntimeAssets(
  actor: RequestActor,
  launchId: string,
  references: AssetReference[],
): Promise<AuthorizedAsset[]> {
  if (references.length === 0) return [];
  if (actor.mode === 'guest') {
    return references.map((reference) => guestAsset(actor, launchId, reference));
  }

  const client = authenticatedClient(actor);
  const { data, error } = await client
    .from('assets')
    .select('id,user_id,launch_id,storage_path,filename,mime_type,byte_size')
    .eq('user_id', actor.ownerId)
    .eq('launch_id', launchId)
    .in(
      'id',
      references.map((reference) => reference.id),
    );
  if (error) {
    throw accessError('Launch assets could not be authorized.', 500, 'unknown');
  }

  const rows = data as AssetRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (
    rows.length !== references.length ||
    references.some((reference) => {
      const row = byId.get(reference.id);
      return !row || !rowMatchesReference(row, reference);
    })
  ) {
    throw accessError('One or more assets are not authorized for this launch.', 403);
  }

  return rows.map((row) => ({
    id: row.id,
    ownerId: row.user_id,
    launchId: row.launch_id,
    storagePath: row.storage_path,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
  }));
}

export function getRuntimeStorage(actor: RequestActor): StorageAdapter {
  if (actor.mode === 'guest') {
    return new LocalGuestStorage({
      ownerId: actor.ownerId,
      sessionId: actor.sessionId,
      runId: actor.uploadRunId,
    });
  }
  return new SupabaseStorage(authenticatedClient(actor));
}
