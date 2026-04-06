"use client"

import { useRef, useEffect, useLayoutEffect } from 'react'

/**
 * FLIP-анимация для списка проектов.
 * Запоминает позиции элементов перед рендером,
 * после рендера вычисляет сдвиг и анимирует через transform.
 */
export function useFlipAnimation(
  containerRef: React.RefObject<HTMLElement | null>,
  deps: unknown[],
) {
  const positionsRef = useRef<Map<string, number>>(new Map())

  // Перед рендером — запомнить позиции (First)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const items = container.querySelectorAll<HTMLElement>('[data-project-id]')
    items.forEach((el) => {
      const id = el.dataset.projectId!
      positionsRef.current.set(id, el.getBoundingClientRect().top)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, containerRef])

  // После рендера — вычислить сдвиг и анимировать (Last, Invert, Play)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const prev = positionsRef.current
    if (prev.size === 0) return

    const items = container.querySelectorAll<HTMLElement>('[data-project-id]')
    items.forEach((el) => {
      const id = el.dataset.projectId!
      const oldTop = prev.get(id)
      if (oldTop === undefined) return
      const newTop = el.getBoundingClientRect().top
      const delta = oldTop - newTop
      if (Math.abs(delta) < 1) return

      el.style.transform = `translateY(${delta}px)`
      el.style.transition = 'none'

      requestAnimationFrame(() => {
        el.style.transition = 'transform 300ms ease'
        el.style.transform = ''
        const cleanup = () => {
          el.style.transition = ''
          el.removeEventListener('transitionend', cleanup)
        }
        el.addEventListener('transitionend', cleanup)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, containerRef])
}
