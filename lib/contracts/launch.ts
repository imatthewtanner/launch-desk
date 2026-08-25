import { z } from 'zod';

export const MAX_ASSETS = 10;
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export const SUPPORTED_ASSET_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

const boundedString = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} must be ${maximum.toLocaleString()} characters or fewer.`);

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function todayInUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const PrioritySchema = z.enum(['P0', 'P1', 'P2']);
export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export const CopyChannelSchema = z.enum([
  'release_notes',
  'email',
  'in_app',
  'social',
  'internal',
  'support',
]);

export const AssetReferenceSchema = z.object({
  id: z.string().trim().min(1).max(128),
  filename: boundedString('Asset filename', 255),
  mimeType: z.enum(SUPPORTED_ASSET_MIME_TYPES, {
    error: 'Asset MIME type is not supported.',
  }),
  byteSize: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_ASSET_BYTES, 'Assets must be 20 MB or smaller.'),
  storagePath: boundedString('Asset storage path', 1_024),
});

export const LaunchRequestSchema = z.object({
  title: boundedString('Launch title', 120).default('Untitled launch'),
  productBrief: boundedString('Product brief', 12_000),
  audience: boundedString('Audience', 2_000),
  launchDate: z
    .string()
    .regex(isoDatePattern, 'Launch date must use YYYY-MM-DD.')
    .refine((value) => value >= todayInUtc(), 'Launch date must be today or in the future.'),
  constraints: z.string().trim().max(4_000).default(''),
  assets: z.array(AssetReferenceSchema).max(MAX_ASSETS, 'A launch can include at most 10 assets.'),
});

export const NormalizedTaskSchema = z.object({
  id: boundedString('Task ID', 128),
  title: boundedString('Task title', 240),
  description: boundedString('Task description', 2_000),
  priority: PrioritySchema,
  ownerRole: boundedString('Owner role', 160),
  dependencies: z.array(boundedString('Dependency', 128)).max(50),
  timing: boundedString('Task timing', 160),
  acceptanceCriteria: z.array(boundedString('Acceptance criterion', 500)).max(20),
  evidenceSources: z.array(boundedString('Evidence source', 240)).max(20),
});

export const ReadinessCategorySchema = z.object({
  key: z.enum([
    'product_brief',
    'audience',
    'timing',
    'rollout',
    'observability',
    'support',
    'security',
    'communications',
    'rollback',
    'assets',
  ]),
  label: boundedString('Readiness category label', 80),
  score: z.number().int().min(0).max(100),
  maxScore: z.number().int().min(1).max(100),
  evidence: z.array(boundedString('Readiness evidence', 500)).max(20),
});

export const ReadinessResultSchema = z.object({
  total: z.number().int().min(0).max(100),
  categories: z.array(ReadinessCategorySchema).max(10),
  blockers: z.array(boundedString('Readiness blocker', 500)).max(30),
  warnings: z.array(boundedString('Readiness warning', 500)).max(30),
  missingDetails: z.array(boundedString('Missing detail', 500)).max(30),
});

export const PlanPhaseSchema = z.object({
  name: boundedString('Plan phase name', 160),
  objective: boundedString('Plan phase objective', 1_000),
  tasks: z.array(NormalizedTaskSchema).max(100),
});

export const RiskRegisterItemSchema = z.object({
  id: boundedString('Risk ID', 128),
  title: boundedString('Risk title', 240),
  description: boundedString('Risk description', 1_500),
  level: RiskLevelSchema,
  likelihood: z.enum(['unlikely', 'possible', 'likely', 'almost_certain']),
  impact: RiskLevelSchema,
  mitigation: boundedString('Risk mitigation', 1_500),
  trigger: boundedString('Risk trigger', 750),
  ownerRole: boundedString('Risk owner role', 160),
});

export const OwnerChecklistItemSchema = z.object({
  id: boundedString('Checklist item ID', 128),
  taskId: boundedString('Checklist task ID', 128),
  label: boundedString('Checklist item label', 300),
  checked: z.literal(false),
  priority: PrioritySchema,
  dueGuidance: boundedString('Checklist due guidance', 160),
  acceptanceCriteria: z.array(boundedString('Acceptance criterion', 500)).max(20),
});

export const OwnerChecklistSchema = z.object({
  ownerRole: boundedString('Checklist owner role', 160),
  items: z.array(OwnerChecklistItemSchema).max(100),
});

export const ChannelCopySuggestionSchema = z.object({
  channel: CopyChannelSchema,
  headline: boundedString('Copy headline', 300),
  body: boundedString('Copy body', 5_000),
  callToAction: boundedString('Copy call to action', 300),
  confirmationNeeded: z.array(boundedString('Copy confirmation', 500)).max(20),
});

export const ResultSectionSchema = z.enum([
  'summary',
  'readiness',
  'plan',
  'risks',
  'owners',
  'copy',
  'assets',
]);

export const FollowUpQuestionSchema = z.object({
  id: boundedString('Follow-up question ID', 128),
  question: boundedString('Follow-up question', 500),
  rationale: boundedString('Follow-up rationale', 750),
  affectedSections: z.array(ResultSectionSchema).min(1).max(7),
});

export const LaunchResultSchema = z.object({
  summary: boundedString('Launch summary', 4_000),
  readiness: ReadinessResultSchema,
  prioritizedPlan: z.array(PlanPhaseSchema).max(20),
  riskRegister: z.array(RiskRegisterItemSchema).max(50),
  ownerChecklists: z.array(OwnerChecklistSchema).max(50),
  copySuggestions: z.array(ChannelCopySuggestionSchema).max(24),
  followUpQuestions: z.array(FollowUpQuestionSchema).max(20),
  assetReferences: z.array(AssetReferenceSchema).max(MAX_ASSETS),
  assumptions: z.array(boundedString('Assumption', 750)).max(30),
});

export type Priority = z.infer<typeof PrioritySchema>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type CopyChannel = z.infer<typeof CopyChannelSchema>;
export type AssetReference = z.infer<typeof AssetReferenceSchema>;
export type LaunchRequest = z.infer<typeof LaunchRequestSchema>;
export type NormalizedTask = z.infer<typeof NormalizedTaskSchema>;
export type ReadinessResult = z.infer<typeof ReadinessResultSchema>;
export type OwnerChecklist = z.infer<typeof OwnerChecklistSchema>;
export type ChannelCopySuggestion = z.infer<typeof ChannelCopySuggestionSchema>;
export type FollowUpQuestion = z.infer<typeof FollowUpQuestionSchema>;
export type LaunchResult = z.infer<typeof LaunchResultSchema>;
