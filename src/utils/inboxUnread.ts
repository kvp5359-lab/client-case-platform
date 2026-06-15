/**
 * Единая логика подсчёта и отображения непрочитанных для inbox-тредов.
 *
 * ВСЕ компоненты должны использовать getBadgeDisplay / getAggregateBadgeDisplay
 * для определения того, что показывать в бейдже. Не дублировать if/else в компонентах.
 */

export type ThreadUnreadFields = {
  unread_count: number
  /** Есть ли хотя бы одна непрочитанная реакция. Для совместимости с превью. */
  has_unread_reaction: boolean
  /** Сколько непрочитанных реакций. Если поле отсутствует, используется has_unread_reaction ? 1 : 0. */
  unread_reaction_count?: number
  manually_unread: boolean
  last_reaction_emoji?: string | null
  /** Audit: count of unread events (status change, etc.) */
  unread_event_count?: number
}

/** Результат: что рендерить в бейдже */
export type BadgeDisplay =
  | { type: 'number'; value: number }
  | { type: 'emoji'; value: string }
  | { type: 'dot' }
  | { type: 'none' }

/** Сколько непрочитанных реакций в треде: либо точное число, либо 0/1 от булева флага. */
function reactionCount(thread: ThreadUnreadFields): number {
  if (typeof thread.unread_reaction_count === 'number') {
    return thread.unread_reaction_count
  }
  return thread.has_unread_reaction ? 1 : 0
}

/**
 * Что показать в бейдже для ОДНОГО треда.
 *
 * Приоритет:
 * 1. Есть непрочитанные сообщения или события, или >1 реакция → число (все вклады сложены)
 * 2. Ровно 1 непрочитанная реакция и больше ничего → эмодзи
 * 3. Нет ничего, но manually_unread → точка
 * 4. Иначе → ничего
 */
export function getBadgeDisplay(thread: ThreadUnreadFields): BadgeDisplay {
  const eventCount = thread.unread_event_count ?? 0
  const reactions = reactionCount(thread)

  if (thread.unread_count > 0 || eventCount > 0 || reactions > 1) {
    return { type: 'number', value: thread.unread_count + eventCount + reactions }
  }
  if (reactions === 1 && thread.last_reaction_emoji) {
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
 * - непрочитанные реакции → +unread_reaction_count
 * - unread_event_count → +unread_event_count
 * - manually_unread без остального → +1 (точка)
 *
 * Итог:
 * 1. В сумме реакций по всем тредам ровно 1, и больше вообще ничего не непрочитано → эмодзи
 * 2. Сумма > 0 → число
 * 3. Только manually_unread → точка
 * 4. Иначе → ничего
 */
export function getAggregateBadgeDisplay(threads: ThreadUnreadFields[]): BadgeDisplay {
  let messagesAndEvents = 0
  let totalReactions = 0
  let soleReactionEmoji: string | null = null
  let hasDot = false

  for (const t of threads) {
    const reactions = reactionCount(t)
    const events = t.unread_event_count ?? 0

    messagesAndEvents += t.unread_count + events
    totalReactions += reactions

    if (reactions === 1 && !soleReactionEmoji && t.last_reaction_emoji) {
      soleReactionEmoji = t.last_reaction_emoji
    }

    if (t.unread_count === 0 && events === 0 && reactions === 0 && t.manually_unread) {
      hasDot = true
    }
  }

  const total = messagesAndEvents + totalReactions

  // Ровно одна непрочитанная реакция на весь список и больше ничего — показываем эмодзи
  if (total === 1 && totalReactions === 1 && soleReactionEmoji) {
    return { type: 'emoji', value: soleReactionEmoji }
  }
  if (total > 0) return { type: 'number', value: total }
  if (hasDot) return { type: 'dot' }
  return { type: 'none' }
}

// --- Числовые счётчики (для расчётов; UI-индикаторы — getBadgeDisplay) ---
// Используются в useInbox для арифметики (суммы по тредам, фильтры).

/** Количество непрочитанных для одного треда. UI — через getBadgeDisplay. */
export function calcThreadUnread(thread: ThreadUnreadFields): number {
  const count = thread.unread_count + (thread.unread_event_count ?? 0) + reactionCount(thread)
  if (count > 0) return count
  if (thread.manually_unread) return -1
  return 0
}

/**
 * Суммарное кол-во непрочитанных по списку тредов.
 * UI — через getAggregateBadgeDisplay.
 */
export function calcTotalUnread(threads: ThreadUnreadFields[]): number {
  let total = 0
  for (const t of threads) {
    const count = t.unread_count + (t.unread_event_count ?? 0) + reactionCount(t)
    if (count > 0) total += count
    else if (t.manually_unread) total += 1
  }
  return total
}

/** Форматировать число для бейджа: 99+ если больше 99 */
export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

// --- Сегменты инбокса «Нужно ответить» / «Ждём клиента» ---
// Считаются на клиенте из лёгких агрегатов (get_inbox_thread_aggregates +
// поля last_from_staff/has_external) — чтобы НЕ грузить тяжёлые обёртки
// get_inbox_needs_reply_threads / get_inbox_awaiting_reply_threads в дефолтном
// пути доски «Входящие». Полные списки этих вкладок грузятся лениво (по клику).
// Предикаты — точное зеркало WHERE этих обёрток (проверено на проде: счётчики
// совпадают ровно). Менять оба места синхронно.

/** Поля агрегата, нужные для классификации сегментов. */
export type InboxSegmentFields = {
  last_message_at: string | null
  unread_count: number
  unread_event_count?: number
  unread_reaction_count?: number
  has_unread_reaction: boolean
  manually_unread: boolean
  /** Последнее НЕ-сервисное сообщение от сотрудника? null = собеседник. */
  last_from_staff?: boolean | null
  /** Есть сообщение из внешнего канала (TG/Wazzup/Email). */
  has_external?: boolean
}

/**
 * Тред «полностью прочитан» — ни одного непрочитанного сигнала. Зеркало
 * read-гейта обёрток needs/awaiting (last_message_at IS NOT NULL + все unread = 0).
 */
export function isThreadFullyRead(t: InboxSegmentFields): boolean {
  return (
    t.last_message_at != null &&
    t.unread_count === 0 &&
    (t.unread_event_count ?? 0) === 0 &&
    (t.unread_reaction_count ?? 0) === 0 &&
    t.has_unread_reaction === false &&
    t.manually_unread === false
  )
}

/** «Нужно ответить»: внешний диалог, прочитан, последним писал НЕ сотрудник. */
export function isNeedsReply(t: InboxSegmentFields): boolean {
  return t.has_external === true && isThreadFullyRead(t) && t.last_from_staff !== true
}

/** «Ждём клиента»: внешний диалог, прочитан, последним писал сотрудник. */
export function isAwaitingReply(t: InboxSegmentFields): boolean {
  return t.has_external === true && isThreadFullyRead(t) && t.last_from_staff === true
}

/** Счётчики сегментов инбокса из лёгких агрегатов — один проход. */
export function countInboxSegments(
  threads: InboxSegmentFields[],
): { needsReply: number; awaiting: number } {
  let needsReply = 0
  let awaiting = 0
  for (const t of threads) {
    if (t.has_external !== true || !isThreadFullyRead(t)) continue
    if (t.last_from_staff === true) awaiting += 1
    else needsReply += 1
  }
  return { needsReply, awaiting }
}
