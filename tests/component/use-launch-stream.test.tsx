import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useLaunchStream, type PlanRequestPayload } from '@/hooks/use-launch-stream';
import type { LaunchResult } from '@/lib/contracts/launch';
import { encodeStreamEvent, type LaunchStreamEvent } from '@/lib/contracts/stream';

const timestamp = '2026-08-25T12:00:00.000Z';

const result: LaunchResult = {
  summary: 'Atlas can proceed after rollout ownership is confirmed.',
  readiness: {
    total: 72,
    categories: [],
    blockers: [],
    warnings: [],
    missingDetails: [],
  },
  prioritizedPlan: [],
  riskRegister: [],
  ownerChecklists: [],
  copySuggestions: [],
  followUpQuestions: [],
  assetReferences: [],
  assumptions: [],
};

const payload: PlanRequestPayload = {
  launchId: 'launch-1',
  launch: {
    title: 'Atlas',
    productBrief: 'Launch Atlas reporting.',
    audience: 'Engineering managers',
    launchDate: '2026-10-15',
    constraints: 'Staged rollout.',
    assets: [],
  },
  guest: { ownerId: 'guest-1', sessionId: 'session-1', runId: 'upload-1' },
};

type UnstampedEvent<T> = T extends LaunchStreamEvent
  ? Omit<T, 'runId' | 'timestamp'>
  : never;

function event(value: UnstampedEvent<LaunchStreamEvent>): LaunchStreamEvent {
  return { ...value, runId: 'run-1', timestamp } as LaunchStreamEvent;
}

function chunkedResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
  );
}

describe('useLaunchStream', () => {
  it('parses split chunks, reduces progress, text, partials, follow-ups, and completion', async () => {
    const question = {
      id: 'q-1',
      question: 'Who owns the staged rollout decision?',
      rationale: 'Ownership changes the critical path.',
      affectedSections: ['plan', 'risks'] as Array<'plan' | 'risks'>,
    };
    const events = [
      event({ type: 'run.started', sequence: 1 }),
      event({
        type: 'tool.started',
        sequence: 2,
        tool: 'check_launch_readiness',
        message: 'Checking launch readiness evidence',
      }),
      event({
        type: 'tool.progress',
        sequence: 3,
        tool: 'check_launch_readiness',
        message: 'Scoring the readiness rubric',
      }),
      event({
        type: 'tool.completed',
        sequence: 4,
        tool: 'check_launch_readiness',
        message: 'Launch readiness checked',
        durationMs: 8,
      }),
      event({ type: 'text.delta', sequence: 5, delta: 'Prioritize ' }),
      event({ type: 'text.delta', sequence: 6, delta: 'the rollout.' }),
      event({
        type: 'result.partial',
        sequence: 7,
        section: 'summary',
        value: result.summary,
      }),
      event({ type: 'follow_up', sequence: 8, question }),
      event({
        type: 'run.completed',
        sequence: 9,
        result,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    ];
    const wire = events.map(encodeStreamEvent).join('');
    const splitAt = wire.indexOf('Checking launch') + 8;
    const fetcher = vi.fn(async () =>
      chunkedResponse([wire.slice(0, splitAt), wire.slice(splitAt)]),
    );
    const { result: hook } = renderHook(() => useLaunchStream(fetcher));

    await act(async () => hook.current.start(payload));

    expect(hook.current.state.status).toBe('completed');
    expect(hook.current.state.text).toBe('Prioritize the rollout.');
    expect(hook.current.state.activity).toEqual([
      expect.objectContaining({
        tool: 'check_launch_readiness',
        status: 'completed',
        message: 'Launch readiness checked',
        durationMs: 8,
      }),
    ]);
    expect(hook.current.state.partials.summary).toBe(result.summary);
    expect(hook.current.state.followUps).toEqual([question]);
    expect(hook.current.state.result).toEqual(result);
    expect(hook.current.state.usage?.totalTokens).toBe(150);
  });

  it('posts to an explicitly configured stream endpoint', async () => {
    const completed = encodeStreamEvent(
      event({ type: 'run.completed', sequence: 1, result }),
    );
    const fetcher = vi.fn(async () => chunkedResponse([completed]));
    const { result: hook } = renderHook(() =>
      useLaunchStream(fetcher, '/api/test/agent-stream'),
    );

    await act(async () => hook.current.start(payload));

    expect(fetcher).toHaveBeenCalledWith(
      '/api/test/agent-stream',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('ignores a duplicate sequence received in a later chunk', async () => {
    const started = encodeStreamEvent(event({ type: 'run.started', sequence: 1 }));
    const first = encodeStreamEvent(event({ type: 'text.delta', sequence: 2, delta: 'Once' }));
    const duplicate = encodeStreamEvent(
      event({ type: 'text.delta', sequence: 2, delta: ' twice' }),
    );
    const completed = encodeStreamEvent(
      event({ type: 'run.completed', sequence: 3, result }),
    );
    const fetcher = vi.fn(async () =>
      chunkedResponse([started + first, duplicate, completed]),
    );
    const { result: hook } = renderHook(() => useLaunchStream(fetcher));

    await act(async () => hook.current.start(payload));
    expect(hook.current.state.text).toBe('Once');
  });

  it('preserves prior text when a late streamed error arrives', async () => {
    const wire = [
      event({ type: 'run.started', sequence: 1 }),
      event({ type: 'text.delta', sequence: 2, delta: 'A useful partial plan.' }),
      event({
        type: 'error',
        sequence: 3,
        category: 'network',
        message: 'The model service could not be reached.',
        retryable: true,
        partial: true,
      }),
    ]
      .map(encodeStreamEvent)
      .join('');
    const { result: hook } = renderHook(() =>
      useLaunchStream(async () => chunkedResponse([wire])),
    );

    await act(async () => hook.current.start(payload));

    expect(hook.current.state.status).toBe('partial');
    expect(hook.current.state.text).toBe('A useful partial plan.');
    expect(hook.current.state.error?.category).toBe('network');
  });

  it('aborts an active request and exposes a cancelled state', async () => {
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const { result: hook } = renderHook(() => useLaunchStream(fetcher));

    act(() => {
      void hook.current.start(payload);
    });
    await waitFor(() => expect(hook.current.state.status).toBe('connecting'));
    act(() => hook.current.cancel());
    await waitFor(() => expect(hook.current.state.status).toBe('cancelled'));
  });

  it('preserves the prior result when a refinement run is cancelled', async () => {
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const { result: hook } = renderHook(() => useLaunchStream(fetcher));

    act(() => {
      void hook.current.start({
        ...payload,
        parentRunId: 'run-1',
        priorResult: result,
      });
    });

    await waitFor(() => expect(hook.current.state.result).toEqual(result));
    act(() => hook.current.cancel());
    await waitFor(() => expect(hook.current.state.status).toBe('cancelled'));
    expect(hook.current.state.result).toEqual(result);
  });
});
