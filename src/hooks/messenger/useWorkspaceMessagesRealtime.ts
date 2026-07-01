"use client"

/**
 * useWorkspaceMessagesRealtime — единая Realtime-подписка workspace-уровня на
 * изменения мессенджера (сообщения, реакции, треды).
 *
 * Транспорт — **Broadcast из БД** (Фаза 3, 2026-06-18). Триггер `trg_inbox_broadcast`
 * шлёт `realtime.send` в приватный топик `inbox:<workspace_id>` на изменения
 * project_messages / message_reactions / project_threads; клиент подписан на этот
 * топик и по сигналу инвалидирует кэши инбокса (два темпа, см. ниже).
 *
 * Почему Broadcast, а не Postgres Changes: Postgres Changes проверяет RLS для
 * КАЖДОГО подписчика на КАЖДОЕ событие — не масштабируется на много онлайн.
 * Broadcast шлёт один сигнал в топик без поштучной проверки (RLS на realtime.messages
 * проверяется один раз при подписке). См. docs/feature-backlog/2026-06-17-inbox-materialization-scaling.md.
 *
 * Подключается в WorkspaceLayout (самый верхний layout workspace) — активен пока
 * пользователь внутри workspace. Не использовать в дочерних компонентах.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { inboxKeys, messengerKeys, sidebarKeys } from '@/hooks/queryKeys'

export function useWorkspaceMessagesRealtime(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!workspaceId) return

    // ── Два темпа инвалидации (Фаза 0) ──
    // Не теряя корректности (рефетч всё равно идёт):
    //  • ЛЁГКИЕ (бейджи/счётчики/сайдбар) — быстрый темп (leading+trailing 400 мс),
    //    чтобы непрочитанность пересчитывалась «онлайн».
    //  • ТЯЖЁЛЫЕ (полные inbox-списки) — коалесцируем до ≤1 раза в HEAVY_MS,
    //    список обновляется с задержкой ≤1.5 с (визуально «динамично»).

    const doInvalidateLight = () => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.messageStatuses(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.aggregates(workspaceId) })
      queryClient.invalidateQueries({ queryKey: sidebarKeys.projectsBase(workspaceId) })
    }

    const doInvalidateHeavy = () => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.unread(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.awaitingReply(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.needsReply(workspaceId) })
      queryClient.invalidateQueries({ queryKey: inboxKeys.muted(workspaceId) })
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
      if (!heavyTimer) {
        heavyTimer = setTimeout(() => {
          heavyTimer = null
          doInvalidateHeavy()
        }, HEAVY_MS)
      }
    }

    // ── Подписка на Broadcast из БД (приватный топик inbox:<ws>) ──
    let cancelled = false
    let broadcastChannel: ReturnType<typeof supabase.channel> | null = null
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) supabase.realtime.setAuth(token)
      broadcastChannel = supabase
        .channel(`inbox:${workspaceId}`, { config: { private: true } })
        .on('broadcast', { event: 'inbox_changed' }, (msg) => {
          const projectId = (msg.payload as { project_id?: string } | undefined)?.project_id
          if (projectId) pendingProjectIds.add(projectId)
          invalidateAll()
        })
        .subscribe()
    })

    return () => {
      cancelled = true
      if (lightTimer) clearTimeout(lightTimer)
      if (heavyTimer) clearTimeout(heavyTimer)
      if (broadcastChannel) supabase.removeChannel(broadcastChannel)
    }
  }, [workspaceId, queryClient])
}
