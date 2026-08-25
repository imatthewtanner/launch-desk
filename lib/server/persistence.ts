import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  LaunchRequestSchema,
  LaunchResultSchema,
  type LaunchRequest,
  type LaunchResult,
} from '@/lib/contracts/launch';
import {
  UsageSummarySchema,
  type LaunchStreamEvent,
} from '@/lib/contracts/stream';

export type LaunchStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type RunErrorCategory = Extract<LaunchStreamEvent, { type: 'error' }>['category'];

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LaunchRecord {
  id: string;
  ownerId: string;
  title: string;
  productBrief: string;
  audience: string;
  launchDate: string;
  constraints: string;
  status: LaunchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunRecord {
  id: string;
  launchId: string;
  ownerId: string;
  parentRunId: string | null;
  status: AgentRunStatus;
  model: string;
  traceId: string | null;
  startedAt: string;
  completedAt: string | null;
  finalResult: LaunchResult | null;
  usageSummary: UsageSummary | null;
  error: RunErrorRecord | null;
}

export interface CreateLaunchInput {
  ownerId: string;
  request: LaunchRequest;
}

export interface StartRunInput {
  ownerId: string;
  launchId: string;
  model: string;
  parentRunId?: string | null;
  traceId?: string | null;
}

export interface RunErrorRecord {
  category: RunErrorCategory;
  message: string;
  retryable: boolean;
  partial?: boolean;
}

export interface LaunchRepository {
  createLaunch(input: CreateLaunchInput): Promise<LaunchRecord>;
  listLaunches(ownerId: string): Promise<LaunchRecord[]>;
  startRun(input: StartRunInput): Promise<AgentRunRecord>;
  completeRun(runId: string, result: LaunchResult, usage: UsageSummary): Promise<void>;
  failRun(runId: string, error: RunErrorRecord): Promise<void>;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryLaunchRepository implements LaunchRepository {
  readonly #launches = new Map<string, LaunchRecord>();
  readonly #runs = new Map<string, AgentRunRecord>();

  async createLaunch({ ownerId, request }: CreateLaunchInput): Promise<LaunchRecord> {
    const parsed = LaunchRequestSchema.parse(request);
    const timestamp = new Date().toISOString();
    const launch: LaunchRecord = {
      id: randomUUID(),
      ownerId,
      title: parsed.title,
      productBrief: parsed.productBrief,
      audience: parsed.audience,
      launchDate: parsed.launchDate,
      constraints: parsed.constraints,
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#launches.set(launch.id, launch);
    return copy(launch);
  }

  async listLaunches(ownerId: string): Promise<LaunchRecord[]> {
    return [...this.#launches.values()]
      .filter((launch) => launch.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(copy);
  }

  async startRun(input: StartRunInput): Promise<AgentRunRecord> {
    const launch = this.#launches.get(input.launchId);
    if (!launch || launch.ownerId !== input.ownerId) {
      throw new Error('The launch does not exist or its owner does not match.');
    }

    if (input.parentRunId) {
      const parent = this.#runs.get(input.parentRunId);
      if (
        !parent ||
        parent.ownerId !== input.ownerId ||
        parent.launchId !== input.launchId
      ) {
        throw new Error('The parent run does not exist or its owner does not match.');
      }
    }

    const run: AgentRunRecord = {
      id: randomUUID(),
      launchId: input.launchId,
      ownerId: input.ownerId,
      parentRunId: input.parentRunId ?? null,
      status: 'running',
      model: input.model,
      traceId: input.traceId ?? null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      finalResult: null,
      usageSummary: null,
      error: null,
    };

    this.#runs.set(run.id, run);
    launch.status = 'running';
    launch.updatedAt = new Date().toISOString();
    return copy(run);
  }

  async completeRun(runId: string, result: LaunchResult, usage: UsageSummary): Promise<void> {
    const run = this.#requireRun(runId);
    const launch = this.#requireLaunch(run.launchId);

    run.finalResult = LaunchResultSchema.parse(result);
    run.usageSummary = UsageSummarySchema.parse(usage);
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    run.error = null;
    launch.status = 'completed';
    launch.updatedAt = run.completedAt;
  }

  async failRun(runId: string, error: RunErrorRecord): Promise<void> {
    const run = this.#requireRun(runId);
    const launch = this.#requireLaunch(run.launchId);
    const completedAt = new Date().toISOString();

    run.status =
      error.category === 'cancelled' ? 'cancelled' : error.partial ? 'partial' : 'failed';
    run.completedAt = completedAt;
    run.error = copy(error);
    launch.status = run.status;
    launch.updatedAt = completedAt;
  }

  inspectLaunch(launchId: string): LaunchRecord | undefined {
    const launch = this.#launches.get(launchId);
    return launch ? copy(launch) : undefined;
  }

  inspectRun(runId: string): AgentRunRecord | undefined {
    const run = this.#runs.get(runId);
    return run ? copy(run) : undefined;
  }

  #requireRun(runId: string): AgentRunRecord {
    const run = this.#runs.get(runId);
    if (!run) throw new Error('Agent run not found.');
    return run;
  }

  #requireLaunch(launchId: string): LaunchRecord {
    const launch = this.#launches.get(launchId);
    if (!launch) throw new Error('Launch not found.');
    return launch;
  }
}

interface LaunchRow {
  id: string;
  user_id: string;
  title: string;
  product_brief: string;
  audience: string;
  launch_date: string;
  constraints: string;
  status: LaunchStatus;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  launch_id: string;
  user_id: string;
  parent_run_id: string | null;
  status: AgentRunStatus;
  model: string;
  trace_id: string | null;
  started_at: string;
  completed_at: string | null;
  final_result: LaunchResult | null;
  usage_summary: UsageSummary | null;
  error_category: RunErrorCategory | null;
  error_message: string | null;
}

function fromLaunchRow(row: LaunchRow): LaunchRecord {
  return {
    id: row.id,
    ownerId: row.user_id,
    title: row.title,
    productBrief: row.product_brief,
    audience: row.audience,
    launchDate: row.launch_date,
    constraints: row.constraints,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromRunRow(row: RunRow): AgentRunRecord {
  return {
    id: row.id,
    launchId: row.launch_id,
    ownerId: row.user_id,
    parentRunId: row.parent_run_id,
    status: row.status,
    model: row.model,
    traceId: row.trace_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    finalResult: row.final_result,
    usageSummary: row.usage_summary,
    error:
      row.error_category && row.error_message
        ? { category: row.error_category, message: row.error_message, retryable: false }
        : null,
  };
}

export class SupabaseLaunchRepository implements LaunchRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createLaunch({ ownerId, request }: CreateLaunchInput): Promise<LaunchRecord> {
    const parsed = LaunchRequestSchema.parse(request);
    const { data, error } = await this.client
      .from('launches')
      .insert({
        user_id: ownerId,
        title: parsed.title,
        product_brief: parsed.productBrief,
        audience: parsed.audience,
        launch_date: parsed.launchDate,
        constraints: parsed.constraints,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Could not create launch: ${error.message}`);
    return fromLaunchRow(data as LaunchRow);
  }

  async listLaunches(ownerId: string): Promise<LaunchRecord[]> {
    const { data, error } = await this.client
      .from('launches')
      .select('*')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Could not list launches: ${error.message}`);
    return (data as LaunchRow[]).map(fromLaunchRow);
  }

  async startRun(input: StartRunInput): Promise<AgentRunRecord> {
    const { data, error } = await this.client
      .from('agent_runs')
      .insert({
        launch_id: input.launchId,
        user_id: input.ownerId,
        parent_run_id: input.parentRunId ?? null,
        status: 'running',
        model: input.model,
        trace_id: input.traceId ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Could not start agent run: ${error.message}`);
    await this.#setLaunchStatus(input.launchId, input.ownerId, 'running');
    return fromRunRow(data as RunRow);
  }

  async completeRun(runId: string, result: LaunchResult, usage: UsageSummary): Promise<void> {
    const parsedResult = LaunchResultSchema.parse(result);
    const parsedUsage = UsageSummarySchema.parse(usage);
    const completedAt = new Date().toISOString();
    const { data, error } = await this.client
      .from('agent_runs')
      .update({
        status: 'completed',
        completed_at: completedAt,
        final_result: parsedResult,
        usage_summary: parsedUsage,
        error_category: null,
        error_message: null,
      })
      .eq('id', runId)
      .select('launch_id,user_id')
      .single();

    if (error) throw new Error(`Could not complete agent run: ${error.message}`);
    const owner = data as { launch_id: string; user_id: string };
    await this.#setLaunchStatus(owner.launch_id, owner.user_id, 'completed');
  }

  async failRun(runId: string, errorRecord: RunErrorRecord): Promise<void> {
    const status: AgentRunStatus =
      errorRecord.category === 'cancelled'
        ? 'cancelled'
        : errorRecord.partial
          ? 'partial'
          : 'failed';
    const { data, error } = await this.client
      .from('agent_runs')
      .update({
        status,
        completed_at: new Date().toISOString(),
        error_category: errorRecord.category,
        error_message: errorRecord.message,
      })
      .eq('id', runId)
      .select('launch_id,user_id')
      .single();

    if (error) throw new Error(`Could not fail agent run: ${error.message}`);
    const owner = data as { launch_id: string; user_id: string };
    await this.#setLaunchStatus(owner.launch_id, owner.user_id, status);
  }

  async #setLaunchStatus(
    launchId: string,
    ownerId: string,
    status: LaunchStatus,
  ): Promise<void> {
    const { error } = await this.client
      .from('launches')
      .update({ status })
      .eq('id', launchId)
      .eq('user_id', ownerId);

    if (error) throw new Error(`Could not update launch status: ${error.message}`);
  }
}
