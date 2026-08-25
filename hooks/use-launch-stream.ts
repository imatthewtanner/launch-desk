'use client';

import { useCallback, useRef, useState } from 'react';

import type {
  LaunchRequest,
  LaunchResult,
  ResultSectionSchema,
} from '@/lib/contracts/launch';
import {
  decodeStreamLines,
  type LaunchStreamEvent,
  type UsageSummary,
} from '@/lib/contracts/stream';
import type { z } from 'zod';

export interface PlanRequestPayload {
  launchId: string;
  launch: LaunchRequest;
  guest: {
    ownerId: string;
    sessionId: string;
    runId: string;
  } | null;
  parentRunId?: string | null;
  priorResult?: LaunchResult | null;
}

export type LaunchUiStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface ToolActivity {
  id: string;
  tool: string;
  message: string;
  status: 'running' | 'completed';
  sequence: number;
  durationMs?: number;
}

type ResultSection = z.infer<typeof ResultSectionSchema>;
type StreamError = Pick<
  Extract<LaunchStreamEvent, { type: 'error' }>,
  'category' | 'message' | 'retryable' | 'partial'
>;

export interface LaunchStreamState {
  status: LaunchUiStatus;
  runId: string | null;
  lastSequence: number;
  activity: ToolActivity[];
  text: string;
  partials: Partial<Record<ResultSection, unknown>>;
  followUps: Array<Extract<LaunchStreamEvent, { type: 'follow_up' }>['question']>;
  result: LaunchResult | null;
  usage: UsageSummary | null;
  error: StreamError | null;
}

const initialState: LaunchStreamState = {
  status: 'idle',
  runId: null,
  lastSequence: 0,
  activity: [],
  text: '',
  partials: {},
  followUps: [],
  result: null,
  usage: null,
  error: null,
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function upsertActivity(
  activities: ToolActivity[],
  event: Extract<
    LaunchStreamEvent,
    { type: 'tool.started' | 'tool.progress' | 'tool.completed' }
  >,
): ToolActivity[] {
  const matchIndex = [...activities]
    .map((activity, index) => ({ activity, index }))
    .reverse()
    .find(({ activity }) => activity.tool === event.tool && activity.status === 'running')
    ?.index;

  if (event.type === 'tool.started' || matchIndex === undefined) {
    return [
      ...activities,
      {
        id: `${event.tool}-${event.sequence}`,
        tool: event.tool,
        message: event.message,
        status: event.type === 'tool.completed' ? 'completed' : 'running',
        sequence: event.sequence,
        ...(event.type === 'tool.completed' && event.durationMs !== undefined
          ? { durationMs: event.durationMs }
          : {}),
      },
    ];
  }

  return activities.map((activity, index) =>
    index === matchIndex
      ? {
          ...activity,
          message: event.message,
          status: event.type === 'tool.completed' ? 'completed' : 'running',
          ...(event.type === 'tool.completed' && event.durationMs !== undefined
            ? { durationMs: event.durationMs }
            : {}),
        }
      : activity,
  );
}

function reduceEvent(
  state: LaunchStreamState,
  event: LaunchStreamEvent,
): LaunchStreamState {
  const common = {
    runId: event.runId,
    lastSequence: event.sequence,
  };

  switch (event.type) {
    case 'run.started':
      return { ...state, ...common, status: 'streaming' };
    case 'tool.started':
    case 'tool.progress':
    case 'tool.completed':
      return {
        ...state,
        ...common,
        status: 'streaming',
        activity: upsertActivity(state.activity, event),
      };
    case 'text.delta':
      return {
        ...state,
        ...common,
        status: 'streaming',
        text: state.text + event.delta,
      };
    case 'result.partial':
      return {
        ...state,
        ...common,
        partials: { ...state.partials, [event.section]: event.value },
      };
    case 'follow_up':
      return {
        ...state,
        ...common,
        followUps: state.followUps.some((question) => question.id === event.question.id)
          ? state.followUps
          : [...state.followUps, event.question],
      };
    case 'run.completed':
      return {
        ...state,
        ...common,
        status: 'completed',
        result: event.result,
        usage: event.usage ?? null,
        followUps:
          event.result.followUpQuestions.length > 0
            ? event.result.followUpQuestions
            : state.followUps,
        error: null,
      };
    case 'error':
      return {
        ...state,
        ...common,
        status:
          event.category === 'cancelled'
            ? 'cancelled'
            : event.partial
              ? 'partial'
              : 'failed',
        error: {
          category: event.category,
          message: event.message,
          retryable: event.retryable,
          partial: event.partial,
        },
      };
  }
}

function clientError(message: string, category: StreamError['category']): StreamError {
  return { category, message, retryable: category !== 'authentication', partial: false };
}

export function useLaunchStream(
  fetcher: FetchLike = fetch,
  endpoint = '/api/agent/plan',
) {
  const [state, setState] = useState<LaunchStreamState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const start = useCallback(
    async (payload: PlanRequestPayload) => {
      abortRef.current?.abort();
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      const controller = new AbortController();
      abortRef.current = controller;
      let lastSequence = 0;
      let terminal = false;
      setState({ ...initialState, status: 'connecting' });

      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
            category?: StreamError['category'];
          } | null;
          throw Object.assign(new Error(body?.error ?? 'The launch request was rejected.'), {
            category:
              body?.category ?? (response.status === 401 ? 'authentication' : 'validation'),
          });
        }
        if (!response.body) throw new Error('The server returned an empty stream.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const decoded = decodeStreamLines(buffer);
          buffer = decoded.remainder;

          for (const event of decoded.events) {
            if (event.sequence <= lastSequence) continue;
            lastSequence = event.sequence;
            terminal ||= event.type === 'run.completed' || event.type === 'error';
            if (generationRef.current === generation) {
              setState((current) => reduceEvent(current, event));
            }
          }
        }

        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          throw new Error('The server stream ended with an incomplete event.');
        }
        if (!terminal) throw new Error('The server stream ended before completion.');
      } catch (error) {
        if (generationRef.current !== generation) return;
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          setState((current) => ({
            ...current,
            status: 'cancelled',
            error: clientError('The launch-planning run was cancelled.', 'cancelled'),
          }));
          return;
        }

        const category =
          error &&
          typeof error === 'object' &&
          'category' in error &&
          typeof error.category === 'string'
            ? (error.category as StreamError['category'])
            : 'stream';
        setState((current) => ({
          ...current,
          status: current.text ? 'partial' : 'failed',
          error: {
            ...clientError(
              error instanceof Error ? error.message : 'The response stream could not be read.',
              category,
            ),
            partial: current.text.length > 0,
          },
        }));
      } finally {
        if (generationRef.current === generation) abortRef.current = null;
      }
    },
    [endpoint, fetcher],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort(new DOMException('Cancelled by user.', 'AbortError'));
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setState(initialState);
  }, []);

  return { state, start, cancel, reset };
}
