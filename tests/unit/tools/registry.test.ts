import { describe, expect, it } from 'vitest';

import { createAgentTools } from '@/lib/tools/registry';

describe('createAgentTools', () => {
  it('registers all deterministic implementations as strict SDK function tools', () => {
    const tools = createAgentTools();

    expect(tools.map((registeredTool) => registeredTool.name)).toEqual([
      'extract_launch_tasks',
      'check_launch_readiness',
      'generate_owner_checklists',
      'draft_channel_copy',
    ]);
    expect(tools.every((registeredTool) => registeredTool.type === 'function')).toBe(true);
    expect(tools.every((registeredTool) => registeredTool.strict)).toBe(true);
  });
});
