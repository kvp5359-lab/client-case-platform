import { useCallback, useState } from 'react'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useUpdateTaskStatus } from '@/components/tasks/useTaskMutations'
import { messengerKeys, projectThreadKeys } from '@/hooks/queryKeys'

interface Options {
  threadId: string | undefined
  projectId: string
  workspaceId: string
  threadType?: 'chat' | 'task'
  threadStatusId?: string | null
}

/**
 * Планфикс-style переключатель статуса задачи.
 * Хранит выбранный, но ещё не применённый статус в localStorage; при отправке
 * сообщения — коммитит статус в БД через useUpdateTaskStatus, потом шлёт сообщение.
 */
export function useTaskStatusPending({
  threadId,
  projectId,
  workspaceId,
  threadType,
  threadStatusId,
}: Options) {
  const isTaskThread = threadType === 'task' && !!threadId
  const { data: taskStatuses = [] } = useTaskStatuses(isTaskThread ? workspaceId : undefined)
  const pendingStatusKey = threadId ? `cc:pending-status:${threadId}` : null

  const [pendingStatusId, setPendingStatusId] = useState<string | null>(() => {
    if (!pendingStatusKey || typeof window === 'undefined') return null
    try {
      const saved = window.localStorage.getItem(pendingStatusKey)
      return saved && saved !== 'null' ? saved : null
    } catch {
      return null
    }
  })

  // Если сохранённый pending совпадает с реальным статусом — сбрасываем (рендер, не эффект).
  const effectivePendingStatusId =
    pendingStatusId && pendingStatusId !== threadStatusId ? pendingStatusId : null

  const handlePickStatus = useCallback(
    (statusId: string | null) => {
      const next = statusId === threadStatusId ? null : statusId
      setPendingStatusId(next)
      if (pendingStatusKey) {
        try {
          if (next) window.localStorage.setItem(pendingStatusKey, next)
          else window.localStorage.removeItem(pendingStatusKey)
        } catch {
          /* ignore */
        }
      }
    },
    [threadStatusId, pendingStatusKey],
  )

  const updateStatusMutation = useUpdateTaskStatus([
    projectId ? messengerKeys.projectThreads(projectId) : [],
    threadId ? projectThreadKeys.byId(threadId) : [],
  ])

  const clearPending = useCallback(() => {
    setPendingStatusId(null)
    if (pendingStatusKey) {
      try {
        window.localStorage.removeItem(pendingStatusKey)
      } catch {
        /* ignore */
      }
    }
  }, [pendingStatusKey])

  return {
    isTaskThread,
    taskStatuses,
    effectivePendingStatusId,
    handlePickStatus,
    updateStatusMutation,
    clearPending,
  }
}
