/**
 * Единый реестр цветовых палитр.
 *
 * Раньше эти массивы были разбросаны:
 *   - components/ui/color-picker.tsx → PRESET_COLORS (24 цвета)
 *   - components/templates/SelectOptionItem.tsx → PRESET_COLORS (8 цветов)
 *   - utils/notionPill.tsx → TAG_COLOR_PALETTE (9 цветов) + NOTION_COLORS
 *
 * Не схлопываем в один массив — палитры реально разные по UX
 * (radial picker vs select options vs tag pills). Но один источник правды.
 */

/** Полная радужная палитра — ColorPicker (общий универсальный пикер). */
export const FULL_PALETTE = [
  // Ряд 1 — яркие
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E',
  '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1',
  // Ряд 2 — глубокие / пастельные / нейтральные
  '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#FB923C',
  '#1E3A5F', '#1F2937', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB',
] as const

/** Компактная палитра для select-опций (поля типа «выпадающий список»). */
export const SELECT_OPTION_PALETTE = [
  '#6B7280', // Серый
  '#EF4444', // Красный
  '#F59E0B', // Оранжевый
  '#10B981', // Зелёный
  '#3B82F6', // Синий
  '#8B5CF6', // Фиолетовый
  '#EC4899', // Розовый
  '#14B8A6', // Бирюзовый
] as const

/** Палитра для тегов / pill'ов в стиле Notion. */
export const TAG_PALETTE = [
  '#6B7280', // gray
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
] as const

/** Пары (фон, текст) Notion-стиля — для пилюль с тёмным текстом на светлом фоне. */
export const NOTION_PILL_PAIRS = [
  { bg: '#F3E8FF', text: '#6B21A8' }, // purple
  { bg: '#DBEAFE', text: '#1E40AF' }, // blue
  { bg: '#D1FAE5', text: '#065F46' }, // green
  { bg: '#FEF3C7', text: '#92400E' }, // yellow
  { bg: '#FFE4E6', text: '#9F1239' }, // pink
  { bg: '#E0E7FF', text: '#3730A3' }, // indigo
  { bg: '#FFEDD5', text: '#9A3412' }, // orange
  { bg: '#F1F5F9', text: '#334155' }, // gray
] as const
