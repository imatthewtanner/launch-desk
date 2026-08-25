import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { validateAssetMetadata } from '@/lib/assets/validation';
import { readServerEnv } from '@/lib/config/env';
import { LocalGuestStorage } from '@/lib/storage/local-guest';
import { SupabaseStorage } from '@/lib/storage/supabase-storage';
import type { SignedUpload } from '@/lib/storage/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const SignRequestSchema = z.object({
  launchId: z.string().trim().min(1).max(128),
  filename: z.string().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().nonnegative(),
  guest: z
    .object({
      ownerId: z.string().trim().min(1).max(128),
      sessionId: z.string().trim().min(1).max(128),
      runId: z.string().trim().min(1).max(128),
    })
    .nullable(),
});

interface PendingGuestUpload {
  storage: LocalGuestStorage;
  upload: SignedUpload;
  asset: {
    id: string;
    ownerId: string;
    launchId: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    storagePath: string;
  };
  expiresAt: number;
}

const pendingGuestUploads = new Map<string, PendingGuestUpload>();

function jsonError(message: string, status: number, issues?: unknown) {
  return NextResponse.json(
    { error: message, ...(issues ? { issues } : {}) },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const parsed = SignRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('Asset metadata is invalid.', 422, parsed.error.flatten().fieldErrors);
  }

  let metadata: ReturnType<typeof validateAssetMetadata>;
  try {
    metadata = validateAssetMetadata(parsed.data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Asset metadata is invalid.', 422);
  }

  const env = readServerEnv();
  const assetId = randomUUID();

  if (env.LAUNCH_DESK_GUEST_MODE) {
    if (!parsed.data.guest) {
      return jsonError('Guest upload scope is required.', 401);
    }

    try {
      const storage = new LocalGuestStorage({
        ownerId: parsed.data.guest.ownerId,
        sessionId: parsed.data.guest.sessionId,
        runId: parsed.data.guest.runId,
      });
      const upload = await storage.signUpload({
        ownerId: parsed.data.guest.ownerId,
        launchId: parsed.data.launchId,
        assetId,
        ...metadata,
      });
      const token = upload.token as string;
      const asset = {
        id: assetId,
        ownerId: parsed.data.guest.ownerId,
        launchId: parsed.data.launchId,
        filename: metadata.filename,
        mimeType: metadata.mimeType,
        byteSize: metadata.byteSize,
        storagePath: upload.path,
      };
      pendingGuestUploads.set(token, {
        storage,
        upload,
        asset,
        expiresAt: Date.parse(upload.expiresAt),
      });

      return NextResponse.json(
        {
          mode: 'guest',
          upload: {
            ...upload,
            signedUrl: `/api/assets/sign?token=${encodeURIComponent(token)}`,
          },
          asset,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Could not sign guest upload.', 422);
    }
  }

  if (parsed.data.guest) {
    return jsonError('Guest uploads are disabled in production.', 403);
  }
  if (!z.string().uuid().safeParse(parsed.data.launchId).success) {
    return jsonError('A valid launch ID is required.', 422);
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims.sub;
  if (claimsError || !ownerId) {
    return jsonError('Authentication is required.', 401);
  }

  const { data: launch, error: launchError } = await supabase
    .from('launches')
    .select('id')
    .eq('id', parsed.data.launchId)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (launchError || !launch) {
    return jsonError('Launch not found.', 404);
  }

  const storage = new SupabaseStorage(supabase);
  const uploadInput = {
    ownerId,
    launchId: parsed.data.launchId,
    assetId,
    ...metadata,
  };
  const { error: insertError } = await supabase.from('assets').insert({
    id: assetId,
    launch_id: parsed.data.launchId,
    user_id: ownerId,
    storage_path: `users/${ownerId}/launches/${parsed.data.launchId}/${assetId}/${metadata.filename}`,
    filename: metadata.filename,
    mime_type: metadata.mimeType,
    byte_size: metadata.byteSize,
  });
  if (insertError) {
    return jsonError('Could not create the asset record.', 500);
  }

  try {
    const upload = await storage.signUpload(uploadInput);
    return NextResponse.json(
      {
        mode: 'supabase',
        upload,
        asset: {
          id: assetId,
          filename: metadata.filename,
          mimeType: metadata.mimeType,
          byteSize: metadata.byteSize,
          storagePath: upload.path,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    await supabase.from('assets').delete().eq('id', assetId).eq('user_id', ownerId);
    return jsonError('Could not create a signed upload URL.', 500);
  }
}

export async function PUT(request: NextRequest) {
  const env = readServerEnv();
  if (!env.LAUNCH_DESK_GUEST_MODE) {
    return jsonError('Local guest upload is disabled.', 404);
  }

  const token = new URL(request.url).searchParams.get('token');
  const pending = token ? pendingGuestUploads.get(token) : undefined;
  if (!token || !pending || pending.expiresAt <= Date.now()) {
    if (token) pendingGuestUploads.delete(token);
    return jsonError('Guest upload token is invalid or expired.', 401);
  }

  const contents = new Uint8Array(await request.arrayBuffer());
  if (contents.byteLength !== pending.asset.byteSize) {
    return jsonError('Uploaded byte size does not match the signed metadata.', 422);
  }

  try {
    await pending.storage.write(pending.upload, contents);
    pendingGuestUploads.delete(token);
    return NextResponse.json(
      { asset: pending.asset },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    pendingGuestUploads.delete(token);
    return jsonError('Could not store the guest asset.', 500);
  }
}
