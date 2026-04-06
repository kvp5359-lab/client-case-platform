"use client"

/**
 * Мутация создания задачи в workspace-режиме (не внутри проекта).
 * В режиме проекта используется useCreateThread из useProjectThreads.
 */

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { taskKeys } from '@/hooks/queryKeys'
import { formatDateToString } from '@/utils/format/dateFormat'
import { toast } from 'sonner'
import { useCreateThread } from '@/hooks/messenger/useProjectThreads'
import type { ChatSettingsResult } from '@/components/messenger/ChatSettingsDialog'

interface UseCreateTaskParams {
  workspaceId: string
  projectId?: string
  isProjectMode: boolean
  onSuccess: () => void
}

export function useCreateTaskHandler({
  workspaceId,
  projectId,
  isProjectMode,
  onSuccess,
}: UseCreateTaskParams) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const createThreadMutation = useCreateThread(projectId ?? null, workspaceId)

  const createTaskMutation = useMutation({
    mutationFn: async ({
      name,
      deadline,
      assigneeIds,
      statusId,
      projectId: taskProjectId,
    }: {
      name: string
      deadline?: Date
      assigneeIds: string[]
      statusId?: string | null
      projectId?: string | null
    }) => {
      const insertData: Record<string, unknown> = {
        workspace_id: workspaceId,
        name,
        type: 'task',
        access_type: 'all',
        is_default: false,
        icon: 'check-square',
        accent_color: 'slate',
        deadline: deadline ? formatDateToString(deadline) : null,
        status_id: statusId ?? null,
        created_by: user?.id ?? null,
      }
      if (taskProjectId) insertData.project_id = taskProjectId
      const { data, error } = await supabase
        .from('project_threads')
        .insert(insertData as never)
        .select('*')
        .single()
      if (error) throw error
      if (assigneeIds.length > 0) {
        await supabase
          .from('task_assignees')
          .insert(assigneeIds.map((pid) => ({ thread_id: data.id, participant_id: pid })))
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.workspace(workspaceId) })
      queryClient.invalidateQueries({ queryKey: ['task-assignees-map'] })
      queryClient.invalidateQueries({ queryKey: ['my-urgent-tasks-count'] })
    },
    onError: () => toast.error('Не удалось создать задачу'),
  })

  const handleCreate = useCallback(
    (result: ChatSettingsResult) => {
      if (isProjectMode) {
        createThreadMutation.mutate(
          {
            name: result.name,
            accessType: result.accessType,
            accentColor: result.accentColor,
            icon: result.icon,
            type: result.threadType,
            memberIds: result.memberIds,
            accessRoles: result.accessRoles,
            deadline: result.deadline,
            statusId: result.statusId,
            assigneeIds: result.assigneeIds,
            projectIdOverride: result.projectId !== undefined ? result.projectId : undefined,
          },
          { onSuccess },
        )
      } else {
        createTaskMutation.mutate(
          {
            name: result.name,
            deadline: result.deadline ? new Date(result.deadline) : undefined,
            assigneeIds: result.assigneeIds ?? [],
            statusId: result.statusId,
            projectId: result.projectId,
          },
          { onSuccess },
        )
      }
    },
    [isProjectMode, createThreadMutation, createTaskMutation, onSuccess],
  )

  const isPending = isProjectMode ? createThreadMutation.isPending : createTaskMutation.isPending

  return { handleCreate, isPending }
}
