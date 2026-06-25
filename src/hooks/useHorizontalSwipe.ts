"use client"

import { useRef } from 'react'

type Opts = {
  onPrev: () => void
  onNext: () => void
  /** Минимальный сдвиг по X (px), чтобы считать жест свайпом. */
  threshold?: number
}

/**
 * Свайп влево/вправо одним пальцем → onNext/onPrev. Возвращает touch-обработчики
 * для контейнера. Жест засчитывается только если он явно горизонтальный
 * (|dx| > threshold и |dx| заметно больше |dy|).
 *
 * Защита: если жест начат внутри горизонтально-прокручиваемого элемента
 * (таблица, доска-пейджер, тулбар со скроллом) — НЕ перехватываем, чтобы не
 * ломать его собственную прокрутку.
 *
 * Только тач: на десктопе мышь touch-события не шлёт, поведение не меняется.
 */
export function useHorizontalSwipe({ onPrev, onNext, threshold = 60 }: Opts) {
  const start = useRef<{ x: number; y: number; guard: boolean } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      start.current = null
      return
    }
    const t = e.touches[0]
    // Идём от точки касания вверх до контейнера: есть ли по пути элемент с
    // реальной горизонтальной прокруткой — тогда жест отдаём ему.
    let el = e.target as HTMLElement | null
    let guard = false
    while (el && el !== e.currentTarget) {
      if (el.scrollWidth > el.clientWidth + 4) {
        const ox = getComputedStyle(el).overflowX
        if (ox === 'auto' || ox === 'scroll') {
          guard = true
          break
        }
      }
      el = el.parentElement
    }
    start.current = { x: t.clientX, y: t.clientY, guard }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const s = start.current
    start.current = null
    if (!s || s.guard) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    // Горизонтальный и достаточно длинный, не вертикальный скролл.
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.8) return
    if (dx < 0) onNext()
    else onPrev()
  }

  return { onTouchStart, onTouchEnd }
}
