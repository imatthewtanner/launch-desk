import { z } from 'zod';

import {
  FollowUpQuestionSchema,
  LaunchResultSchema,
  ResultSectionSchema,
} from '@/lib/contracts/launch';

const commonFields = {
  runId: z.string().trim().min(1).max(128),
  sequence: z.number().int().positive(),
  timestamp: z.string().datetime({ offset: true }),
};

const toolFields = {
  tool: z.string().trim().min(1).max(128),
  message: z.string().trim().min(1).max(500),
};

export const UsageSummarySchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
});

export const LaunchStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run.started'), ...commonFields }),
  z.object({ type: z.literal('tool.started'), ...commonFields, ...toolFields }),
  z.object({ type: z.literal('tool.progress'), ...commonFields, ...toolFields }),
  z.object({
    type: z.literal('tool.completed'),
    ...commonFields,
    ...toolFields,
    durationMs: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('text.delta'),
    ...commonFields,
    delta: z.string().min(1),
  }),
  z.object({
    type: z.literal('result.partial'),
    ...commonFields,
    section: ResultSectionSchema,
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('follow_up'),
    ...commonFields,
    question: FollowUpQuestionSchema,
  }),
  z.object({
    type: z.literal('run.completed'),
    ...commonFields,
    result: LaunchResultSchema,
    usage: UsageSummarySchema.optional(),
  }),
  z.object({
    type: z.literal('error'),
    ...commonFields,
    category: z.enum([
      'authentication',
      'model_unavailable',
      'rate_limit',
      'network',
      'timeout',
      'tool',
      'stream',
      'schema',
      'validation',
      'cancelled',
      'unknown',
    ]),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean(),
    partial: z.boolean().default(false),
  }),
]);

export type LaunchStreamEvent = z.infer<typeof LaunchStreamEventSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

export function encodeStreamEvent(event: LaunchStreamEvent): string {
  return `${JSON.stringify(LaunchStreamEventSchema.parse(event))}\n`;
}

export function decodeStreamLines(buffer: string): {
  events: LaunchStreamEvent[];
  remainder: string;
} {
  const lastNewline = buffer.lastIndexOf('\n');

  if (lastNewline === -1) {
    return { events: [], remainder: buffer };
  }

  const complete = buffer.slice(0, lastNewline + 1);
  const remainder = buffer.slice(lastNewline + 1);
  const events = complete
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => LaunchStreamEventSchema.parse(JSON.parse(line)));

  for (let index = 1; index < events.length; index += 1) {
    if (events[index].sequence <= events[index - 1].sequence) {
      throw new Error('Stream event sequence numbers must increase monotonically.');
    }
  }

  return { events, remainder };
}
