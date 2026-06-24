"use client"

import { useEffect, useState } from 'react'
import { toast, useSonner } from 'sonner'
import { X } from 'lucide-react'
import { groupedLines } from '@/hooks/messenger/useMessageToastPayload'

export function DismissAllToasts() {
  const { toasts } = useSonner()
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Отслеживаем позицию верхнего тоста чтобы разместить кнопку над ним.
  // Используем MutationObserver на toaster-контейнере (детектит add/remove
  // тостов и изменение transform/style при анимации стека) + ResizeObserver
  // на верхнем тосте (детектит изменение высоты при загрузке вложений).
  // Полагаться на setInterval не получается — между тиками кнопка успевает
  // «промигнуть» и не появиться, если тост попадает в стек слишком быстро.
  useEffect(() => {
    // toasts.length < 2 — рендер всё равно вернёт null, setPos в эффекте
    // тут не нужен (ESLint react-hooks/set-state-in-effect ругается).
    if (toasts.length < 2) return

    let rafId: number | null = null
    const scheduleUpdate = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const items = document.querySelectorAll('[data-sonner-toast]')
        if (!items.length) return
        let topEl: Element | null = null
        let minTop = Infinity
        items.forEach((el) => {
          const rect = el.getBoundingClientRect()
          if (rect.top < minTop) {
            minTop = rect.top
            topEl = el
          }
        })
        if (topEl && minTop < Infinity) {
          const rect = (topEl as Element).getBoundingClientRect()
          setPos({ top: minTop, right: window.innerWidth - rect.right })
        }
      })
    }

    scheduleUpdate()

    const toaster = document.querySelector('[data-sonner-toaster]')
    const mo = toaster
      ? new MutationObserver(scheduleUpdate)
      : null
    mo?.observe(toaster as Node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'data-mounted', 'data-removed'],
    })

    window.addEventListener('resize', scheduleUpdate)
    // Подстраховка от пропуска (анимации/late-mount): несколько rAF подряд
    // первые ~200мс после изменения числа тостов.
    const pulse = setInterval(scheduleUpdate, 100)
    const stopPulse = setTimeout(() => clearInterval(pulse), 600)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      mo?.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      clearInterval(pulse)
      clearTimeout(stopPulse)
    }
  }, [toasts.length])

  if (toasts.length < 2 || pos === null) {
    return null
  }

  return (
    <button
      type="button"
      className="fixed z-[999] flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/90 backdrop-blur text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm border cursor-pointer"
      style={{ top: pos.top - 32, right: pos.right }}
      // pointerdown гасим: Radix DismissableLayer (открытые модалки) слушает
      // pointerdown раньше click → без этого «Скрыть все» закрывало диалог.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        groupedLines.clear()
        toast.dismiss()
      }}
    >
      <X className="w-3 h-3" />
      Скрыть все ({toasts.length})
    </button>
  )
}
