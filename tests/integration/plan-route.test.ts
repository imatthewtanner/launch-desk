import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LaunchResult } from '@/lib/contracts/launch';
import { decodeStreamLines } from '@/lib/contracts/stream';

const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/agent/run-launch-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/run-launch-agent')>();
  return { ...actual, runLaunchAgent: runAgentMock };
});

import {
  GET as listLaunches,
  POST as createLaunch,
} from '@/app/api/launches/route';
import {
  POST as planLaunch,
  runtime,
} from '@/app/api/agent/plan/route';

function futureDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 45);
  return date.toISOString().slice(0, 10);
}

const launch = {
  title: 'Compass launch',
  productBrief: 'Release a dependency health dashboard to platform teams.',
  audience: 'Platform engineering leads',
  launchDate: futureDate(),
  constraints: 'Start with an internal pilot.',
  assets: [],
};

const result: LaunchResult = {
  summary: 'Compass should begin with an internal pilot and explicit rollback owner.',
  readiness: {
    total: 60,
    categories: [],
    blockers: [],
    warnings: [],
    missingDetails: [],
  },
  prioritizedPlan: [],
  riskRegister: [],
  ownerChecklists: [],
  copySuggestions: [],
  followUpQuestions: [],
  assetReferences: [],
  assumptions: ['The pilot precedes general availability.'],
};

describe('Next.js launch and plan routes', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-server-key';
    process.env.OPENAI_MODEL = 'gpt-5.6-terra';
    process.env.LAUNCH_DESK_GUEST_MODE = 'true';
    process.env.OPENAI_TRACING_DISABLED = 'true';
    runAgentMock.mockReset();
    runAgentMock.mockImplementation(async function* () {
      yield { type: 'text.delta', delta: '{"summary":"Compass' };
      yield {
        type: 'usage',
        usage: { inputTokens: 90, outputTokens: 60, totalTokens: 150 },
      };
      yield { type: 'result.final', result };
    });
  });

  it('uses the Node runtime and streams a guest launch through the wired route', async () => {
    expect(runtime).toBe('nodejs');
    const guest = {
      ownerId: 'guest-route-1',
      sessionId: 'session-route-1',
      runId: 'upload-route-1',
    };
    const createdResponse = await createLaunch(
      new Request('http://launch-desk.test/api/launches', {
        method: 'POST',
        body: JSON.stringify({ launch, guest }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { launch: { id: string } };

    const response = await planLaunch(
      new Request('http://launch-desk.test/api/agent/plan', {
        method: 'POST',
        body: JSON.stringify({ launchId: created.launch.id, launch, guest }),
      }),
    );
    const { events, remainder } = decodeStreamLines(await response.text());

    expect(remainder).toBe('');
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(events.some((event) => event.type === 'tool.progress')).toBe(true);
    expect(events.some((event) => event.type === 'text.delta')).toBe(true);
    expect(events.at(-1)?.type).toBe('run.completed');
    expect(runAgentMock).toHaveBeenCalledOnce();

    const listResponse = await listLaunches(
      new Request(
        `http://launch-desk.test/api/launches?ownerId=${guest.ownerId}&sessionId=${guest.sessionId}&runId=${guest.runId}`,
      ),
    );
    const listed = (await listResponse.json()) as { launches: Array<{ id: string }> };
    expect(listed.launches.map(({ id }) => id)).toContain(created.launch.id);
  });
});
