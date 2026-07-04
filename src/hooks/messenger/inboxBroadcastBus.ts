/**
 * Внутренняя шина событий инбокса.
 *
 * Broadcast-топик `inbox:<ws>` слушается в ОДНОМ месте — useWorkspaceMessagesRealtime
 * (смонтирован в WorkspaceLayout, активен всё время внутри воркспейса). Причина: в
 * supabase-js `supabase.channel(topic)` возвращает ТОТ ЖЕ инстанс канала при
 * повторном вызове с тем же топиком, поэтому несколько хуков не могут независимо
 * подписаться/отписаться от `inbox:<ws>` — `removeChannel` одного убил бы общий
 * канал у остальных.
 *
 * Поэтому useWorkspaceMessagesRealtime переизлучает полученные события в эту шину,
 * а живая лента (useProjectMessages) и тост (useNewMessageToast) подписываются на
 * шину — без своей supabase-подписки. Один websocket-канал, ноль коллизий.
 */

export type InboxBroadcastPayload = {
  project_id?: string | null
  tbl?: string
  thread_id?: string | null
  message_id?: string | null
  op?: string
  has_attachments?: boolean
}

type Listener = (payload: InboxBroadcastPayload) => void

const listeners = new Set<Listener>()

/** Переизлучить событие broadcast всем локальным подписчикам. */
export function emitInboxBroadcast(payload: InboxBroadcastPayload): void {
  for (const listener of listeners) {
    try {
      listener(payload)
    } catch {
      /* изоляция: сбой одного подписчика не ломает остальных */
    }
  }
}

/** Подписаться на события инбокса. Возвращает функцию отписки. */
export function subscribeInboxBroadcast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
