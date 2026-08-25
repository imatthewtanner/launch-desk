import { describe, expect, it } from 'vitest';

import {
  decodeStreamLines,
  encodeStreamEvent,
  LaunchStreamEventSchema,
} from '@/lib/contracts/stream';

const events = [
  {
    type: 'run.started' as const,
    runId: 'run-1',
    sequence: 1,
    timestamp: '2026-08-25T00:00:00.000Z',
  },
  {
    type: 'tool.progress' as const,
    runId: 'run-1',
    sequence: 2,
    timestamp: '2026-08-25T00:00:01.000Z',
    tool: 'check_launch_readiness',
    message: 'Scored 10 readiness categories',
  },
  {
    type: 'text.delta' as const,
    runId: 'run-1',
    sequence: 3,
    timestamp: '2026-08-25T00:00:02.000Z',
    delta: 'Prioritize the staged rollout.',
  },
];

describe('LaunchStreamEventSchema', () => {
  it('recognizes all nine public event types', () => {
    const eventTypes = [
      'run.started',
      'tool.started',
      'tool.progress',
      'tool.completed',
      'text.delta',
      'result.partial',
      'follow_up',
      'run.completed',
      'error',
    ];

    expect(eventTypes).toHaveLength(9);
    expect(LaunchStreamEventSchema.options.map((option) => option.shape.type.value)).toEqual(
      eventTypes,
    );
  });
});

describe('NDJSON stream framing', () => {
  it('encodes and decodes ordered events', () => {
    const encoded = events.map(encodeStreamEvent).join('');
    const decoded = decodeStreamLines(encoded);

    expect(decoded.events).toEqual(events);
    expect(decoded.remainder).toBe('');
  });

  it('rejects duplicate or decreasing sequence numbers in one frame batch', () => {
    const duplicate = [events[0], { ...events[1], sequence: 1 }]
      .map((event) => `${JSON.stringify(event)}\n`)
      .join('');

    expect(() => decodeStreamLines(duplicate)).toThrow(/sequence/i);
  });

  it('preserves an incomplete final line for the next chunk', () => {
    const first = encodeStreamEvent(events[0]);
    const partial = JSON.stringify(events[1]).slice(0, 42);
    const decoded = decodeStreamLines(first + partial);

    expect(decoded.events).toEqual([events[0]]);
    expect(decoded.remainder).toBe(partial);
  });
});
