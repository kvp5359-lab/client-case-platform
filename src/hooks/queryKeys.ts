/**
 * Фабрика query keys для React Query
 *
 * Единый источник правды для всех ключей кэша.
 * Использование: import { formKitKeys, documentKitKeys } from '@/hooks/queryKeys'
 */

/**
 * Константы staleTime. Вместо магических чисел по файлам —
 * единые «тайминги свежести» по характеру данных.
 *
 * SHORT    —  30s: часто меняющиеся списки (inbox, live-треды, realtime).
 * STANDARD —  1min: типичный дефолт — формы, сессии, списки участников.
 * MEDIUM   —  2min: списки-обзоры (проекты, задачи, документы проекта).
 * LONG     —  5min: почти статичное (роли, шаблоны, permissions, settings).
 */
export const STALE_TIME = {
  SHORT: 30_000,
  STANDARD: 60_000,
  MEDIUM: 2 * 60_000,
  LONG: 5 * 60_000,
} as const

/**
 * Стандартные значения gcTime (как долго данные живут в кэше после того, как
 * перестают быть нужными). Дольше staleTime — иначе данные удаляются раньше,
 * чем устаревают.
 */
export const GC_TIME = {
  STANDARD: 5 * 60_000,
  LONG: 10 * 60_000,
} as const

export const formKitKeys = {
  all: ['form-kit'] as const,
  byProject: (projectId: string) => ['form-kit', 'project', projectId] as const,
  byId: (formKitId: string) => ['form-kit', formKitId] as const,
  detail: (formKitId: string) => ['form-kit', formKitId, 'detail'] as const,
  structure: (formKitId: string) => ['form-kit', formKitId, 'structure'] as const,
  fieldValues: (formKitId: string) => ['form-kit', formKitId, 'field-values'] as const,
  compositeItems: (formKitId: string) => ['form-kit', formKitId, 'composite-items'] as const,
  selectOptions: (formKitId: string) => ['form-kit', formKitId, 'select-options'] as const,
}

export const documentKitKeys = {
  all: ['documentKits'] as const,
  byProject: (projectId: string) => ['documentKits', projectId] as const,
}

export const documentKeys = {
  /** Prefix for broad-invalidate of all document caches. */
  all: ['documents'] as const,
}

export const kitlessDocumentKeys = {
  all: ['kitless-documents'] as const,
  byProject: (projectId: string) => ['kitless-documents', projectId] as const,
}

export const projectKeys = {
  all: ['projects'] as const,
  detail: (projectId: string) => ['projects', projectId] as const,
  folderCheck: (projectId: string) => ['projects', 'folder-check', projectId] as const,
  /**
   * Префикс для broad-invalidate: инвалидирует все варианты project-listing'а
   * в воркспейсе (они используют ['projects', workspaceId, userId, isOwner, canViewAll]).
   * Partial match захватит все такие кэши разом.
   */
  byWorkspace: (workspaceId: string) => ['projects', workspaceId] as const,
  /**
   * Полный ключ для чтения списка проектов с учётом прав пользователя.
   * Права влияют на queryFn (get_user_projects(..., canViewAll)), поэтому
   * включены в ключ — иначе смена роли не заставит React Query перегрузить данные.
   */
  listForUser: (
    workspaceId: string,
    userId: string | undefined,
    isOwner: boolean,
    canViewAll: boolean,
  ) => ['projects', workspaceId, userId, isOwner, canViewAll] as const,
  /** Кэш «участники проектов воркспейса» для фильтра в /projects. */
  participantsFilter: (workspaceId: string | null | undefined) =>
    ['project-participants-filter', workspaceId ?? ''] as const,
}

export const folderSlotKeys = {
  all: ['folder-slots'] as const,
  byProject: (projectId: string) => ['folder-slots', projectId] as const,
  byProjectForTasks: (projectId: string) => ['folder-slots', projectId, 'tasks'] as const,
}

export const folderTemplateSlotKeys = {
  all: ['folder-template-slots'] as const,
  byTemplate: (templateId: string) => ['folder-template-slots', templateId] as const,
}

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (workspaceId: string) => ['workspaces', workspaceId] as const,
  userWorkspaces: (userEmail: string) => ['workspaces', 'user', userEmail] as const,
}

export const sidebarKeys = {
  /** All sidebar project lists for a workspace (any canViewAll value) */
  projectsBase: (workspaceId: string) => ['sidebar', 'projects', workspaceId] as const,
  projects: (workspaceId: string, canViewAll: boolean) =>
    ['sidebar', 'projects', workspaceId, canViewAll] as const,
  projectsSearch: (workspaceId: string, canViewAll: boolean, query: string) =>
    ['sidebar', 'projects', workspaceId, 'search', canViewAll, query] as const,
}

export const userSettingsKeys = {
  all: ['user-settings'] as const,
  byUser: (userId: string) => ['user-settings', userId] as const,
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

export const knowledgeBaseKeys = {
  all: ['knowledge-base'] as const,
  articles: (workspaceId: string) => ['knowledge-base', 'articles', workspaceId] as const,
  article: (articleId: string) => ['knowledge-base', 'article', articleId] as const,
  articleGroups: (articleId: string) => ['knowledge-base', 'article-groups', articleId] as const,
  groups: (workspaceId: string) => ['knowledge-base', 'groups', workspaceId] as const,
  templateArticles: (templateId: string) =>
    ['knowledge-base', 'template-articles', templateId] as const,
  templateGroups: (templateId: string) =>
    ['knowledge-base', 'template-groups', templateId] as const,
  projectArticles: (templateId: string) =>
    ['knowledge-base', 'project-articles', templateId] as const,
  // Доступ: какие шаблоны привязаны к группе/статье
  groupAccess: (groupId: string) => ['knowledge-base', 'group-access', groupId] as const,
  articleAccess: (articleId: string) => ['knowledge-base', 'article-access', articleId] as const,
  // AI-поиск
  conversations: (workspaceId: string, projectId?: string) =>
    ['knowledge-base', 'conversations', workspaceId, projectId ?? 'admin'] as const,
  messages: (conversationId: string) => ['knowledge-base', 'messages', conversationId] as const,
  indexStatus: (articleId: string) => ['knowledge-base', 'index-status', articleId] as const,
  // Версии
  versions: (articleId: string) => ['knowledge-base', 'versions', articleId] as const,
  version: (versionId: string) => ['knowledge-base', 'version', versionId] as const,
  // Теги
  tags: (workspaceId: string) => ['knowledge-base', 'tags', workspaceId] as const,
  // Q&A
  qa: (workspaceId: string) => ['knowledge-base', 'qa', workspaceId] as const,
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

export const inboxKeys = {
  all: ['inbox'] as const,
  /** Ключ inbox-кеша (thread-level). v1 удалён, остался только v2. */
  threads: (workspaceId: string) => ['inbox', 'threads-v2', workspaceId] as const,
  /** @deprecated Используй `threads`. Алиас для обратной совместимости. */
  threadsV2: (workspaceId: string) => ['inbox', 'threads-v2', workspaceId] as const,
}

export const taskKeys = {
  /** Prefix for broad-invalidate: matches all workspaces. */
  allUrgent: ['my-urgent-tasks-count'] as const,
  urgentCount: (workspaceId: string) => ['my-urgent-tasks-count', workspaceId] as const,
}

export const workspaceThreadKeys = {
  all: ['workspace-threads'] as const,
  /** Префикс для broad-invalidate: сбрасывает треды для всех пользователей в воркспейсе */
  workspace: (workspaceId: string) => ['workspace-threads', workspaceId] as const,
  /** Полный ключ с user id — используется при чтении, чтобы разные юзеры имели разные кэши */
  forUser: (workspaceId: string, userId: string | undefined) =>
    ['workspace-threads', workspaceId, userId] as const,
}

export const currentParticipantKeys = {
  all: ['current-participant'] as const,
  forUser: (workspaceId: string, userId: string | undefined) =>
    ['current-participant', workspaceId, userId] as const,
}

export const accessibleProjectKeys = {
  all: ['accessible-projects'] as const,
  workspace: (workspaceId: string) => ['accessible-projects', workspaceId] as const,
  forUser: (workspaceId: string, userId: string | undefined) =>
    ['accessible-projects', workspaceId, userId] as const,
}

/**
 * Инвалидировать все кэши мессенджера: inbox v2 + sidebar projects.
 * Вызывать после markAsRead, markAsUnread, отправки сообщения, реакций и т.д.
 */
export function invalidateMessengerCaches(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void },
  workspaceId: string,
) {
  queryClient.invalidateQueries({ queryKey: inboxKeys.threadsV2(workspaceId) })
  queryClient.invalidateQueries({ queryKey: sidebarKeys.projects(workspaceId, true) })
  queryClient.invalidateQueries({ queryKey: sidebarKeys.projects(workspaceId, false) })
}

/**
 * Messenger-кэши привязаны к thread_id.
 * Legacy-режим (projectId+channel) удалён в рамках audit S1 cleanup:
 * все callers используют threadId-based ключи, в БД нет сообщений без thread_id.
 */
export const messengerKeys = {
  all: ['messenger'] as const,
  messagesByThreadId: (threadId: string) => ['messenger', 'messages', 'chat', threadId] as const,
  unreadCountByThreadId: (threadId: string) =>
    ['messenger', 'unread-count', 'chat', threadId] as const,
  telegramLinkByThreadId: (threadId: string) =>
    ['messenger', 'telegram-link', 'chat', threadId] as const,
  lastReadAtByThreadId: (threadId: string) =>
    ['messenger', 'last-read-at', 'chat', threadId] as const,
  /** Агрегированная карта last_read_at по всем тредам проекта — для «Всей истории» в TaskPanel. */
  lastReadAtByProject: (projectId: string, userId: string) =>
    ['messenger', 'last-read-at', 'project', projectId, userId] as const,
  /**
   * Префикс для broad-invalidate карты last_read_at в проекте — без userId.
   * React Query matches partial prefix → попадёт в lastReadAtByProject любого
   * пользователя в кэше (фактически только один — сам пользователь сессии).
   */
  lastReadAtByProjectPrefix: (projectId: string) =>
    ['messenger', 'last-read-at', 'project', projectId] as const,
  searchByThreadId: (threadId: string, query: string) =>
    ['messenger', 'search', 'chat', threadId, query] as const,
  projectThreads: (projectId: string) => ['messenger', 'project-chats', projectId] as const,
}

export const documentGenerationKeys = {
  all: ['document-generations'] as const,
  byProject: (projectId: string) => ['document-generations', projectId] as const,
}

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

export const documentTemplateKeys = {
  all: ['document-templates'] as const,
  byWorkspace: (workspaceId: string) => ['document-templates', workspaceId] as const,
  detail: (templateId: string) => ['document-templates', 'detail', templateId] as const,
}

export const customDirectoryKeys = {
  all: ['custom-directories'] as const,
  byWorkspace: (workspaceId: string) => ['custom-directories', workspaceId] as const,
  detail: (directoryId: string) => ['custom-directories', 'detail', directoryId] as const,
  fields: (directoryId: string) => ['custom-directories', 'fields', directoryId] as const,
  entries: (directoryId: string) => ['custom-directories', 'entries', directoryId] as const,
  entryValues: (entryId: string) => ['custom-directories', 'entry-values', entryId] as const,
}

export const autofillKeys = {
  projectDocuments: (projectId: string) => ['project-documents-for-autofill', projectId] as const,
}

export const historyKeys = {
  all: ['history'] as const,
  byProject: (projectId: string) => ['history', projectId] as const,
  unreadCount: (projectId: string) => ['history', 'unread-count', projectId] as const,
}

export const permissionKeys = {
  participantRoles: (workspaceId: string, userId?: string) =>
    ['participant-roles', workspaceId, userId] as const,
  workspaceRoles: (workspaceId: string) => ['workspace-roles', workspaceId] as const,
  workspaceFeatures: (workspaceId: string) => ['workspace-features', workspaceId] as const,
  projectWorkspace: (projectId: string) => ['project-workspace', projectId] as const,
  projectParticipant: (projectId: string, userId?: string, workspaceId?: string) =>
    ['project-participant', projectId, userId, workspaceId] as const,
  projectRoles: (workspaceId: string) => ['project-roles', workspaceId] as const,
}

export const participantKeys = {
  authorName: (userId: string) => ['author-name', userId] as const,
  projectParticipant: (projectId: string, userId: string) =>
    ['participant', 'project', projectId, userId] as const,
  workspaceParticipant: (workspaceId: string, userId: string) =>
    ['participant', 'workspace', workspaceId, userId] as const,
  /** Список всех активных участников воркспейса (с ролями/именами). */
  workspaceList: (workspaceId: string | undefined) =>
    ['workspace-participants', workspaceId] as const,
  /** Полный список project_participants (с вложенной participants). */
  projectFull: (projectId: string | undefined) =>
    ['project-participants-full', projectId] as const,
  /** Лёгкий список участников проекта (avatars). */
  projectAvatars: (projectId: string | undefined) =>
    ['project-participants-avatars', projectId] as const,
  /** project_participants с ролями — для мессенджера. */
  projectWithRoles: (projectId: string | undefined) =>
    ['project-participants-with-roles', projectId] as const,
  /** Лёгкий project_participants без аватарок — для ChatSettings/Dialog. */
  projectLight: (projectId: string | undefined) =>
    ['project-participants', projectId] as const,
  /** Участники проекта сгруппированные по ролям — для хедера страницы проекта. */
  projectHeader: (projectId: string | undefined) =>
    ['project-header-participants', projectId] as const,
}

/**
 * Треды как сущности (project_threads). В отличие от messengerKeys (кэши чатов),
 * здесь хранится сам тред, его участники и аудит-события.
 */
export const projectThreadKeys = {
  all: ['project_thread'] as const,
  byId: (threadId: string | undefined) => ['project_thread', threadId ?? ''] as const,
  auditEvents: (threadId: string | undefined) => ['thread-audit-events', threadId] as const,
  members: (threadId: string | undefined) => ['thread-members', threadId] as const,
  membersMap: (threadIds: string[]) =>
    ['thread-members-map', [...threadIds].sort().join(',')] as const,
}

/**
 * Шаблоны проектов и их подразделы.
 * Крупный блок — использовался в 15+ местах через hardcoded ключи.
 */
export const projectTemplateKeys = {
  all: ['project-template'] as const,
  allList: ['project-templates'] as const,
  /** Список шаблонов в воркспейсе. */
  listByWorkspace: (workspaceId: string | undefined) =>
    ['project-templates', workspaceId] as const,
  /**
   * Лёгкий детальный ключ шаблона: `id, name, enabled_modules, root_folder_id`.
   * Используется в `useProjectData`/`WorkspaceSidebarFull` — там нужен только
   * `enabled_modules` для `useProjectModules`.
   */
  detail: (templateId: string | null | undefined) => ['project-template', templateId] as const,
  /**
   * Полный шаблон со всеми колонками `project_templates` — используется только
   * в редакторе типа проекта, где форма редактирует все поля шаблона.
   * Отдельный ключ от `detail()`, чтобы лёгкий и полный кеши не конфликтовали.
   */
  detailFull: (templateId: string | null | undefined) =>
    ['project-template', templateId, 'full'] as const,
  /** Ссылка «какой templateId у проекта» — используется в мессенджере/QuickReplyPicker. */
  idByProject: (projectId: string | null | undefined) =>
    ['project-template-id', projectId] as const,
  /** Только имя шаблона по его id (для PanelProjectInfoRow). */
  nameById: (templateId: string | null | undefined) =>
    ['project-template-name', templateId ?? ''] as const,
  /** Привязанные к шаблону form-templates. */
  forms: (templateId: string | undefined) => ['project-template-forms', templateId] as const,
  /** Привязанные к шаблону document-kits. */
  documentKits: (templateId: string | undefined) =>
    ['project-template-document-kits', templateId] as const,
  /** Привязанные к шаблону knowledge-articles. */
  knowledgeArticles: (templateId: string | undefined) =>
    ['knowledge-article-templates', templateId] as const,
  /** Привязанные к шаблону knowledge-groups. */
  knowledgeGroups: (templateId: string | undefined) =>
    ['knowledge-group-templates', templateId] as const,
}

/**
 * Form-template editor: секции, поля, сам шаблон.
 */
export const formTemplateKeys = {
  detail: (templateId: string | undefined) => ['form-template', templateId] as const,
  sections: (templateId: string | undefined) => ['form-template-sections', templateId] as const,
  fields: (templateId: string | undefined) => ['form-template-fields', templateId] as const,
  listByWorkspace: (workspaceId: string | undefined) =>
    ['form-templates', workspaceId] as const,
}

/**
 * Document-kit template editor.
 */
export const documentKitTemplateKeys = {
  detail: (kitId: string | undefined) => ['document-kit-template', kitId] as const,
  kitFolders: (kitId: string | undefined) => ['kit-folders', kitId] as const,
  kitFolderSlots: (folderId: string | undefined) => ['kit-folder-slots', folderId] as const,
  kitFolderSlotsAll: (kitFolderIds: string[]) =>
    ['kit-folder-slots-all', ...kitFolderIds] as const,
  listByWorkspace: (workspaceId: string | undefined) =>
    ['document-kit-templates', workspaceId] as const,
}

/**
 * Folder-template editor + counts.
 */
export const folderTemplateKeys = {
  listByWorkspace: (workspaceId: string | undefined) =>
    ['folder-templates', workspaceId] as const,
  slotCounts: (workspaceId: string | undefined) =>
    ['folder-template-slot-counts', workspaceId] as const,
}

/**
 * Knowledge-article/group cross-лукапы, не покрытые knowledgeBaseKeys.
 */
export const knowledgeListKeys = {
  /** Плоский список статей workspace (без join/group). */
  articlesList: (workspaceId: string | undefined) =>
    ['knowledge-articles-list', workspaceId] as const,
  /** Связи статей с группами: (article_id, group_id). Используется для
   *  построения дерева и фильтров по группам. */
  articleGroupLinks: (workspaceId: string | undefined) =>
    ['knowledge-article-groups', workspaceId] as const,
  knowledgeTree: (workspaceId: string | undefined) =>
    ['knowledge-tree', workspaceId] as const,
  articleTags: (articleId: string | undefined) =>
    ['knowledge-base', 'article-tags', articleId] as const,
}

/**
 * Field definitions (universal form fields).
 */
export const fieldDefinitionKeys = {
  all: ['field-definitions'] as const,
  byIds: (ids: string[]) => ['field-definitions-by-ids', ids] as const,
  selectOptions: (fieldId: string | undefined) =>
    ['field-definition-select-options', fieldId] as const,
  forComposite: (fieldId: string | undefined) =>
    ['field-definitions-for-composite', fieldId] as const,
  projectValues: (projectId: string | undefined, fieldIds: string[]) =>
    ['project-field-values', projectId, fieldIds] as const,
}

/**
 * Workspace-level задачи (список задач, assignees-map).
 */
export const workspaceTaskKeys = {
  all: ['workspace-tasks'] as const,
  byWorkspace: (workspaceId: string | undefined) =>
    ['workspace-tasks', workspaceId] as const,
  assigneesMap: ['task-assignees-map'] as const,
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

/**
 * AI-cache, привязанные к проекту: инвалидируется при новых сообщениях
 * мессенджера, чтобы AI-panel перечитал контекст разговора.
 *
 * `messengerMessages(projectId)` — префикс для broad-invalidate, захватывает
 * оба канала ('client' и 'internal') сразу.
 * `messengerMessagesByChannel(projectId, channel)` — точный ключ для чтения.
 */
export const projectAiKeys = {
  all: ['project-ai'] as const,
  messengerMessages: (projectId: string) =>
    ['project-ai', 'messenger-messages', projectId] as const,
  messengerMessagesByChannel: (projectId: string, channel: 'client' | 'internal') =>
    ['project-ai', 'messenger-messages', projectId, channel] as const,
  /** Сообщения по списку тредов (или null = все треды проекта). */
  messengerMessagesByThreads: (projectId: string, threadIds: string[] | null) =>
    [
      'project-ai',
      'messenger-messages',
      projectId,
      'threads',
      threadIds === null ? '__all__' : [...threadIds].sort().join(','),
    ] as const,
}

/**
 * Настройки воркспейса (send delay, notifications и т.п.).
 */
export const workspaceSettingsKeys = {
  settings: (workspaceId: string) => ['workspace-settings', workspaceId] as const,
  notifications: (workspaceId: string) =>
    ['workspace-notification-settings', workspaceId] as const,
}

/**
 * Корзина воркспейса — мягко удалённые проекты и треды.
 * Используется в разделе настроек "Корзина" (только владелец воркспейса).
 */
export const trashKeys = {
  all: ['trash'] as const,
  workspace: (workspaceId: string) => ['trash', workspaceId] as const,
  projects: (workspaceId: string) => ['trash', workspaceId, 'projects'] as const,
  threads: (workspaceId: string) => ['trash', workspaceId, 'threads'] as const,
}

/**
 * Boards: workspace-level project participants (junction filter).
 */
export const boardParticipantKeys = {
  byWorkspace: (workspaceId: string | undefined) =>
    ['workspace-project-participants', workspaceId ?? ''] as const,
}

/**
 * Project access check (can the current user see this project?).
 */
export const projectAccessKeys = {
  check: (
    projectId: string | undefined,
    userId: string | undefined,
    isWorkspaceOwner: boolean,
    canViewAllProjects: boolean,
  ) => ['project-access', projectId, userId, isWorkspaceOwner, canViewAllProjects] as const,
}

/**
 * Timeline messages (merged view across threads).
 */
export const timelineKeys = {
  messages: (projectId: string, threadIds: string[]) =>
    ['timeline', 'messages-v2', projectId, [...threadIds].sort().join(',')] as const,
}

/**
 * Messenger AI context data (documents, form-kits).
 */
export const messengerAiKeys = {
  all: ['messenger-ai'] as const,
  documents: (projectId: string) => ['messenger-ai', 'documents', projectId] as const,
  formKits: (projectId: string) => ['messenger-ai', 'form-kits', projectId] as const,
}

/**
 * Telegram link code for thread binding.
 */
export const telegramLinkKeys = {
  linkCode: (threadId: string | undefined) =>
    ['messenger', 'link-code', threadId ?? 'no-thread'] as const,
  /** Fallback key when no threadId — matches messengerKeys.telegramLinkByThreadId pattern. */
  noThread: ['messenger', 'telegram-link', 'no-thread'] as const,
}

/**
 * Current user's project participant data (participantId + project roles).
 */
export const myProjectParticipantKeys = {
  forUser: (projectId: string | undefined, userId: string | undefined) =>
    ['my-project-participant', projectId, userId] as const,
}

/**
 * Chat state — single RPC preload (participant, telegram, email, unread, last_read_at).
 */
export const chatStateKeys = {
  byThread: (threadId: string | undefined, userId: string | undefined) =>
    ['chat-state', threadId, userId] as const,
}

/**
 * Sidebar data — workspace access RPC (threads, roles, members, assignees).
 */
export const sidebarDataKeys = {
  forUser: (workspaceId: string, userId: string | undefined) =>
    ['sidebar-data', workspaceId, userId] as const,
}

/**
 * Current participant for messenger (project or workspace level).
 */
export const messengerParticipantKeys = {
  current: (scopeId: string, userId: string | undefined) =>
    ['messenger', 'current-participant', scopeId, userId] as const,
}

/**
 * Chat settings data helpers.
 */
export const chatSettingsKeys = {
  workspaceProjects: (workspaceId: string | undefined) =>
    ['workspace-projects-list', workspaceId] as const,
  emailSuggestions: (workspaceId: string | undefined) =>
    ['email-suggestions', workspaceId] as const,
}

/**
 * Inbox thread detail (deadline etc.).
 */
export const inboxThreadDetailKeys = {
  byThread: (threadId: string) => ['inbox-thread-detail', threadId] as const,
}

/**
 * Template access counts for knowledge/quick-reply entities.
 */
export const templateAccessKeys = {
  counts: (entityType: string, entityIds: string[]) =>
    ['template-access-counts', entityType, ...entityIds] as const,
}

export const taskPanelTabsKeys = {
  byProjectUser: (projectId: string, userId: string) =>
    ['task-panel-tabs', projectId, userId] as const,
}
