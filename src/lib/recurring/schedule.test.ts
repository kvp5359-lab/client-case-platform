import { describe, it, expect } from 'vitest'
import {
  describeSchedule,
  nextOccurrences,
  isoDay,
  lastDayOfMonth,
  type RecurrenceSchedule,
} from './schedule'

describe('isoDay', () => {
  it('понедельник = 1, воскресенье = 7', () => {
    expect(isoDay(new Date(2026, 5, 29))).toBe(1) // Mon 29 Jun 2026
    expect(isoDay(new Date(2026, 5, 28))).toBe(7) // Sun 28 Jun 2026
    expect(isoDay(new Date(2026, 5, 27))).toBe(6) // Sat
  })
})

describe('lastDayOfMonth', () => {
  it('февраль 2026 = 28, апрель = 30, январь = 31', () => {
    expect(lastDayOfMonth(2026, 1)).toBe(28)
    expect(lastDayOfMonth(2026, 3)).toBe(30)
    expect(lastDayOfMonth(2026, 0)).toBe(31)
  })
})

describe('nextOccurrences', () => {
  const from = new Date(2026, 5, 27, 12, 0, 0) // Sat 27 Jun 2026, 12:00 local

  it('ежедневно: следующая — завтра в указанное время', () => {
    const s: RecurrenceSchedule = { freq: 'daily', byweekday: [], bymonthday: null, fireTime: '09:00' }
    const next = nextOccurrences(s, from, 2)
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(new Date(2026, 5, 28, 9, 0, 0))
    expect(next[1]).toEqual(new Date(2026, 5, 29, 9, 0, 0))
  })

  it('еженедельно Пн/Ср/Пт: ближайшие совпадения', () => {
    const s: RecurrenceSchedule = { freq: 'weekly', byweekday: [1, 3, 5], bymonthday: null, fireTime: '09:00' }
    const next = nextOccurrences(s, from, 3)
    expect(next[0]).toEqual(new Date(2026, 5, 29, 9, 0, 0)) // Mon 29
    expect(next[1]).toEqual(new Date(2026, 6, 1, 9, 0, 0)) // Wed 1 Jul
    expect(next[2]).toEqual(new Date(2026, 6, 3, 9, 0, 0)) // Fri 3 Jul
  })

  it('ежемесячно 1-го числа', () => {
    const s: RecurrenceSchedule = { freq: 'monthly', byweekday: [], bymonthday: 1, fireTime: '09:00' }
    const next = nextOccurrences(s, from, 1)
    expect(next[0]).toEqual(new Date(2026, 6, 1, 9, 0, 0))
  })

  it('ежемесячно в последний день месяца', () => {
    const s: RecurrenceSchedule = { freq: 'monthly', byweekday: [], bymonthday: -1, fireTime: '09:00' }
    const next = nextOccurrences(s, from, 2)
    expect(next[0]).toEqual(new Date(2026, 5, 30, 9, 0, 0)) // 30 Jun
    expect(next[1]).toEqual(new Date(2026, 6, 31, 9, 0, 0)) // 31 Jul
  })

  it('ежемесячно 31-го числа: кламп к последнему дню короткого месяца', () => {
    const febFrom = new Date(2026, 1, 1, 0, 0, 0) // 1 Feb 2026
    const s: RecurrenceSchedule = { freq: 'monthly', byweekday: [], bymonthday: 31, fireTime: '09:00' }
    const next = nextOccurrences(s, febFrom, 1)
    expect(next[0]).toEqual(new Date(2026, 1, 28, 9, 0, 0)) // 28 Feb (clamped)
  })

  it('учитывает until_date — не выходит за предел', () => {
    const s: RecurrenceSchedule = {
      freq: 'daily',
      byweekday: [],
      bymonthday: null,
      fireTime: '09:00',
      untilDate: '2026-06-29',
    }
    const next = nextOccurrences(s, from, 10)
    expect(next).toHaveLength(2) // 28, 29 июня
    expect(next[next.length - 1]).toEqual(new Date(2026, 5, 29, 9, 0, 0))
  })

  it('weekly без выбранных дней — пусто', () => {
    const s: RecurrenceSchedule = { freq: 'weekly', byweekday: [], bymonthday: null, fireTime: '09:00' }
    expect(nextOccurrences(s, from, 3)).toHaveLength(0)
  })
})

describe('describeSchedule', () => {
  it('ежедневно', () => {
    expect(describeSchedule({ freq: 'daily', byweekday: [], bymonthday: null, fireTime: '09:00' })).toBe(
      'Ежедневно в 09:00',
    )
  })

  it('по будням схлопывается', () => {
    expect(
      describeSchedule({ freq: 'weekly', byweekday: [1, 2, 3, 4, 5], bymonthday: null, fireTime: '10:30' }),
    ).toBe('По будням в 10:30')
  })

  it('конкретные дни недели', () => {
    expect(
      describeSchedule({ freq: 'weekly', byweekday: [1, 5], bymonthday: null, fireTime: '09:00' }),
    ).toBe('Еженедельно: Пн, Пт в 09:00')
  })

  it('ежемесячно по числу и последний день', () => {
    expect(
      describeSchedule({ freq: 'monthly', byweekday: [], bymonthday: 15, fireTime: '09:00' }),
    ).toBe('Ежемесячно 15-го числа в 09:00')
    expect(
      describeSchedule({ freq: 'monthly', byweekday: [], bymonthday: -1, fireTime: '09:00' }),
    ).toBe('Ежемесячно в последний день месяца в 09:00')
  })
})
