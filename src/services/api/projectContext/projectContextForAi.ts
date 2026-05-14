/**
 * Преобразование записей «Контекста проекта» в формат для AI.
 *
 * Текст:
 *   - для item_type='text' → content_html → strip HTML
 *   - для file / screenshot → extracted_text (если есть)
 */

import type { ProjectContextItemForAi } from '@/services/api/messenger/messengerAiService'
import type { ProjectContextItemWithFile } from './projectContextService'

const HTML_TAG_RE = /<\/?[^>]+>/g
const HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

export function htmlToPlainTextForAi(html: string | null | undefined): string {
  if (!html) return ''
  const noTags = html.replace(HTML_TAG_RE, ' ')
  const decoded = noTags.replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITY_MAP[entity] ?? entity)
  return decoded.replace(/\s+/g, ' ').trim()
}

export function projectContextItemToAi(item: ProjectContextItemWithFile): ProjectContextItemForAi {
  let text: string | null = null
  if (item.item_type === 'text') {
    text = htmlToPlainTextForAi(item.content_html)
  } else {
    text = item.extracted_text ?? null
  }
  return {
    id: item.id,
    name: item.name,
    itemType: item.item_type as 'text' | 'file' | 'screenshot',
    text: text && text.length > 0 ? text : null,
  }
}

export function projectContextItemsToAi(
  items: ProjectContextItemWithFile[] | undefined,
): ProjectContextItemForAi[] {
  if (!items) return []
  return items.map(projectContextItemToAi).filter((i) => !!i.text)
}
