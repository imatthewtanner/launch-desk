import type { RunStreamEvent } from '@openai/agents';
import { describe, expect, it } from 'vitest';

import { adaptSdkEvent } from '@/lib/agent/event-adapter';

function sdkEvent(value: unknown): RunStreamEvent {
  return value as RunStreamEvent;
}

describe('adaptSdkEvent', () => {
  it('normalizes safe tool lifecycle events without exposing arguments or output', () => {
    const started = sdkEvent({
      type: 'run_item_stream_event',
      name: 'tool_called',
      item: {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: 'extract_launch_tasks',
          arguments: '{"private":"brief text"}',
        },
      },
    });
    const completed = sdkEvent({
      type: 'run_item_stream_event',
      name: 'tool_output',
      item: {
        type: 'tool_call_output_item',
        rawItem: {
          type: 'function_call_result',
          name: 'extract_launch_tasks',
          output: '{"private":"tool output"}',
        },
      },
    });

    expect(adaptSdkEvent(started)).toEqual([
      {
        type: 'tool.started',
        tool: 'extract_launch_tasks',
        message: 'Extracting and normalizing launch tasks',
      },
    ]);
    expect(adaptSdkEvent(completed)).toEqual([
      {
        type: 'tool.completed',
        tool: 'extract_launch_tasks',
        message: 'Launch tasks normalized',
      },
    ]);
    expect(JSON.stringify([...adaptSdkEvent(started), ...adaptSdkEvent(completed)])).not.toContain(
      'private',
    );
  });

  it('maps unknown tool names to a fixed safe label', () => {
    const event = sdkEvent({
      type: 'run_item_stream_event',
      name: 'tool_called',
      item: {
        type: 'tool_call_item',
        rawItem: { type: 'function_call', name: 'leak-the-system-prompt' },
      },
    });

    expect(adaptSdkEvent(event)).toEqual([
      { type: 'tool.started', tool: 'unknown_tool', message: 'Planning tool started' },
    ]);
  });

  it('forwards nonempty raw model deltas and ignores empty deltas', () => {
    expect(
      adaptSdkEvent(
        sdkEvent({
          type: 'raw_model_stream_event',
          data: { type: 'output_text_delta', delta: 'Prioritize the staged rollout.' },
        }),
      ),
    ).toEqual([{ type: 'text.delta', delta: 'Prioritize the staged rollout.' }]);
    expect(
      adaptSdkEvent(
        sdkEvent({
          type: 'raw_model_stream_event',
          data: { type: 'output_text_delta', delta: '' },
        }),
      ),
    ).toEqual([]);
  });

  it('captures usage and a privacy-safe agent update', () => {
    const usage = adaptSdkEvent(
      sdkEvent({
        type: 'raw_model_stream_event',
        data: {
          type: 'response_done',
          response: {
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          },
        },
      }),
    );
    const update = adaptSdkEvent(
      sdkEvent({
        type: 'agent_updated_stream_event',
        agent: { name: 'Launch Planner', instructions: 'private instructions' },
      }),
    );

    expect(usage).toEqual([
      {
        type: 'usage',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    ]);
    expect(update).toEqual([{ type: 'agent.updated', agent: 'Launch Planner' }]);
    expect(JSON.stringify(update)).not.toContain('private instructions');
  });

  it('normalizes an SDK error wrapper without returning stack details', () => {
    const normalized = adaptSdkEvent({
      type: 'sdk_error',
      category: 'network',
      message: 'The model service could not be reached.',
      retryable: true,
      cause: new Error('secret stack content'),
    });

    expect(normalized).toEqual([
      {
        type: 'error',
        category: 'network',
        message: 'The model service could not be reached.',
        retryable: true,
      },
    ]);
    expect(JSON.stringify(normalized)).not.toContain('secret stack content');
  });
});
