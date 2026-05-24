/**
 * Кастомный RBC-вид «Следующие N дней» — обёртка над TimeGrid с замкнутым N.
 * Используется в BoardListCalendarView через views={NEXT_N_VIEW}.
 *
 * RBC не экспортирует TimeGrid из index, нужен внутренний путь.
 */

// @ts-expect-error — type definitions for internal path не поставляются
import TimeGrid from 'react-big-calendar/lib/TimeGrid'
import { Navigate } from 'react-big-calendar'
import { startOfDay, addDays, subDays, format as fmt } from 'date-fns'
import { ru } from 'date-fns/locale'

export function makeNextNDaysView(n: number) {
  const View = (props: Record<string, unknown>) => {
    const baseDate = startOfDay((props as { date: Date }).date)
    const range = Array.from({ length: n }, (_, i) => addDays(baseDate, i))
    return <TimeGrid {...props} range={range} eventOffset={15} />
  }
  ;(View as unknown as { range: (date: Date) => Date[] }).range = (date: Date) => {
    const baseDate = startOfDay(date)
    return Array.from({ length: n }, (_, i) => addDays(baseDate, i))
  }
  ;(View as unknown as { navigate: (date: Date, action: string) => Date }).navigate = (
    date: Date,
    action: string,
  ) => {
    switch (action) {
      case Navigate.PREVIOUS:
        return subDays(date, n)
      case Navigate.NEXT:
        return addDays(date, n)
      default:
        return date
    }
  }
  ;(View as unknown as { title: (date: Date) => string }).title = (date: Date) => {
    const start = date
    const end = addDays(date, n - 1)
    return `${fmt(start, 'd MMM', { locale: ru })} — ${fmt(end, 'd MMM', { locale: ru })}`
  }
  return View
}
