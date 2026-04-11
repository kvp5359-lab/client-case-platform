"use client"

import { useEffect, useState } from 'react'
import { toast, useSonner } from 'sonner'
import { X } from 'lucide-react'
import { groupedLines } from '@/hooks/messenger/useMessageToastPayload'

export function DismissAllToasts() {
  const { toasts } = useSonner()
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Отслеживаем позицию верхнего тоста чтобы разместить кнопку над ним.
  // Ранний выход при недостаточном числе тостов — без setState в эффекте:
  // рендер и так вернёт null, а при следующем эффекте pos переписался бы заново.
  useEffect(() => {
    if (toasts.length < 2) return
    const update = () => {
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
    }
    update()
    const id = setInterval(update, 300)
    return () => clearInterval(id)
  }, [toasts.length])

  if (toasts.length < 2 || pos === null) {
    return null
  }

  return (
    <button
      type="button"
      className="fixed z-[999] flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/90 backdrop-blur text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm border cursor-pointer"
      style={{ top: pos.top - 32, right: pos.right }}
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
