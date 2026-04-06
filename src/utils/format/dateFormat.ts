/**
 * Утилиты для работы с датами: парсинг, форматирование, «умные» даты.
 * Используют локальную таймзону (без UTC конвертации).
 */

const MONTHS_SHORT_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
]

const DAYS_SHORT_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/**
 * Конвертирует строку даты YYYY-MM-DD в объект Date (локальная таймзона)
 */
export function parseDateString(dateStr: string): Date | undefined {
  if (!dateStr) return undefined
  const parts = dateStr.split('-')
  if (parts.length !== 3) return undefined
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return undefined
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const date = new Date(y, m - 1, d)
  // Проверяем, что дата не «переполнилась» (например, 31 февраля → 3 марта)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return undefined
  }
  return date
}

/**
 * Конвертирует объект Date в строку YYYY-MM-DD (локальная таймзона)
 */
export function formatDateToString(date: Date | null | undefined): string {
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * «Умная» дата: сегодня / вчера / день недели / дд ммм [гг]
 */
export function formatSmartDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000)

  if (diffDays === 0) return 'сегодня'
  if (diffDays === 1) return 'вчера'
  if (diffDays < 7) {
    return DAYS_SHORT_RU[date.getDay()]
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getDate()} ${MONTHS_SHORT_RU[date.getMonth()]}`
  }
  return `${date.getDate()} ${MONTHS_SHORT_RU[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`
}

/**
 * «Умная» дата с временем: сегодня в 14:30 / вчера в 09:15 / пн в 18:00 / 5 мар 14:30
 */
export function formatSmartDateTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000)

  if (diffDays === 0) return `сегодня в ${time}`
  if (diffDays === 1) return `вчера в ${time}`
  if (diffDays < 7) {
    return `${DAYS_SHORT_RU[date.getDay()]} в ${time}`
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getDate()} ${MONTHS_SHORT_RU[date.getMonth()]} ${time}`
  }
  return `${date.getDate()} ${MONTHS_SHORT_RU[date.getMonth()]} ${String(date.getFullYear()).slice(2)} ${time}`
}

/**
 * Короткая дата: "15 мар", "3 янв"
 * Используется в строках документов (DocumentRow, TrashedDocumentRow и т.д.)
 */
export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return `${date.getDate()} ${MONTHS_SHORT_RU[date.getMonth()]}`
}
