"use client"

/**
 * Хук для управления привязкой Telegram-группы к проекту
 */

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { messengerKeys } from '@/hooks/queryKeys'
import type { MessageChannel } from '@/services/api/messengerService'

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
  channel: MessageChannel = 'client',
  threadId?: string,
  /** Включить polling (например, пока открыт диалог привязки) */
  polling = false,
) {
  const queryClient = useQueryClient()
  const telegramLinkKey = threadId
    ? messengerKeys.telegramLinkByThreadId(threadId)
    : messengerKeys.telegramLink(projectId ?? '', channel)

  const query = useQuery({
    queryKey: telegramLinkKey,
    queryFn: async () => {
      let q = supabase.from('project_telegram_chats').select('*').eq('is_active', true)

      if (threadId) {
        q = q.eq('thread_id', threadId)
      } else if (projectId) {
        q = q.eq('project_id', projectId).eq('channel', channel)
      } else {
        return null
      }

      const { data, error } = await q.maybeSingle()

      if (error) throw error
      return data as TelegramLink | null
    },
    enabled: !!(projectId || threadId),
    staleTime: 0,
    // Polling пока диалог привязки открыт и ещё не привязано — каждые 2 сек
    refetchInterval: polling ? (query) => (query.state.data ? false : 2000) : false,
  })

  // Получить/сгенерировать код привязки для конкретного чата
  const linkCodeQuery = useQuery({
    queryKey: ['messenger', 'link-code', threadId ?? projectId ?? '', channel],
    queryFn: async () => {
      // Новый путь: код из project_threads.link_code
      if (threadId) {
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
      }

      // Fallback: legacy код из projects
      const { data, error } = await supabase
        .from('projects')
        .select('messenger_link_code')
        .eq('id', projectId)
        .single()

      if (error) throw error

      if (data.messenger_link_code) {
        return channel === 'internal' ? data.messenger_link_code + '-I' : data.messenger_link_code
      }

      const { data: code } = await supabase.rpc('generate_messenger_link_code')
      if (code) {
        await supabase.from('projects').update({ messenger_link_code: code }).eq('id', projectId)
        return code as string
      }
      return null
    },
    enabled: !!(projectId || threadId),
    staleTime: Infinity,
  })

  // Realtime-подписка: обновлять статус при привязке/отвязке из Telegram
  // NOTE: фильтр project_id=eq.X НЕ работает с INSERT в Supabase Realtime,
  // поэтому подписываемся на все события таблицы и фильтруем в callback
  useEffect(() => {
    const channelName = threadId
      ? `telegram-link-thread:${threadId}`
      : `telegram-link-${projectId}:${channel}`
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
          if (
            (threadId && record?.thread_id === threadId) ||
            (projectId && record?.project_id === projectId)
          ) {
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
  }, [projectId, channel, threadId, queryClient, telegramLinkKey])

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
