/**
 * Query keys для шаблонов тредов, доступа к шаблонам, маршрутизации лидов
 * и шаблонов слотов.
 */

export const threadTemplateKeys = {
  all: ['thread-templates'] as const,
  byWorkspace: (workspaceId: string) => ['thread-templates', workspaceId] as const,
  /** Global templates only (owner_project_template_id IS NULL). */
  globalByWorkspace: (workspaceId: string) =>
    ['thread-templates', workspaceId, 'global'] as const,
  /** Templates visible inside a project of given type: global + scoped. */
  forProjectContext: (workspaceId: string, projectTemplateId: string | null) =>
    ['thread-templates', workspaceId, 'project-context', projectTemplateId ?? 'none'] as const,
  /** Only templates scoped to a specific project template (for the editor). */
  byProjectTemplate: (projectTemplateId: string) =>
    ['thread-templates', 'by-project-template', projectTemplateId] as const,
}

/** Шаблоны воронок/lead-routing/funnel — все висели инлайном. */
export const templatesForRoutingKeys = {
  forFunnel: (workspaceId: string) => ['project-templates-for-funnel', workspaceId] as const,
  forLeadRouting: (workspaceId: string) =>
    ['project-templates-for-lead-routing', workspaceId] as const,
  defaultLeadTemplates: (workspaceId: string) =>
    ['workspace-default-lead-templates', workspaceId] as const,
  // templateIdForProject удалён в T4 — дублировал projectTemplateKeys.idByProject
  // (тот же ключ ['project-template-id', projectId]). Используй idByProject.
}

/**
 * Реестр слотов шаблонов и наборов уже есть выше (folderTemplateSlotKeys,
 * documentKitTemplateKeys.kitFolderSlots). Тут только новый ключ для пикера
 * slot-templates на уровне воркспейса.
 */
export const slotTemplatesKeys = {
  all: ['slot-templates'] as const,
  byWorkspace: (workspaceId: string) => ['slot-templates', workspaceId] as const,
}
