import { describe, expect, it } from 'vitest';

import type { NormalizedAgentEvent } from '@/lib/agent/event-adapter';
import {
  createPlanHandler,
  type CreatePlanHandlerDependencies,
  type RequestActor,
} from '@/lib/server/create-plan-handler';
import type { LaunchResult, ReadinessResult } from '@/lib/contracts/launch';
import { decodeStreamLines, type LaunchStreamEvent } from '@/lib/contracts/stream';
import { InMemoryLaunchRepository } from '@/lib/server/persistence';
import type { StorageAdapter } from '@/lib/storage/types';

function futureDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

const launchRequest = {
  title: 'Atlas launch',
  productBrief: 'Launch a shared delivery reporting workspace.',
  audience: 'Engineering managers',
  launchDate: futureDate(),
  constraints: 'Use a staged rollout.',
  assets: [],
};

const readiness: ReadinessResult = {
  total: 72,
  categories: [],
  blockers: ['Rollout owner is missing.'],
  warnings: [],
  missingDetails: ['Rollout owner'],
};

const result: LaunchResult = {
  summary: 'Atlas is provisionally ready after rollout ownership is confirmed.',
  readiness,
  prioritizedPlan: [],
  riskRegister: [],
  ownerChecklists: [],
  copySuggestions: [],
  followUpQuestions: [],
  assetReferences: [],
  assumptions: ['Dates are interpreted as UTC calendar dates.'],
};

const actor = {
  mode: 'guest',
  ownerId: 'guest-1',
  sessionId: 'session-1',
  uploadRunId: 'upload-1',
} satisfies RequestActor;

const unusedStorage: StorageAdapter = {
  signUpload: async () => {
    throw new Error('not used');
  },
  read: async () => {
    throw new Error('not used');
  },
  remove: async () => undefined,
  cleanup: async () => undefined,
};

async function readEvents(response: Response): Promise<LaunchStreamEvent[]> {
  const body = await response.text();
  const { events, remainder } = decodeStreamLines(body);
  expect(remainder).toBe('');
  return events;
}

async function harness(
  runner: CreatePlanHandlerDependencies['runAgent'],
  overrides: Partial<CreatePlanHandlerDependencies> = {},
) {
  const repository = new InMemoryLaunchRepository();
  const launch = await repository.createLaunch({ ownerId: actor.ownerId, request: launchRequest });
  const dependencies: CreatePlanHandlerDependencies = {
    model: 'gpt-5.6-terra',
    tracingDisabled: true,
    resolveActor: async () => actor,
    getRepository: async () => repository,
    authorizeAssets: async () => [],
    getStorage: async () => unusedStorage,
    checkReadiness: () => readiness,
    runAgent: runner,
    ...overrides,
  };
  const handler = createPlanHandler(dependencies);
  const body = {
    launchId: launch.id,
    launch: launchRequest,
    guest: {
      ownerId: actor.ownerId,
      sessionId: actor.sessionId,
      runId: actor.uploadRunId,
    },
  };

  return { repository, launch, handler, body };
}

async function* successfulRunner(): AsyncGenerator<NormalizedAgentEvent> {
  yield {
    type: 'tool.started',
    tool: 'extract_launch_tasks',
    message: 'Extracting and normalizing launch tasks',
  };
  yield { type: 'text.delta', delta: '{"summary":"Atlas' };
  yield {
    type: 'tool.completed',
    tool: 'extract_launch_tasks',
    message: 'Launch tasks normalized',
    durationMs: 12,
  };
  yield {
    type: 'usage',
    usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
  };
  yield { type: 'result.final', result };
}

describe('createPlanHandler', () => {
  it('streams readiness progress, model text, validated partials, and completion in order', async () => {
    const { handler, body } = await harness(successfulRunner);
    const response = await handler(
      new Request('http://launch-desk.test/api/agent/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const events = await readEvents(response);
    expect(events.slice(0, 4).map(({ type }) => type)).toEqual([
      'run.started',
      'tool.started',
      'tool.progress',
      'tool.completed',
    ]);
    expect(events.some((event) => event.type === 'text.delta' && event.delta.length > 0)).toBe(
      true,
    );
    expect(events.some((event) => event.type === 'result.partial')).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
    });
    expect(events.map(({ sequence }) => sequence)).toEqual(
      events.map((_, index) => index + 1),
    );
  });

  it('rejects invalid input before creating a stream', async () => {
    const { handler } = await harness(successfulRunner);
    const response = await handler(
      new Request('http://launch-desk.test/api/agent/plan', {
        method: 'POST',
        body: JSON.stringify({ launchId: 'launch-1', launch: { title: '' } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toMatchObject({ category: 'validation' });
  });

  it('rejects a request when production authentication is unavailable', async () => {
    const { handler, body } = await harness(successfulRunner, {
      resolveActor: async () => null,
    });
    const response = await handler(
      new Request('http://launch-desk.test/api/agent/plan', {
        method: 'POST',
        body: JSON.stringify({ ...body, guest: null }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ category: 'authentication' });
  });

  it('rejects an asset that is not authorized for the actor and launch', async () => {
    const { handler, body } = await harness(successfulRunner, {
      authorizeAssets: async () => {
        throw Object.assign(new Error('Asset ownership does not match.'), {
          status: 403,
          category: 'validation',
          publicMessage: 'One or more assets are not authorized for this launch.',
        });
      },
    });
    const response = await handler(
      new Request('http://launch-desk.test/api/agent/plan', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      category: 'validation',
      error: 'One or more assets are not authorized for this launch.',
    });
  });

  it.each([
    { label: 'before text', textFirst: false, partial: false },
    { label: 'after text', textFirst: true, partial: true },
  ])('preserves streamed content on an agent error $label', async ({ textFirst, partial }) => {
    async function* failedRunner(): AsyncGenerator<NormalizedAgentEvent> {
      if (textFirst) yield { type: 'text.delta', delta: 'A partial plan' };
      yield {
        type: 'error',
        category: 'network',
        message: 'The model service could not be reached.',
        retryable: true,
      };
    }
    const { handler, body } = await harness(failedRunner);
    const response = await handler(
      new Request('http://launch-desk.test/api/agent/plan', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
    const events = await readEvents(response);

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      category: 'network',
      partial,
    });
    expect(events.some((event) => event.type === 'text.delta')).toBe(textFirst);
  });

  it('rejects a final result that fails the shared schema', async () => {
    async function* invalidRunner(): AsyncGenerator<NormalizedAgentEvent> {
      yield { type: 'result.final', result: { summary: 'Incomplete' } as LaunchResult };
    }
    const { handler, body } = await harness(invalidRunner);
    const response = await handler(
      new Request('http://launch-desk.test/api/agent/plan', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
    const events = await readEvents(response);

    expect(events.at(-1)).toMatchObject({ type: 'error', category: 'schema', partial: false });
  });

  it('propagates request cancellation to the runner', async () => {
    let observedSignal: AbortSignal | undefined;
    async function* cancelledRunner(
      _input: Parameters<CreatePlanHandlerDependencies['runAgent']>[0],
      options: Parameters<CreatePlanHandlerDependencies['runAgent']>[1],
    ): AsyncGenerator<NormalizedAgentEvent> {
      observedSignal = options.signal;
      await new Promise<void>((resolve) => {
        if (options.signal?.aborted) resolve();
        else options.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      yield {
        type: 'error',
        category: 'cancelled',
        message: 'The launch-planning run was cancelled.',
        retryable: true,
      };
    }
    const { handler, body } = await harness(cancelledRunner);
    const controller = new AbortController();
    const response = await handler(
      new Request('http://launch-desk.test/api/agent/plan', {
        method: 'POST',
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
    );
    controller.abort();
    const events = await readEvents(response);

    expect(observedSignal?.aborted).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'error', category: 'cancelled' });
  });
});
