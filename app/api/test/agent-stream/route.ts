import { z } from 'zod';

import { LaunchRequestSchema } from '@/lib/contracts/launch';
import { encodeStreamEvent } from '@/lib/contracts/stream';
import {
  createFixtureLaunchResult,
  createFixtureStreamEvents,
} from '@/lib/testing/launch-stream-fixture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FixtureRequestSchema = z.object({
  launchId: z.string().trim().min(1).max(128),
  launch: LaunchRequestSchema,
  parentRunId: z.string().trim().min(1).max(128).nullable().optional(),
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function POST(request: Request): Promise<Response> {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENABLE_TEST_STREAM_FIXTURE !== 'true'
  ) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  const parsed = FixtureRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'The fixture request is invalid.' }, { status: 422 });
  }

  const refinement = Boolean(parsed.data.parentRunId);
  const runId = refinement ? 'fixture-refinement-run' : 'fixture-initial-run';
  const result = createFixtureLaunchResult(parsed.data.launch.assets);
  const events = createFixtureStreamEvents({ runId, result, refinement });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const event of events) {
          if (request.signal.aborted) return;
          controller.enqueue(encoder.encode(encodeStreamEvent(event)));
          await delay(refinement ? 160 : 90);
        }

        if (refinement) {
          await delay(5_000);
          if (request.signal.aborted) return;
          controller.enqueue(
            encoder.encode(
              encodeStreamEvent({
                type: 'run.completed',
                runId,
                sequence: 5,
                timestamp: new Date().toISOString(),
                result,
              }),
            ),
          );
        }
        controller.close();
      } catch {
        try {
          controller.close();
        } catch {
          // The client may have cancelled while the fixture was awaiting its next event.
        }
      }
    },
    cancel() {
      // Cancelling the response is the expected path for the refinement e2e scenario.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
