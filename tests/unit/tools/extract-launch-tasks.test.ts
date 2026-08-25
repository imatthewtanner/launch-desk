import { describe, expect, it } from 'vitest';

import { extractLaunchTasks } from '@/lib/tools/extract-launch-tasks';

const candidates = {
  tasks: [
    {
      title: ' Confirm rollback owner ',
      description: 'Name the decision-maker for rollback.',
      priority: 'P1' as const,
      ownerRole: 'Engineering lead',
      dependencies: [],
      timing: 'T-7 days',
      acceptanceCriteria: ['Owner is named in the runbook'],
      evidenceSources: ['Product brief'],
    },
    {
      title: 'confirm   ROLLBACK owner',
      description: 'Name and page-test the role that owns rollback decisions.',
      priority: 'P0' as const,
      ownerRole: 'Platform lead',
      dependencies: [],
      timing: 'T-8 days',
      acceptanceCriteria: ['Pager test succeeds'],
      evidenceSources: ['Readiness review'],
    },
    {
      title: 'Finalize rollback runbook',
      description: 'Document rollback triggers and commands.',
      priority: 'P1' as const,
      ownerRole: 'Engineering lead',
      dependencies: ['Confirm rollback owner'],
      timing: 'T-5 days',
      acceptanceCriteria: ['A dry run completes successfully'],
      evidenceSources: ['Operations review'],
    },
    {
      title: 'Publish release notes',
      description: 'Publish customer-facing availability and outcome details.',
      priority: 'P2' as const,
      ownerRole: null,
      dependencies: ['Finalize rollback runbook'],
      timing: 'Launch day',
      acceptanceCriteria: ['Release notes are publicly visible'],
      evidenceSources: ['Communications plan'],
    },
  ],
};

describe('extractLaunchTasks', () => {
  it('deduplicates normalized titles and preserves the most urgent priority', () => {
    const tasks = extractLaunchTasks(candidates);

    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      id: 'confirm-rollback-owner',
      title: 'Confirm rollback owner',
      priority: 'P0',
    });
    expect(tasks[0].acceptanceCriteria).toEqual(
      expect.arrayContaining(['Owner is named in the runbook', 'Pager test succeeds']),
    );
    expect(tasks[0].evidenceSources).toEqual(
      expect.arrayContaining(['Product brief', 'Readiness review']),
    );
  });

  it('sorts P0, P1, P2 and keeps dependencies before their dependents', () => {
    const tasks = extractLaunchTasks(candidates);
    const runbook = tasks.find((task) => task.id === 'finalize-rollback-runbook');

    expect(tasks.map((task) => task.priority)).toEqual(['P0', 'P1', 'P2']);
    expect(runbook?.dependencies).toEqual(['confirm-rollback-owner']);
    expect(tasks.findIndex((task) => task.id === 'confirm-rollback-owner')).toBeLessThan(
      tasks.findIndex((task) => task.id === 'finalize-rollback-runbook'),
    );
  });

  it('produces stable IDs for the same input', () => {
    expect(extractLaunchTasks(candidates).map((task) => task.id)).toEqual(
      extractLaunchTasks(candidates).map((task) => task.id),
    );
  });
});
