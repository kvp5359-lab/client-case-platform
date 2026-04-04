/**
 * Notion-style pill helpers — цвета, хеширование, компонент NotionPill.
 *
 * Используется в: KnowledgeTableView, KnowledgeQAView, KnowledgeBaseArticleEditorPage.
 */

import { safeCssColor } from '@/utils/isValidCssColor'

/** Палитра цветов для тегов и групп */
export const TAG_COLOR_PALETTE = [
  '#6B7280', // gray
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
]

/** Палитра Notion для групп (стабильный цвет по хешу имени) */
export const NOTION_COLORS = [
  { bg: '#F3E8FF', text: '#6B21A8' }, // purple
  { bg: '#DBEAFE', text: '#1E40AF' }, // blue
  { bg: '#D1FAE5', text: '#065F46' }, // green
  { bg: '#FEF3C7', text: '#92400E' }, // yellow
  { bg: '#FFE4E6', text: '#9F1239' }, // pink
  { bg: '#E0E7FF', text: '#3730A3' }, // indigo
  { bg: '#FFEDD5', text: '#9A3412' }, // orange
  { bg: '#F1F5F9', text: '#334155' }, // gray
]

/** Простой hash строки → неотрицательное число */
export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Превращает hex-цвет тега в пару bg/text для Notion-pill */
export function getTagColors(hex: string): { bg: string; text: string } {
  // Expand shorthand hex (#abc → #aabbcc)
  let h = hex
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  }
  const r = parseInt(h.slice(1, 3), 16)
  const g = parseInt(h.slice(3, 5), 16)
  const b = parseInt(h.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return NOTION_COLORS[0]
  }
  return {
    bg: `rgba(${r},${g},${b},0.15)`,
    text: hex,
  }
}

/** Цвет группы: если есть свой цвет — getTagColors, иначе — из палитры по хешу */
export function getGroupColor(name: string, color?: string | null): { bg: string; text: string } {
  if (color) return getTagColors(color)
  return NOTION_COLORS[hashString(name) % NOTION_COLORS.length]
}

/** Notion-style pill компонент */
export function NotionPill({ name, bg, text }: { name: string; bg: string; text: string }) {
  return (
    <span
      className="inline-block text-[11px] leading-[18px] px-1.5 rounded-sm truncate max-w-full font-medium"
      style={{ backgroundColor: safeCssColor(bg), color: safeCssColor(text) }}
    >
      {name}
    </span>
  )
}
