/**
 * Query keys для воркспейса: основной кеш + сайдбар + настройки + дайджест.
 */

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (workspaceId: string) => ['workspaces', workspaceId] as const,
  userWorkspaces: (userEmail: string) => ['workspaces', 'user', userEmail] as const,
}

export const sidebarKeys = {
  /**
   * Префикс для broad-invalidate сайдбарных списков проектов во ВСЕХ воркспейсах.
   * Используется когда workspaceId недоступен в месте инвалидации (например
   * в useProjectMutations, работающем по projectId).
   */
  projectsAll: ['sidebar', 'projects'] as const,
  /** All sidebar project lists for a workspace (any canViewAll value) */
  projectsBase: (workspaceId: string) => ['sidebar', 'projects', workspaceId] as const,
  projects: (workspaceId: string, canViewAll: boolean) =>
    ['sidebar', 'projects', workspaceId, canViewAll] as const,
  projectsSearch: (workspaceId: string, canViewAll: boolean, query: string) =>
    ['sidebar', 'projects', workspaceId, 'search', canViewAll, query] as const,
  /** Fetch missing unread projects (ids outside the top-N activity window). */
  projectsByIds: (workspaceId: string, canViewAll: boolean, ids: string[]) =>
    ['sidebar', 'projects', workspaceId, 'by-ids', canViewAll, [...ids].sort().join(',')] as const,
}

/** Кеши вспомогательных мета-данных, рисуемых в сайдбаре. */
export const sidebarMetaKeys = {
  /** Префикс для broad-invalidate во всех воркспейсах. */
  templatesIconsAll: ['sidebar', 'workspace-templates-icons'] as const,
  templatesIcons: (workspaceId: string) =>
    ['sidebar', 'workspace-templates-icons', workspaceId] as const,
  statusesColors: (workspaceId: string) =>
    ['sidebar', 'workspace-statuses-colors', workspaceId] as const,
}

/**
 * Sidebar data — workspace access RPC (threads, roles, members, assignees).
 */
export const sidebarDataKeys = {
  forUser: (workspaceId: string, userId: string | undefined) =>
    ['sidebar-data', workspaceId, userId] as const,
}

/**
 * Настройки сайдбара воркспейса (видимость/порядок пунктов меню + режимы бейджей досок).
 */
export const workspaceSidebarSettingsKeys = {
  byWorkspace: (workspaceId: string) =>
    ['workspace-sidebar-settings', workspaceId] as const,
}

/**
 * Профили настроек интерфейса (UI: «Профиль настроек»). Список профилей воркспейса
 * + активный профиль текущего пользователя.
 */
export const interfacePresetKeys = {
  all: ['interface-presets'] as const,
  byWorkspace: (workspaceId: string | undefined) =>
    ['interface-presets', workspaceId] as const,
  active: (workspaceId: string | undefined, userId: string | undefined) =>
    ['interface-presets', 'active', workspaceId, userId] as const,
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

export const workspaceThreadKeys = {
  all: ['workspace-threads'] as const,
  /** Префикс для broad-invalidate: сбрасывает треды для всех пользователей в воркспейсе */
  workspace: (workspaceId: string) => ['workspace-threads', workspaceId] as const,
  /** Полный ключ с user id — используется при чтении, чтобы разные юзеры имели разные кэши */
  forUser: (workspaceId: string, userId: string | undefined) =>
    ['workspace-threads', workspaceId, userId] as const,
}

/**
 * Настройки воркспейса (send delay, notifications и т.п.).
 */
export const workspaceSettingsKeys = {
  settings: (workspaceId: string) => ['workspace-settings', workspaceId] as const,
  notifications: (workspaceId: string) =>
    ['workspace-notification-settings', workspaceId] as const,
}

export const workspaceDigestSettingsKeys = {
  byWorkspace: (workspaceId: string) =>
    ['workspace-digest-settings', workspaceId] as const,
}

/** Домен воркспейса и публичный slug. */
export const workspaceDomainKeys = {
  domain: (workspaceId: string) => ['workspace-domain', workspaceId] as const,
  activeSlug: (workspaceId: string) => ['workspace-slug-active', workspaceId] as const,
}
