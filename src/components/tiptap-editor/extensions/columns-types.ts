/**
 * Типы и константы для Columns extension. Вынесены, чтобы
 * column-view не тянул сам extension и не образовывал цикл.
 */

export type ColumnCount = 2 | 3
export type BorderRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl'

export const COLUMN_BG_COLORS = [
  { name: 'Без фона', value: null },
  { name: 'Серый', value: '#F3F4F6' },
  { name: 'Голубой', value: '#EFF6FF' },
  { name: 'Зелёный', value: '#F0FDF4' },
  { name: 'Жёлтый', value: '#FEFCE8' },
  { name: 'Розовый', value: '#FDF2F8' },
  { name: 'Фиолетовый', value: '#FAF5FF' },
  { name: 'Оранжевый', value: '#FFF7ED' },
]
