import {
  ReadinessResultSchema,
  type ReadinessResult,
} from '@/lib/contracts/launch';
import type { ReadinessInput } from '@/lib/tools/types';

export const READINESS_WEIGHTS = {
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
} as const;

const CATEGORY_LABELS: Record<keyof typeof READINESS_WEIGHTS, string> = {
  product_brief: 'Product brief',
  audience: 'Audience',
  timing: 'Launch timing',
  rollout: 'Rollout strategy',
  observability: 'Observability',
  support: 'Support readiness',
  security: 'Security and privacy',
  communications: 'Communications',
  rollback: 'Rollback plan',
  assets: 'Available assets',
};

const BLOCKING_CATEGORIES = new Set<keyof typeof READINESS_WEIGHTS>([
  'product_brief',
  'rollout',
  'rollback',
]);

const WARNING_CATEGORIES = new Set<keyof typeof READINESS_WEIGHTS>([
  'observability',
  'support',
  'security',
  'communications',
]);

function normalizeEvidence(value: string | null | undefined): string[] {
  const normalized = value?.trim();
  return normalized ? [normalized] : [];
}

export function checkLaunchReadiness(input: ReadinessInput): ReadinessResult {
  const evidenceByCategory: Record<keyof typeof READINESS_WEIGHTS, string[]> = {
    product_brief: normalizeEvidence(input.productBrief),
    audience: normalizeEvidence(input.audience),
    timing: normalizeEvidence(input.launchDate),
    rollout: normalizeEvidence(input.rollout),
    observability: normalizeEvidence(input.observability),
    support: normalizeEvidence(input.support),
    security: normalizeEvidence(input.security),
    communications: normalizeEvidence(input.communications),
    rollback: normalizeEvidence(input.rollback),
    assets: (input.assets ?? []).map((asset) => asset.trim()).filter(Boolean),
  };

  const categories = (
    Object.keys(READINESS_WEIGHTS) as Array<keyof typeof READINESS_WEIGHTS>
  ).map((key) => {
    const maxScore = READINESS_WEIGHTS[key];
    const evidence = evidenceByCategory[key];

    return {
      key,
      label: CATEGORY_LABELS[key],
      score: evidence.length > 0 ? maxScore : 0,
      maxScore,
      evidence,
    };
  });

  const missingKeys = categories
    .filter((category) => category.score === 0)
    .map((category) => category.key);
  const blockers = missingKeys
    .filter((key) => BLOCKING_CATEGORIES.has(key))
    .map((key) => `${CATEGORY_LABELS[key]} evidence is required before launch.`);
  const warnings = missingKeys
    .filter((key) => WARNING_CATEGORIES.has(key))
    .map((key) => `${CATEGORY_LABELS[key]} has no explicit readiness evidence.`);
  const missingDetails = missingKeys.map(
    (key) => `Provide explicit evidence for ${CATEGORY_LABELS[key].toLowerCase()}.`,
  );
  const total = Math.max(
    0,
    Math.min(
      100,
      categories.reduce((sum, category) => sum + category.score, 0),
    ),
  );

  return ReadinessResultSchema.parse({
    total,
    categories,
    blockers,
    warnings,
    missingDetails,
  });
}
