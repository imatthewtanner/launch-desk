import { describe, expect, it } from 'vitest';

import { extractLaunchTasks } from '@/lib/tools/extract-launch-tasks';
import { generateOwnerChecklists } from '@/lib/tools/generate-owner-checklists';

describe('generateOwnerChecklists', () => {
  it('groups tasks by owner role with unchecked, dependency-aware items', () => {
    const tasks = extractLaunchTasks({
      tasks: [
        {
          title: 'Confirm rollout owner',
          description: 'Name the person accountable for the rollout.',
          priority: 'P0',
          ownerRole: 'Engineering lead',
          dependencies: [],
          timing: 'T-7 days',
          acceptanceCriteria: ['Owner acknowledges the runbook'],
          evidenceSources: ['Readiness review'],
        },
        {
          title: 'Run launch rehearsal',
          description: 'Exercise the rollout and rollback runbooks.',
          priority: 'P1',
          ownerRole: 'Engineering lead',
          dependencies: ['Confirm rollout owner'],
          timing: 'T-3 days',
          acceptanceCriteria: ['Rehearsal completes without a P0 issue'],
          evidenceSources: ['Operations plan'],
        },
        {
          title: 'Publish internal announcement',
          description: 'Tell internal teams when the rollout begins.',
          priority: 'P2',
          ownerRole: '  ',
          dependencies: [],
          timing: 'T-1 day',
          acceptanceCriteria: ['Announcement is posted'],
          evidenceSources: ['Communications plan'],
        },
      ],
    });

    const checklists = generateOwnerChecklists(tasks);
    const engineering = checklists.find(
      (checklist) => checklist.ownerRole === 'Engineering lead',
    );
    const unassigned = checklists.find(
      (checklist) => checklist.ownerRole === 'Unassigned role',
    );

    expect(engineering?.items).toHaveLength(2);
    expect(engineering?.items.every((item) => item.checked === false)).toBe(true);
    expect(engineering?.items[1]).toMatchObject({
      taskId: 'run-launch-rehearsal',
      dueGuidance: 'T-3 days',
      acceptanceCriteria: ['Rehearsal completes without a P0 issue'],
    });
    expect(unassigned?.items[0]).toMatchObject({
      taskId: 'publish-internal-announcement',
      priority: 'P2',
    });
  });
});
