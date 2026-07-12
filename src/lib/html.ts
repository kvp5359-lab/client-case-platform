/**
 * Экранирование текста для безопасной вставки в HTML.
 * Полный вариант (& < > " ') — надмножество, безопасен и в тексте, и в атрибутах.
 * Единая точка вместо разъехавшихся локальных копий.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
