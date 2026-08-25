import {
  OwnerChecklistSchema,
  type NormalizedTask,
  type OwnerChecklist,
  type Priority,
} from '@/lib/contracts/launch';

const priorityRank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };

function normalizedRole(value: string): string {
  return value.trim().replace(/\s+/g, ' ') || 'Unassigned role';
}

export function generateOwnerChecklists(tasks: NormalizedTask[]): OwnerChecklist[] {
  const groups = new Map<string, { ownerRole: string; tasks: NormalizedTask[] }>();

  for (const task of tasks) {
    const ownerRole = normalizedRole(task.ownerRole);
    const key = ownerRole.toLocaleLowerCase('en-US');
    const group = groups.get(key) ?? { ownerRole, tasks: [] };

    if (!group.tasks.some((groupedTask) => groupedTask.id === task.id)) {
      group.tasks.push(task);
    }
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(({ ownerRole, tasks: ownerTasks }) =>
      OwnerChecklistSchema.parse({
        ownerRole,
        items: ownerTasks
          .sort(
            (left, right) =>
              priorityRank[left.priority] - priorityRank[right.priority] ||
              left.title.localeCompare(right.title),
          )
          .map((task) => ({
            id: `check-${task.id}`,
            taskId: task.id,
            label: task.title,
            checked: false,
            priority: task.priority,
            dueGuidance: task.timing,
            acceptanceCriteria: task.acceptanceCriteria,
          })),
      }),
    )
    .sort((left, right) => {
      if (left.ownerRole === 'Unassigned role') return 1;
      if (right.ownerRole === 'Unassigned role') return -1;
      return left.ownerRole.localeCompare(right.ownerRole);
    });
}
