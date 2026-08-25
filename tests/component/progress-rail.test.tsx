import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProgressRail } from '@/components/stream/progress-rail';

describe('ProgressRail', () => {
  it('renders tool activity with text status labels and an active cancel control', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ProgressRail
        status="streaming"
        onCancel={onCancel}
        activity={[
          {
            id: 'readiness-1',
            tool: 'check_launch_readiness',
            message: 'Launch readiness checked',
            status: 'completed',
            sequence: 2,
            durationMs: 18,
          },
          {
            id: 'tasks-1',
            tool: 'extract_launch_tasks',
            message: 'Extracting and normalizing launch tasks',
            status: 'running',
            sequence: 5,
          },
        ]}
        followUps={[]}
      />,
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('18 ms')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
