import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResultTabs } from '@/components/results/result-tabs';
import type { LaunchResult } from '@/lib/contracts/launch';

const result: LaunchResult = {
  summary: 'Atlas can proceed after rollout ownership is confirmed.',
  readiness: {
    total: 72,
    categories: [],
    blockers: ['Rollout owner is still unconfirmed.'],
    warnings: [],
    missingDetails: ['Rollout owner'],
  },
  prioritizedPlan: [
    {
      name: 'Stabilize the launch path',
      objective: 'Prove reliability before rollout.',
      tasks: [
        {
          id: 'task-1',
          title: 'Verify rollback',
          description: 'Exercise the rollback path.',
          priority: 'P0',
          ownerRole: 'Platform Engineering Lead',
          dependencies: [],
          timing: 'Before pilot',
          acceptanceCriteria: ['Rollback completes inside ten minutes.'],
          evidenceSources: ['Product brief'],
        },
      ],
    },
  ],
  riskRegister: [
    {
      id: 'risk-1',
      title: 'Rollback owner missing',
      description: 'No decision maker is named.',
      level: 'critical',
      likelihood: 'possible',
      impact: 'critical',
      mitigation: 'Name the owner before pilot.',
      trigger: 'Pilot begins without an owner.',
      ownerRole: 'Release Manager',
    },
  ],
  ownerChecklists: [
    {
      ownerRole: 'Platform Engineering Lead',
      items: [
        {
          id: 'check-1',
          taskId: 'task-1',
          label: 'Verify rollback',
          checked: false,
          priority: 'P0',
          dueGuidance: 'Before pilot',
          acceptanceCriteria: ['Rollback completes inside ten minutes.'],
        },
      ],
    },
  ],
  copySuggestions: [
    {
      channel: 'release_notes',
      headline: 'Atlas reporting is ready for pilot teams',
      body: 'Build and share delivery reports in one workspace.',
      callToAction: 'Join the pilot',
      confirmationNeeded: ['Confirm availability date.'],
    },
  ],
  followUpQuestions: [
    {
      id: 'q-1',
      question: 'Who owns the staged rollout decision?',
      rationale: 'Ownership changes the critical path.',
      affectedSections: ['plan', 'risks'],
    },
  ],
  assetReferences: [],
  assumptions: [],
};

describe('ResultTabs', () => {
  it('supports keyboard tab navigation and renders risk severity as text plus style', async () => {
    const user = userEvent.setup();
    render(<ResultTabs result={result} />);
    const planTab = screen.getByRole('tab', { name: 'Plan' });
    planTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Risks' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getAllByText('Critical').find((element) => element.hasAttribute('data-level')),
    ).toHaveAttribute('data-level', 'critical');
  });

  it('renders interactive owner checklists and copies one channel draft', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<ResultTabs result={result} />);

    await user.click(screen.getByRole('tab', { name: 'Owners' }));
    const checkbox = screen.getByRole('checkbox', { name: /verify rollback/i });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('tab', { name: 'Copy' }));
    await user.click(screen.getByRole('button', { name: /copy release notes/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Atlas reporting'));
    expect(screen.getByRole('button', { name: /copied release notes/i })).toBeInTheDocument();
  });

  it('submits a follow-up answer for the next refinement request', async () => {
    const user = userEvent.setup();
    const onRefine = vi.fn();
    render(<ResultTabs result={result} onRefine={onRefine} />);

    await user.click(screen.getByRole('tab', { name: 'Questions' }));
    await user.type(
      screen.getByLabelText('Answer: Who owns the staged rollout decision?'),
      'The release manager.',
    );
    await user.click(screen.getByRole('button', { name: 'Use answer' }));

    expect(onRefine).toHaveBeenCalledWith({ 'q-1': 'The release manager.' });
  });
});
