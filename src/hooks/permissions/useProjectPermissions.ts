"use client"

/**
 * Хук для проверки разрешений на уровне проекта
 */

import { useMemo, useCallback } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspacePermissions } from './useWorkspacePermissions'
import { permissionKeys } from '../queryKeys'
import { logger } from '@/utils/logger'
import type {
  ProjectModule,
  ProjectModuleAccess,
  ProjectPermissionCode,
  ProjectPermissions,
} from '../../types/permissions'
import { PermissionError } from '../../services/errors'
import { fromSupabaseJson } from '@/utils/supabaseJson'
import { STALE_TIME, GC_TIME } from '@/hooks/queryKeys'

/** Мёрж объектов boolean-полей по принципу ИЛИ */
function mergeByOr<T extends object>(target: T, source: Partial<T> | null | undefined): void {
  if (!source || typeof source !== 'object') return
  for (const key of Object.keys(target) as (keyof T)[]) {
    if (source[key]) {
      ;(target as Record<string, boolean>)[key as string] = true
    }
  }
}

interface UseProjectPermissionsOptions {
  projectId: string
}

export interface ProjectPermissionsResult {
  /** Загрузка данных */
  isLoading: boolean
  /** Ошибка загрузки */
  error: Error | null
  /** Проверка доступа к модулю */
  hasModuleAccess: (module: ProjectModule) => boolean
  /** Проверка разрешения внутри модуля */
  can: (
    module: 'settings' | 'forms' | 'documents' | 'comments',
    permission: ProjectPermissionCode,
  ) => boolean
  /** Проверка разрешения с выбросом PermissionError при отсутствии */
  require: (
    module: 'settings' | 'forms' | 'documents' | 'comments',
    permission: ProjectPermissionCode,
  ) => void
  /** Доступ к модулям */
  moduleAccess: ProjectModuleAccess | null
  /** Все разрешения */
  permissions: ProjectPermissions | null
  /** Роли пользователя в проекте */
  userProjectRoles: string[]
  /** Перезагрузить данные */
  refetch: () => void
}

// Полный доступ ко всем модулям — для workspace-администраторов
const FULL_MODULE_ACCESS: ProjectModuleAccess = {
  settings: true,
  forms: true,
  documents: true,
  tasks: true,
  chats: true,
  history: true,
  ai_document_check: true,
  ai_form_autofill: true,
  ai_knowledge_all: true,
  ai_knowledge_project: true,
  ai_project_assistant: true,
  comments: true,
  knowledge_base: true,
  finance: true,
}

// Полный набор разрешений — для workspace-администраторов
const FULL_PERMISSIONS: ProjectPermissions = {
  settings: {
    edit_project_info: true,
    manage_project_participants: true,
    manage_google_drive: true,
    delete_project: true,
  },
  forms: {
    add_forms: true,
    fill_forms: true,
    edit_own_form_answers: true,
    view_others_form_answers: true,
  },
  documents: {
    add_documents: true,
    view_documents: true,
    edit_documents: true,
    download_documents: true,
    move_documents: true,
    delete_documents: true,
    compress_pdf: true,
    view_document_technical_info: true,
    create_folders: true,
    add_document_kits: true,
  },
  comments: {
    view_comments: true,
    edit_comments: true,
    manage_comments: true,
  },
}

/**
 * Хук для проверки разрешений на уровне проекта
 */
export function useProjectPermissions(
  options: UseProjectPermissionsOptions,
): ProjectPermissionsResult {
  const { projectId } = options
  const { user } = useAuth()

  // Загружаем проект для получения workspace_id
  const { data: projectData, isLoading: loadingProject } = useQuery({
    queryKey: permissionKeys.projectWorkspace(projectId ?? ''),
    queryFn: async () => {
      if (!projectId) return null

      const { data, error } = await supabase
        .from('projects')
        .select('workspace_id')
        .eq('id', projectId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.LONG,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

  const workspaceId = projectData?.workspace_id

  // Получаем права workspace для проверки администратора
  const { isOwner: isWorkspaceOwner, can: hasWorkspacePermission } = useWorkspacePermissions({
    workspaceId,
  })

  // Загружаем участие пользователя в проекте
  const {
    data: projectParticipantData,
    isLoading: loadingParticipant,
    error: participantError,
    refetch: refetchParticipant,
  } = useQuery({
    queryKey: permissionKeys.projectParticipant(projectId ?? '', user?.id, workspaceId),
    queryFn: async () => {
      if (!projectId || !user?.id || !workspaceId) return null

      // Один запрос с JOIN: участие в проекте + привязка к workspace через participants.
      // Раньше делалось 2 последовательных roundtrip, теперь один.
      const { data, error } = await supabase
        .from('project_participants')
        .select('project_roles, participants!inner(user_id, workspace_id, is_deleted)')
        .eq('project_id', projectId)
        .eq('participants.user_id', user.id)
        .eq('participants.workspace_id', workspaceId)
        .eq('participants.is_deleted', false)
        .maybeSingle()

      if (error) {
        logger.warn('useProjectPermissions: ошибка загрузки project_participants', error)
        return null
      }
      return data ? { project_roles: data.project_roles } : null
    },
    enabled: !!projectId && !!user?.id && !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
    gcTime: GC_TIME.LONG,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

  // Загружаем все роли проекта с их разрешениями
  const {
    data: rolesData,
    isLoading: loadingRoles,
    error: rolesError,
    refetch: refetchRoles,
  } = useQuery({
    queryKey: permissionKeys.projectRoles(workspaceId ?? ''),
    queryFn: async () => {
      if (!workspaceId) return null

      const { data, error } = await supabase
        .from('project_roles')
        .select('*')
        .eq('workspace_id', workspaceId)

      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.LONG,
    refetchOnWindowFocus: false,
  })

  const userProjectRoles = useMemo(
    () => projectParticipantData?.project_roles || [],
    [projectParticipantData?.project_roles],
  )

  // Проверяем, является ли пользователь администратором workspace
  // Полный доступ к проекту получает только владелец или тот, у кого есть edit_all_projects
  const isWorkspaceAdmin = isWorkspaceOwner || hasWorkspacePermission('edit_all_projects')

  // Вычисляем объединённый доступ к модулям (по принципу ИЛИ)
  const moduleAccess = useMemo<ProjectModuleAccess | null>(() => {
    // Администратор workspace имеет полный доступ ко всем модулям
    if (isWorkspaceAdmin) {
      return FULL_MODULE_ACCESS
    }

    if (!rolesData || userProjectRoles.length === 0) return null

    // Сопоставление ролей по name — архитектурное решение:
    // project_participants.project_roles хранит массив имён ролей (string[]),
    // а project_roles.name — уникально в пределах workspace (unique constraint).
    // Переименование роли НЕ обновляет project_participants автоматически.
    const userRolesData = rolesData.filter((role) => userProjectRoles.includes(role.name))

    const merged: ProjectModuleAccess = {
      settings: false,
      forms: false,
      documents: false,
      tasks: false,
      chats: false,
      history: false,
      ai_document_check: false,
      ai_form_autofill: false,
      ai_knowledge_all: false,
      ai_knowledge_project: false,
      ai_project_assistant: false,
      comments: false,
      knowledge_base: false,
      finance: false,
    }

    for (const role of userRolesData) {
      mergeByOr(merged, fromSupabaseJson<ProjectModuleAccess>(role.module_access))
    }

    return merged
  }, [isWorkspaceAdmin, rolesData, userProjectRoles])

  // Вычисляем объединённые разрешения (по принципу ИЛИ)
  const permissions = useMemo<ProjectPermissions | null>(() => {
    // Администратор workspace имеет все разрешения
    if (isWorkspaceAdmin) {
      return FULL_PERMISSIONS
    }

    if (!rolesData || userProjectRoles.length === 0) return null

    const userRolesData = rolesData.filter((role) => userProjectRoles.includes(role.name))

    const merged: ProjectPermissions = {
      settings: {
        edit_project_info: false,
        manage_project_participants: false,
        manage_google_drive: false,
        delete_project: false,
      },
      forms: {
        add_forms: false,
        fill_forms: false,
        edit_own_form_answers: false,
        view_others_form_answers: false,
      },
      documents: {
        add_documents: false,
        view_documents: false,
        edit_documents: false,
        download_documents: false,
        move_documents: false,
        delete_documents: false,
        compress_pdf: false,
        view_document_technical_info: false,
        create_folders: false,
        add_document_kits: false,
      },
      comments: {
        view_comments: false,
        edit_comments: false,
        manage_comments: false,
      },
    }

    for (const role of userRolesData) {
      const rolePerms = fromSupabaseJson<ProjectPermissions>(role.permissions)
      if (rolePerms) {
        mergeByOr(merged.settings, rolePerms.settings)
        mergeByOr(merged.forms, rolePerms.forms)
        mergeByOr(merged.documents, rolePerms.documents)
        mergeByOr(merged.comments, rolePerms.comments)
      }
    }

    return merged
  }, [isWorkspaceAdmin, rolesData, userProjectRoles])

  // Функция проверки доступа к модулю
  const hasModuleAccess = useCallback(
    (module: ProjectModule): boolean => {
      if (!moduleAccess) return false
      return moduleAccess[module] === true
    },
    [moduleAccess],
  )

  // Функция проверки разрешения внутри модуля
  const can = useCallback(
    (
      module: 'settings' | 'forms' | 'documents' | 'comments',
      permission: ProjectPermissionCode,
    ): boolean => {
      if (!permissions) return false
      const modulePerms = permissions[module]
      if (!modulePerms) return false
      if (!(permission in modulePerms)) return false
      return (modulePerms as unknown as Record<string, boolean>)[permission] === true
    },
    [permissions],
  )

  // Функция проверки с выбросом PermissionError
  const require = useCallback(
    (
      module: 'settings' | 'forms' | 'documents' | 'comments',
      permission: ProjectPermissionCode,
    ): void => {
      if (!can(module, permission)) {
        throw new PermissionError(`Нет разрешения: ${module}.${permission}`)
      }
    },
    [can],
  )

  const refetch = useCallback(() => {
    refetchParticipant()
    refetchRoles()
  }, [refetchParticipant, refetchRoles])

  // isLoading = true, пока данные о правах не готовы.
  // Ключевой момент: когда workspaceId ещё не загружен из проекта,
  // зависимые запросы (participant, roles) имеют enabled=false,
  // и React Query отдаёт isLoading=false для них — это ложный "готов".
  // Также между рендерами, когда enabled переключается с false на true,
  // isLoading может быть false на один рендер.
  // Поэтому: если projectId передан, но moduleAccess ещё null и мы не admin —
  // проверяем, что все данные реально загрузились (rolesData и participantData не undefined).
  const allQueriesSettled = useMemo(
    () =>
      !loadingProject &&
      !loadingParticipant &&
      !loadingRoles &&
      rolesData !== undefined &&
      projectParticipantData !== undefined,
    [loadingProject, loadingParticipant, loadingRoles, rolesData, projectParticipantData],
  )

  const isStillLoading = useMemo(
    () =>
      loadingProject ||
      loadingParticipant ||
      loadingRoles ||
      (!!projectId && !isWorkspaceAdmin && !allQueriesSettled),
    [
      loadingProject,
      loadingParticipant,
      loadingRoles,
      projectId,
      isWorkspaceAdmin,
      allQueriesSettled,
    ],
  )

  return {
    isLoading: isStillLoading,
    error: participantError || rolesError,
    hasModuleAccess,
    can,
    require,
    moduleAccess,
    permissions,
    userProjectRoles,
    refetch,
  }
}
