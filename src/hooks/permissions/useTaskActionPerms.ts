"use client"

/**
 * Права на действия с задачами (уровень роли Workspace).
 * Удаление — по паре own/any: свою может удалить автор с правом delete_own_task,
 * любую — с правом delete_any_task.
 */

import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspacePermissions } from './useWorkspacePermissions'

export function useTaskActionPerms(workspaceId?: string) {
  const { user } = useAuth()
  const { can, isLoading } = useWorkspacePermissions({ workspaceId })

  const canDeleteTask = useCallback(
    (createdBy?: string | null): boolean => {
      if (!!createdBy && createdBy === user?.id && can('delete_own_task')) return true
      return can('delete_any_task')
    },
    [can, user?.id],
  )

  return {
    isLoading,
    canCreate: can('create_tasks'),
    canChangeStatus: can('change_task_status'),
    canManageAssignees: can('manage_task_assignees'),
    canDeleteTask,
  }
}
