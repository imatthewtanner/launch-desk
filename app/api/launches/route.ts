import { z } from 'zod';

import { readServerEnv } from '@/lib/config/env';
import { LaunchRequestSchema } from '@/lib/contracts/launch';
import { GuestPlanContextSchema } from '@/lib/server/create-plan-handler';
import {
  getRuntimeRepository,
  resolveRuntimeActor,
} from '@/lib/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateLaunchBodySchema = z.object({
  launch: LaunchRequestSchema,
  guest: GuestPlanContextSchema.nullable().default(null),
});

function responseError(error: string, status: number, issues?: unknown): Response {
  return Response.json(
    { error, ...(issues ? { issues } : {}) },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const parsed = CreateLaunchBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return responseError('The launch request is invalid.', 422, parsed.error.flatten().fieldErrors);
  }

  const env = readServerEnv();
  const actor = await resolveRuntimeActor(parsed.data.guest, env).catch(() => null);
  if (!actor) return responseError('Authentication is required.', 401);

  try {
    const repository = getRuntimeRepository(actor);
    const launch = await repository.createLaunch({
      ownerId: actor.ownerId,
      request: parsed.data.launch,
    });
    return Response.json(
      { launch },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return responseError('The launch could not be created.', 500);
  }
}

export async function GET(request: Request): Promise<Response> {
  const env = readServerEnv();
  const url = new URL(request.url);
  const guest = env.LAUNCH_DESK_GUEST_MODE
    ? GuestPlanContextSchema.safeParse({
        ownerId: url.searchParams.get('ownerId'),
        sessionId: url.searchParams.get('sessionId'),
        runId: url.searchParams.get('runId'),
      })
    : null;
  if (guest && !guest.success) {
    return responseError('Guest workspace identifiers are invalid.', 422);
  }

  const actor = await resolveRuntimeActor(guest?.data ?? null, env).catch(() => null);
  if (!actor) return responseError('Authentication is required.', 401);

  try {
    const repository = getRuntimeRepository(actor);
    const launches = await repository.listLaunches(actor.ownerId);
    return Response.json(
      { launches },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return responseError('Launches could not be listed.', 500);
  }
}
