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

    // ── Фаза 0 масштабирования (2026-06-17): два темпа инвалидации ──
    // Раньше КАЖДОЕ событие realtime инвалидировало все 7 ключей, включая
    // тяжёлые списки (get_inbox_threads_page/unread/needs/awaiting — каждый
    // = полный скан воркспейса ~574 мс). Под потоком сообщений это давало
    // 2–3 полных скана на каждое событие × число онлайн → главный источник
    // нагрузки (см. docs/feature-backlog/2026-06-17-inbox-materialization-scaling.md).
    //
    // Разводим на два темпа, не теряя корректности (рефетч всё равно идёт):
    //  • ЛЁГКИЕ (бейджи/счётчики/сайдбар) — быстрый темп (leading+trailing 400 мс),
    //    чтобы непрочитанность пересчитывалась «онлайн».
    //  • ТЯЖЁЛЫЕ (полные inbox-списки) — коалесцируем до ≤1 раза в HEAVY_MS,
    //    список обновляется с задержкой ≤1.5 с (визуально «динамично»), но
    //    дорогой скан перестаёт дёргаться на каждое сообщение.

    // Лёгкие: агрегаты (сайдбар-бейджи/favicon), статусы галочек, проекты сайдбара.
    const doInvalidateLight = () => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.messageStatuses(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.aggregates(workspaceId) })
      queryClient.invalidateQueries({ queryKey: sidebarKeys.projectsBase(workspaceId) })
    }

    // Тяжёлые: полные inbox-списки (каждый = полный скан v2).
    const doInvalidateHeavy = () => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.unread(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.awaitingReply(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.needsReply(workspaceId) })
    }

    const LIGHT_MS = 400
    const HEAVY_MS = 1500
    let lightLastAt = 0
    let lightTimer: ReturnType<typeof setTimeout> | null = null
    let heavyTimer: ReturnType<typeof setTimeout> | null = null
    const pendingProjectIds = new Set<string>()

    const flushProjectThreads = () => {
      for (const pid of pendingProjectIds) {
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(pid) })
      }
      pendingProjectIds.clear()
    }

    const fireLight = () => {
      lightLastAt = Date.now()
      doInvalidateLight()
      flushProjectThreads()
    }

    const invalidateAll = () => {
      // Лёгкие — throttle leading+trailing 400 мс (мгновенный отклик бейджей).
      const now = Date.now()
      const elapsed = now - lightLastAt
      if (elapsed >= LIGHT_MS) {
        fireLight()
      } else if (!lightTimer) {
        lightTimer = setTimeout(() => {
          lightTimer = null
          fireLight()
        }, LIGHT_MS - elapsed)
      }
      // Тяжёлые — trailing-only коалесценция: один рефетч на окно HEAVY_MS,
      // даже при непрерывном потоке (≤1 полный скан в 1.5 с на онлайн-юзера).
      if (!heavyTimer) {
        heavyTimer = setTimeout(() => {
          heavyTimer = null
          doInvalidateHeavy()
        }, HEAVY_MS)
      }
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
      if (lightTimer) clearTimeout(lightTimer)
      if (heavyTimer) clearTimeout(heavyTimer)
      supabase.removeChannel(channel)
    }
  }, [workspaceId, queryClient, instanceId])
}
