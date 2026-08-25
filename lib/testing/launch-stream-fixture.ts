import type { AssetReference, LaunchResult } from '@/lib/contracts/launch';
import type { LaunchStreamEvent } from '@/lib/contracts/stream';

export function createFixtureLaunchResult(
  assets: AssetReference[] = [],
): LaunchResult {
  return {
    summary:
      'Atlas can proceed to an internal pilot once rollout ownership and rollback evidence are confirmed.',
    readiness: {
      total: 72,
      categories: [
        {
          key: 'product_brief',
          label: 'Product brief',
          score: 90,
          maxScore: 100,
          evidence: ['The product outcome and primary audience are explicit.'],
        },
        {
          key: 'rollout',
          label: 'Rollout',
          score: 54,
          maxScore: 100,
          evidence: ['A staged rollout is required, but its owner is not named.'],
        },
      ],
      blockers: ['Rollout owner and rollback decision authority are unconfirmed.'],
      warnings: ['Support escalation coverage is not documented.'],
      missingDetails: ['Named rollout owner', 'Rollback thresholds'],
    },
    prioritizedPlan: [
      {
        name: 'Stabilize the launch path',
        objective: 'Make the rollout measurable and reversible before expanding access.',
        tasks: [
          {
            id: 'task-rollout-owner',
            title: 'Confirm rollout and rollback ownership',
            description:
              'Assign decision authority for each rollout stage and document the rollback trigger.',
            priority: 'P0',
            ownerRole: 'Engineering lead',
            dependencies: [],
            timing: 'T-14 days',
            acceptanceCriteria: [
              'One accountable owner is named for each rollout stage.',
              'Rollback thresholds are published in the launch runbook.',
            ],
            evidenceSources: ['Launch brief', 'Rollout runbook'],
          },
          {
            id: 'task-pilot',
            title: 'Run an internal pilot',
            description:
              'Validate reporting accuracy and support handoffs with a small engineering cohort.',
            priority: 'P1',
            ownerRole: 'Product engineering',
            dependencies: ['task-rollout-owner'],
            timing: 'T-7 days',
            acceptanceCriteria: ['Pilot metrics remain within agreed error budgets.'],
            evidenceSources: ['Pilot dashboard'],
          },
        ],
      },
      {
        name: 'Coordinate release day',
        objective: 'Keep customer communication and operations aligned.',
        tasks: [
          {
            id: 'task-launch-briefing',
            title: 'Hold the launch-day briefing',
            description: 'Review the go/no-go checklist, owners, and escalation path.',
            priority: 'P1',
            ownerRole: 'Launch lead',
            dependencies: ['task-pilot'],
            timing: 'T-1 day',
            acceptanceCriteria: ['Every P0 item has evidence and an accountable owner.'],
            evidenceSources: ['Owner checklist'],
          },
        ],
      },
    ],
    riskRegister: [
      {
        id: 'risk-reporting-drift',
        title: 'Reporting data drifts during rollout',
        description: 'Early customers could make decisions from inconsistent delivery data.',
        level: 'high',
        likelihood: 'possible',
        impact: 'high',
        mitigation: 'Compare source data and launch dashboards at every rollout stage.',
        trigger: 'More than 1% of sampled records disagree with the source system.',
        ownerRole: 'Data engineering lead',
      },
      {
        id: 'risk-support-gap',
        title: 'Support escalation coverage is unclear',
        description: 'Launch questions may not reach the correct engineering owner quickly.',
        level: 'medium',
        likelihood: 'possible',
        impact: 'medium',
        mitigation: 'Publish an escalation matrix and on-call handoff before the pilot.',
        trigger: 'A pilot issue remains unowned for more than 30 minutes.',
        ownerRole: 'Support lead',
      },
    ],
    ownerChecklists: [
      {
        ownerRole: 'Engineering lead',
        items: [
          {
            id: 'check-rollback',
            taskId: 'task-rollout-owner',
            label: 'Publish rollback thresholds and decision authority',
            checked: false,
            priority: 'P0',
            dueGuidance: 'Before the internal pilot',
            acceptanceCriteria: ['Runbook links to current thresholds and named owners.'],
          },
        ],
      },
      {
        ownerRole: 'Support lead',
        items: [
          {
            id: 'check-escalation',
            taskId: 'task-launch-briefing',
            label: 'Confirm support escalation coverage',
            checked: false,
            priority: 'P1',
            dueGuidance: 'T-3 days',
            acceptanceCriteria: ['Escalation path is visible to support and engineering.'],
          },
        ],
      },
    ],
    copySuggestions: [
      {
        channel: 'internal',
        headline: 'Atlas pilot opens to engineering managers',
        body:
          'Atlas brings shared delivery reporting into one workspace. The internal pilot starts with a limited cohort while the team validates accuracy and support handoffs.',
        callToAction: 'Review the pilot guide and report mismatched data.',
        confirmationNeeded: ['Confirm the pilot cohort and start date.'],
      },
      {
        channel: 'email',
        headline: 'A clearer view of engineering delivery is coming',
        body:
          'Atlas is preparing a shared reporting workspace for engineering managers. Availability remains subject to pilot readiness and rollout approval.',
        callToAction: 'Watch for the confirmed launch update.',
        confirmationNeeded: ['Confirm general-availability timing before sending.'],
      },
    ],
    followUpQuestions: [
      {
        id: 'question-rollout-owner',
        question: 'Who owns each staged rollout and the rollback decision?',
        rationale: 'Named decision authority changes the critical path and readiness score.',
        affectedSections: ['readiness', 'plan', 'risks', 'owners'],
      },
    ],
    assetReferences: assets,
    assumptions: [
      'The supplied launch date is the target for the first customer-facing rollout.',
      'No evidence currently proves that rollback thresholds are approved.',
    ],
  };
}

export function createFixtureStreamEvents({
  runId,
  result,
  refinement,
}: {
  runId: string;
  result: LaunchResult;
  refinement: boolean;
}): LaunchStreamEvent[] {
  const timestamp = new Date().toISOString();
  const common = { runId, timestamp };

  if (refinement) {
    return [
      { ...common, type: 'run.started', sequence: 1 },
      {
        ...common,
        type: 'tool.started',
        sequence: 2,
        tool: 'check_launch_readiness',
        message: 'Rechecking readiness with the new owner evidence',
      },
      {
        ...common,
        type: 'text.delta',
        sequence: 3,
        delta: 'Updating the rollout path while preserving the completed plan…',
      },
      {
        ...common,
        type: 'result.partial',
        sequence: 4,
        section: 'summary',
        value: result.summary,
      },
    ];
  }

  return [
    { ...common, type: 'run.started', sequence: 1 },
    {
      ...common,
      type: 'tool.started',
      sequence: 2,
      tool: 'extract_launch_tasks',
      message: 'Extracting launch work from the brief',
    },
    {
      ...common,
      type: 'tool.completed',
      sequence: 3,
      tool: 'extract_launch_tasks',
      message: 'Launch tasks prioritized',
      durationMs: 84,
    },
    {
      ...common,
      type: 'tool.progress',
      sequence: 4,
      tool: 'check_launch_readiness',
      message: 'Scoring evidence against the readiness rubric',
    },
    {
      ...common,
      type: 'text.delta',
      sequence: 5,
      delta: 'Building a reversible staged rollout with explicit owners and launch gates…',
    },
    {
      ...common,
      type: 'tool.completed',
      sequence: 6,
      tool: 'check_launch_readiness',
      message: 'Launch readiness scored',
      durationMs: 112,
    },
    {
      ...common,
      type: 'result.partial',
      sequence: 7,
      section: 'plan',
      value: result.prioritizedPlan,
    },
    {
      ...common,
      type: 'follow_up',
      sequence: 8,
      question: result.followUpQuestions[0],
    },
    {
      ...common,
      type: 'run.completed',
      sequence: 9,
      result,
      usage: { inputTokens: 640, outputTokens: 420, totalTokens: 1060 },
    },
  ];
}
