"use client"

import { useCallback, useRef } from 'react'

/**
 * Панорамирование доски: зажатие ЛКМ на пустом месте + тяга мышью скроллит
 * ближайший скроллируемый родитель по X/Y. Игнорируем нажатия на интерактивных
 * элементах (кнопки, ссылки, инпуты, карточки задач).
 *
 * Реализован через callback ref, а не useEffect — потому что BoardView имеет
 * ранний return при пустом списке, и при первом монтировании ref.current был null.
 * useEffect([]) с пустыми deps не перезапускался при появлении div'а, и pan-drag
 * переставал работать. Callback ref срабатывает каждый раз при присваивании
 * DOM-ноды, так что handlers подвешиваются в нужный момент.
 */
export function usePanDrag<T extends HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null)

  return useCallback((el: T | null) => {
    // Отвязка предыдущих handlers — при размонтировании или смене ноды
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    if (!el) return

    const scroller = findScrollableParent(el)
    if (!scroller) return

    let startX = 0
    let startY = 0
    let startScrollLeft = 0
    let startScrollTop = 0
    let panning = false
    let armed = false

    const isInteractive = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false
      return !!target.closest(
        'button, a, input, textarea, select, [role="button"], [data-board-card], [contenteditable="true"]',
      )
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (isInteractive(e.target)) return
      armed = true
      startX = e.clientX
      startY = e.clientY
      startScrollLeft = scroller.scrollLeft
      startScrollTop = scroller.scrollTop
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!armed) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!panning) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        panning = true
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }
      scroller.scrollLeft = startScrollLeft - dx
      scroller.scrollTop = startScrollTop - dy
      e.preventDefault()
    }

    const onMouseUp = () => {
      armed = false
      if (panning) {
        panning = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    cleanupRef.current = () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])
}

function findScrollableParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement
  while (parent) {
    const style = getComputedStyle(parent)
    const overflowX = style.overflowX
    const overflowY = style.overflowY
    if (
      (overflowX === 'auto' || overflowX === 'scroll') &&
      parent.scrollWidth > parent.clientWidth
    ) {
      return parent
    }
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}
