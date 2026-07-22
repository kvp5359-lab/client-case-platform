/**
 * Query keys для модуля «План».
 *
 * Паттерн фабрики как у остальных доменов (см. documents.ts, projects.ts):
 * `all` — broad-prefix для инвалидации, `byProject` — конкретный проект.
 */

export const planKeys = {
  all: ['plan'] as const,
  byProject: (projectId: string) => ['plan', projectId] as const,
  templateByTemplate: (templateId: string) => ['plan', 'template', templateId] as const,
}

/** «Группы задач» проекта + карта «задача → группа» (см. useProjectTaskGroups). */
export const taskGroupKeys = {
  byProject: (projectId: string) => ['task-groups', projectId] as const,
  membership: (projectId: string) => ['task-group-membership', projectId] as const,
}
