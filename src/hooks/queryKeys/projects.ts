/**
 * Query keys для проектов и всего связанного с ними (треды, шаблоны, доступы,
 * финансовые транзакции, AI-кэш, дневник, кастомные поля).
 */

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

export const accessibleProjectKeys = {
  all: ['accessible-projects'] as const,
  workspace: (workspaceId: string) => ['accessible-projects', workspaceId] as const,
  forUser: (workspaceId: string, userId: string | undefined) =>
    ['accessible-projects', workspaceId, userId] as const,
}

/** Клиентский view списка проектов для портального юзера. */
export const clientWorkspaceProjectsKeys = {
  byUser: (workspaceId: string, userId: string | undefined) =>
    ['client-workspace-projects', workspaceId, userId ?? null] as const,
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

/** Клиенты и каналы тредов в проекте — для resolve клиентских тредов. */
export const projectClientThreadKeys = {
  clients: (projectId: string) => ['project-clients', projectId] as const,
  telegram: (projectId: string) => ['project-telegram-threads', projectId] as const,
  email: (projectId: string, threadIdsKey: string) =>
    ['project-email-threads', projectId, threadIdsKey] as const,
  custom: (projectId: string, threadIdsKey: string) =>
    ['project-custom-thread-members', projectId, threadIdsKey] as const,
}

/** Кандидаты и батч-лукапы для секций проекта. */
export const projectFieldsKeys = {
  contactCandidates: (workspaceId: string) =>
    ['project-contact-candidates', workspaceId] as const,
  /** Батчевая загрузка записей кастомных справочников по списку id. */
  customDirectoryEntriesBatch: (key: string) =>
    ['custom-directory-entries-batch', key] as const,
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
  /**
   * Дефолтные вкладки боковой панели проекта — берётся из шаблона проекта
   * сеялкой `TaskPanelTabbedShellRenderer`. Отдельный ключ от `idByProject`,
   * чтобы не конфликтовать с местами, где грузится только `template_id`.
   */
  defaultPanelTabsByProject: (projectId: string | null | undefined) =>
    ['project-template-default-panel-tabs', projectId] as const,
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
  /** Привязанные к шаблону кастомные поля (через project_template_field_links). */
  fieldLinks: (templateId: string | undefined) =>
    ['project-template-field-links', templateId] as const,
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
 * Current user's project participant data (participantId + project roles).
 */
export const myProjectParticipantKeys = {
  forUser: (projectId: string | undefined, userId: string | undefined) =>
    ['my-project-participant', projectId, userId] as const,
}

export const projectServiceKeys = {
  all: ['project-services'] as const,
  list: (projectId: string) => ['project-services', 'list', projectId] as const,
}

export const projectTransactionKeys = {
  all: ['project-transactions'] as const,
  list: (projectId: string, type: 'income' | 'expense' | 'all' = 'all') =>
    ['project-transactions', 'list', projectId, type] as const,
}

/**
 * AI-cache, привязанные к проекту: инвалидируется при новых сообщениях
 * мессенджера, чтобы AI-panel перечитал контекст разговора.
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
 * Дневник проекта: карточки сводок.
 */
export const projectDigestKeys = {
  all: ['project-digests'] as const,
  byProject: (projectId: string) => ['project-digests', 'by-project', projectId] as const,
  /** Префикс для broad-invalidate всех периодных срезов одного воркспейса. */
  byWorkspaceAllPeriods: (workspaceId: string) =>
    ['project-digests', 'by-workspace-period', workspaceId] as const,
  byWorkspaceForPeriod: (workspaceId: string, periodStart: string, periodEnd: string) =>
    ['project-digests', 'by-workspace-period', workspaceId, periodStart, periodEnd] as const,
  card: (
    projectId: string,
    periodStart: string,
    periodEnd: string,
    digestType: string,
  ) => ['project-digests', 'card', projectId, periodStart, periodEnd, digestType] as const,
}

/**
 * Контекст проекта: внутренние материалы команды (заметки, файлы, скриншоты).
 */
export const projectContextKeys = {
  all: ['project-context'] as const,
  byProject: (projectId: string) => ['project-context', 'by-project', projectId] as const,
  byWorkspaceTrash: (workspaceId: string) =>
    ['project-context', 'trash', workspaceId] as const,
}

export const projectsWithActivityKeys = {
  all: ['projects-with-activity'] as const,
  /** Префикс для broad-invalidate всех периодных срезов одного воркспейса. */
  byWorkspace: (workspaceId: string) => ['projects-with-activity', workspaceId] as const,
  byWorkspaceForPeriod: (workspaceId: string, periodStart: string, periodEnd: string) =>
    ['projects-with-activity', workspaceId, periodStart, periodEnd] as const,
}
