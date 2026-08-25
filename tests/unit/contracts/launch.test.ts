import { describe, expect, it } from 'vitest';

import {
  LaunchRequestSchema,
  LaunchResultSchema,
  MAX_ASSET_BYTES,
  type LaunchResult,
} from '@/lib/contracts/launch';

function dateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const validRequest = {
  title: 'Project Atlas staged rollout',
  productBrief: 'Launch a self-serve reporting workspace for existing teams.',
  audience: 'Engineering managers at mid-market SaaS companies',
  launchDate: dateFromToday(14),
  constraints: 'No weekend migration and no downtime.',
  assets: [
    {
      id: 'asset-1',
      filename: 'launch-brief.md',
      mimeType: 'text/markdown' as const,
      byteSize: 1_024,
      storagePath: 'guest/session/run/asset-1',
    },
  ],
};

const completeResult: LaunchResult = {
  summary: 'Atlas is viable as a staged launch once rollback ownership is confirmed.',
  readiness: {
    total: 78,
    categories: [
      {
        key: 'product_brief',
        label: 'Product brief',
        score: 15,
        maxScore: 15,
        evidence: ['The supplied brief identifies the customer outcome.'],
      },
    ],
    blockers: ['Rollback owner is not confirmed.'],
    warnings: ['Support coverage ends before the launch window closes.'],
    missingDetails: ['Named rollback decision-maker'],
  },
  prioritizedPlan: [
    {
      name: 'Preflight',
      objective: 'Resolve launch blockers before rollout.',
      tasks: [
        {
          id: 'confirm-rollback-owner',
          title: 'Confirm rollback owner',
          description: 'Name the role that can stop and reverse the rollout.',
          priority: 'P0',
          ownerRole: 'Engineering lead',
          dependencies: [],
          timing: 'T-7 days',
          acceptanceCriteria: ['The runbook names an on-call rollback owner.'],
          evidenceSources: ['Product brief'],
        },
      ],
    },
  ],
  riskRegister: [
    {
      id: 'risk-support-gap',
      title: 'Support coverage gap',
      description: 'Users may be unable to get help during the rollout window.',
      level: 'high',
      likelihood: 'possible',
      impact: 'high',
      mitigation: 'Extend support coverage for the first rollout cohort.',
      trigger: 'A launch-blocking support ticket remains unassigned for 30 minutes.',
      ownerRole: 'Support lead',
    },
  ],
  ownerChecklists: [
    {
      ownerRole: 'Engineering lead',
      items: [
        {
          id: 'check-confirm-rollback-owner',
          taskId: 'confirm-rollback-owner',
          label: 'Confirm rollback owner',
          checked: false,
          priority: 'P0',
          dueGuidance: 'T-7 days',
          acceptanceCriteria: ['The runbook names an on-call rollback owner.'],
        },
      ],
    },
  ],
  copySuggestions: [
    {
      channel: 'release_notes',
      headline: 'Atlas reporting is available to the first rollout cohort',
      body: 'Teams in the first cohort can now build shared reporting workspaces.',
      callToAction: 'Open Atlas reporting',
      confirmationNeeded: ['Confirm the rollout cohort name.'],
    },
  ],
  followUpQuestions: [
    {
      id: 'rollback-owner',
      question: 'Which role owns the rollback decision?',
      rationale: 'The rollout cannot start safely without a decision-maker.',
      affectedSections: ['readiness', 'plan', 'risks'],
    },
  ],
  assetReferences: validRequest.assets,
  assumptions: ['The launch date is in UTC.'],
};

describe('LaunchRequestSchema', () => {
  it('accepts a complete launch request', () => {
    expect(LaunchRequestSchema.parse(validRequest)).toMatchObject({
      title: 'Project Atlas staged rollout',
      assets: [{ filename: 'launch-brief.md' }],
    });
  });

  it('requires a calendar date in YYYY-MM-DD form', () => {
    expect(() =>
      LaunchRequestSchema.parse({ ...validRequest, launchDate: `${dateFromToday(14)}T12:00:00Z` }),
    ).toThrow(/YYYY-MM-DD/i);
  });

  it('rejects dates before today', () => {
    expect(() =>
      LaunchRequestSchema.parse({ ...validRequest, launchDate: dateFromToday(-1) }),
    ).toThrow(/today or in the future/i);
  });

  it('rejects more than ten assets', () => {
    const assets = Array.from({ length: 11 }, (_, index) => ({
      ...validRequest.assets[0],
      id: `asset-${index}`,
      filename: `brief-${index}.md`,
    }));

    expect(() => LaunchRequestSchema.parse({ ...validRequest, assets })).toThrow(/10 assets/i);
  });

  it('rejects an asset over twenty megabytes', () => {
    const assets = [{ ...validRequest.assets[0], byteSize: MAX_ASSET_BYTES + 1 }];
    expect(() => LaunchRequestSchema.parse({ ...validRequest, assets })).toThrow(/20 MB/i);
  });

  it('rejects unsupported asset MIME types', () => {
    const assets = [{ ...validRequest.assets[0], mimeType: 'application/zip' }];
    expect(() => LaunchRequestSchema.parse({ ...validRequest, assets })).toThrow(/supported/i);
  });
});

describe('LaunchResultSchema', () => {
  it('accepts every required result section', () => {
    const result = LaunchResultSchema.parse(completeResult);

    expect(result).toEqual(
      expect.objectContaining({
        summary: expect.any(String),
        readiness: expect.any(Object),
        prioritizedPlan: expect.any(Array),
        riskRegister: expect.any(Array),
        ownerChecklists: expect.any(Array),
        copySuggestions: expect.any(Array),
        followUpQuestions: expect.any(Array),
        assetReferences: expect.any(Array),
        assumptions: expect.any(Array),
      }),
    );
  });
});
