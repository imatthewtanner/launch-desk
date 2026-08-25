import { z } from 'zod';

import {
  NormalizedTaskSchema,
  type NormalizedTask,
  type Priority,
} from '@/lib/contracts/launch';
import {
  ExtractLaunchTasksInputSchema,
  type CandidateTask,
  type ExtractLaunchTasksInput,
} from '@/lib/tools/types';

const priorityRank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function duplicateKey(value: string): string {
  return collapseWhitespace(value).toLocaleLowerCase('en-US');
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return slug || `task-${stableHash(value)}`;
}

function mergeUnique(values: string[], additions: string[]): string[] {
  const seen = new Set(values.map(duplicateKey));
  const merged = [...values];

  for (const addition of additions) {
    const normalized = collapseWhitespace(addition);
    const key = duplicateKey(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(normalized);
    }
  }

  return merged;
}

interface MergedCandidate extends CandidateTask {
  originalIndex: number;
}

function mergeCandidate(existing: MergedCandidate, candidate: CandidateTask): void {
  const candidateIsMoreUrgent = priorityRank[candidate.priority] < priorityRank[existing.priority];

  if (candidateIsMoreUrgent) {
    existing.priority = candidate.priority;
    existing.timing = collapseWhitespace(candidate.timing);
  }
  if (collapseWhitespace(candidate.description).length > existing.description.length) {
    existing.description = collapseWhitespace(candidate.description);
  }
  if (!collapseWhitespace(existing.ownerRole ?? '') && collapseWhitespace(candidate.ownerRole ?? '')) {
    existing.ownerRole = collapseWhitespace(candidate.ownerRole ?? '');
  }

  existing.dependencies = mergeUnique(existing.dependencies, candidate.dependencies);
  existing.acceptanceCriteria = mergeUnique(
    existing.acceptanceCriteria,
    candidate.acceptanceCriteria,
  );
  existing.evidenceSources = mergeUnique(existing.evidenceSources, candidate.evidenceSources);
}

function sortWithDependencies(tasks: NormalizedTask[], originalOrder: Map<string, number>): NormalizedTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const remainingDependencies = new Map(
    tasks.map((task) => [
      task.id,
      new Set(task.dependencies.filter((dependency) => byId.has(dependency))),
    ]),
  );
  const sorted: NormalizedTask[] = [];
  const remaining = new Set(tasks.map((task) => task.id));

  const compare = (left: NormalizedTask, right: NormalizedTask) =>
    priorityRank[left.priority] - priorityRank[right.priority] ||
    (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0) ||
    left.id.localeCompare(right.id);

  while (remaining.size > 0) {
    const ready = [...remaining]
      .map((id) => byId.get(id) as NormalizedTask)
      .filter((task) => (remainingDependencies.get(task.id)?.size ?? 0) === 0)
      .sort(compare);

    const next = ready[0] ?? [...remaining].map((id) => byId.get(id) as NormalizedTask).sort(compare)[0];
    sorted.push(next);
    remaining.delete(next.id);

    for (const dependencies of remainingDependencies.values()) {
      dependencies.delete(next.id);
    }
  }

  return sorted;
}

export function extractLaunchTasks(input: ExtractLaunchTasksInput): NormalizedTask[] {
  const parsed = ExtractLaunchTasksInputSchema.parse(input);
  const mergedByTitle = new Map<string, MergedCandidate>();

  parsed.tasks.forEach((candidate, originalIndex) => {
    const key = duplicateKey(candidate.title);
    const existing = mergedByTitle.get(key);

    if (existing) {
      mergeCandidate(existing, candidate);
      return;
    }

    mergedByTitle.set(key, {
      ...candidate,
      title: collapseWhitespace(candidate.title),
      description: collapseWhitespace(candidate.description),
      ownerRole: collapseWhitespace(candidate.ownerRole ?? ''),
      dependencies: candidate.dependencies.map(collapseWhitespace),
      timing: collapseWhitespace(candidate.timing),
      acceptanceCriteria: candidate.acceptanceCriteria.map(collapseWhitespace),
      evidenceSources: candidate.evidenceSources.map(collapseWhitespace),
      originalIndex,
    });
  });

  const usedIds = new Set<string>();
  const idByTitle = new Map<string, string>();
  for (const [key, candidate] of mergedByTitle) {
    const baseId = slugify(candidate.title);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    idByTitle.set(key, id);
  }

  const originalOrder = new Map<string, number>();
  const normalized = [...mergedByTitle.entries()].map(([key, candidate]) => {
    const id = idByTitle.get(key) as string;
    originalOrder.set(id, candidate.originalIndex);
    const dependencies = mergeUnique(
      [],
      candidate.dependencies.map((dependency) => {
        const knownId = idByTitle.get(duplicateKey(dependency));
        return knownId ?? slugify(dependency);
      }),
    ).filter((dependency) => dependency !== id);

    return NormalizedTaskSchema.parse({
      id,
      title: candidate.title,
      description: candidate.description,
      priority: candidate.priority,
      ownerRole: collapseWhitespace(candidate.ownerRole ?? '') || 'Unassigned role',
      dependencies,
      timing: candidate.timing,
      acceptanceCriteria: candidate.acceptanceCriteria,
      evidenceSources: candidate.evidenceSources,
    });
  });

  return z.array(NormalizedTaskSchema).parse(sortWithDependencies(normalized, originalOrder));
}
