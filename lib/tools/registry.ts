import { tool } from '@openai/agents';
import { z } from 'zod';

import {
  ChannelCopySuggestionSchema,
  NormalizedTaskSchema,
  OwnerChecklistSchema,
  ReadinessResultSchema,
} from '@/lib/contracts/launch';
import { checkLaunchReadiness } from '@/lib/tools/check-launch-readiness';
import { draftChannelCopy } from '@/lib/tools/draft-channel-copy';
import { extractLaunchTasks } from '@/lib/tools/extract-launch-tasks';
import { generateOwnerChecklists } from '@/lib/tools/generate-owner-checklists';
import {
  DraftChannelCopyInputSchema,
  ExtractLaunchTasksInputSchema,
  GenerateOwnerChecklistsInputSchema,
  ReadinessToolInputSchema,
} from '@/lib/tools/types';

export interface AgentToolDependencies {
  extractLaunchTasks: typeof extractLaunchTasks;
  checkLaunchReadiness: typeof checkLaunchReadiness;
  generateOwnerChecklists: typeof generateOwnerChecklists;
  draftChannelCopy: typeof draftChannelCopy;
}

export function createAgentTools(
  overrides: Partial<AgentToolDependencies> = {},
): Array<ReturnType<typeof tool>> {
  const implementations: AgentToolDependencies = {
    extractLaunchTasks,
    checkLaunchReadiness,
    generateOwnerChecklists,
    draftChannelCopy,
    ...overrides,
  };

  const extractTasksTool = tool({
    name: 'extract_launch_tasks',
    description:
      'Normalize candidate launch work, merge duplicate tasks, preserve evidence and dependencies, and order the actionable task list.',
    parameters: ExtractLaunchTasksInputSchema,
    outputSchema: z.object({ tasks: z.array(NormalizedTaskSchema) }),
    execute: async (input) => ({ tasks: implementations.extractLaunchTasks(input) }),
  });

  const readinessTool = tool({
    name: 'check_launch_readiness',
    description:
      'Score the fixed 100-point launch-readiness rubric using only explicit evidence. Use null when evidence was not supplied.',
    parameters: ReadinessToolInputSchema,
    outputSchema: ReadinessResultSchema,
    execute: async (input) => implementations.checkLaunchReadiness(input),
  });

  const ownerChecklistTool = tool({
    name: 'generate_owner_checklists',
    description:
      'Group normalized launch tasks into role-based, unchecked owner checklists with timing and acceptance criteria.',
    parameters: GenerateOwnerChecklistsInputSchema,
    outputSchema: z.object({ checklists: z.array(OwnerChecklistSchema) }),
    execute: async ({ tasks }) => ({
      checklists: implementations.generateOwnerChecklists(tasks),
    }),
  });

  const channelCopyTool = tool({
    name: 'draft_channel_copy',
    description:
      'Apply channel-specific launch-copy constraints while keeping unverified facts inside explicit confirmation markers.',
    parameters: DraftChannelCopyInputSchema,
    outputSchema: z.object({ suggestions: z.array(ChannelCopySuggestionSchema) }),
    execute: async (input) => ({
      suggestions: implementations.draftChannelCopy(input),
    }),
  });

  return [extractTasksTool, readinessTool, ownerChecklistTool, channelCopyTool];
}
