import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseDateString,
  formatDateToString,
  formatSmartDate,
  formatSmartDateTime,
  formatShortDate,
} from './dateFormat'

describe('parseDateString', () => {
  it('парсит валидную дату YYYY-MM-DD', () => {
    const date = parseDateString('2026-04-11')
    expect(date).toBeInstanceOf(Date)
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(3) // апрель = 3
    expect(date?.getDate()).toBe(11)
  })

  it('возвращает undefined для пустой строки', () => {
    expect(parseDateString('')).toBeUndefined()
  })

  it('возвращает undefined для строки без 3 частей', () => {
    expect(parseDateString('2026-04')).toBeUndefined()
    expect(parseDateString('2026')).toBeUndefined()
    expect(parseDateString('2026-04-11-extra')).toBeUndefined()
  })

  it('возвращает undefined для нечисловых частей', () => {
    expect(parseDateString('abcd-04-11')).toBeUndefined()
    expect(parseDateString('2026-xx-11')).toBeUndefined()
    expect(parseDateString('2026-04-yy')).toBeUndefined()
  })

  it('возвращает undefined для месяца вне 1-12', () => {
    expect(parseDateString('2026-00-11')).toBeUndefined()
    expect(parseDateString('2026-13-11')).toBeUndefined()
  })

  it('возвращает undefined для дня вне 1-31', () => {
    expect(parseDateString('2026-04-00')).toBeUndefined()
    expect(parseDateString('2026-04-32')).toBeUndefined()
  })

  it('возвращает undefined для несуществующих дат (31 февраля)', () => {
    expect(parseDateString('2026-02-31')).toBeUndefined()
    expect(parseDateString('2026-04-31')).toBeUndefined() // апрель — 30 дней
  })

  it('корректно парсит 29 февраля високосного года', () => {
    const date = parseDateString('2024-02-29')
    expect(date?.getDate()).toBe(29)
  })
})

describe('formatDateToString', () => {
  it('форматирует Date в YYYY-MM-DD', () => {
    expect(formatDateToString(new Date(2026, 3, 11))).toBe('2026-04-11')
  })

  it('добавляет ведущие нули к месяцу и дню', () => {
    expect(formatDateToString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('возвращает пустую строку для null', () => {
    expect(formatDateToString(null)).toBe('')
  })

  it('возвращает пустую строку для undefined', () => {
    expect(formatDateToString(undefined)).toBe('')
  })

  it('parseDateString и formatDateToString — обратные функции', () => {
    const original = '2026-04-11'
    expect(formatDateToString(parseDateString(original))).toBe(original)
  })
})

describe('formatSmartDate', () => {
  beforeEach(() => {
    // Замораживаем "сейчас" на 2026-04-11 (суббота), 12:00 локального времени
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 11, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('возвращает прочерк для null', () => {
    expect(formatSmartDate(null)).toBe('—')
  })

  it('возвращает "сегодня" для текущей даты', () => {
    expect(formatSmartDate('2026-04-11T08:00:00')).toBe('сегодня')
  })

  it('возвращает "вчера" для вчерашней даты', () => {
    expect(formatSmartDate('2026-04-10T08:00:00')).toBe('вчера')
  })

  it('возвращает короткий день недели для дат в пределах недели', () => {
    // 2026-04-08 — среда
    expect(formatSmartDate('2026-04-08T08:00:00')).toBe('ср')
  })

  it('возвращает "дд ммм" для дат текущего года старше недели', () => {
    expect(formatSmartDate('2026-01-05T08:00:00')).toBe('5 янв')
  })

  it('возвращает "дд ммм гг" для дат прошлых лет', () => {
    expect(formatSmartDate('2024-03-15T08:00:00')).toBe('15 мар 24')
  })
})

describe('formatSmartDateTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 11, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('возвращает прочерк для null', () => {
    expect(formatSmartDateTime(null)).toBe('—')
  })

  it('возвращает "сегодня в HH:MM" для текущей даты', () => {
    const result = formatSmartDateTime('2026-04-11T14:30:00')
    expect(result).toMatch(/^сегодня в \d{2}:\d{2}$/)
  })

  it('возвращает "вчера в HH:MM" для вчерашней даты', () => {
    const result = formatSmartDateTime('2026-04-10T09:15:00')
    expect(result).toMatch(/^вчера в \d{2}:\d{2}$/)
  })

  it('возвращает день недели для дат в пределах недели', () => {
    // 2026-04-08 — среда
    const result = formatSmartDateTime('2026-04-08T18:00:00')
    expect(result).toMatch(/^ср в \d{2}:\d{2}$/)
  })

  it('содержит месяц для старых дат текущего года', () => {
    const result = formatSmartDateTime('2026-01-05T10:00:00')
    expect(result).toMatch(/^5 янв \d{2}:\d{2}$/)
  })

  it('содержит год для дат прошлых лет', () => {
    const result = formatSmartDateTime('2024-03-15T10:00:00')
    expect(result).toMatch(/^15 мар 24 \d{2}:\d{2}$/)
  })
})

describe('formatShortDate', () => {
  it('возвращает пустую строку для null', () => {
    expect(formatShortDate(null)).toBe('')
  })

  it('возвращает пустую строку для undefined', () => {
    expect(formatShortDate(undefined)).toBe('')
  })

  it('форматирует дату как "дд ммм"', () => {
    expect(formatShortDate('2026-04-11T00:00:00')).toBe('11 апр')
    expect(formatShortDate('2026-01-03T00:00:00')).toBe('3 янв')
  })
})
