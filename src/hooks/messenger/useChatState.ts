"use client"

/**
 * useChatState — предзагрузка состояния чата через единый RPC get_chat_state.
 *
 * Один HTTP-запрос вместо нескольких:
 *   1. participant (project or workspace level)
 *   2. telegram link
 *   3. email link
 *
 * **С 2026-05-16** unread_count и last_read_at БОЛЬШЕ НЕ сидируются отсюда:
 * `useUnreadCount`/`useLastReadAt` теперь читают эти поля из единой строки
 * inbox v2 (`inboxKeys.threads(workspaceId)`), которая всегда загружена
 * на уровне WorkspaceLayout. Дублирование убрано.
 *
 * Сам RPC `get_chat_state` пока продолжает возвращать unread/lastReadAt
 * для обратной совместимости и других потенциальных потребителей; при
 * следующем рефакторинге можно упростить RPC и тип `ChatStateResult`.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { messengerKeys, emailAccountKeys, chatStateKeys, messengerParticipantKeys, STALE_TIME } from '@/hooks/queryKeys'

type ChatStateResult = {
  participant: {
    participantId: string
    name: string
    lastName: string | null
    avatarUrl: string | null
    role: string | null
  } | null
  telegramLink: {
    id: string
    project_id: string
    telegram_chat_id: number
    telegram_chat_title: string | null
    is_active: boolean
    channel: string
  } | null
  emailLink: {
    id: string
    thread_id: string
    contact_email: string
    subject: string | null
  } | null
  unreadCount: number
  lastReadAt: string | null
  manuallyUnread: boolean
}

/**
 * Предзагружает состояние чата одним RPC-вызовом и заполняет кэши.
 * Вызывать в useMessengerState при открытии чата.
 */
export function useChatState(
  threadId: string | undefined,
  projectId: string | undefined,
  workspaceId: string,
  _channel: string = 'client',
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: chatStateKeys.byThread(threadId, user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_chat_state', {
        p_thread_id: threadId!,
        p_user_id: user!.id,
        // undefined (а не null): Args типизирует p_project_id как string?;
        // supabase-js опускает поле, plpgsql берёт DEFAULT NULL — эквивалентно.
        p_project_id: projectId ?? undefined,
        p_workspace_id: workspaceId,
      })
      if (error) throw error
      return data as unknown as ChatStateResult
    },
    enabled: !!threadId && !!user?.id,
    staleTime: STALE_TIME.SHORT,
  })

  // Seed React Query caches so existing hooks pick up data without own HTTP calls
  useEffect(() => {
    if (!data || !threadId) return

    queryClient.setQueryData(messengerKeys.telegramLinkByThreadId(threadId), data.telegramLink)
    queryClient.setQueryData(emailAccountKeys.emailLink(threadId), data.emailLink)
    // unread/lastReadAt больше не сидируем — useUnreadCount/useLastReadAt
    // читают из inbox v2 (см. JSDoc к этому модулю).

    // Current participant cache
    const participantKey = messengerParticipantKeys.current(projectId ?? workspaceId, user?.id)
    if (data.participant) {
      queryClient.setQueryData(participantKey, {
        participantId: data.participant.participantId,
        name: [data.participant.name, data.participant.lastName].filter(Boolean).join(' '),
        role: data.participant.role,
      })
    }
  }, [data, threadId, projectId, workspaceId, queryClient, user?.id])

  return data
}
