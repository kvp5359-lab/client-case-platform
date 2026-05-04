import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Дёргает wazzup-mark-read при открытии Wazzup-треда. Если тред не
 * Wazzup'овский — функция вернёт `{skip: …}`, это не страшно.
 *
 * Параметр `lastMessageMarker` нужен, чтобы перезапускать вызов при
 * приходе нового непрочитанного сообщения (передавай туда unreadCount
 * или id последнего message — всё, что увеличивается с приходом нового).
 */
export function useWazzupMarkRead(threadId: string | undefined, lastMessageMarker?: number | string) {
  useEffect(() => {
    if (!threadId) return
    void supabase.functions.invoke('wazzup-mark-read', { body: { thread_id: threadId } })
      .catch(() => { /* тихо — функция всё равно может вернуть skip */ })
  }, [threadId, lastMessageMarker])
}
