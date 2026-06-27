/**
 * Query keys для повторяющихся задач (recurring_task_rules).
 * План: docs/feature-backlog/2026-06-27-recurring-tasks.md
 */
export const recurringKeys = {
  all: ['recurring-rules'] as const,
  byWorkspace: (workspaceId: string) => ['recurring-rules', workspaceId] as const,
  byId: (ruleId: string) => ['recurring-rules', 'detail', ruleId] as const,
}
