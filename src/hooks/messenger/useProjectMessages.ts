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
import {
  getMessages,
  type MessageChannel,
  type ProjectMessage,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, projectAiKeys } from '@/hooks/queryKeys'
import { logger } from '@/utils/logger'
import { perfMark } from '@/utils/perfTrace'
import { subscribeInboxBroadcast } from './inboxBroadcastBus'

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
    queryFn: async ({ pageParam, signal }) => {
      const isFirstPage = !pageParam
      if (isFirstPage && threadId) {
        const warm = !!queryClient.getQueryData(messengerKeys.messagesByThreadId(threadId))
        perfMark(threadId, 'query:start', { warm })
      }
      const result = await getMessages(threadId!, { before: pageParam as string | undefined, signal })
      if (isFirstPage && threadId) {
        perfMark(threadId, 'query:end', { count: result.messages.length, hasMore: result.hasMore })
      }

      // Только для первой страницы (pageParam=undefined): если идёт активная
      // мутация sendMessage, забираем оптимистики из кэша и мержим в результат —
      // иначе react-query запишет fresh data, стирая optimistic.
      // (cancelQueries не успевает: fetch обычно уже завершился к моменту вызова.)
      if (!pageParam && threadId) {
        const isMut = queryClient.isMutating({ mutationKey: ['sendMessage', threadId] })
        if (isMut > 0) {
          const cached = queryClient.getQueryData<{
            pages: { messages: ProjectMessage[]; hasMore: boolean }[]
          }>(messengerKeys.messagesByThreadId(threadId))
          const lastPage = cached?.pages?.[cached.pages.length - 1]
          const optimistics =
            lastPage?.messages?.filter((m) => m.id.startsWith('optimistic-')) ?? []
          if (optimistics.length > 0) {
            // Optimistic'и идут после реальных (по времени).
            // Финальный порядок: [реальные..., optimistics...]
            return {
              ...result,
              messages: [...result.messages, ...optimistics],
            }
          }
        }
      }

      return result
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (firstPage) => {
      if (!firstPage.hasMore || firstPage.messages.length === 0) return undefined
      return firstPage.messages[0]?.created_at
    },
    enabled: !!threadId,
    // Перф: держим сообщения треда в кэше 30 мин (а не дефолтные 10) — повторное
    // открытие недавнего треда мгновенно (тёплый кэш + фоновый refetch). 24ч НЕ
    // ставим: вместе с убранным IndexedDB-персистом суточный кэш только копил
    // память (а сериализация раздутого кэша грузила CPU при открытии тредов).
    gcTime: 30 * 60_000,
  })

  // Flatten в хронологическом порядке
  const messages = [...(query.data?.pages ?? [])].reverse().flatMap((p) => p.messages)

  // При открытии чата — подгружать свежие данные, НО не если идёт активная
  // мутация (sendMessage). Иначе refetch стёр бы optimistic bubble до того,
  // как mutationFn успел поставить настоящее сообщение из БД с attachments.
  useEffect(() => {
    if (!threadId) return
    const key = messengerKeys.messagesByThreadId(threadId)
    if (queryClient.isMutating({ mutationKey: ['sendMessage', threadId] }) > 0) return
    perfMark(threadId, 'mount:invalidate', {
      hadCache: !!queryClient.getQueryData(key),
    })
    queryClient.invalidateQueries({ queryKey: key })
  }, [threadId, queryClient])

  // Realtime подписка.
  //
  // Сообщения треда (INSERT/UPDATE/DELETE) — через **Broadcast** из БД (топик
  // inbox:<ws>, триггер trg_inbox_broadcast), чтобы снять таблицу project_messages
  // с прямого слежения Postgres Changes (главный источник WAL-нагрузки). Сигнал
  // несёт только id/флаги (не содержимое) — само сообщение подтягивает refetch
  // (RLS-авторизованный getMessages), поэтому утечки нет.
  //
  // Реакции и вложения оставлены на Postgres Changes — их таблицы малонагружены
  // и остаются в publication; логика «рефетч если сообщение известно» сохранена.
  useEffect(() => {
    if (!threadId) return

    const pendingTimers: ReturnType<typeof setTimeout>[] = []
    const key = messengerKeys.messagesByThreadId(threadId)
    const unreadKey = messengerKeys.unreadCountByThreadId(threadId)

    // ── 1. Сообщения треда — через локальную шину (источник broadcast'а —
    // useWorkspaceMessagesRealtime, единственная supabase-подписка на inbox:<ws>) ──
    const unsubBus = subscribeInboxBroadcast((p) => {
      if (p.tbl !== 'project_messages' || p.thread_id !== threadId) return

      if (p.op === 'INSERT') {
        // Активная мутация sendMessage — mutationFn сам поставит финальную
        // версию через onSuccess; refetch стёр бы optimistic.
        if (queryClient.isMutating({ mutationKey: ['sendMessage', threadId] }) > 0) return
        // Есть вложения — refetch сейчас вернёт сообщение без файлов
        // (пишутся позже); событие message_attachments придёт отдельно.
        if (p.has_attachments) return
        queryClient.refetchQueries({ queryKey: key })
        queryClient.invalidateQueries({ queryKey: unreadKey })
        if (channel === 'client' && projectId) {
          queryClient.invalidateQueries({ queryKey: projectAiKeys.messengerMessages(projectId) })
        }
      } else if (p.op === 'UPDATE') {
        queryClient.refetchQueries({ queryKey: key })
      } else if (p.op === 'DELETE') {
        queryClient.refetchQueries({ queryKey: key })
        queryClient.invalidateQueries({ queryKey: unreadKey })
      }
    })

    // ── 2. Реакции и вложения — Postgres Changes (как раньше) ──
    const channelName = `project-messages-aux:thread:${threadId}:${instanceId}`
    const auxChannel = supabase
      .channel(channelName)
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

          // Активная мутация sendMessage для этого треда — пропускаем
          // refetch. mutationFn сам поставит финальное состояние с
          // вложениями через onSuccess.
          if (queryClient.isMutating({ mutationKey: ['sendMessage', threadId] }) > 0) return

          if (knownIds.has(messageId)) {
            // Сообщение уже в кэше — рефетчим сразу
            queryClient.refetchQueries({ queryKey: key })
          } else {
            // Сообщение ещё не в кэше (Telegram: attachment приходит сразу после message INSERT).
            // Рефетчим с задержкой, чтобы сообщение успело попасть в кэш.
            const timer = setTimeout(() => {
              // Повторная проверка перед самим refetch'ем — мутация
              // могла стартовать за время таймера.
              if (queryClient.isMutating({ mutationKey: ['sendMessage', threadId] }) > 0) return
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
      unsubBus()
      pendingTimers.forEach(clearTimeout)
      supabase.removeChannel(auxChannel)
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
