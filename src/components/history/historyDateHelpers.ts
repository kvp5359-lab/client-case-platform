/**
 * Общие date-хелперы лент истории (TimelineFeed, ActivityFeed):
 * заголовок дня (Сегодня/Вчера/длинная дата) и ключ дня для группировки.
 */
import { formatLongDate } from '@/utils/format/dateFormat'

/** «Сегодня» / «Вчера» / «15 мая 2026» для разделителя дня в ленте. */
export function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const entryDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - entryDay.getTime()) / 86_400_000)

  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Вчера'
  return formatLongDate(date)
}

/** Ключ дня «YYYY-M-D» (локальная TZ) для группировки записей ленты по дню. */
export function dayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
