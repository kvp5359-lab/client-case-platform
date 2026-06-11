"use client"

/**
 * useWorkspaceMessagesRealtime — единая Realtime-подписка workspace-уровня
 * на project_messages и message_reactions.
 *
 * До этого каждый из 4+ компонентов (сайдбар, useInboxThreadsV2, useNewMessageToast)
 * создавал свой WebSocket-канал на одни и те же события — Supabase получал одно
 * сообщение и рассылал его 4+ раза по разным каналам. Теперь один канал — все
 * инвалидации кэшей выполняются здесь.
 *
 * Подключается в WorkspaceLayoutShell (самый верхний layout workspace), так что активен
 * всегда пока пользователь внутри workspace. Не используй этот хук в дочерних компонентах.
 */

import { useEffect, useId } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { inboxKeys, messengerKeys, sidebarKeys } from '@/hooks/queryKeys'

export function useWorkspaceMessagesRealtime(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  // Уникальный ID инстанса — useId() стабилен и безопасен на рендере.
  const instanceId = useId()

  useEffect(() => {
    if (!workspaceId) return

    // Уникальное имя канала для монтирования (защита от React StrictMode).
    const channelName = `ws-messages:${workspaceId}:${instanceId}`

    const doInvalidate = () => {
      // Инвалидируем все ключи, которые зависят от project_messages workspace-level:
      // - threadsV2: единый inbox-кеш для UI-списка тредов (вкладка «Все»)
      // - unread: отдельный полный список непрочитанных (вкладка «Непрочитанные»)
      // - messageStatuses: статусы доставки для галочек в превью
      // - aggregates: лёгкий RPC для сайдбар-бейджей и favicon (с 2026-05-27)
      // - projectsBase: сайдбар проектов с last_activity_at
      queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.unread(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.messageStatuses(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.aggregates(workspaceId) })
      queryClient.invalidateQueries({ queryKey: sidebarKeys.projectsBase(workspaceId) })
    }

    // Throttle с leading + trailing edge: при первом событии — мгновенная
    // инвалидация (юзер видит обновление без задержки). Последующие события
    // в окне 400 мс схлопываются в один trailing-вызов. Это критично при
    // активной переписке (5-10 сообщений/сек в воркспейсе) — раньше каждое
    // дёргало 2 RPC, теперь — пачка обновлений идёт одним батчем.
    //
    // 400 мс — компромисс: визуально неощутимо, но достаточно чтобы поймать
    // типичный «всплеск» сообщений и обновления project_threads вместе.
    const THROTTLE_MS = 400
    let lastFireAt = 0
    let trailingTimer: ReturnType<typeof setTimeout> | null = null
    const pendingProjectIds = new Set<string>()

    const flushProjectThreads = () => {
      for (const pid of pendingProjectIds) {
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(pid) })
      }
      pendingProjectIds.clear()
    }

    const invalidateAll = () => {
      const now = Date.now()
      const elapsed = now - lastFireAt
      if (elapsed >= THROTTLE_MS) {
        // Leading edge — выполняем немедленно.
        lastFireAt = now
        doInvalidate()
        flushProjectThreads()
        return
      }
      // Внутри окна — ставим/обновляем trailing-таймер.
      if (trailingTimer) return
      trailingTimer = setTimeout(() => {
        trailingTimer = null
        lastFireAt = Date.now()
        doInvalidate()
        flushProjectThreads()
      }, THROTTLE_MS - elapsed)
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
      // project_threads: новые треды (например, созданные resend-webhook'ом
      // при письме на p+<id>@) должны мгновенно появляться в списке тредов
      // проекта без перезагрузки страницы.
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_threads',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const projectId = (payload.new as { project_id?: string } | null)?.project_id
          if (projectId) pendingProjectIds.add(projectId)
          invalidateAll()
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'project_threads',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const projectId = (payload.new as { project_id?: string } | null)?.project_id
          if (projectId) pendingProjectIds.add(projectId)
          invalidateAll()
        },
      )
      .subscribe()

    return () => {
      if (trailingTimer) clearTimeout(trailingTimer)
      supabase.removeChannel(channel)
    }
  }, [workspaceId, queryClient, instanceId])
}
