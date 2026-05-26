import { useEffect, useRef, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Вставляет переданный `quoteText` в редактор как blockquote и зовёт `onClearQuote`.
 *
 * Зависит от `nonce` — счётчика, который растёт на каждый setQuoteText в
 * useMessengerState. Это позволяет триггерить вставку, даже когда юзер
 * цитирует ровно тот же текст подряд: значение строки не меняется, но nonce
 * новый → useEffect срабатывает.
 *
 * Позиция вставки:
 *  - Если редактор хоть раз был сфокусирован в этом треде
 *    (`wasFocusedRef.current === true`) — вставляем в последнюю позицию
 *    курсора. `editor.commands.focus()` без аргументов восстанавливает
 *    сохранённую в Tiptap selection.
 *  - Иначе — `focus('end')` и вставка в конец документа.
 *
 * Проверять `editor.isFocused` напрямую нельзя: выделение текста в баббле
 * уводит DOM Selection из редактора, isFocused становится false ещё до
 * клика «Цитировать». wasFocusedRef — стабильный сигнал «был ли фокус».
 */
export function useQuoteInsertion(
  editor: Editor | null,
  quoteText: string | null | undefined,
  nonce: number | undefined,
  wasFocusedRef: RefObject<boolean>,
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
    const content = `<blockquote>${paragraphs}</blockquote><p></p>`
    if (wasFocusedRef.current) {
      editor.chain().focus().insertContent(content).run()
    } else {
      editor.chain().focus('end').insertContent(content).run()
    }
    onClearRef.current?.()
  }, [editor, quoteText, nonce, wasFocusedRef])
}
