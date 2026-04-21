import { useEffect, useRef, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Вставляет переданный `quoteText` в редактор как blockquote и зовёт `onClearQuote`.
 * Срабатывает каждый раз, когда `quoteText` меняется на непустое значение.
 */
export function useQuoteInsertion(
  editorRef: RefObject<Editor | null>,
  quoteText: string | null | undefined,
  onClearQuote?: () => void,
) {
  const onClearRef = useRef(onClearQuote)
  useEffect(() => {
    onClearRef.current = onClearQuote
  }, [onClearQuote])

  useEffect(() => {
    const editor = editorRef.current
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
  }, [editorRef, quoteText])
}
