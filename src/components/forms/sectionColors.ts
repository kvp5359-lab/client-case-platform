/**
 * Палитра светлых цветов для фона заголовка секции анкеты.
 * Все цвета — Tailwind 100-уровня (мягкие пастельные), текст всегда чёрный.
 * NULL header_color = первый цвет (light-gray).
 */

export const SECTION_HEADER_COLORS: string[] = [
  '#F3F4F6', // gray-100 (default)
  '#FEE2E2', // red-100
  '#FFEDD5', // orange-100
  '#FEF3C7', // amber-100
  '#FEF9C3', // yellow-100
  '#ECFCCB', // lime-100
  '#DCFCE7', // green-100
  '#D1FAE5', // emerald-100
  '#CCFBF1', // teal-100
  '#CFFAFE', // cyan-100
  '#E0F2FE', // sky-100
  '#DBEAFE', // blue-100
  '#E0E7FF', // indigo-100
  '#EDE9FE', // violet-100
  '#F3E8FF', // purple-100
  '#FCE7F3', // pink-100
]

export const DEFAULT_SECTION_HEADER_COLOR = SECTION_HEADER_COLORS[0]

/**
 * Добавляет alpha-канал к HEX-цвету.
 * Возвращает 8-значный HEX (#RRGGBBAA).
 * Принимает значения alpha от 0 до 1.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '')
  if (cleaned.length !== 6) return hex
  const a = Math.max(0, Math.min(1, alpha))
  const aHex = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${cleaned}${aHex}`
}
