import { z } from 'zod';

import {
  CopyChannelSchema,
  NormalizedTaskSchema,
  PrioritySchema,
} from '@/lib/contracts/launch';

export const CandidateTaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(2_000),
  priority: PrioritySchema,
  ownerRole: z.string().trim().max(160).nullable(),
  dependencies: z.array(z.string().trim().min(1).max(240)).max(50),
  timing: z.string().trim().min(1).max(160),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(20),
  evidenceSources: z.array(z.string().trim().min(1).max(240)).max(20),
});

export const ExtractLaunchTasksInputSchema = z.object({
  tasks: z.array(CandidateTaskSchema).max(100),
});

export const GenerateOwnerChecklistsInputSchema = z.object({
  tasks: z.array(NormalizedTaskSchema).max(100),
});

const nullableEvidence = z.string().trim().max(12_000).nullable();

export const ReadinessToolInputSchema = z.object({
  productBrief: nullableEvidence,
  audience: nullableEvidence,
  launchDate: nullableEvidence,
  rollout: nullableEvidence,
  observability: nullableEvidence,
  support: nullableEvidence,
  security: nullableEvidence,
  communications: nullableEvidence,
  rollback: nullableEvidence,
  assets: z.array(z.string().trim().min(1).max(255)).max(10),
});

export const DraftChannelCopyInputSchema = z.object({
  productName: z.string().trim().min(1).max(120),
  outcome: z.string().trim().min(1).max(1_000),
  availability: z.string().trim().min(1).max(500),
  audience: z.string().trim().min(1).max(500),
  callToAction: z.string().trim().min(1).max(300),
  knownLimitations: z.array(z.string().trim().min(1).max(500)).max(20),
  escalationGuidance: z.string().trim().min(1).max(750),
  verifiedFacts: z.array(z.string().trim().min(1).max(500)).max(20),
  unverifiedFacts: z.array(z.string().trim().min(1).max(500)).max(20),
  channels: z.array(CopyChannelSchema).min(1).max(6),
});

export interface ReadinessInput {
  productBrief?: string | null;
  audience?: string | null;
  launchDate?: string | null;
  rollout?: string | null;
  observability?: string | null;
  support?: string | null;
  security?: string | null;
  communications?: string | null;
  rollback?: string | null;
  assets?: string[] | null;
}

export type CandidateTask = z.infer<typeof CandidateTaskSchema>;
export type ExtractLaunchTasksInput = z.infer<typeof ExtractLaunchTasksInputSchema>;
export type GenerateOwnerChecklistsInput = z.infer<typeof GenerateOwnerChecklistsInputSchema>;
export type DraftChannelCopyInput = z.infer<typeof DraftChannelCopyInputSchema>;
