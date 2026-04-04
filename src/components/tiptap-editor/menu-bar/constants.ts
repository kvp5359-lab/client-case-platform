/**
 * Константы для тулбара Tiptap редактора
 */

// Предустановленные цвета для палитры текста
export const TEXT_COLORS = [
  { name: 'По умолчанию', color: null },
  { name: 'Чёрный', color: '#000000' },
  { name: 'Серый', color: '#6B7280' },
  { name: 'Красный', color: '#DC2626' },
  { name: 'Оранжевый', color: '#EA580C' },
  { name: 'Жёлтый', color: '#CA8A04' },
  { name: 'Зелёный', color: '#16A34A' },
  { name: 'Бирюзовый', color: '#0D9488' },
  { name: 'Синий', color: '#2563EB' },
  { name: 'Фиолетовый', color: '#9333EA' },
  { name: 'Розовый', color: '#DB2777' },
]

// Бледные цвета для выделения (маркер)
export const HIGHLIGHT_COLORS = [
  { name: 'Убрать', color: null },
  { name: 'Жёлтый', color: '#FEF08A' },
  { name: 'Зелёный', color: '#BBF7D0' },
  { name: 'Голубой', color: '#BAE6FD' },
  { name: 'Розовый', color: '#FBCFE8' },
  { name: 'Оранжевый', color: '#FED7AA' },
  { name: 'Фиолетовый', color: '#DDD6FE' },
  { name: 'Серый', color: '#E5E7EB' },
  { name: 'Красный', color: '#FECACA' },
  { name: 'Бирюзовый', color: '#A5F3FC' },
]

// Светлые цвета фона для инлайн-кода
export const CODE_BG_COLORS = [
  { name: 'Без фона', color: null },
  { name: 'Серый', color: '#F3F4F6' },
  { name: 'Красный', color: '#FEE2E2' },
  { name: 'Оранжевый', color: '#FFEDD5' },
  { name: 'Жёлтый', color: '#FEF9C3' },
  { name: 'Зелёный', color: '#DCFCE7' },
  { name: 'Голубой', color: '#DBEAFE' },
  { name: 'Фиолетовый', color: '#EDE9FE' },
  { name: 'Розовый', color: '#FCE7F3' },
]

// Яркие цвета текста для инлайн-кода
export const CODE_TEXT_COLORS = [
  { name: 'По умолчанию', color: null },
  { name: 'Красный', color: '#DC2626' },
  { name: 'Оранжевый', color: '#EA580C' },
  { name: 'Жёлтый', color: '#CA8A04' },
  { name: 'Зелёный', color: '#16A34A' },
  { name: 'Синий', color: '#2563EB' },
  { name: 'Фиолетовый', color: '#9333EA' },
  { name: 'Розовый', color: '#DB2777' },
  { name: 'Бирюзовый', color: '#0D9488' },
]

// Тип цвета
export interface ColorItem {
  name: string
  color: string | null
}
