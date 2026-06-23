"use client"

/**
 * Хук создания треда (задачи, чата, email) — единый путь через useCreateThread.
 */

import { useCallback } from 'react'
import { useCreateThread } from '@/hooks/messenger/useProjectThreads'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ChatSettingsResult } from '@/components/messenger/ChatSettingsDialog'

type UseCreateTaskParams = {
  workspaceId: string
  projectId?: string
  onSuccess: (newThread: ProjectThread, result: ChatSettingsResult) => void
}

export function useCreateTaskHandler({
  workspaceId,
  projectId,
  onSuccess,
}: UseCreateTaskParams) {
  const createThreadMutation = useCreateThread(projectId ?? null, workspaceId)

  const handleCreate = useCallback(
    (result: ChatSettingsResult) => {
      createThreadMutation.mutate(
        {
          name: result.name,
          accessType: result.accessType,
          accentColor: result.accentColor,
          icon: result.icon,
          type: result.channelType === 'email' ? 'email' : result.threadType,
          emailData:
            result.channelType === 'email'
              ? {
                  contactEmails: (result.contactEmails ?? []).map((e) => e.email),
                  subject: result.emailSubject,
                }
              : undefined,
          memberIds: result.memberIds,
          accessRoles: result.accessRoles,
          deadline: result.deadline,
          startAt: result.startAt,
          endAt: result.endAt,
          statusId: result.statusId,
          assigneeIds: result.assigneeIds,
          projectIdOverride: result.projectId !== undefined ? result.projectId : undefined,
          sourceTemplateId: result.sourceTemplateId,
        },
        { onSuccess: (newThread) => onSuccess(newThread, result) },
      )
    },
    [createThreadMutation, onSuccess],
  )

  const isPending = createThreadMutation.isPending

  return { handleCreate, isPending }
}
