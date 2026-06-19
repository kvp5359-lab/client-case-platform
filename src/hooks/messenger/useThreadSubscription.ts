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

export function useThreadSubscription(
  threadId: string | undefined,
  workspaceId: string | undefined,
) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: threadSubscriptionKeys.byThread(threadId ?? ''),
    enabled: !!threadId,
    queryFn: async (): Promise<boolean | null> => {
      const { data, error } = await supabase.rpc('is_thread_subscribed_me', {
        p_thread_id: threadId!,
      })
      if (error) throw error
      return data
    },
  })

  const mutation = useMutation({
    mutationFn: async (subscribed: boolean): Promise<boolean> => {
      const { error } = await supabase.rpc('set_my_thread_subscription', {
        p_thread_id: threadId!,
        p_subscribed: subscribed,
      })
      if (error) throw error
      return subscribed
    },
    onSuccess: (subscribed) => {
      qc.setQueryData(threadSubscriptionKeys.byThread(threadId ?? ''), subscribed)
      if (workspaceId) invalidateMessengerCaches(qc, workspaceId)
    },
  })

  return {
    /** true = подписан, false = отписан, null = ещё грузится / нет участника. */
    isSubscribed: query.data ?? null,
    isLoading: query.isLoading,
    setSubscribed: (v: boolean) => mutation.mutate(v),
    pending: mutation.isPending,
  }
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
