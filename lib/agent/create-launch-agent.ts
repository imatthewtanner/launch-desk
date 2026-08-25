import { Agent, type Tool } from '@openai/agents';

import { LaunchResultSchema } from '@/lib/contracts/launch';
import { buildLaunchPlannerInstructions } from '@/lib/agent/instructions';
import { createAgentTools } from '@/lib/tools/registry';

export type LaunchPlannerAgent = Agent<unknown, typeof LaunchResultSchema>;

export interface CreateLaunchAgentOptions {
  model: string;
  tools?: Tool<unknown>[];
  handoffs?: LaunchPlannerAgent[];
}

export function createLaunchAgent({
  model,
  tools = createAgentTools(),
  handoffs = [],
}: CreateLaunchAgentOptions): LaunchPlannerAgent {
  return new Agent<unknown, typeof LaunchResultSchema>({
    name: 'Launch Planner',
    instructions: buildLaunchPlannerInstructions(),
    model,
    tools,
    handoffs,
    outputType: LaunchResultSchema,
  });
}
