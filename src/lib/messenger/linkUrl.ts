/**
 * Чистые хелперы для работы со ссылками в композере мессенджера.
 * Вынесены из UI-компонента, чтобы покрыть тестами (логика подсчёта сегментов
 * уже однажды была неверной — считала уникальные href вместо сегментов).
 */

import type { Node as ProseMirrorNode, MarkType } from '@tiptap/pm/model'

/** Разрешённые схемы ссылок. Прочее (в т.ч. `javascript:`) трактуется как адрес
 *  без схемы и получает `https://` — так `javascript:alert(1)` превращается в
 *  безобидный сломанный URL, а не исполняемую ссылку. */
const SAFE_SCHEME = /^(?:https?|mailto|tel):/i

/**
 * Приводит введённый пользователем URL к пригодному виду:
 * - пусто/пробелы → пустая строка (сигнал «снять ссылку»);
 * - валидная схема (http/https/mailto/tel) → как есть;
 * - иначе (`site.ru`, `www.x`, `javascript:…`) → префикс `https://`.
 */
export function normalizeHref(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return SAFE_SCHEME.test(v) ? v : `https://${v}`
}

/**
 * Считает ОТДЕЛЬНЫЕ сегменты ссылок в диапазоне [from, to] документа.
 * Каждый визуально-отдельный кусок = одна ссылка, даже если URL совпадает.
 * Новый сегмент начинается на переходе «нет ссылки → есть ссылка» ИЛИ при
 * смене href у соседних сегментов (две разные ссылки подряд без текста между).
 */
export function countLinkSegments(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  linkType: MarkType,
): number {
  let segments = 0
  let prevHref: string | null = null
  doc.nodesBetween(from, to, (node) => {
    const mark = node.isText ? node.marks.find((m) => m.type === linkType) : undefined
    const href = (mark?.attrs.href as string | undefined) ?? null
    if (href !== null && href !== prevHref) segments++
    prevHref = href
  })
  return segments
}
