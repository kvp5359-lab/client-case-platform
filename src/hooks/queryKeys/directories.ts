/**
 * Query keys для справочников (custom directories, statuses, quick-replies).
 */

export const customDirectoryKeys = {
  all: ['custom-directories'] as const,
  byWorkspace: (workspaceId: string) => ['custom-directories', workspaceId] as const,
  detail: (directoryId: string) => ['custom-directories', 'detail', directoryId] as const,
  fields: (directoryId: string) => ['custom-directories', 'fields', directoryId] as const,
  entries: (directoryId: string) => ['custom-directories', 'entries', directoryId] as const,
  entryValues: (entryId: string) => ['custom-directories', 'entry-values', entryId] as const,
}

export const statusKeys = {
  document: (workspaceId: string) => ['statuses', 'document', workspaceId] as const,
  documentKit: (workspaceId: string) => ['statuses', 'document_kit', workspaceId] as const,
  task: (workspaceId: string) => ['statuses', 'task', workspaceId] as const,
  /** Все project-статусы воркспейса (общие + привязанные к шаблонам) одним списком — клиент сам фильтрует. */
  project: (workspaceId: string) => ['statuses', 'project', workspaceId] as const,
  knowledgeArticle: (workspaceId: string) =>
    ['statuses', 'knowledge_article', workspaceId] as const,
  /** Детали одного статуса по id (имя + цвет) — для UI-чипов. */
  detailById: (statusId: string | null | undefined) =>
    ['status-detail', statusId ?? ''] as const,
  /** Project-статусы конкретного шаблона (через junction). */
  projectByTemplate: (workspaceId: string | undefined, templateId: string | null | undefined) =>
    ['statuses', 'project-template', workspaceId ?? '', templateId ?? ''] as const,
}

export const quickReplyKeys = {
  all: ['quick-replies'] as const,
  groups: (workspaceId: string) => ['quick-replies', 'groups', workspaceId] as const,
  list: (workspaceId: string) => ['quick-replies', 'list', workspaceId] as const,
  groupAccess: (groupId: string) => ['quick-replies', 'group-access', groupId] as const,
  replyAccess: (replyId: string) => ['quick-replies', 'reply-access', replyId] as const,
  forPicker: (workspaceId: string, templateId?: string | null) =>
    ['quick-replies', 'picker', workspaceId, templateId ?? 'all'] as const,
}
