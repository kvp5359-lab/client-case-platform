"use client"

import { useEffect, useState } from 'react'
import { toast, useSonner } from 'sonner'
import { X } from 'lucide-react'
import { groupedLines } from '@/lib/messenger/toastRegistry'

// Показываем «Скрыть все», когда уведомлений больше двух.
const MIN_TOASTS = 3

export function DismissAllToasts() {
  const { toasts } = useSonner()
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Держим кнопку над верхним тостом. Позицию пересчитываем на любое изменение
  // стека: MutationObserver (add/remove тостов, transform-анимация стекинга) +
  // ResizeObserver на контейнере тостера (изменение высоты — загрузка картинок
  // во вложениях, рост стека). Именно ResizeObserver раньше не хватало: высота
  // менялась ПОСЛЕ первого замера, и кнопка «отставала» или не появлялась.
  useEffect(() => {
    if (toasts.length < MIN_TOASTS) return

    let rafId: number | null = null
    const recompute = () => {
      const items = document.querySelectorAll('[data-sonner-toast]')
      // DOM ещё не отрисовал тосты — не обнуляем pos (иначе кнопка мигает),
      // ждём следующего тика наблюдателей.
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
    }
    const schedule = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        recompute()
      })
    }

    schedule()

    const toaster = document.querySelector('[data-sonner-toaster]')
    const mo = toaster ? new MutationObserver(schedule) : null
    mo?.observe(toaster as Node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'data-mounted', 'data-removed', 'data-expanded'],
    })
    const ro = toaster ? new ResizeObserver(schedule) : null
    if (toaster) ro?.observe(toaster)

    window.addEventListener('resize', schedule)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      mo?.disconnect()
      ro?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [toasts.length])

  if (toasts.length < MIN_TOASTS || pos === null) {
    return null
  }

  return (
    <button
      type="button"
      className="fixed flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/90 backdrop-blur text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm border cursor-pointer"
      style={{
        top: pos.top - 36,
        right: pos.right,
        // z-index уровня тостера sonner (999999), иначе кнопка уходит под оверлеи.
        zIndex: 1_000_000,
        // pointer-events:auto — Radix-модалка ставит body{pointer-events:none},
        // и кнопка ВНЕ тостера переставала кликаться (крестик тоста внутри тостера
        // спасался CSS-оверрайдом, а «Скрыть все» — нет). Возвращаем клики себе.
        pointerEvents: 'auto',
      }}
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
