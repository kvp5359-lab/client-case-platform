"use client"

/**
 * useChatState — предзагрузка состояния чата через единый RPC get_chat_state.
 *
 * Один HTTP-запрос вместо 5-6:
 *   1. participant (project or workspace level)
 *   2. telegram link
 *   3. email link
 *   4. unread count
 *   5. last_read_at + manually_unread
 *
 * Результат записывается в кэш React Query по существующим ключам,
 * чтобы useUnreadCount, useLastReadAt, useTelegramLink, useEmailLink
 * брали данные из кэша без собственных HTTP-запросов.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { messengerKeys, emailAccountKeys, chatStateKeys, messengerParticipantKeys, STALE_TIME } from '@/hooks/queryKeys'

interface ChatStateResult {
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
      const { data, error } = await supabase.rpc('get_chat_state' as never, {
        p_thread_id: threadId!,
        p_user_id: user!.id,
        p_project_id: projectId ?? null,
        p_workspace_id: workspaceId,
      } as never)
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
    queryClient.setQueryData(messengerKeys.unreadCountByThreadId(threadId), data.unreadCount)
    queryClient.setQueryData(messengerKeys.lastReadAtByThreadId(threadId), data.lastReadAt)

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
