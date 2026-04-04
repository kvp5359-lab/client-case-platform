/**
 * Единая логика подсчёта непрочитанных для inbox-тредов.
 * Используется в: InboxChatItem, useFilteredInbox, useInbox.
 */

interface ThreadUnreadFields {
  unread_count: number
  has_unread_reaction: boolean
  manually_unread: boolean
}

/**
 * Количество непрочитанных для одного треда.
 * Реакция считается как +1. manually_unread без сообщений — тоже 1.
 * Возвращает -1 если только manually_unread (показать точку без числа).
 */
export function calcThreadUnread(thread: ThreadUnreadFields): number {
  const count = thread.unread_count + (thread.has_unread_reaction ? 1 : 0)
  if (count > 0) return count
  if (thread.manually_unread) return -1
  return 0
}

/**
 * Суммарное кол-во непрочитанных по списку тредов (для favicon, бейджа сайдбара).
 * manually_unread без сообщений считается как 1.
 */
export function calcTotalUnread(threads: ThreadUnreadFields[]): number {
  let total = 0
  for (const t of threads) {
    const count = t.unread_count + (t.has_unread_reaction ? 1 : 0)
    if (count > 0) total += count
    else if (t.manually_unread) total += 1
  }
  return total
}
