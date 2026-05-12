import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { backfillTelegramHistory } from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'

/**
 * Возвращает true, если тред подключён к MTProto-сессии (т.е. для него
 * имеет смысл показывать кнопку «Загрузить ещё из Telegram»).
 *
 * Лёгкий select без RLS-фокусов: смотрим только два поля. Используется
 * фронтом для условного рендера UI бэкфилла.
 */
export function useIsMtprotoThread(threadId: string | undefined): boolean {
  const { data } = useQuery({
    queryKey: ['thread', 'is-mtproto', threadId],
    queryFn: async () => {
      if (!threadId) return false
      const { data, error } = await supabase
        .from('project_threads')
        .select('mtproto_session_user_id, mtproto_client_tg_user_id')
        .eq('id', threadId)
        .maybeSingle()
      if (error || !data) return false
      return !!data.mtproto_session_user_id && !!data.mtproto_client_tg_user_id
    },
    enabled: !!threadId,
    staleTime: 5 * 60 * 1000, // тред не меняет канал на лету
  })
  return data ?? false
}

/**
 * Догрузка старой истории сообщений MTProto-треда через
 * edge function `telegram-mtproto-backfill`.
 *
 * Используется в MessageList: когда сотрудник долистал тред до самого
 * старого сообщения в БД и нажал «Загрузить ещё из Telegram». Под капотом
 * mtproto-service сходит в Telegram через `Api.messages.GetHistory`,
 * вставит до 50 старых сообщений с медиа в БД, фронт по успеху
 * инвалидирует InfiniteQuery и пересортирует ленту.
 *
 * Toast выводит результат: «загружено N сообщений», «история закончилась»,
 * «попробуйте через N сек» (FLOOD_WAIT). Ошибки сети — обычный toast.
 */
export function useBackfillTelegramHistory(threadId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!threadId) throw new Error('thread_id отсутствует')
      return backfillTelegramHistory(threadId)
    },
    onSuccess: (data) => {
      if (!threadId) return
      // Инвалидация ленты — InfiniteQuery перезапросит первую страницу,
      // и старые сообщения подтянутся при следующем скролле вверх (или
      // сразу, если новых сообщений достаточно много, чтобы UI их показал).
      qc.invalidateQueries({ queryKey: messengerKeys.messagesByThreadId(threadId) })

      if (data.inserted === 0 && !data.hasMore) {
        toast.info('История этого чата в Telegram закончилась')
      } else if (data.inserted === 0) {
        // fetched > 0 но inserted = 0 — все уже были в БД (дубли).
        toast.info('Эти сообщения уже загружены')
      } else if (data.hasMore) {
        toast.success(`Загружено ${data.inserted} сообщений — есть ещё`)
      } else {
        toast.success(`Загружено ${data.inserted} сообщений — это вся история`)
      }
    },
    onError: (err: Error) => {
      const msg = err.message ?? ''
      // FLOOD_WAIT прилетает как строка с retry_after_seconds в JSON-теле.
      const flood = msg.match(/retry_after_seconds["\s:]+(\d+)/)
      if (flood) {
        toast.error(`Telegram просит подождать ${flood[1]} сек. Попробуйте позже.`)
      } else {
        toast.error(msg || 'Не удалось загрузить историю')
      }
    },
  })
}
