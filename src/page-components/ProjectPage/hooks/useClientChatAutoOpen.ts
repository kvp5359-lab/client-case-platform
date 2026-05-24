"use client"

/**
 * Для клиентов синхронизирует TaskPanel с доступными ему чатами проекта:
 *  - закрывает «мусорные» thread-вкладки, к которым нет доступа
 *    (остатки прошлого UX, когда у клиента был сайдбар);
 *  - один раз на projectId-сессию открывает все доступные chat-треды.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { useAccessibleThreadIds } from '@/hooks/messenger/useAccessibleThreadIds'
import { threadToItem } from '@/components/tasks/taskListConstants'

type Options = {
  projectId: string | undefined
  isClientOnly: boolean
  chatsEnabled: boolean
}

export function useClientChatAutoOpen({ projectId, isClientOnly, chatsEnabled }: Options) {
  const taskPanel = useLayoutTaskPanel()
  const enabled = !!projectId && isClientOnly && chatsEnabled

  const { data: threads = [] } = useProjectThreads(enabled ? projectId : undefined)
  const { accessibleThreadIds } = useAccessibleThreadIds(enabled ? projectId : undefined)

  // Set id'шников chat-тредов, к которым у клиента есть доступ.
  const accessibleChatIds = useMemo(() => {
    if (!enabled) return new Set<string>()
    return new Set(
      threads
        .filter((t) => t.type === 'chat' && !t.is_deleted && accessibleThreadIds.has(t.id))
        .map((t) => t.id),
    )
  }, [enabled, threads, accessibleThreadIds])

  // Cleanup orphan-вкладок — всегда, не зависит от seededRef. Срабатывает
  // и когда openTabs только подгрузилось из БД, и когда у клиента в проекте
  // меняется набор доступных тредов.
  useEffect(() => {
    if (!enabled || !taskPanel?.closeTab || !taskPanel.openTabs) return
    if (threads.length === 0) return // ждём, пока подгрузятся треды
    for (const tab of taskPanel.openTabs) {
      if (tab.type !== 'thread' || !tab.refId) continue
      if (!accessibleChatIds.has(tab.refId)) {
        taskPanel.closeTab(tab.id)
      }
    }
  }, [enabled, taskPanel, threads.length, accessibleChatIds])

  // Auto-open доступных тредов — один раз на projectId-сессию.
  // Если клиент сам закроет вкладку, повторно открывать не будем.
  const seededRef = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !taskPanel) return
    if (seededRef.current === projectId) return
    if (threads.length === 0) return
    if (accessibleChatIds.size === 0) {
      seededRef.current = projectId ?? null
      return
    }
    const chatThreads = threads.filter((t) => accessibleChatIds.has(t.id))
    for (const t of chatThreads) {
      taskPanel.openThread(threadToItem(t))
    }
    seededRef.current = projectId ?? null
  }, [enabled, taskPanel, projectId, threads, accessibleChatIds])
}
