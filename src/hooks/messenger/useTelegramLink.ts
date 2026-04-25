"use client"

/**
 * Хук для управления привязкой Telegram-группы к проекту.
 */

import { useEffect, useId, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { messengerKeys, telegramLinkKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { MessageChannel } from '@/services/api/messenger/messengerService'

interface TelegramLink {
  id: string
  project_id: string
  telegram_chat_id: number
  telegram_chat_title: string | null
  is_active: boolean
  channel: string
}

export function useTelegramLink(
  projectId: string | undefined,
  channel: MessageChannel,
  threadId: string | undefined,
  /** Включить polling (например, пока открыт диалог привязки) */
  polling = false,
) {
  const queryClient = useQueryClient()
  const telegramLinkKey = useMemo(
    () =>
      threadId
        ? messengerKeys.telegramLinkByThreadId(threadId)
        : telegramLinkKeys.noThread,
    [threadId],
  )

  const query = useQuery({
    queryKey: telegramLinkKey,
    queryFn: async () => {
      if (!threadId) return null
      const { data, error } = await supabase
        .from('project_telegram_chats')
        .select('*')
        .eq('is_active', true)
        .eq('thread_id', threadId)
        .maybeSingle()

      if (error) throw error
      return data as TelegramLink | null
    },
    enabled: !!threadId,
    // Привязка канала меняется редко (через UI «Подключить Telegram»). Polling
    // ниже принудительно опрашивает каждые 2с — staleTime не мешает ему. Без
    // polling кэшируем на минуту, чтобы переход между чатами не делал лишние
    // запросы на одну и ту же связку.
    staleTime: STALE_TIME.STANDARD,
    refetchInterval: polling ? (query) => (query.state.data ? false : 2000) : false,
  })

  // Получить/сгенерировать код привязки для конкретного треда
  const linkCodeQuery = useQuery({
    queryKey: telegramLinkKeys.linkCode(threadId),
    queryFn: async () => {
      if (!threadId) return null
      const { data, error } = await supabase
        .from('project_threads')
        .select('link_code')
        .eq('id', threadId)
        .single()

      if (error) throw error

      if (data.link_code) return data.link_code

      // Генерируем код для треда
      const { data: code } = await supabase.rpc('generate_chat_link_code')
      if (code) {
        await supabase.from('project_threads').update({ link_code: code }).eq('id', threadId)
        return code as string
      }
      return null
    },
    enabled: !!threadId,
    staleTime: Infinity,
  })

  // Уникальный ID инстанса — useId() стабилен и безопасен на рендере.
  const instanceId = useId()

  // Realtime-подписка: обновлять статус при привязке/отвязке из Telegram
  // NOTE: фильтр project_id=eq.X НЕ работает с INSERT в Supabase Realtime,
  // поэтому подписываемся на все события таблицы и фильтруем в callback
  useEffect(() => {
    if (!threadId) return
    const channelName = `telegram-link-thread:${threadId}:${instanceId}`
    const realtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_telegram_chats',
        },
        (payload) => {
          const record =
            (payload.new as Record<string, unknown>) ?? (payload.old as Record<string, unknown>)
          if (record?.thread_id === threadId) {
            queryClient.invalidateQueries({
              queryKey: telegramLinkKey,
            })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(realtimeChannel)
    }
  }, [threadId, queryClient, telegramLinkKey, instanceId])

  // Отвязать группу
  const unlinkMutation = useMutation({
    mutationFn: async () => {
      if (!query.data?.id) return
      const { error } = await supabase
        .from('project_telegram_chats')
        .update({ is_active: false })
        .eq('id', query.data.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: telegramLinkKey })
    },
    onError: () => {
      toast.error('Не удалось отвязать группу')
    },
  })

  return {
    telegramLink: query.data ?? null,
    isLinked: !!query.data,
    isLoading: query.isLoading,
    linkCode: linkCodeQuery.data ?? null,
    isLoadingCode: linkCodeQuery.isLoading,
    unlink: unlinkMutation.mutate,
    isUnlinking: unlinkMutation.isPending,
  }
}
