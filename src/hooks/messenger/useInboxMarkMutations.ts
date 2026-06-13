"use client"

/**
 * useInboxMarkMutations — общие мутации mark-as-read / mark-as-unread для
 * inbox-тредов. Раньше тот же код дублировался в InboxPage и BoardInboxList
 * (~130 строк × 2). Делает оптимистичный патч обоих inbox-кэшей (тред-списка
 * и лёгких агрегатов через patchCachesForMarkRead/Unread), вызывает серверный
 * markAsRead/markAsUnread, при ошибке откатывает.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  resolveParticipantId,
  markAsRead,
  markAsUnread,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { inboxKeys, invalidateMessengerCaches } from '@/hooks/queryKeys'
import { patchCachesForMarkRead, patchCachesForMarkUnread } from './useUnreadCount'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { InboxInfiniteData } from './useInbox'

export function useInboxMarkMutations(workspaceId: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const getChannel = (chat: InboxThreadEntry): MessageChannel =>
    (chat.legacy_channel as MessageChannel) ?? 'client'

  // Резолв participant: проектный (если у треда есть project_id) или
  // workspace-уровневый (личные диалоги TG/Email/Wazzup без project_id).
  const resolveChatParticipantId = async (chat: InboxThreadEntry): Promise<string | null> => {
    if (!user) return null
    return resolveParticipantId(chat.project_id ?? undefined, workspaceId, user.id)
  }

  const markRead = useMutation({
    mutationFn: async (chat: InboxThreadEntry) => {
      if (!user) throw new Error('Не авторизован')
      const participantId = await resolveChatParticipantId(chat)
      if (!participantId) throw new Error('Участник не найден')
      return markAsRead(
        participantId,
        chat.project_id ?? undefined,
        getChannel(chat),
        chat.thread_id,
      )
    },
    onMutate: (chat) => {
      // Snapshot для rollback. patchCachesForMarkRead патчит и threads, и aggregates.
      const prev = queryClient.getQueryData<InboxInfiniteData>(inboxKeys.threads(workspaceId))
      patchCachesForMarkRead(queryClient, {
        threadId: chat.thread_id,
        projectId: chat.project_id ?? undefined,
        workspaceId,
      })
      return { prev }
    },
    onSuccess: () => {
      invalidateMessengerCaches(queryClient, workspaceId)
    },
    onError: (err, _chat, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(inboxKeys.threads(workspaceId), ctx.prev)
      }
      queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
      const desc = err instanceof Error ? err.message : undefined
      toast.error('Не удалось отметить как прочитанное', desc ? { description: desc } : undefined)
    },
  })

  const markUnread = useMutation({
    mutationFn: async (chat: InboxThreadEntry) => {
      if (!user) throw new Error('Не авторизован')
      const participantId = await resolveChatParticipantId(chat)
      if (!participantId) throw new Error('Участник не найден')
      return markAsUnread(
        participantId,
        chat.project_id ?? undefined,
        getChannel(chat),
        chat.thread_id,
      )
    },
    onMutate: (chat) => {
      const prev = queryClient.getQueryData<InboxInfiniteData>(inboxKeys.threads(workspaceId))
      patchCachesForMarkUnread(queryClient, {
        threadId: chat.thread_id,
        projectId: chat.project_id ?? undefined,
        workspaceId,
      })
      return { prev }
    },
    onSuccess: () => {
      invalidateMessengerCaches(queryClient, workspaceId)
    },
    onError: (err, _chat, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(inboxKeys.threads(workspaceId), ctx.prev)
      }
      queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
      const desc = err instanceof Error ? err.message : undefined
      toast.error('Не удалось отметить как непрочитанное', desc ? { description: desc } : undefined)
    },
  })

  return { markRead, markUnread }
}
