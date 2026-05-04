"use client"

/**
 * Для клиентов — автоматически открывает доступные ему chat-треды
 * как вкладки в правой панели TaskPanel при заходе в проект, если:
 *  - роль клиентская (isClientOnly)
 *  - модуль чатов в проекте включён
 *  - правая панель ещё пустая (клиент сам не открыл/закрыл вкладки)
 *
 * У клиента нет сайдбара, поэтому это единственная точка входа в чаты.
 */

import { useEffect, useRef } from 'react'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { useAccessibleThreadIds } from '@/hooks/messenger/useAccessibleThreadIds'
import { threadToItem } from '@/components/tasks/taskListConstants'

interface Options {
  projectId: string | undefined
  isClientOnly: boolean
  chatsEnabled: boolean
}

export function useClientChatAutoOpen({ projectId, isClientOnly, chatsEnabled }: Options) {
  const taskPanel = useLayoutTaskPanel()
  const enabled = !!projectId && isClientOnly && chatsEnabled

  const { data: threads = [] } = useProjectThreads(enabled ? projectId : undefined)
  const { accessibleThreadIds } = useAccessibleThreadIds(enabled ? projectId : undefined)

  // Запускаем автооткрытие один раз на проект-сессию.
  const seededRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !taskPanel) return
    if (seededRef.current === projectId) return
    if (taskPanel.hasTabs) {
      seededRef.current = projectId ?? null
      return
    }

    const chatThreads = threads.filter(
      (t) => t.type === 'chat' && !t.is_deleted && accessibleThreadIds.has(t.id),
    )
    if (chatThreads.length === 0) return

    for (const t of chatThreads) {
      taskPanel.openThread(threadToItem(t))
    }
    seededRef.current = projectId ?? null
  }, [enabled, taskPanel, projectId, threads, accessibleThreadIds])
}
