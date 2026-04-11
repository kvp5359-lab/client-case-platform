"use client"

/**
 * Хук для проверки разрешений на уровне workspace
 */

import { useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspaceContext } from '../../contexts/WorkspaceContext'
import { permissionKeys } from '../queryKeys'
import type { WorkspacePermission, WorkspacePermissions } from '../../types/permissions'
import { fromSupabaseJson } from '@/utils/supabaseJson'

interface UseWorkspacePermissionsOptions {
  workspaceId?: string
}

export interface WorkspacePermissionsResult {
  /** Загрузка данных */
  isLoading: boolean
  /** Ошибка загрузки */
  error: Error | null
  /** Является ли пользователь владельцем */
  isOwner: boolean
  /** Проверка конкретного разрешения */
  can: (permission: WorkspacePermission) => boolean
  /** Все разрешения пользователя */
  permissions: WorkspacePermissions | null
  /** Роли пользователя в workspace */
  userRoles: string[]
  /** Имеет ли право на просмотр всех проектов (для оптимизации) */
  canViewAllProjects: boolean
  /** Перезагрузить данные */
  refetch: () => void
}

/**
 * Хук для проверки разрешений на уровне workspace
 */
export function useWorkspacePermissions(
  options: UseWorkspacePermissionsOptions = {},
): WorkspacePermissionsResult {
  const { user } = useAuth()
  const { workspaceId: ctxWorkspaceId } = useWorkspaceContext()
  const workspaceId = options.workspaceId || ctxWorkspaceId

  // Загружаем роли пользователя в workspace
  const {
    data: participantData,
    isLoading: loadingParticipant,
    error: participantError,
    refetch: refetchParticipant,
  } = useQuery({
    queryKey: permissionKeys.participantRoles(workspaceId ?? '', user?.id),
    queryFn: async () => {
      if (!workspaceId || !user?.id) return null

      const { data, error } = await supabase
        .from('participants')
        .select('workspace_roles')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!workspaceId && !!user?.id,
  })

  // Загружаем все роли workspace с их разрешениями
  const {
    data: rolesData,
    isLoading: loadingRoles,
    error: rolesError,
    refetch: refetchRoles,
  } = useQuery({
    queryKey: permissionKeys.workspaceRoles(workspaceId ?? ''),
    queryFn: async () => {
      if (!workspaceId) return null

      const { data, error } = await supabase
        .from('workspace_roles')
        .select('*')
        .eq('workspace_id', workspaceId)

      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

  const userRoles = useMemo(() => participantData?.workspace_roles ?? [], [participantData])

  // Вычисляем объединённые разрешения (по принципу ИЛИ)
  const permissions = useMemo<WorkspacePermissions | null>(() => {
    if (!rolesData || userRoles.length === 0) return null

    const userRolesData = rolesData.filter((role) => userRoles.includes(role.name))

    // Начинаем со всех false
    const merged: WorkspacePermissions = {
      manage_workspace_settings: false,
      delete_workspace: false,
      manage_participants: false,
      manage_roles: false,
      manage_templates: false,
      manage_statuses: false,
      manage_features: false,
      create_projects: false,
      view_all_projects: false,
      edit_all_projects: false,
      delete_all_projects: false,
      view_knowledge_base: false,
      manage_knowledge_base: false,
    }

    // Объединяем по принципу ИЛИ
    for (const role of userRolesData) {
      const rolePerms = role.permissions
      if (!rolePerms || typeof rolePerms !== 'object' || Array.isArray(rolePerms)) continue
      const perms = fromSupabaseJson<WorkspacePermissions>(rolePerms)
      for (const key of Object.keys(merged) as WorkspacePermission[]) {
        if (perms[key]) {
          merged[key] = true
        }
      }
    }

    return merged
  }, [rolesData, userRoles])

  // Проверяем, является ли пользователь владельцем
  const isOwner = useMemo(() => {
    if (!rolesData || userRoles.length === 0) return false
    const ownerRole = rolesData.find((r) => r.is_owner)
    return ownerRole ? userRoles.includes(ownerRole.name) : false
  }, [rolesData, userRoles])

  // Функция проверки разрешения (owner имеет все разрешения)
  const can = useCallback(
    (permission: WorkspacePermission): boolean => {
      if (isOwner) return true
      if (!permissions) return false
      return permissions[permission] === true
    },
    [permissions, isOwner],
  )

  // Вычисляем canViewAllProjects для оптимизации (owner имеет все права)
  const canViewAllProjects = useMemo(
    () => isOwner || permissions?.view_all_projects === true,
    [isOwner, permissions?.view_all_projects],
  )

  const refetch = useCallback(() => {
    refetchParticipant()
    refetchRoles()
  }, [refetchParticipant, refetchRoles])

  return {
    isLoading: loadingParticipant || loadingRoles,
    error: participantError || rolesError,
    isOwner,
    can,
    permissions,
    userRoles,
    canViewAllProjects,
    refetch,
  }
}
