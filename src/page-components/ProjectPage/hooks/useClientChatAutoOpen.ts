"use client"

/**
 * Для клиентов синхронизирует TaskPanel с доступными ему чатами проекта:
 *  - закрывает «мусорные» вкладки тредов, к которым доступа больше нет
 *    (остались с прошлого UX, когда у клиента был сайдбар);
 *  - досоздаёт вкладки для всех доступных chat-тредов проекта.
 *
 * Запускается один раз на projectId-сессию. Если клиент сам закроет
 * открытую вкладку позже — повторно открывать не будем (та же projectId
 * уже отмечена как засеянная).
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

  const seededRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !taskPanel) return
    if (seededRef.current === projectId) return
    // Ждём, пока useAccessibleThreadIds реально посчитает доступы.
    // Пустой Set — допустимое валидное значение (например, у клиента
    // нет ни одного доступного треда), но при этом threads уже загружены.
    if (threads.length === 0) return

    const accessibleChatIds = new Set(
      threads
        .filter((t) => t.type === 'chat' && !t.is_deleted && accessibleThreadIds.has(t.id))
        .map((t) => t.id),
    )

    // 1. Закрыть «мусорные» thread-вкладки — те, что в панели, но нет доступа.
    if (taskPanel.closeTab && taskPanel.openTabs) {
      for (const tab of taskPanel.openTabs) {
        if (tab.type !== 'thread' || !tab.refId) continue
        if (!accessibleChatIds.has(tab.refId)) {
          taskPanel.closeTab(tab.id)
        }
      }
    }

    // 2. Открыть все доступные chat-треды (повторное openThread по
    //    существующей вкладке только активирует её, дубля не будет).
    if (accessibleChatIds.size > 0) {
      const chatThreads = threads.filter((t) => accessibleChatIds.has(t.id))
      for (const t of chatThreads) {
        taskPanel.openThread(threadToItem(t))
      }
    }

    seededRef.current = projectId ?? null
  }, [enabled, taskPanel, projectId, threads, accessibleThreadIds])
}
