import type { RunStreamEvent } from '@openai/agents';

import type { LaunchResult } from '@/lib/contracts/launch';
import type { LaunchStreamEvent } from '@/lib/contracts/stream';

export const REGISTERED_TOOL_NAMES = [
  'extract_launch_tasks',
  'check_launch_readiness',
  'generate_owner_checklists',
  'draft_channel_copy',
] as const;

export type RegisteredToolName = (typeof REGISTERED_TOOL_NAMES)[number];
export type SafeToolName = RegisteredToolName | 'unknown_tool';
export type AgentErrorCategory = Extract<
  LaunchStreamEvent,
  { type: 'error' }
>['category'];

export type NormalizedAgentEvent =
  | { type: 'tool.started'; tool: SafeToolName; message: string }
  | {
      type: 'tool.completed';
      tool: SafeToolName;
      message: string;
      durationMs?: number;
    }
  | { type: 'text.delta'; delta: string }
  | { type: 'agent.updated'; agent: string }
  | {
      type: 'usage';
      usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    }
  | {
      type: 'error';
      category: AgentErrorCategory;
      message: string;
      retryable: boolean;
    }
  | { type: 'result.final'; result: LaunchResult };

export interface SdkErrorEvent {
  type: 'sdk_error';
  category: AgentErrorCategory;
  message: string;
  retryable: boolean;
  cause?: unknown;
}

const START_MESSAGES: Record<RegisteredToolName, string> = {
  extract_launch_tasks: 'Extracting and normalizing launch tasks',
  check_launch_readiness: 'Checking launch readiness evidence',
  generate_owner_checklists: 'Generating owner checklists',
  draft_channel_copy: 'Drafting channel-specific launch copy',
};

const COMPLETE_MESSAGES: Record<RegisteredToolName, string> = {
  extract_launch_tasks: 'Launch tasks normalized',
  check_launch_readiness: 'Launch readiness checked',
  generate_owner_checklists: 'Owner checklists generated',
  draft_channel_copy: 'Channel-specific launch copy drafted',
};

function safeToolName(value: unknown): SafeToolName {
  return typeof value === 'string' &&
    (REGISTERED_TOOL_NAMES as readonly string[]).includes(value)
    ? (value as RegisteredToolName)
    : 'unknown_tool';
}

function rawToolName(event: Extract<RunStreamEvent, { type: 'run_item_stream_event' }>): unknown {
  const rawItem = event.item.rawItem;
  return rawItem && 'name' in rawItem ? rawItem.name : undefined;
}

function toolEvent(
  phase: 'started' | 'completed',
  rawName: unknown,
): NormalizedAgentEvent {
  const tool = safeToolName(rawName);
  const message =
    tool === 'unknown_tool'
      ? phase === 'started'
        ? 'Planning tool started'
        : 'Planning tool completed'
      : phase === 'started'
        ? START_MESSAGES[tool]
        : COMPLETE_MESSAGES[tool];

  return { type: `tool.${phase}`, tool, message } as NormalizedAgentEvent;
}

export function adaptSdkEvent(
  event: RunStreamEvent | SdkErrorEvent,
): NormalizedAgentEvent[] {
  switch (event.type) {
    case 'sdk_error':
      return [
        {
          type: 'error',
          category: event.category,
          message: event.message,
          retryable: event.retryable,
        },
      ];

    case 'raw_model_stream_event': {
      switch (event.data.type) {
        case 'output_text_delta':
          return event.data.delta.length > 0
            ? [{ type: 'text.delta', delta: event.data.delta }]
            : [];
        case 'response_done':
          return [
            {
              type: 'usage',
              usage: {
                inputTokens: event.data.response.usage.inputTokens,
                outputTokens: event.data.response.usage.outputTokens,
                totalTokens: event.data.response.usage.totalTokens,
              },
            },
          ];
        case 'response_started':
        case 'model':
          return [];
      }
    }

    case 'run_item_stream_event':
      switch (event.name) {
        case 'tool_called':
          return [toolEvent('started', rawToolName(event))];
        case 'tool_output':
          return [toolEvent('completed', rawToolName(event))];
        case 'message_output_created':
        case 'handoff_requested':
        case 'handoff_occurred':
        case 'tool_search_called':
        case 'tool_search_output_created':
        case 'reasoning_item_created':
        case 'compaction_item_created':
        case 'tool_approval_requested':
          return [];
      }

    case 'agent_updated_stream_event':
      return [
        {
          type: 'agent.updated',
          agent: event.agent.name.slice(0, 120),
        },
      ];
  }
}
