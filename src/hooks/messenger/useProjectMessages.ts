"use client"

/**
 * Хук для загрузки сообщений треда с Realtime подпиской.
 *
 * Имя `useProjectMessages` — исторически сложившееся, фактически хук теперь
 * работает только по thread_id (см. audit S1). Legacy-режим (projectId+channel)
 * удалён — все callers передают threadId, а в БД 0 сообщений без thread_id.
 *
 * projectId и channel всё ещё принимаются, но используются ТОЛЬКО для
 * invalidate-hook'а AI-кешей мессенджера (ProjectAiChat читает сообщения
 * проекта по каналу, и его надо обновлять при новых сообщениях). На выбор
 * основного кеша они не влияют.
 */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback, useId } from 'react'
import { supabase } from '@/lib/supabase'
import { getMessages, type MessageChannel } from '@/services/api/messenger/messengerService'
import { messengerKeys, projectAiKeys } from '@/hooks/queryKeys'
import { logger } from '@/utils/logger'

export function useProjectMessages(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  threadId: string | undefined,
) {
  const queryClient = useQueryClient()
  // Уникальный ID инстанса — useId() стабилен на инстанс и безопасен на рендере.
  const instanceId = useId()

  const messagesKey = threadId ? messengerKeys.messagesByThreadId(threadId) : undefined

  const query = useInfiniteQuery({
    queryKey: messagesKey ?? ['messenger', 'messages', 'no-thread'],
    queryFn: ({ pageParam }) =>
      getMessages(threadId!, { before: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (firstPage) => {
      if (!firstPage.hasMore || firstPage.messages.length === 0) return undefined
      return firstPage.messages[0]?.created_at
    },
    enabled: !!threadId,
  })

  // Flatten в хронологическом порядке
  const messages = [...(query.data?.pages ?? [])].reverse().flatMap((p) => p.messages)

  // При открытии чата — всегда подгружать свежие данные
  useEffect(() => {
    if (!threadId) return
    queryClient.invalidateQueries({ queryKey: messengerKeys.messagesByThreadId(threadId) })
  }, [threadId, queryClient])

  // Realtime подписка
  useEffect(() => {
    if (!threadId) return

    const pendingTimers: ReturnType<typeof setTimeout>[] = []
    const key = messengerKeys.messagesByThreadId(threadId)
    const unreadKey = messengerKeys.unreadCountByThreadId(threadId)
    // Уникальное имя канала для каждого монтирования (защита от React StrictMode)
    const channelName = `project-messages:thread:${threadId}:${instanceId}`
    const realtimeFilter = `thread_id=eq.${threadId}`

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
          if ((payload.new as { thread_id?: string }).thread_id !== threadId) return
          // Если в кэше есть оптимистичное сообщение — это наш INSERT, не рефетчим:
          // вложения ещё не записаны, рефетч вернёт сообщение без файлов.
          // Рефетч придёт позже через событие message_attachments.
          const cachedData = queryClient.getQueryData<{
            pages: { messages: { id: string }[] }[]
          }>(key)
          const hasOptimistic = cachedData?.pages?.some((p) =>
            p.messages.some((m) => m.id.startsWith('optimistic-')),
          )
          if (hasOptimistic) return
          // Если новое сообщение имеет вложения — рефетч сейчас вернёт его без файлов
          // (вложения пишутся чуть позже). Пропускаем — событие message_attachments придёт отдельно.
          const newMsg = payload.new as { has_attachments?: boolean }
          if (newMsg.has_attachments) return
          queryClient.refetchQueries({ queryKey: key })
          queryClient.invalidateQueries({ queryKey: unreadKey })
          if (channel === 'client' && projectId) {
            queryClient.invalidateQueries({
              queryKey: projectAiKeys.messengerMessages(projectId),
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
          if ((payload.new as { thread_id?: string }).thread_id !== threadId) return
          queryClient.refetchQueries({ queryKey: key })
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
          queryClient.refetchQueries({ queryKey: key })
          queryClient.invalidateQueries({ queryKey: unreadKey })
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
          // Filter: only invalidate if the reaction belongs to a message in this thread
          const messageId =
            (payload.new as { message_id?: string })?.message_id ||
            (payload.old as { message_id?: string })?.message_id
          if (!messageId) return
          const cachedData = queryClient.getQueryData<{ pages: { messages: { id: string }[] }[] }>(
            key,
          )
          const knownIds = new Set(
            cachedData?.pages?.flatMap((p) => p.messages.map((m) => m.id)) ?? [],
          )
          if (!knownIds.has(messageId)) return

          queryClient.refetchQueries({ queryKey: key })
          queryClient.invalidateQueries({ queryKey: unreadKey })
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
            key,
          )
          const knownIds = new Set(
            cachedData?.pages?.flatMap((p) => p.messages.map((m) => m.id)) ?? [],
          )

          if (knownIds.has(messageId)) {
            // Сообщение уже в кэше — рефетчим сразу
            queryClient.refetchQueries({ queryKey: key })
          } else {
            // Сообщение ещё не в кэше (Telegram: attachment приходит сразу после message INSERT).
            // Рефетчим с задержкой, чтобы сообщение успело попасть в кэш.
            const timer = setTimeout(() => {
              queryClient.refetchQueries({ queryKey: key })
            }, 1000)
            pendingTimers.push(timer)
          }

          if (channel === 'client' && projectId) {
            queryClient.invalidateQueries({
              queryKey: projectAiKeys.messengerMessages(projectId),
            })
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          // warn вместо error: некритично (часто бывает в dev при быстром HMR),
          // error-лог триггерит Next.js overlay и отвлекает.
          logger.warn('Realtime channel error:', err)
        }
        if (status === 'TIMED_OUT') {
          logger.warn('Realtime channel timed out, retrying...')
        }
      })

    return () => {
      pendingTimers.forEach(clearTimeout)
      supabase.removeChannel(realtimeChannel)
    }
  }, [threadId, projectId, channel, queryClient, instanceId])

  const fetchOlderMessages = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage()
    }
  }, [query])

  // количество сообщений на самой свежей странице (page[0]),
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
