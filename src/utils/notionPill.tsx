/**
 * Notion-style pill helpers — цвета, хеширование, компонент NotionPill.
 *
 * Используется в: KnowledgeTableView, KnowledgeQAView, KnowledgeBaseArticleEditorPage.
 */

import { safeCssColor } from '@/utils/isValidCssColor'

import { TAG_PALETTE, NOTION_PILL_PAIRS } from '@/lib/palette'

/** @deprecated Импортируй TAG_PALETTE из @/lib/palette. */
export const TAG_COLOR_PALETTE = TAG_PALETTE

/** @deprecated Импортируй NOTION_PILL_PAIRS из @/lib/palette. */
export const NOTION_COLORS = NOTION_PILL_PAIRS

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
