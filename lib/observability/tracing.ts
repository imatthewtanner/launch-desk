import type { RunConfig } from '@openai/agents';

import { LAUNCH_PLANNER_INSTRUCTIONS_VERSION } from '@/lib/agent/instructions';

export interface LaunchTraceMetadata {
  runId: string;
  launchId: string;
  actorId: string;
  model: string;
  tracingDisabled: boolean;
}

export type LaunchTraceConfig = Pick<
  RunConfig,
  | 'tracingDisabled'
  | 'traceIncludeSensitiveData'
  | 'workflowName'
  | 'groupId'
  | 'traceMetadata'
  | 'tracing'
>;

function boundedIdentifier(value: string): string {
  return value.trim().slice(0, 128);
}

/**
 * The SDK creates model and function-tool spans (including timings) automatically.
 * This configuration keeps those operational spans while excluding prompt, asset,
 * tool-input, tool-output, and model-output bodies from trace exports.
 */
export function buildLaunchTraceConfig(
  metadata: LaunchTraceMetadata,
): LaunchTraceConfig {
  return {
    tracingDisabled: metadata.tracingDisabled,
    traceIncludeSensitiveData: false,
    workflowName: 'Launch Desk plan',
    groupId: boundedIdentifier(metadata.launchId),
    traceMetadata: {
      run_id: boundedIdentifier(metadata.runId),
      launch_id: boundedIdentifier(metadata.launchId),
      actor_id: boundedIdentifier(metadata.actorId),
      model: boundedIdentifier(metadata.model),
      instruction_version: LAUNCH_PLANNER_INSTRUCTIONS_VERSION,
    },
    tracing: { includeTaskAndTurnSpans: true },
  };
}
