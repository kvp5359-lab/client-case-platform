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
  documentSources: (projectId: string) =>
    ['google-drive', 'document-sources', projectId] as const,
  sourceDocuments: (projectId: string) =>
    ['google-drive', 'source-documents', projectId] as const,
  /** Broad-префикс для сброса правой панели «Из источника» всех проектов. */
  sourceDocumentsAll: () => ['google-drive', 'source-documents'] as const,
  kitSourceDocuments: (kitId: string) =>
    ['google-drive', 'kit-source-documents', kitId] as const,
  /** Broad-префикс для сброса лотков всех наборов проекта. */
  kitSourceDocumentsAll: () => ['google-drive', 'kit-source-documents'] as const,
  /** Лента файлов из источников по всему воркспейсу («Обновления источников»). */
  workspaceSourceUpdates: (workspaceId: string) =>
    ['google-drive', 'workspace-source-updates', workspaceId] as const,
  /** Broad-префикс для сброса ленты обновлений источников любого воркспейса. */
  workspaceSourceUpdatesAll: () => ['google-drive', 'workspace-source-updates'] as const,
  /** Непрочитанные обновления источников по проектам (бейдж сайдбара + кнопки). */
  sourceUpdatesUnread: (workspaceId: string) =>
    ['google-drive', 'source-updates-unread', workspaceId] as const,
  /** Broad-префикс для сброса непрочитанного обновлений источников. */
  sourceUpdatesUnreadAll: () => ['google-drive', 'source-updates-unread'] as const,
  /** Мои отметки прочтения + epoch (клиентский фильтр «только непрочитанные»).
   *  Под префиксом sourceUpdatesUnreadAll — мутации «Прочитать» сбрасывают и его. */
  sourceUpdateReadMarks: () => ['google-drive', 'source-updates-unread', 'marks'] as const,
  /** Проекты воркспейса, где пользователь — исполнитель (скоуп ленты обновлений). */
  executorProjectIds: (workspaceId: string) =>
    ['google-drive', 'executor-project-ids', workspaceId] as const,
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

/**
 * Серверно-отфильтрованные данные доски (вариант A — union-prefilter).
 * Ключ включает сериализованный union-фильтр: при смене фильтров списков
 * запрос автоматически перевыбирается.
 *
 * ⚠️ КОНТРАКТ: ключи НАМЕРЕННО вложены под префиксы родительских данных —
 * threads под `['workspace-threads', ws]` (= workspaceThreadKeys.workspace),
 * projects под `['accessible-projects', ws]` (= accessibleProjectKeys.workspace).
 * Доска читает производные от них данные, поэтому ЛЮБАЯ существующая
 * инвалидация workspaceThreadKeys.workspace(ws) / accessibleProjectKeys.all
 * (панель задач, мутации статуса/дедлайна, удаление и т.д.) благодаря
 * partial-prefix matching React Query автоматически рефетчит и доску. Без этого
 * пришлось бы добавлять board-инвалидацию в десятки мутаций. НЕ менять первые
 * два сегмента, иначе доска перестанет обновляться на правки извне.
 */
export const boardFilteredKeys = {
  threadsAll: (workspaceId: string) => ['workspace-threads', workspaceId, 'board'] as const,
  threads: (workspaceId: string, userId: string | undefined, filterKey: string) =>
    ['workspace-threads', workspaceId, 'board', userId, filterKey] as const,
  projectsAll: (workspaceId: string) => ['accessible-projects', workspaceId, 'board'] as const,
  projects: (workspaceId: string, userId: string | undefined, filterKey: string) =>
    ['accessible-projects', workspaceId, 'board', userId, filterKey] as const,
}

/** Разделы (workspace_sections) — группировка досок и списков. */
export const sectionKeys = {
  all: ['sections'] as const,
  byWorkspace: (workspaceId: string) => ['sections', workspaceId] as const,
  /** Все членства (section_items) воркспейса — карта раздел↔элемент. */
  items: (workspaceId: string) => ['section-items', workspaceId] as const,
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
 * Google Drive — имя папки по ID (cache friendly).
 */
export const driveFolderKeys = {
  all: ['drive-folder-name'] as const,
  byFolder: (folderId: string, workspaceId: string) =>
    ['drive-folder-name', folderId, workspaceId] as const,
}

/**
 * Профиль подбора ВНЖ проекта (case_profiles, один на проект).
 */
export const caseProfileKeys = {
  all: ['case-profile'] as const,
  byProject: (projectId: string) => ['case-profile', projectId] as const,
}

/**
 * Секции профиля пользователя (личный TG-статус, свой participant и т.п.).
 * Раньше были литералами в PersonalTelegramSection (один из них залезал в
 * чужой namespace 'participant').
 */
export const profileSectionKeys = {
  selfParticipant: (workspaceId: string, userId: string) =>
    ['profile', 'self-participant', workspaceId, userId] as const,
  tgStatus: (workspaceId: string, userId: string) =>
    ['profile', 'tg-status', workspaceId, userId] as const,
}

/** Имена закреплённых тредов в сайдбаре (батч по id). */
export const favoriteThreadNamesKeys = {
  all: ['favorite-thread-names'] as const,
  byWorkspaceThreads: (workspaceId: string, threadIds: string[]) =>
    ['favorite-thread-names', workspaceId, threadIds] as const,
}

/** Уже существующие треды проекта при добавлении из шаблона. */
export const addFromTemplateKeys = {
  existingThreads: (projectId: string) =>
    ['add-from-template', 'existing-threads', projectId] as const,
}

/** Участники проектов по ролям (для фильтров/таблиц списков). */
export const projectPeopleByRoleKeys = {
  all: ['project-people-by-role'] as const,
  byKey: (key: string) => ['project-people-by-role', key] as const,
}

/** Справочники для редактора быстрых действий сайдбара. */
export const quickActionsEditorKeys = {
  projectTemplates: (workspaceId: string) => ['qa-project-templates', workspaceId] as const,
  threadTemplates: (workspaceId: string) => ['qa-thread-templates', workspaceId] as const,
  projects: (workspaceId: string) => ['qa-projects', workspaceId] as const,
}

/** Имя контакта проекта по participant_id (Google Drive секция). */
export const projectContactNameKeys = {
  byParticipant: (participantId: string) => ['project-contact-name', participantId] as const,
}
