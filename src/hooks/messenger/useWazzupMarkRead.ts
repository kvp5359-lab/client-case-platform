import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useProjectThreads } from './useProjectThreads'

/**
 * Дёргает Edge Function `wazzup-mark-read`, если открытый тред — Wazzup'овский.
 *
 * До рефакторинга (Зона 8) хук стрелял на ВСЕ треды, edge function проверяла
 * тип треда внутри и возвращала `{skip: …}`. Сейчас фильтруем на фронте по
 * `wazzup_channel_id`: для не-Wazzup тредов лишний HTTP-запрос вообще не идёт.
 *
 * Параметр `lastMessageMarker` нужен, чтобы перезапускать вызов при приходе
 * нового непрочитанного (передавай туда unreadCount или id последнего
 * сообщения — всё, что увеличивается с приходом нового).
 */
export function useWazzupMarkRead(
  projectId: string | undefined,
  threadId: string | undefined,
  lastMessageMarker?: number | string,
) {
  const { data: threads } = useProjectThreads(projectId)
  // wazzup_channel_id не описан в типе ProjectThread (он узкий для UI),
  // но select('*') в useProjectThreads его забирает — кастим к расширенному.
  const thread = threads?.find((t) => t.id === threadId) as
    | { wazzup_channel_id?: string | null }
    | undefined
  const isWazzup = !!thread?.wazzup_channel_id

  useEffect(() => {
    if (!threadId || !isWazzup) return
    void supabase.functions
      .invoke('wazzup-mark-read', { body: { thread_id: threadId } })
      .catch(() => {
        /* тихо — функция всё равно может вернуть skip */
      })
  }, [threadId, isWazzup, lastMessageMarker])
}
