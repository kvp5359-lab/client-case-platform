"use client"

/**
 * Хук для загрузки сообщений проекта с Realtime подпиской
 */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getMessages, type MessageChannel } from '@/services/api/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'
import { logger } from '@/utils/logger'

export function useProjectMessages(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  threadId?: string,
) {
  const queryClient = useQueryClient()
  const instanceId = useRef(Math.random().toString(36).slice(2))
  const messagesKey = threadId
    ? messengerKeys.messagesByThreadId(threadId)
    : messengerKeys.messages(projectId ?? '', channel)

  const query = useInfiniteQuery({
    queryKey: messagesKey,
    queryFn: ({ pageParam }) =>
      getMessages(projectId, { before: pageParam as string | undefined, channel, threadId }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (firstPage) => {
      if (!firstPage.hasMore || firstPage.messages.length === 0) return undefined
      return firstPage.messages[0]?.created_at
    },
    enabled: !!(projectId || threadId),
  })

  // Flatten в хронологическом порядке
  const messages = useMemo(
    () => [...(query.data?.pages ?? [])].reverse().flatMap((p) => p.messages),
    [query.data],
  )

  // При открытии чата — всегда подгружать свежие данные
  useEffect(() => {
    if (!projectId && !threadId) return
    queryClient.invalidateQueries({ queryKey: messagesKey })
  }, [projectId, channel, threadId, queryClient, messagesKey])

  // Realtime подписка
  useEffect(() => {
    if (!projectId && !threadId) return

    const pendingTimers: ReturnType<typeof setTimeout>[] = []
    const unreadKey = threadId
      ? messengerKeys.unreadCountByThreadId(threadId)
      : messengerKeys.unreadCount(projectId ?? '', channel)
    // Уникальное имя канала для каждого монтирования (защита от React StrictMode)
    const channelName = threadId
      ? `project-messages:thread:${threadId}:${instanceId.current}`
      : `project-messages:${projectId}:${channel}:${instanceId.current}`

    // Realtime filter: use thread_id if available (works for tasks without project), else project_id
    const realtimeFilter = threadId ? `thread_id=eq.${threadId}` : `project_id=eq.${projectId}`

    const realtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: realtimeFilter,
        },
        (payload) => {
          // Фильтруем на клиенте (Supabase Realtime не поддерживает AND в filter)
          if (threadId) {
            if ((payload.new as { thread_id?: string }).thread_id !== threadId) return
          } else {
            if ((payload.new as { channel?: string }).channel !== channel) return
          }
          // Если в кэше есть оптимистичное сообщение — это наш INSERT, не рефетчим:
          // вложения ещё не записаны, рефетч вернёт сообщение без файлов.
          // Рефетч придёт позже через событие message_attachments.
          const cachedData = queryClient.getQueryData<{
            pages: { messages: { id: string }[] }[]
          }>(messagesKey)
          const hasOptimistic = cachedData?.pages?.some((p) =>
            p.messages.some((m) => m.id.startsWith('optimistic-')),
          )
          if (hasOptimistic) return
          // Если новое сообщение имеет вложения — рефетч сейчас вернёт его без файлов
          // (вложения пишутся чуть позже). Пропускаем — событие message_attachments придёт отдельно.
          const newMsg = payload.new as { has_attachments?: boolean }
          if (newMsg.has_attachments) return
          queryClient.refetchQueries({ queryKey: messagesKey })
          queryClient.invalidateQueries({
            queryKey: unreadKey,
          })
          if (channel === 'client') {
            queryClient.invalidateQueries({
              queryKey: ['project-ai', 'messenger-messages', projectId],
            })
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'project_messages',
          filter: realtimeFilter,
        },
        (payload) => {
          if (threadId) {
            if ((payload.new as { thread_id?: string }).thread_id !== threadId) return
          } else {
            if ((payload.new as { channel?: string }).channel !== channel) return
          }
          queryClient.refetchQueries({ queryKey: messagesKey })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'project_messages',
          filter: realtimeFilter,
        },
        () => {
          queryClient.refetchQueries({ queryKey: messagesKey })
          queryClient.invalidateQueries({
            queryKey: unreadKey,
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          // Filter: only invalidate if the reaction belongs to a message in this project
          const messageId =
            (payload.new as { message_id?: string })?.message_id ||
            (payload.old as { message_id?: string })?.message_id
          if (!messageId) return
          const cachedData = queryClient.getQueryData<{ pages: { messages: { id: string }[] }[] }>(
            messagesKey,
          )
          const knownIds = new Set(
            cachedData?.pages?.flatMap((p) => p.messages.map((m) => m.id)) ?? [],
          )
          if (!knownIds.has(messageId)) return

          queryClient.refetchQueries({ queryKey: messagesKey })
          queryClient.invalidateQueries({
            queryKey: unreadKey,
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_attachments',
        },
        (payload) => {
          const messageId =
            (payload.new as { message_id?: string })?.message_id ||
            (payload.old as { message_id?: string })?.message_id
          if (!messageId) return

          const cachedData = queryClient.getQueryData<{ pages: { messages: { id: string }[] }[] }>(
            messagesKey,
          )
          const knownIds = new Set(
            cachedData?.pages?.flatMap((p) => p.messages.map((m) => m.id)) ?? [],
          )

          if (knownIds.has(messageId)) {
            // Сообщение уже в кэше — рефетчим сразу
            queryClient.refetchQueries({ queryKey: messagesKey })
          } else {
            // Сообщение ещё не в кэше (Telegram: attachment приходит сразу после message INSERT).
            // Рефетчим с задержкой, чтобы сообщение успело попасть в кэш.
            const timer = setTimeout(() => {
              queryClient.refetchQueries({
                queryKey: messagesKey,
              })
            }, 1000)
            pendingTimers.push(timer)
          }

          if (channel === 'client') {
            queryClient.invalidateQueries({
              queryKey: ['project-ai', 'messenger-messages', projectId],
            })
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          logger.error('Realtime channel error:', err)
        }
        if (status === 'TIMED_OUT') {
          logger.warn('Realtime channel timed out, retrying...')
        }
      })

    return () => {
      pendingTimers.forEach(clearTimeout)
      supabase.removeChannel(realtimeChannel)
    }
  }, [projectId, channel, threadId, queryClient, messagesKey])

  const fetchOlderMessages = useCallback(() => {
    // DEBUG: диагностика подгрузки старых сообщений
    console.log('[useProjectMessages] fetchOlder called', {
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      pagesCount: query.data?.pages?.length,
      lastPageHasMore: query.data?.pages?.[query.data.pages.length - 1]?.hasMore,
      lastPageFirstMsgDate: query.data?.pages?.[query.data.pages.length - 1]?.messages?.[0]?.created_at,
    })
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage()
    }
  }, [query])

  // Z4-11: количество сообщений на самой свежей странице (page[0]),
  // чтобы звук не срабатывал при подгрузке старых страниц
  const latestPageMessageCount = query.data?.pages?.[0]?.messages.length ?? 0

  return {
    messages,
    isLoading: query.isLoading,
    fetchOlderMessages,
    hasMoreOlder: query.hasNextPage ?? false,
    isFetchingOlder: query.isFetchingNextPage,
    latestPageMessageCount,
  }
}
