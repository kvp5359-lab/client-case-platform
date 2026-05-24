/**
 * Чистые helpers для TaskTimePickerPopover.
 * Без React — легко тестируются по отдельности.
 */

import type { TaskTimeValue } from './TaskTimePickerPopover'

/** Список вариантов времени с шагом 15 минут — для двух колонок-list'ов. */
export const TIME_OPTIONS = (() => {
  const out: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

export function formatDateShort(d: Date | undefined): string {
  if (!d) return ''
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).replace(/\.$/, '')
}

export function parseHM(time: string): { h: number; m: number } | null {
  if (!time) return null
  const [hStr, mStr] = time.split(':')
  const h = Number.parseInt(hStr, 10)
  const m = Number.parseInt(mStr, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return { h, m }
}

export function addMinutes(time: string, addMin: number): string {
  const t = parseHM(time)
  if (!t) return ''
  const total = t.h * 60 + t.m + addMin
  const norm = ((total % 1440) + 1440) % 1440
  const h = Math.floor(norm / 60)
  const m = norm % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function buildIsoFromDateAndTime(date: Date | undefined, time: string): string | null {
  if (!date) return null
  const t = parseHM(time)
  if (!t) return null
  const d = new Date(date)
  d.setHours(t.h, t.m, 0, 0)
  return d.toISOString()
}

export function formatDateOnly(date: Date | undefined): string | null {
  if (!date) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Сравнение двух ISO/date-only строк по фактическому моменту времени.
 *  Учитывает разные форматы ('+00:00' vs 'Z'), считает обе null равными. */
export function isoEqual(a: string | null, b: string | null): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b
  return ta === tb
}

export function getInitialScrollTarget(
  field: 'startTime' | 'endTime',
  current: string,
  startTime: string,
): string {
  if (current) return current
  if (field === 'endTime' && startTime) return addMinutes(startTime, 30)
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const rounded = `${String(h).padStart(2, '0')}:${String(Math.floor(m / 15) * 15).padStart(2, '0')}`
  return rounded < '09:00' ? '09:00' : rounded
}

/**
 * Парсит value (deadline/startAt/endAt из БД) в локальный state формы.
 */
export function parseValue(v: TaskTimeValue): {
  date: Date | undefined
  endDate: Date | undefined
  startTime: string
  endTime: string
  showDuration: boolean
} {
  if (v.startAt && v.endAt) {
    const s = new Date(v.startAt)
    const e = new Date(v.endAt)
    const sameDay =
      s.getFullYear() === e.getFullYear() &&
      s.getMonth() === e.getMonth() &&
      s.getDate() === e.getDate()
    const isMultiDayAllDay =
      !sameDay &&
      s.getHours() === 0 && s.getMinutes() === 0 &&
      e.getHours() === 23 && e.getMinutes() === 59
    return {
      date: s,
      endDate: sameDay ? undefined : e,
      startTime: isMultiDayAllDay
        ? ''
        : `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
      endTime: isMultiDayAllDay
        ? ''
        : `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`,
      showDuration: true,
    }
  }
  return {
    date: v.deadline ? new Date(v.deadline) : undefined,
    endDate: undefined,
    startTime: '',
    endTime: '',
    showDuration: false,
  }
}

/**
 * Собирает state в TaskTimeValue для родителя.
 */
export function buildValue(
  date: Date | undefined,
  endDate: Date | undefined,
  startTime: string,
  endTime: string,
  showDuration: boolean,
): TaskTimeValue {
  if (!date) return { deadline: null, startAt: null, endAt: null }
  if (!showDuration) {
    return { deadline: formatDateOnly(date), startAt: null, endAt: null }
  }
  const hasTime = Boolean(startTime && endTime)
  if (!hasTime) {
    if (endDate) {
      const startAt = buildIsoFromDateAndTime(date, '00:00')
      const endAt = buildIsoFromDateAndTime(endDate, '23:59')
      return { deadline: endAt, startAt, endAt }
    }
    return { deadline: formatDateOnly(date), startAt: null, endAt: null }
  }
  const startAt = buildIsoFromDateAndTime(date, startTime)
  const endAt = buildIsoFromDateAndTime(endDate ?? date, endTime)
  return { deadline: endAt, startAt, endAt }
}

export type ActiveField = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null
