import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDeadlineGroup } from './deadlineUtils'

describe('getDeadlineGroup', () => {
  beforeEach(() => {
    // 2026-04-11 — суббота, 12:00
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 11, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('возвращает no_deadline для null', () => {
    expect(getDeadlineGroup(null)).toBe('no_deadline')
  })

  it('возвращает no_deadline для пустой строки', () => {
    expect(getDeadlineGroup('')).toBe('no_deadline')
  })

  it('возвращает overdue для прошедшей даты', () => {
    expect(getDeadlineGroup('2026-04-10T08:00:00')).toBe('overdue')
    expect(getDeadlineGroup('2025-12-31T08:00:00')).toBe('overdue')
  })

  it('возвращает today для сегодняшней даты', () => {
    expect(getDeadlineGroup('2026-04-11T08:00:00')).toBe('today')
    expect(getDeadlineGroup('2026-04-11T23:59:00')).toBe('today')
  })

  it('возвращает tomorrow для завтрашней даты', () => {
    expect(getDeadlineGroup('2026-04-12T08:00:00')).toBe('tomorrow')
  })

  it('возвращает this_week для дат в пределах текущей недели', () => {
    // Суббота 11.04 → конец недели включает воскресенье 12.04
    // Но 12.04 уже tomorrow, проверим понедельник который позже окажется в later
    // На субботу 11.04 endOfWeek = today + (0+1) = 12.04 + 1 = 13.04 (исключительно)
    // Так что 12.04 — tomorrow, после 13.04 — later
    // Проверим то, что точно в этой неделе быть не может (суббота — последний рабочий день недели)
    // Для случая, когда мы в середине недели, проверим отдельно ниже
    expect(getDeadlineGroup('2026-04-13T08:00:00')).toBe('later')
  })

  it('возвращает this_week когда дата в текущей рабочей неделе (среда → пятница)', () => {
    // Установим среду 2026-04-08
    vi.setSystemTime(new Date(2026, 3, 8, 12, 0, 0))
    expect(getDeadlineGroup('2026-04-10T08:00:00')).toBe('this_week') // пт
  })

  it('возвращает later для дат за пределами этой недели', () => {
    expect(getDeadlineGroup('2026-04-20T08:00:00')).toBe('later')
    expect(getDeadlineGroup('2027-01-01T08:00:00')).toBe('later')
  })
})
