export type Provider = "github" | "linear";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RecommendationPriority = "P0" | "P1" | "P2";

export interface SourceEvidence {
  provider: Provider | "file" | "plan";
  reference: string;
  summary: string;
}

export interface SourceStatus {
  provider: Provider;
  scope: string;
  status: "connected" | "not_configured" | "error";
  message: string;
  evidenceCount: number;
}

export interface ReadinessCategory {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  evidence: string[];
}

export interface ReviewGap {
  id: string;
  category: string;
  title: string;
  rationale: string;
  priority: RecommendationPriority;
  evidence: string[];
}

export interface ReviewRisk {
  id: string;
  title: string;
  level: RiskLevel;
  likelihood: "unlikely" | "possible" | "likely" | "almost_certain";
  impact: RiskLevel;
  evidence: string[];
  mitigation: string;
  ownerRole: string;
}

export interface ReviewRecommendation {
  id: string;
  title: string;
  description: string;
  priority: RecommendationPriority;
  ownerRole: string;
  destinationSuggestion: Provider;
  evidence: string[];
  status: "outstanding" | "assigned";
  createdIssueUrl?: string;
}

export interface LaunchReview {
  id: string;
  ownerSubject: string;
  title: string;
  createdAt: string;
  readiness: {
    total: number;
    categories: ReadinessCategory[];
  };
  gaps: ReviewGap[];
  risks: ReviewRisk[];
  missingOwners: string[];
  recommendations: ReviewRecommendation[];
  followUpQuestions: string[];
  sources: SourceStatus[];
}

export interface IssueDraft {
  id: string;
  recommendationId: string;
  provider: Provider;
  destination: string;
  title: string;
  description: string;
}

export interface IssuePreview {
  id: string;
  reviewId: string;
  ownerSubject: string;
  createdAt: string;
  expiresAt: string;
  contentHash: string;
  drafts: IssueDraft[];
  consumedAt?: string;
  createdIssues?: CreatedIssue[];
}

export interface CreatedIssue {
  recommendationId: string;
  provider: Provider;
  destination: string;
  title: string;
  url: string;
}
