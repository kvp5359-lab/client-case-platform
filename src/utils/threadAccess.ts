/**
 * Единый источник правды для проверки доступа к треду (клиентская сторона).
 *
 * Зеркалит SQL-логику в get_workspace_threads RPC.
 * Используется в useAccessibleThreadIds и useFilteredInbox.
 *
 * Правила доступа (проверяются в порядке приоритета):
 * 1. Тред без проекта (workspace-level) → всегда доступен
 * 2. view_all_projects / workspace owner → доступ ко всему
 * 3. Администратор проекта → доступ ко всем тредам проекта
 * 4. Создатель треда → доступ
 * 5. Исполнитель задачи (task_assignees) → доступ
 * 6. access_type='all' + участник проекта → доступ
 * 7. access_type='roles' + пересечение ролей → доступ
 * 8. access_type='custom' + в project_thread_members → доступ
 */

export interface ThreadAccessInfo {
  id: string
  project_id: string | null
  access_type: string
  access_roles: string[] | null
  created_by: string | null
}

export interface ThreadAccessParams {
  thread: ThreadAccessInfo
  userId: string
  participantId: string | null
  /** Роли пользователя в проекте треда. null = не участник проекта */
  projectRoles: string[] | null
  /** Является ли пользователь исполнителем задачи */
  isAssignee: boolean
  /** Является ли пользователь членом custom-треда */
  isMember: boolean
  /** Имеет ли пользователь права view_all_projects (owner или роль) */
  hasViewAllProjects: boolean
}

export function canAccessThread(params: ThreadAccessParams): boolean {
  const {
    thread,
    userId,
    projectRoles,
    isAssignee,
    isMember,
    hasViewAllProjects,
  } = params

  // 1. Workspace-level тред (без проекта) — всегда доступен
  if (!thread.project_id) return true

  // Не участник проекта и нет глобального права → нет доступа
  if (!projectRoles && !hasViewAllProjects) return false

  // 2. view_all_projects → полный доступ
  if (hasViewAllProjects) return true

  // 3. Администратор проекта
  if (projectRoles?.includes('Администратор')) return true

  // 4. Создатель треда
  if (thread.created_by === userId) return true

  // 5. Исполнитель задачи
  if (isAssignee) return true

  // 6. access_type = 'all' (все участники проекта)
  if (thread.access_type === 'all' && projectRoles) return true

  // 7. access_type = 'roles' (пересечение ролей)
  if (thread.access_type === 'roles' && projectRoles) {
    const accessRoles = thread.access_roles ?? []
    if (projectRoles.some((r) => accessRoles.includes(r))) return true
  }

  // 8. access_type = 'custom' (явное членство)
  if (thread.access_type === 'custom' && isMember) return true

  return false
}
