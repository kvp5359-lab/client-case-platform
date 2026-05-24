/**
 * Утилиты для перевода DOM-координат курсора в время на RBC-сетке.
 * Вынесено из BoardListCalendarView — все функции чистые, без React.
 */

import { Views, type View } from 'react-big-calendar'
import { startOfDay, startOfWeek, addDays, subDays, getDay } from 'date-fns'

/** Размер 30-минутного блока в пикселях по текущей сетке. */
export function pxPerMinute(daySlotEl: HTMLElement): number {
  const groups = daySlotEl.querySelectorAll('.rbc-timeslot-group').length
  if (groups === 0) return 0
  return daySlotEl.getBoundingClientRect().height / (groups * 60)
}

/** Находит .rbc-day-slot под точкой (через elementsFromPoint — обходит
 *  overlay'и dnd-kit, которые на короткий момент могут перекрывать слот). */
export function findDaySlotAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const elements = document.elementsFromPoint(clientX, clientY)
  for (const el of elements) {
    const candidate = (el as HTMLElement).closest?.('.rbc-day-slot') as HTMLElement | null
    if (candidate) return candidate
  }
  return null
}

/** Достаёт min_hour из первой подписи .rbc-time-gutter (формат «8:00»). */
export function getMinHourFromGutter(slotInsideTimeContent: HTMLElement): number {
  const timeContent = slotInsideTimeContent.closest('.rbc-time-content')
  const gutter = timeContent?.parentElement?.querySelector('.rbc-time-gutter')
  const firstLabel = gutter?.querySelector('.rbc-label')?.textContent?.trim() ?? '00:00'
  return parseInt(firstLabel.split(':')[0] ?? '0', 10) || 0
}

/**
 * Считает Date+время по координатам курсора и DOM-элементу day-slot RBC.
 *
 *  1. Колонка → дата: индекс day-slot внутри `.rbc-time-content` +
 *     стартовая дата текущего диапазона (зависит от view).
 *  2. Y → минуты: доля Y относительно высоты колонки * длительность
 *     видимой сетки. min_hour берём из подписи `.rbc-time-gutter`.
 *  3. Снап на 10 минут (шаг резайза).
 *
 * Возвращает `null`, если не удалось определить колонку или сетка пуста.
 */
export function computeTimeFromCoords(
  _clientX: number,
  clientY: number,
  view: View,
  date: Date,
  daySlot: HTMLElement,
): Date | null {
  // _clientX оставлен в сигнатуре только для согласованности с вызовами —
  // X нужен лишь снаружи в findDaySlotAtPoint.

  // Все day-slot этого календаря, чтобы найти индекс колонки.
  const timeContent = daySlot.closest('.rbc-time-content') as HTMLElement | null
  if (!timeContent) return null
  const daySlots = Array.from(timeContent.querySelectorAll<HTMLElement>('.rbc-day-slot'))
  const colIndex = daySlots.indexOf(daySlot)
  if (colIndex < 0) return null

  // Стартовая дата текущего диапазона.
  const startOfRange: Date = (() => {
    if (view === Views.DAY) return startOfDay(date)
    if (view === Views.WORK_WEEK) {
      // RBC по умолчанию: пн-пт текущей недели.
      const day = getDay(date) // 0..6, вс=0
      return startOfDay(subDays(date, day === 0 ? 6 : day - 1))
    }
    if ((view as string) === 'next_n') {
      // Кастомный вид: range = [date, date+N-1].
      return startOfDay(date)
    }
    // Week: воскресенье текущей недели (Sunday-start).
    return startOfWeek(date, { weekStartsOn: 0 })
  })()

  const dayDate = addDays(startOfRange, colIndex)

  // Y → минуты: доля Y в колонке * её длительность.
  const rect = daySlot.getBoundingClientRect()
  const y = clientY - rect.top
  const ratio = Math.max(0, Math.min(1, y / rect.height))

  const groups = daySlot.querySelectorAll('.rbc-timeslot-group').length
  const totalMinutes = groups * 60
  if (totalMinutes === 0) return null
  const gutter = timeContent.parentElement?.querySelector('.rbc-time-gutter')
  const firstLabel = gutter?.querySelector('.rbc-label')?.textContent?.trim() ?? '00:00'
  const minHour = parseInt(firstLabel.split(':')[0] ?? '0', 10) || 0

  const rawMin = minHour * 60 + ratio * totalMinutes
  // floor (а не round) → полоска всегда у верхнего края слота, в котором
  // находится курсор. Это совпадает с тем, как RBC внутренне считает
  // click-to-slot (Math.floor в closestSlotToPosition), и интуитивно:
  // мышь не может «обогнать» полоску вниз.
  const snappedMin = Math.floor(rawMin / 10) * 10
  const h = Math.floor(snappedMin / 60)
  const m = snappedMin % 60

  const result = new Date(dayDate)
  result.setHours(h, m, 0, 0)
  return result
}
