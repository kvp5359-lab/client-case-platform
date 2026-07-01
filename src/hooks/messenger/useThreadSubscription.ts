/**
 * useThreadSubscription — подписка текущего пользователя на тред.
 *
 * «Подписан» = получаю уведомления/непрочитанное по треду. «Отписан» = доступ
 * остаётся (читать могу), но не цепляет. Управляет только сам пользователь.
 * Источник правды — RPC is_thread_subscribed_me / set_my_thread_subscription
 * (эффективная подписка: явный оверрайд → иначе дефолт «активный участник»).
 *
 * При переключении БД-триггер пересчитывает непрочитанное → инвалидируем
 * inbox-кэши, чтобы бейджи обновились сразу.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { threadSubscriptionKeys, invalidateMessengerCaches } from '@/hooks/queryKeys/messenger'

/** Уровень уведомлений по треду. */
export type NotifyLevel = 'all' | 'messages' | 'off'

export function useThreadSubscription(
  threadId: string | undefined,
  workspaceId: string | undefined,
) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: threadSubscriptionKeys.byThread(threadId ?? ''),
    enabled: !!threadId,
    queryFn: async (): Promise<NotifyLevel | null> => {
      const { data, error } = await supabase.rpc('get_my_thread_notify_level', {
        p_thread_id: threadId!,
      })
      if (error) throw error
      return (data as NotifyLevel | null) ?? null
    },
  })

  const mutation = useMutation({
    mutationFn: async (level: NotifyLevel): Promise<NotifyLevel> => {
      const { error } = await supabase.rpc('set_my_thread_notify_level', {
        p_thread_id: threadId!,
        p_level: level,
      })
      if (error) throw error
      return level
    },
    onSuccess: (level) => {
      qc.setQueryData(threadSubscriptionKeys.byThread(threadId ?? ''), level)
      // Карта подписчиков (variant='manage') — отдельный кэш; без инвалидации
      // она оставалась со старым «Я» после личной отписки (асимметрия с setFor).
      qc.invalidateQueries({ queryKey: threadSubscriptionKeys.subscribers(threadId ?? '') })
      // Тон подсветки непрочитанного (серый у mute) — зависит от факта mute.
      qc.invalidateQueries({ queryKey: ['thread-muted-by-me', threadId ?? ''] })
      if (workspaceId) invalidateMessengerCaches(qc, workspaceId)
    },
  })

  const level = query.data ?? null

  return {
    /** Уровень уведомлений: 'all' | 'messages' | 'off' | null (грузится/нет участника). */
    level,
    setLevel: (v: NotifyLevel) => mutation.mutate(v),
    /** true = подписан (all/messages), false = off, null = грузится. Совместимость. */
    isSubscribed: level === null ? null : level !== 'off',
    isLoading: query.isLoading,
    /** Совместимость: подписать = 'all', отписать = 'off'. */
    setSubscribed: (v: boolean) => mutation.mutate(v ? 'all' : 'off'),
    pending: mutation.isPending,
  }
}

/**
 * useIsThreadMutedByMe — явно ли Я заглушил (mute) этот тред.
 *
 * Отличает mute (осознанное «тихо, но не теряй») от «пассивного» состояния
 * (доступ есть, но не подписан по дефолту — напр. view_all-владелец): у пассива
 * явной строки нет, у mute — state='muted'. RLS `pts_select` возвращает ТОЛЬКО
 * мою строку, поэтому фильтровать по participant_id не нужно.
 *
 * Используется для «тихой» (серой) подсветки непрочитанного внутри заглушённого
 * треда — в отличие от красной у подписанных.
 */
export function useIsThreadMutedByMe(threadId: string | undefined): boolean {
  const { data } = useQuery({
    queryKey: ['thread-muted-by-me', threadId ?? ''],
    enabled: !!threadId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('project_thread_subscriptions')
        .select('state')
        .eq('thread_id', threadId!)
        .maybeSingle()
      if (error) throw error
      return (data as { state?: string } | null)?.state === 'muted'
    },
  })
  return data ?? false
}

/**
 * Управление подписчиками треда (для владельца/менеджеров): карта
 * participant_id → подписан + сеттер за конкретного участника. RPC сам
 * проверяет право (сам участник ИЛИ manage_workspace_settings).
 */
export function useThreadSubscribers(
  threadId: string | undefined,
  workspaceId: string | undefined,
  enabled: boolean,
) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: threadSubscriptionKeys.subscribers(threadId ?? ''),
    enabled: !!threadId && enabled,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase.rpc('get_thread_subscribers', {
        p_thread_id: threadId!,
      })
      if (error) throw error
      const map: Record<string, boolean> = {}
      for (const row of data ?? []) map[row.participant_id] = row.subscribed
      return map
    },
  })

  const mutation = useMutation({
    mutationFn: async (vars: { participantId: string; subscribed: boolean }) => {
      const { error } = await supabase.rpc('set_thread_subscription_for', {
        p_thread_id: threadId!,
        p_participant_id: vars.participantId,
        p_subscribed: vars.subscribed,
      })
      if (error) throw error
      return vars
    },
    onSuccess: ({ participantId, subscribed }) => {
      qc.setQueryData<Record<string, boolean>>(
        threadSubscriptionKeys.subscribers(threadId ?? ''),
        (prev) => ({ ...(prev ?? {}), [participantId]: subscribed }),
      )
      // Своя подписка и бейджи могли поменяться.
      qc.invalidateQueries({ queryKey: threadSubscriptionKeys.byThread(threadId ?? '') })
      if (workspaceId) invalidateMessengerCaches(qc, workspaceId)
    },
  })

  return {
    subscribers: query.data ?? {},
    isLoading: query.isLoading,
    setFor: (participantId: string, subscribed: boolean) =>
      mutation.mutate({ participantId, subscribed }),
    pending: mutation.isPending,
  }
}
