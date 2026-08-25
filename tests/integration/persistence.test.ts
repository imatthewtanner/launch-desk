import { describe, expect, it } from 'vitest';

import type { LaunchResult } from '@/lib/contracts/launch';
import { InMemoryLaunchRepository } from '@/lib/server/persistence';

function futureDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 21);
  return date.toISOString().slice(0, 10);
}

const request = {
  title: 'Atlas launch',
  productBrief: 'Launch a shared delivery reporting workspace.',
  audience: 'Engineering managers',
  launchDate: futureDate(),
  constraints: 'Use a staged rollout.',
  assets: [],
};

const result: LaunchResult = {
  summary: 'Atlas can proceed after rollout ownership is confirmed.',
  readiness: {
    total: 70,
    categories: [],
    blockers: ['Rollout owner is missing.'],
    warnings: [],
    missingDetails: ['Rollout owner'],
  },
  prioritizedPlan: [],
  riskRegister: [],
  ownerChecklists: [],
  copySuggestions: [],
  followUpQuestions: [],
  assetReferences: [],
  assumptions: ['Dates are interpreted as UTC calendar dates.'],
};

describe('InMemoryLaunchRepository', () => {
  it('isolates launch lists by owner', async () => {
    const repository = new InMemoryLaunchRepository();
    const ownerLaunch = await repository.createLaunch({ ownerId: 'owner-a', request });
    await repository.createLaunch({
      ownerId: 'owner-b',
      request: { ...request, title: 'Private launch' },
    });

    expect(await repository.listLaunches('owner-a')).toEqual([ownerLaunch]);
    expect(await repository.listLaunches('owner-b')).toHaveLength(1);
  });

  it('records a completed run with validated structured output and usage', async () => {
    const repository = new InMemoryLaunchRepository();
    const launch = await repository.createLaunch({ ownerId: 'owner-a', request });
    const run = await repository.startRun({
      ownerId: 'owner-a',
      launchId: launch.id,
      model: 'gpt-5.6-terra',
    });

    await repository.completeRun(run.id, result, {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });

    expect(repository.inspectRun(run.id)).toMatchObject({
      status: 'completed',
      finalResult: result,
      usageSummary: { totalTokens: 150 },
    });
    expect(repository.inspectLaunch(launch.id)?.status).toBe('completed');
  });

  it('records safe failures and rejects runs against another owner\'s launch', async () => {
    const repository = new InMemoryLaunchRepository();
    const launch = await repository.createLaunch({ ownerId: 'owner-a', request });

    await expect(
      repository.startRun({
        ownerId: 'owner-b',
        launchId: launch.id,
        model: 'gpt-5.6-terra',
      }),
    ).rejects.toThrow(/owner/i);

    const run = await repository.startRun({
      ownerId: 'owner-a',
      launchId: launch.id,
      model: 'gpt-5.6-terra',
    });
    await repository.failRun(run.id, {
      category: 'network',
      message: 'The model service could not be reached.',
      retryable: true,
    });

    expect(repository.inspectRun(run.id)).toMatchObject({
      status: 'failed',
      error: { category: 'network', retryable: true },
    });
  });
});
