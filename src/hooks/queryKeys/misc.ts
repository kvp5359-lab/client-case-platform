/**
 * Прочие query-ключи, не попавшие в тематические модули: autofill, history,
 * Google Drive, email-accounts/inbound, comments, tasks, taskPanelTabs, trash,
 * itemLists, boards, myTaskCounts, userSettings.
 */

export const userSettingsKeys = {
  all: ['user-settings'] as const,
  byUser: (userId: string) => ['user-settings', userId] as const,
}

export const globalSearchKeys = {
  all: ['global-search'] as const,
  byWorkspaceQuery: (workspaceId: string, query: string) =>
    ['global-search', workspaceId, query] as const,
}

export const recentlyViewedKeys = {
  all: ['recently-viewed'] as const,
  byWorkspace: (workspaceId: string) => ['recently-viewed', workspaceId] as const,
}

export const googleDriveKeys = {
  all: ['google-drive'] as const,
  connection: (userId: string) => ['google-drive', 'connection', userId] as const,
  sourceDocuments: (projectId: string) =>
    ['google-drive', 'source-documents', projectId] as const,
  destinationDocuments: (exportFolderId: string, workspaceId: string) =>
    ['google-drive', 'destination-documents', exportFolderId, workspaceId] as const,
}

export const emailAccountKeys = {
  all: ['email-accounts'] as const,
  byUser: (userId: string) => ['email-accounts', userId] as const,
  emailLink: (threadId: string) => ['email-accounts', 'link', threadId] as const,
}

export const emailInboundKeys = {
  all: ['email-inbound-unmatched'] as const,
  byWorkspace: (workspaceId: string) =>
    ['email-inbound-unmatched', workspaceId] as const,
  byWorkspaceUnresolved: (workspaceId: string) =>
    ['email-inbound-unmatched', workspaceId, 'unresolved'] as const,
}

export const commentKeys = {
  all: ['comments'] as const,
  byEntity: (entityType: string, entityId: string) => ['comments', entityType, entityId] as const,
  // Хешируем entityIds вместо spread — предотвращает огромные ключи
  // и путаницу кэшей при разном порядке IDs
  counts: (entityType: string, entityIds: string[]) =>
    ['comments', 'counts', entityType, [...entityIds].sort().join(',')] as const,
  /**
   * Префикс для всех «comments counts» кэшей — используется при broad-invalidate,
   * когда нужно сбросить все counts сразу (на create/delete комментария).
   */
  countsAll: ['comments', 'counts'] as const,
}

export const taskKeys = {
  /** Prefix for broad-invalidate: matches all workspaces. */
  allUrgent: ['my-urgent-tasks-count'] as const,
  urgentCount: (workspaceId: string) => ['my-urgent-tasks-count', workspaceId] as const,
}

export const taskPanelTabsKeys = {
  all: ['task-panel-tabs'] as const,
  byProjectUser: (projectId: string, userId: string) =>
    ['task-panel-tabs', projectId, userId] as const,
}

/**
 * Корзина воркспейса — мягко удалённые проекты и треды.
 */
export const trashKeys = {
  all: ['trash'] as const,
  workspace: (workspaceId: string) => ['trash', workspaceId] as const,
  projects: (workspaceId: string) => ['trash', workspaceId, 'projects'] as const,
  threads: (workspaceId: string) => ['trash', workspaceId, 'threads'] as const,
  contextItems: (workspaceId: string) => ['trash', workspaceId, 'context-items'] as const,
}

export const itemListKeys = {
  all: ['item-lists'] as const,
  byWorkspace: (workspaceId: string) => ['item-lists', 'workspace', workspaceId] as const,
  detail: (listId: string) => ['item-lists', 'detail', listId] as const,
}

export const boardKeys = {
  all: ['boards'] as const,
  byWorkspace: (workspaceId: string) => ['boards', 'workspace', workspaceId] as const,
  detail: (boardId: string) => ['boards', boardId] as const,
  lists: (boardId: string) => ['boards', boardId, 'lists'] as const,
  members: (boardId: string) => ['boards', boardId, 'members'] as const,
  /**
   * Список «projects для boards-фильтра» в воркспейсе. Отдельный ключ от
   * projectKeys, потому что BoardsPage показывает проекты сквозь свой API
   * с другим набором полей (BoardProject vs Project).
   */
  projectsByWorkspace: (workspaceId: string) => ['boards', 'projects', workspaceId] as const,
  /** Ручной порядок карточек по всем спискам доски (board_list_item_order). */
  itemOrders: (boardId: string) => ['boards', boardId, 'item-orders'] as const,
}

export const myTaskCountsKeys = {
  /** Префикс для broad-invalidate во всех воркспейсах. */
  all: ['my-task-counts'] as const,
  byWorkspace: (workspaceId: string) =>
    ['my-task-counts', workspaceId] as const,
}

export const autofillKeys = {
  projectDocuments: (projectId: string) => ['project-documents-for-autofill', projectId] as const,
}

export const historyKeys = {
  all: ['history'] as const,
  byProject: (projectId: string) => ['history', projectId] as const,
  unreadCount: (projectId: string) => ['history', 'unread-count', projectId] as const,
}

/**
 * Календарь: треды-задачи с заполненными start_at/end_at, видимые в time-grid.
 * Ключ зависит от диапазона дат, чтобы кэш не путал «эта неделя» и «следующая».
 */
export const calendarKeys = {
  all: ['calendar'] as const,
  byWorkspaceRange: (workspaceId: string, fromIso: string, toIso: string) =>
    ['calendar', workspaceId, fromIso, toIso] as const,
}

/**
 * Внешние календари (Google и т.п.) — события через external_calendar_events.
 */
export const externalCalendarKeys = {
  all: ['external-calendar-events'] as const,
  byWorkspace: (workspaceId: string) => ['external-calendar-events', workspaceId] as const,
  byWorkspaceCalendars: (workspaceId: string, calendarIdsKey: string) =>
    ['external-calendar-events', workspaceId, calendarIdsKey] as const,
}

/**
 * Флаги шаблонов («qr-flags») — feature flags для конкретной сущности.
 */
export const qrFlagsKeys = {
  all: ['qr-flags'] as const,
  byEntity: (entityType: string, entityId: string) =>
    ['qr-flags', entityType, entityId] as const,
}

/**
 * «Контекст проекта» — внутренние материалы команды.
 */
export const projectContextKeys = {
  all: ['project-context'] as const,
  byProject: (projectId: string) => ['project-context', 'by-project', projectId] as const,
}

/**
 * Google Drive — имя папки по ID (cache friendly).
 */
export const driveFolderKeys = {
  all: ['drive-folder-name'] as const,
  byFolder: (folderId: string, workspaceId: string) =>
    ['drive-folder-name', folderId, workspaceId] as const,
}
