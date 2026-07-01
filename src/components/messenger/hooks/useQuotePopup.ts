import { useRef, useEffect, useCallback } from 'react'

/**
 * Popup «Цитировать» по выделению текста внутри баббла, вынесен из MessageBubble.
 *
 * Реализован императивно (DOM), чтобы не вызывать re-render баббла и не терять
 * браузерное выделение текста. Возвращает `contentRef` — его нужно повесить на
 * div с контентом сообщения; popup создаётся внутри этого контейнера.
 */
export function useQuotePopup(onQuote: ((text: string) => void) | undefined) {
  const contentRef = useRef<HTMLDivElement>(null)
  const quotePopupRef = useRef<HTMLDivElement | null>(null)
  const quoteTextRef = useRef<string>('')

  const destroyQuotePopup = useCallback(() => {
    if (quotePopupRef.current) {
      quotePopupRef.current.remove()
      quotePopupRef.current = null
      quoteTextRef.current = ''
    }
  }, [])

  // Показ/скрытие popup'а «Цитировать» по выделению текста.
  // Слушаем mouseup на document'е, а не на самом баббле — иначе если юзер
  // протянул выделение за границы баббла, mouseup случается вне нашего div'а
  // и кнопка просто не появляется. По document — ловим всегда.
  useEffect(() => {
    if (!onQuote) return
    const showOrHide = (e: MouseEvent) => {
      // Клик по самому popup'у — не пересчитываем выделение.
      if ((e.target as HTMLElement | null)?.closest?.('[data-quote-popup]')) return
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        destroyQuotePopup()
        return
      }
      const container = contentRef.current
      if (!container) return
      const range = selection.getRangeAt(0)
      // Показываем popup только если выделение пересекается с нашим баблом —
      // не открываем своё для выделений в других сообщениях.
      if (!container.contains(range.commonAncestorContainer)) {
        destroyQuotePopup()
        return
      }
      const text = selection.toString().trim()
      quoteTextRef.current = text
      const rect = range.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const x = rect.left + rect.width / 2 - containerRect.left
      const y = rect.top - containerRect.top - 4

      // Удаляем старый popup если есть
      destroyQuotePopup()

      // Создаём popup императивно — без setState, без re-render
      const popup = document.createElement('div')
      popup.setAttribute('data-quote-popup', '')
      popup.className = 'absolute z-20 -translate-x-1/2 -translate-y-full'
      popup.style.left = `${x}px`
      popup.style.top = `${y}px`
      popup.innerHTML = `<div class="flex items-center bg-popover text-popover-foreground border shadow-md rounded-lg overflow-hidden text-xs font-medium">
        <button type="button" data-act="quote" class="flex items-center gap-1.5 px-3 py-1.5 hover:bg-accent transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
          Цитировать
        </button>
        <span class="w-px self-stretch bg-border"></span>
        <button type="button" data-act="copy" class="flex items-center gap-1.5 px-3 py-1.5 hover:bg-accent transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Копировать
        </button>
      </div>`

      popup.addEventListener('mousedown', (evt) => {
        evt.preventDefault()
        evt.stopPropagation()
      })
      popup.querySelector('[data-act="quote"]')!.addEventListener('click', () => {
        onQuote!(quoteTextRef.current)
        window.getSelection()?.removeAllRanges()
        destroyQuotePopup()
      })
      popup.querySelector('[data-act="copy"]')!.addEventListener('click', () => {
        navigator.clipboard?.writeText(quoteTextRef.current).catch(() => {})
        window.getSelection()?.removeAllRanges()
        destroyQuotePopup()
      })

      container.appendChild(popup)
      quotePopupRef.current = popup
    }
    document.addEventListener('mouseup', showOrHide)
    return () => document.removeEventListener('mouseup', showOrHide)
  }, [onQuote, destroyQuotePopup])

  // Скрываем popup при клике (mousedown) вне бабла. mouseup для popup-показа
  // уже на document'е выше, mousedown отдельно — для срабатывания при клике
  // вне выделения (тогда выделение схлопывается, и mouseup-обработчик уберёт
  // popup).
  useEffect(() => {
    const hide = (e: MouseEvent) => {
      if (!quotePopupRef.current) return
      if (contentRef.current?.contains(e.target as Node)) return
      destroyQuotePopup()
    }
    document.addEventListener('mousedown', hide)
    return () => document.removeEventListener('mousedown', hide)
  }, [destroyQuotePopup])

  // Cleanup при unmount
  useEffect(() => destroyQuotePopup, [destroyQuotePopup])

  return { contentRef }
}
