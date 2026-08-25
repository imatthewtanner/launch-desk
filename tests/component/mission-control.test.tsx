import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MissionControl } from '@/components/desk/mission-control';
import type { LaunchResult } from '@/lib/contracts/launch';
import { encodeStreamEvent, type LaunchStreamEvent } from '@/lib/contracts/stream';

function futureDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

const result: LaunchResult = {
  summary: 'Atlas is ready for an internal pilot after rollout ownership is confirmed.',
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
      objective: 'Prove reliability.',
      tasks: [],
    },
  ],
  riskRegister: [],
  ownerChecklists: [],
  copySuggestions: [],
  followUpQuestions: [],
  assetReferences: [],
  assumptions: [],
};

function streamResponse(): Response {
  const timestamp = '2026-08-25T12:00:00.000Z';
  const common = { runId: 'run-1', timestamp };
  const events = [
    { ...common, type: 'run.started', sequence: 1 },
    {
      ...common,
      type: 'tool.progress',
      sequence: 2,
      tool: 'check_launch_readiness',
      message: 'Scoring the launch against the readiness rubric',
    },
    {
      ...common,
      type: 'tool.completed',
      sequence: 3,
      tool: 'check_launch_readiness',
      message: 'Launch readiness checked',
    },
    { ...common, type: 'text.delta', sequence: 4, delta: 'Building Atlas plan…' },
    { ...common, type: 'run.completed', sequence: 5, result },
  ] as LaunchStreamEvent[];
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(events.map(encodeStreamEvent).join('')));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
  );
}

describe('MissionControl', () => {
  beforeEach(() => localStorage.clear());

  it('creates a guest launch and renders the streamed structured result', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/launches') {
        return Response.json(
          { launch: { id: 'launch-1' } },
          { status: 201 },
        );
      }
      return streamResponse();
    });
    render(<MissionControl guestMode fetcher={fetcher} />);

    expect(screen.getByRole('heading', { name: 'Plan the launch. Find the gaps.' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Product brief'), 'Launch Atlas reporting.');
    await user.type(screen.getByLabelText('Audience'), 'Engineering managers');
    await user.clear(screen.getByLabelText('Launch date'));
    await user.type(screen.getByLabelText('Launch date'), futureDate());
    await user.click(screen.getByRole('button', { name: 'Build launch plan' }));

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Plan' })).toBeInTheDocument(),
    );
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('Stabilize the launch path')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith('/api/launches', expect.any(Object));
    expect(fetcher).toHaveBeenCalledWith('/api/agent/plan', expect.any(Object));
  });

  it('uses a deterministic stream endpoint when one is configured', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/launches') {
        return Response.json({ launch: { id: 'launch-1' } }, { status: 201 });
      }
      return streamResponse();
    });
    render(
      <MissionControl
        guestMode
        fetcher={fetcher}
        planEndpoint="/api/test/agent-stream"
      />,
    );

    await user.type(screen.getByLabelText('Product brief'), 'Launch Atlas reporting.');
    await user.type(screen.getByLabelText('Audience'), 'Engineering managers');
    await user.clear(screen.getByLabelText('Launch date'));
    await user.type(screen.getByLabelText('Launch date'), futureDate());
    await user.click(screen.getByRole('button', { name: 'Build launch plan' }));

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Plan' })).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith(
      '/api/test/agent-stream',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
