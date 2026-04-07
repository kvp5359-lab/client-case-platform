/**
 * Единая логика подсчёта и отображения непрочитанных для inbox-тредов.
 *
 * ВСЕ компоненты должны использовать getBadgeDisplay / getAggregateBadgeDisplay
 * для определения того, что показывать в бейдже. Не дублировать if/else в компонентах.
 */

export interface ThreadUnreadFields {
  unread_count: number
  has_unread_reaction: boolean
  manually_unread: boolean
  last_reaction_emoji?: string | null
}

/** Результат: что рендерить в бейдже */
export type BadgeDisplay =
  | { type: 'number'; value: number }
  | { type: 'emoji'; value: string }
  | { type: 'dot' }
  | { type: 'none' }

/**
 * Что показать в бейдже для ОДНОГО треда.
 *
 * Приоритет:
 * 1. Есть непрочитанные сообщения → число (unread_count + реакция как +1)
 * 2. Нет сообщений, но есть реакция → эмодзи
 * 3. Нет сообщений, нет реакции, но manually_unread → точка
 * 4. Иначе → ничего
 */
export function getBadgeDisplay(thread: ThreadUnreadFields): BadgeDisplay {
  if (thread.unread_count > 0) {
    return { type: 'number', value: thread.unread_count + (thread.has_unread_reaction ? 1 : 0) }
  }
  if (thread.has_unread_reaction && thread.last_reaction_emoji) {
    return { type: 'emoji', value: thread.last_reaction_emoji }
  }
  if (thread.manually_unread) {
    return { type: 'dot' }
  }
  return { type: 'none' }
}

/**
 * Что показать в АГРЕГИРОВАННОМ бейдже для списка тредов (проект в сайдбаре, вкладка «Чаты»).
 *
 * Каждый тред вносит вклад:
 * - unread_count сообщений → +unread_count
 * - реакция → +1 (независимо от наличия сообщений)
 * - manually_unread без сообщений и реакции → +1
 *
 * Итог:
 * 1. Сумма > 0 → число
 * 2. Единственный вклад — одна реакция без сообщений → эмодзи
 * 3. Только manually_unread → точка
 * 4. Иначе → ничего
 */
export function getAggregateBadgeDisplay(threads: ThreadUnreadFields[]): BadgeDisplay {
  let total = 0
  let reactionOnlyEmoji: string | null = null
  let reactionOnlyCount = 0
  let hasDot = false

  for (const t of threads) {
    if (t.unread_count > 0) {
      total += t.unread_count + (t.has_unread_reaction ? 1 : 0)
    } else if (t.has_unread_reaction) {
      total += 1
      reactionOnlyCount++
      if (!reactionOnlyEmoji && t.last_reaction_emoji) reactionOnlyEmoji = t.last_reaction_emoji
    } else if (t.manually_unread) {
      hasDot = true
    }
  }

  // Единственный непрочитанный — одна реакция без сообщений → показать эмодзи
  if (total === 1 && reactionOnlyCount === 1 && reactionOnlyEmoji) {
    return { type: 'emoji', value: reactionOnlyEmoji }
  }
  if (total > 0) return { type: 'number', value: total }
  if (hasDot) return { type: 'dot' }
  return { type: 'none' }
}

// --- Обратная совместимость (используется в useFilteredInbox, useFaviconBadge) ---

/**
 * Количество непрочитанных для одного треда.
 * @deprecated Используй getBadgeDisplay для визуала. Эта функция — для подсчёта числа.
 */
export function calcThreadUnread(thread: ThreadUnreadFields): number {
  const count = thread.unread_count + (thread.has_unread_reaction ? 1 : 0)
  if (count > 0) return count
  if (thread.manually_unread) return -1
  return 0
}

/**
 * Суммарное кол-во непрочитанных по списку тредов (для favicon, бейджа сайдбара).
 * @deprecated Используй getAggregateBadgeDisplay для визуала. Эта функция — для чисел.
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

/** Форматировать число для бейджа: 99+ если больше 99 */
export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}
