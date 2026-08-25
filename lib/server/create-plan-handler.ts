import { z, ZodError } from 'zod';

import {
  normalizeAgentError,
  type LaunchAgentInput,
  type RunLaunchAgentOptions,
} from '@/lib/agent/run-launch-agent';
import type { NormalizedAgentEvent } from '@/lib/agent/event-adapter';
import { prepareAssetContext } from '@/lib/assets/prepare-context';
import {
  AssetReferenceSchema,
  LaunchRequestSchema,
  LaunchResultSchema,
  type AssetReference,
  type LaunchResult,
  type ReadinessResult,
} from '@/lib/contracts/launch';
import {
  LaunchStreamEventSchema,
  encodeStreamEvent,
  type LaunchStreamEvent,
  type UsageSummary,
} from '@/lib/contracts/stream';
import type { LaunchRepository } from '@/lib/server/persistence';
import type { AuthorizedAsset, StorageAdapter } from '@/lib/storage/types';
import type { ReadinessInput } from '@/lib/tools/types';

const safeIdentifier = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Identifiers contain unsupported characters.');

export const GuestPlanContextSchema = z.object({
  ownerId: safeIdentifier,
  sessionId: safeIdentifier,
  runId: safeIdentifier,
});

export const PlanApiRequestSchema = z.object({
  launchId: safeIdentifier,
  launch: LaunchRequestSchema,
  guest: GuestPlanContextSchema.nullable().default(null),
  parentRunId: safeIdentifier.nullable().optional(),
  priorResult: LaunchResultSchema.nullable().optional(),
});

export type GuestPlanContext = z.infer<typeof GuestPlanContextSchema>;
export type PlanApiRequest = z.infer<typeof PlanApiRequestSchema>;

export type RequestActor =
  | {
      mode: 'guest';
      ownerId: string;
      sessionId: string;
      uploadRunId: string;
    }
  | {
      mode: 'authenticated';
      ownerId: string;
      authContext?: unknown;
    };

export interface CreatePlanHandlerDependencies {
  model: string;
  tracingDisabled: boolean;
  resolveActor(guest: GuestPlanContext | null): Promise<RequestActor | null>;
  getRepository(actor: RequestActor): Promise<LaunchRepository> | LaunchRepository;
  authorizeAssets(
    actor: RequestActor,
    launchId: string,
    assets: AssetReference[],
  ): Promise<AuthorizedAsset[]>;
  getStorage(actor: RequestActor, launchId: string): Promise<StorageAdapter> | StorageAdapter;
  checkReadiness(input: ReadinessInput): ReadinessResult;
  runAgent(
    input: LaunchAgentInput,
    options: RunLaunchAgentOptions,
  ): AsyncIterable<NormalizedAgentEvent>;
  now?: () => Date;
}

type UnstampedEvent<T> = T extends LaunchStreamEvent
  ? Omit<T, 'runId' | 'sequence' | 'timestamp'>
  : never;
type StreamEventInput = UnstampedEvent<LaunchStreamEvent>;

interface PublicRequestError {
  status: number;
  category: Extract<LaunchStreamEvent, { type: 'error' }>['category'];
  publicMessage: string;
}

function isPublicRequestError(error: unknown): error is PublicRequestError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      typeof error.status === 'number' &&
      'category' in error &&
      typeof error.category === 'string' &&
      'publicMessage' in error &&
      typeof error.publicMessage === 'string',
  );
}

function jsonError(
  error: string,
  status: number,
  category: PublicRequestError['category'],
  issues?: unknown,
): Response {
  return Response.json(
    { category, error, ...(issues ? { issues } : {}) },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function readinessInput(body: PlanApiRequest): ReadinessInput {
  return {
    productBrief: body.launch.productBrief,
    audience: body.launch.audience,
    launchDate: body.launch.launchDate,
    rollout: null,
    observability: null,
    support: null,
    security: null,
    communications: null,
    rollback: null,
    assets: body.launch.assets.map((asset) => asset.filename),
  };
}

function createEventWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  runId: string,
  now: () => Date,
) {
  const encoder = new TextEncoder();
  let sequence = 0;

  return (input: StreamEventInput): LaunchStreamEvent => {
    const event = LaunchStreamEventSchema.parse({
      ...input,
      runId,
      sequence: (sequence += 1),
      timestamp: now().toISOString(),
    });
    controller.enqueue(encoder.encode(encodeStreamEvent(event)));
    return event;
  };
}

const EMPTY_USAGE: UsageSummary = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

function partialSections(result: LaunchResult): StreamEventInput[] {
  return [
    { type: 'result.partial', section: 'summary', value: result.summary },
    { type: 'result.partial', section: 'readiness', value: result.readiness },
    { type: 'result.partial', section: 'plan', value: result.prioritizedPlan },
    { type: 'result.partial', section: 'risks', value: result.riskRegister },
    { type: 'result.partial', section: 'owners', value: result.ownerChecklists },
    { type: 'result.partial', section: 'copy', value: result.copySuggestions },
    { type: 'result.partial', section: 'assets', value: result.assetReferences },
  ];
}

async function safelyFailRun(
  repository: LaunchRepository,
  runId: string,
  error: Extract<LaunchStreamEvent, { type: 'error' }>,
): Promise<void> {
  try {
    await repository.failRun(runId, {
      category: error.category,
      message: error.message,
      retryable: error.retryable,
      partial: error.partial,
    });
  } catch {
    // The stream still reports the original safe error when persistence is unavailable.
  }
}

export function createPlanHandler(dependencies: CreatePlanHandlerDependencies) {
  return async function handlePlanRequest(request: Request): Promise<Response> {
    const rawBody = await request.json().catch(() => null);
    const parsed = PlanApiRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(
        'The launch request is invalid.',
        422,
        'validation',
        parsed.error.flatten().fieldErrors,
      );
    }

    let actor: RequestActor | null;
    try {
      actor = await dependencies.resolveActor(parsed.data.guest);
    } catch {
      actor = null;
    }
    if (!actor) {
      return jsonError('Authentication is required.', 401, 'authentication');
    }

    let repository: LaunchRepository;
    let authorizedAssets: AuthorizedAsset[];
    let runId: string;
    try {
      repository = await dependencies.getRepository(actor);
      authorizedAssets = await dependencies.authorizeAssets(
        actor,
        parsed.data.launchId,
        parsed.data.launch.assets.map((asset) => AssetReferenceSchema.parse(asset)),
      );
      const run = await repository.startRun({
        ownerId: actor.ownerId,
        launchId: parsed.data.launchId,
        parentRunId: parsed.data.parentRunId,
        model: dependencies.model,
      });
      runId = run.id;
    } catch (error) {
      if (isPublicRequestError(error)) {
        return jsonError(error.publicMessage, error.status, error.category);
      }
      return jsonError(
        'The launch could not be opened for this user.',
        404,
        'validation',
      );
    }

    const runAbort = new AbortController();
    const forwardAbort = () => runAbort.abort(request.signal.reason);
    if (request.signal.aborted) forwardAbort();
    else request.signal.addEventListener('abort', forwardAbort, { once: true });

    let consumerCancelled = false;
    const now = dependencies.now ?? (() => new Date());
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = createEventWriter(controller, runId, now);

        void (async () => {
          let textEmitted = false;
          let terminalEventEmitted = false;
          let usage: UsageSummary = EMPTY_USAGE;

          try {
            write({ type: 'run.started' });

            const readinessStartedAt = Date.now();
            write({
              type: 'tool.started',
              tool: 'check_launch_readiness',
              message: 'Checking launch readiness evidence',
            });
            write({
              type: 'tool.progress',
              tool: 'check_launch_readiness',
              message: 'Scoring the launch against the 100-point readiness rubric',
            });
            const readiness = dependencies.checkReadiness(readinessInput(parsed.data));
            write({
              type: 'tool.completed',
              tool: 'check_launch_readiness',
              message: 'Launch readiness checked',
              durationMs: Math.max(0, Date.now() - readinessStartedAt),
            });

            const storage = await dependencies.getStorage(actor, parsed.data.launchId);
            const assets = await prepareAssetContext(authorizedAssets, storage);

            for await (const agentEvent of dependencies.runAgent(
              {
                request: parsed.data.launch,
                readiness,
                assets,
                priorResult: parsed.data.priorResult,
              },
              {
                runId,
                launchId: parsed.data.launchId,
                actorId: actor.ownerId,
                model: dependencies.model,
                signal: runAbort.signal,
                tracingDisabled: dependencies.tracingDisabled,
              },
            )) {
              switch (agentEvent.type) {
                case 'tool.started':
                  write({
                    type: 'tool.started',
                    tool: agentEvent.tool,
                    message: agentEvent.message,
                  });
                  break;
                case 'tool.completed':
                  write({
                    type: 'tool.completed',
                    tool: agentEvent.tool,
                    message: agentEvent.message,
                    durationMs: agentEvent.durationMs,
                  });
                  break;
                case 'text.delta':
                  if (agentEvent.delta.length > 0) {
                    textEmitted = true;
                    write({ type: 'text.delta', delta: agentEvent.delta });
                  }
                  break;
                case 'usage':
                  usage = agentEvent.usage;
                  break;
                case 'agent.updated':
                  break;
                case 'error': {
                  const streamError: Extract<LaunchStreamEvent, { type: 'error' }> = {
                    type: 'error',
                    runId,
                    sequence: 1,
                    timestamp: now().toISOString(),
                    category: agentEvent.category,
                    message: agentEvent.message,
                    retryable: agentEvent.retryable,
                    partial: textEmitted,
                  };
                  await safelyFailRun(repository, runId, streamError);
                  write({
                    type: 'error',
                    category: streamError.category,
                    message: streamError.message,
                    retryable: streamError.retryable,
                    partial: streamError.partial,
                  });
                  terminalEventEmitted = true;
                  break;
                }
                case 'result.final': {
                  const finalResult = LaunchResultSchema.parse({
                    ...agentEvent.result,
                    readiness,
                    assetReferences: assets.references,
                  });
                  for (const partial of partialSections(finalResult)) write(partial);
                  for (const question of finalResult.followUpQuestions) {
                    write({ type: 'follow_up', question });
                  }
                  await repository.completeRun(runId, finalResult, usage);
                  write({ type: 'run.completed', result: finalResult, usage });
                  terminalEventEmitted = true;
                  break;
                }
              }

              if (terminalEventEmitted) break;
            }

            if (!terminalEventEmitted) {
              throw new Error('The agent stream ended before a final result.');
            }
          } catch (error) {
            if (!terminalEventEmitted && !consumerCancelled) {
              const normalized =
                error instanceof ZodError
                  ? {
                      category: 'schema' as const,
                      message: 'The agent returned an invalid launch plan. Please retry.',
                      retryable: true,
                    }
                  : normalizeAgentError(error, runAbort.signal);
              const streamError: Extract<LaunchStreamEvent, { type: 'error' }> = {
                type: 'error',
                runId,
                sequence: 1,
                timestamp: now().toISOString(),
                ...normalized,
                partial: textEmitted,
              };
              await safelyFailRun(repository, runId, streamError);
              write({
                type: 'error',
                category: streamError.category,
                message: streamError.message,
                retryable: streamError.retryable,
                partial: streamError.partial,
              });
            }
          } finally {
            request.signal.removeEventListener('abort', forwardAbort);
            if (!consumerCancelled) controller.close();
          }
        })();
      },
      cancel() {
        consumerCancelled = true;
        runAbort.abort(new DOMException('Response stream cancelled.', 'AbortError'));
        request.signal.removeEventListener('abort', forwardAbort);
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
  };
}
