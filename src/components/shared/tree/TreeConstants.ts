/**
 * Shared constants for tree layout (Knowledge Base + Quick Replies).
 *
 * INDENT = 20px per depth level
 * BASE_PAD = 12px left margin at depth 0
 * ICON_CENTER = 8px — center of 16px folder icon
 * ARTICLE_EXTRA = 6px — extra left padding for leaf items vs folders
 */

export const INDENT = 20
export const BASE_PAD = 12
export const ICON_CENTER = 8
export const ARTICLE_EXTRA = 6

export function getLineX(depth: number) {
  return BASE_PAD + (depth - 1) * INDENT + ICON_CENTER
}
