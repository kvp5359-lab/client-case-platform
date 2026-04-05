"use client"

/**
 * useWorkspaceMessagesRealtime — единая Realtime-подписка workspace-уровня
 * на project_messages и message_reactions.
 *
 * До этого каждый из 4+ компонентов (сайдбар, useInboxThreadsV2, useInboxThreads v1,
 * useNewMessageToast) создавал свой WebSocket-канал на одни и те же события — Supabase
 * получал одно сообщение и рассылал его 4+ раза по разным каналам. Теперь один канал —
 * все инвалидации кэшей выполняются здесь.
 *
 * Подключается в WorkspaceLayoutShell (самый верхний layout workspace), так что активен
 * всегда пока пользователь внутри workspace. Не используй этот хук в дочерних компонентах.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { inboxKeys, sidebarKeys } from '@/hooks/queryKeys'

export function useWorkspaceMessagesRealtime(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const instanceId = useRef(Math.random().toString(36).slice(2))

  useEffect(() => {
    if (!workspaceId) return

    // Уникальное имя канала для монтирования (защита от React StrictMode).
    const channelName = `ws-messages:${workspaceId}:${instanceId.current}`

    const invalidateAll = () => {
      // Инвалидируем все ключи, которые зависят от project_messages workspace-level:
      // - threadsV2: список тредов с непрочитанными (сайдбар, inbox)
      // - threads (v1): legacy ключ, всё ещё используется в useIsManuallyUnread и др.
      // - projectsBase: сайдбар проектов с last_activity_at
      queryClient.invalidateQueries({ queryKey: inboxKeys.threadsV2(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
      queryClient.invalidateQueries({ queryKey: sidebarKeys.projectsBase(workspaceId) })
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        invalidateAll,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        invalidateAll,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
        },
        invalidateAll,
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
        },
        invalidateAll,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, queryClient])
}
