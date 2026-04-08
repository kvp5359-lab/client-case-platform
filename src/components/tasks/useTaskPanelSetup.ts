"use client"

/**
 * useTaskPanelSetup — единый хук для подключения TaskPanel.
 * Инкапсулирует: состояние открытого треда, мутации, конвертацию и рендер-пропсы.
 * Используется в TaskListView, InboxPage, WorkspaceLayout, BoardsPage.
 */

import { useState, useMemo, useCallback } from 'react'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useTaskAssigneesMap } from './useTaskAssignees'
import {
  useUpdateTaskStatus,
  useUpdateTaskDeadline,
  useRenameTask,
  useUpdateTaskSettings,
} from './useTaskMutations'
import { taskKeys } from '@/hooks/queryKeys'
import type { TaskItem } from './types'
import type { TaskPanelProps } from './TaskPanel'

interface UseTaskPanelSetupParams {
  workspaceId: string
  /** Дополнительные query keys для инвалидации */
  extraInvalidateKeys?: ReadonlyArray<readonly unknown[]>
}

export function useTaskPanelSetup({ workspaceId, extraInvalidateKeys = [] }: UseTaskPanelSetupParams) {
  const [openThread, setOpenThread] = useState<TaskItem | null>(null)

  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)

  const threadIds = useMemo(() => (openThread ? [openThread.id] : []), [openThread])
  const { data: membersMap = {} } = useTaskAssigneesMap(threadIds)

  const invalidateKeys = useMemo(
    () => [taskKeys.workspace(workspaceId), ...extraInvalidateKeys],
    [workspaceId, extraInvalidateKeys],
  )
  const updateStatus = useUpdateTaskStatus(invalidateKeys)
  const updateDeadline = useUpdateTaskDeadline(invalidateKeys)
  const renameTask = useRenameTask(invalidateKeys)
  const updateSettings = useUpdateTaskSettings(invalidateKeys)

  const close = useCallback(() => setOpenThread(null), [])

  /** Props для <TaskPanel /> — spread-ready */
  const taskPanelProps: Omit<TaskPanelProps, 'showProjectLink' | 'onProjectClick'> = {
    task: openThread,
    open: !!openThread,
    onClose: close,
    workspaceId,
    statuses: taskStatuses,
    members: membersMap[openThread?.id ?? ''] ?? [],
    onStatusChange: (statusId) =>
      openThread && updateStatus.mutate({ threadId: openThread.id, statusId }),
    onDeadlineSet: (date) =>
      openThread && updateDeadline.mutate({ threadId: openThread.id, deadline: date.toISOString() }),
    onDeadlineClear: () =>
      openThread && updateDeadline.mutate({ threadId: openThread.id, deadline: null }),
    onRename: (name) => openThread && renameTask.mutate({ threadId: openThread.id, name }),
    onSettingsSave: (params) =>
      openThread && updateSettings.mutate({ threadId: openThread.id, ...params }),
    deadlinePending: updateDeadline.isPending,
    settingsPending: updateSettings.isPending,
  }

  return {
    openThread,
    setOpenThread,
    taskPanelProps,
    taskStatuses,
    membersMap,
    updateStatus,
    updateDeadline,
    renameTask,
    updateSettings,
  }
}
