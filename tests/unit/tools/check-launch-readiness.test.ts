import { describe, expect, it } from 'vitest';

import {
  checkLaunchReadiness,
  READINESS_WEIGHTS,
} from '@/lib/tools/check-launch-readiness';

const completeLaunch = {
  productBrief: 'A scoped reporting launch with a measurable customer outcome.',
  audience: 'Existing engineering manager customers',
  launchDate: '2026-09-15',
  rollout: 'Enable 10%, 25%, then 100% of eligible workspaces.',
  observability: 'Track activation, errors, latency, and cohort adoption.',
  support: 'Support lead and escalation rotation cover the launch window.',
  security: 'Threat review and privacy review are approved.',
  communications: 'Release notes, in-app, and support messaging are drafted.',
  rollback: 'Disable the feature flag and restore the prior workflow.',
  assets: ['launch brief', 'support runbook'],
};

describe('checkLaunchReadiness', () => {
  it('uses a rubric whose exact weights total 100', () => {
    expect(READINESS_WEIGHTS).toEqual({
      product_brief: 15,
      audience: 10,
      timing: 10,
      rollout: 15,
      observability: 10,
      support: 10,
      security: 10,
      communications: 10,
      rollback: 5,
      assets: 5,
    });
    expect(Object.values(READINESS_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it('scores a launch with explicit evidence in every category at 100', () => {
    const result = checkLaunchReadiness(completeLaunch);

    expect(result.total).toBe(100);
    expect(result.categories).toHaveLength(10);
    expect(result.blockers).toEqual([]);
    expect(result.missingDetails).toEqual([]);
  });

  it('keeps a brief-only launch below 40 instead of inferring unrelated readiness', () => {
    const result = checkLaunchReadiness({
      productBrief: completeLaunch.productBrief,
    });

    expect(result.total).toBeLessThan(40);
    expect(result.categories.find((category) => category.key === 'rollout')?.score).toBe(0);
    expect(result.categories.find((category) => category.key === 'security')?.score).toBe(0);
  });

  it('returns rollout and rollback blockers when their evidence is missing', () => {
    const withoutSafetyControls = {
      productBrief: completeLaunch.productBrief,
      audience: completeLaunch.audience,
      launchDate: completeLaunch.launchDate,
      observability: completeLaunch.observability,
      support: completeLaunch.support,
      security: completeLaunch.security,
      communications: completeLaunch.communications,
      assets: completeLaunch.assets,
    };
    const result = checkLaunchReadiness(withoutSafetyControls);

    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/rollout/i),
        expect.stringMatching(/rollback/i),
      ]),
    );
  });
});
