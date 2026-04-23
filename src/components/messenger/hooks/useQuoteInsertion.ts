import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Вставляет переданный `quoteText` в редактор как blockquote и зовёт `onClearQuote`.
 * Принимает сам `editor` (state, а не ref), чтобы при пересылке в чат, где редактор
 * только что смонтирован, эффект повторно срабатывал, когда editor инициализируется
 * (null → Editor). Иначе quoteText выставляется раньше, эффект видит editor=null и
 * молча уходит, а при появлении редактора больше не повторяется.
 */
export function useQuoteInsertion(
  editor: Editor | null,
  quoteText: string | null | undefined,
  onClearQuote?: () => void,
) {
  const onClearRef = useRef(onClearQuote)
  useEffect(() => {
    onClearRef.current = onClearQuote
  }, [onClearQuote])

  useEffect(() => {
    if (!editor || !quoteText) return
    const paragraphs = quoteText
      .split('\n')
      .filter((line, i, arr) => {
        if (line.trim() === '' && i > 0 && i < arr.length - 1) return false
        return true
      })
      .map((line) => {
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<p>${escaped || '<br>'}</p>`
      })
      .join('')
    editor.chain().focus().insertContent(`<blockquote>${paragraphs}</blockquote><p></p>`).run()
    onClearRef.current?.()
  }, [editor, quoteText])
}
