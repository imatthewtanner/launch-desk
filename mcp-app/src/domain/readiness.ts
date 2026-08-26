import { randomUUID } from "node:crypto";

import type {
  LaunchReview,
  ReadinessCategory,
  RecommendationPriority,
  ReviewGap,
  ReviewRecommendation,
  ReviewRisk,
  SourceEvidence,
  SourceStatus,
} from "./types.js";

const RUBRIC = [
  { key: "product_brief", label: "Product brief", weight: 15, patterns: [/objective/i, /outcome/i, /scope/i, /product/i], blocking: true, owner: "Product lead" },
  { key: "audience", label: "Audience", weight: 10, patterns: [/audience/i, /customer/i, /user/i, /tenant/i], owner: "Product lead" },
  { key: "timing", label: "Launch timing", weight: 10, patterns: [/launch date/i, /release date/i, /timeline/i, /\b20\d{2}-\d{2}-\d{2}\b/], owner: "Release manager" },
  { key: "rollout", label: "Rollout strategy", weight: 15, patterns: [/rollout/i, /canary/i, /feature flag/i, /percentage/i], blocking: true, owner: "Engineering lead" },
  { key: "observability", label: "Observability", weight: 10, patterns: [/monitor/i, /metric/i, /alert/i, /dashboard/i, /slo/i], owner: "SRE or platform lead" },
  { key: "support", label: "Support readiness", weight: 10, patterns: [/support/i, /runbook/i, /escalation/i, /on-call/i], owner: "Support lead" },
  { key: "security", label: "Security and privacy", weight: 10, patterns: [/security/i, /privacy/i, /threat/i, /permission/i, /pii/i], owner: "Security owner" },
  { key: "communications", label: "Communications", weight: 10, patterns: [/communication/i, /release note/i, /announcement/i, /stakeholder/i], owner: "Launch communications owner" },
  { key: "rollback", label: "Rollback plan", weight: 5, patterns: [/rollback/i, /revert/i, /kill switch/i, /disable/i], blocking: true, owner: "Engineering lead" },
  { key: "assets", label: "Available assets", weight: 5, patterns: [/asset/i, /document/i, /design/i, /demo/i, /file/i], owner: "Product operations" },
] as const;

function compact(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function collectEvidence(
  planText: string,
  evidence: SourceEvidence[],
  patterns: readonly RegExp[],
): string[] {
  const lines = planText
    .split(/\r?\n/)
    .map((line) => compact(line).slice(0, 600))
    .filter(Boolean);
  const matches = lines.filter((line) => patterns.some((pattern) => pattern.test(line)));
  const external = evidence
    .filter((item) => patterns.some((pattern) => pattern.test(item.summary)))
    .map((item) => `${item.provider}: ${item.summary}`);
  return [...new Set([...matches, ...external])].slice(0, 6);
}

function priorityFor(blocking: boolean | undefined, weight: number): RecommendationPriority {
  if (blocking) return "P0";
  return weight >= 10 ? "P1" : "P2";
}

function ownerMentions(planText: string): Set<string> {
  const owners = new Set<string>();
  for (const match of planText.matchAll(/(?:owner|owned by|dri)\s*[:=-]\s*([^\n,;]+)/gi)) {
    const owner = compact(match[1] ?? "");
    if (owner) owners.add(owner.toLocaleLowerCase("en-US"));
  }
  return owners;
}

export function buildLaunchReview(input: {
  ownerSubject: string;
  title?: string;
  planText: string;
  evidence: SourceEvidence[];
  sources: SourceStatus[];
}): LaunchReview {
  const categories: ReadinessCategory[] = RUBRIC.map((rubric) => {
    const evidence = collectEvidence(input.planText, input.evidence, rubric.patterns);
    return {
      key: rubric.key,
      label: rubric.label,
      score: evidence.length > 0 ? rubric.weight : 0,
      maxScore: rubric.weight,
      evidence,
    };
  });

  const gaps: ReviewGap[] = categories
    .filter((category) => category.score === 0)
    .map((category) => {
      const rubric = RUBRIC.find((item) => item.key === category.key)!;
      return {
        id: `gap-${category.key}`,
        category: category.key,
        title: `${category.label} evidence is missing`,
        rationale: `The submitted plan and authorized sources do not provide explicit ${category.label.toLocaleLowerCase("en-US")} evidence.`,
        priority: priorityFor("blocking" in rubric ? rubric.blocking : false, rubric.weight),
        evidence: [],
      };
    });

  const risks: ReviewRisk[] = gaps.map((gap) => {
    const rubric = RUBRIC.find((item) => item.key === gap.category)!;
    const critical = "blocking" in rubric && Boolean(rubric.blocking);
    return {
      id: `risk-${gap.category}`,
      title: `Launch may proceed without ${rubric.label.toLocaleLowerCase("en-US")}`,
      level: critical ? "high" : "medium",
      likelihood: critical ? "likely" : "possible",
      impact: critical ? "high" : "medium",
      evidence: gap.evidence,
      mitigation: `Add explicit ${rubric.label.toLocaleLowerCase("en-US")} evidence and obtain owner sign-off before launch.`,
      ownerRole: rubric.owner,
    };
  });

  const knownOwners = ownerMentions(input.planText);
  const missingOwners = [...new Set(
    gaps
      .map((gap) => RUBRIC.find((item) => item.key === gap.category)!.owner)
      .filter((owner) => !knownOwners.has(owner.toLocaleLowerCase("en-US"))),
  )];

  const recommendations: ReviewRecommendation[] = gaps.map((gap) => {
    const rubric = RUBRIC.find((item) => item.key === gap.category)!;
    return {
      id: `recommend-${gap.category}`,
      title: `Document ${rubric.label.toLocaleLowerCase("en-US")} readiness`,
      description: `${gap.rationale} Add verifiable evidence, acceptance criteria, and an accountable owner.`,
      priority: gap.priority,
      ownerRole: rubric.owner,
      destinationSuggestion: gap.priority === "P0" ? "github" : "linear",
      evidence: gap.evidence,
      status: "outstanding",
    };
  });

  const followUpQuestions = gaps.slice(0, 6).map((gap) => {
    const rubric = RUBRIC.find((item) => item.key === gap.category)!;
    return `What verified ${rubric.label.toLocaleLowerCase("en-US")} evidence should be included, and who owns it?`;
  });

  return {
    id: randomUUID(),
    ownerSubject: input.ownerSubject,
    title: compact(input.title ?? "Launch readiness review") || "Launch readiness review",
    createdAt: new Date().toISOString(),
    readiness: {
      total: categories.reduce((total, category) => total + category.score, 0),
      categories,
    },
    gaps,
    risks,
    missingOwners,
    recommendations,
    followUpQuestions,
    sources: input.sources,
  };
}
