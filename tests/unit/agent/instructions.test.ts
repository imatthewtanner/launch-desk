import { describe, expect, it } from 'vitest';

import {
  buildLaunchPlannerInstructions,
  LAUNCH_PLANNER_INSTRUCTIONS_VERSION,
} from '@/lib/agent/instructions';

describe('Launch Planner instructions', () => {
  it('codifies the launch-planning trust and output contract', () => {
    const instructions = buildLaunchPlannerInstructions();

    expect(LAUNCH_PLANNER_INSTRUCTIONS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(instructions).toMatch(/supplied facts/i);
    expect(instructions).toMatch(/label every assumption/i);
    expect(instructions).toMatch(/unknown owners.*roles/i);
    expect(instructions).toMatch(/launch date.*constraint/i);
    expect(instructions).toMatch(/asset.*untrusted/i);
    expect(instructions).toMatch(/provisional plan/i);
    expect(instructions).toMatch(/material follow-up questions/i);
    expect(instructions).toMatch(/LaunchResultSchema|final result schema/i);
  });
});
