"use client"

/**
 * Карточка нераспределённых документов (без папки)
 */

import { memo, useState, useRef, useLayoutEffect, useCallback } from 'react'
import { ChevronRight, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { DocumentItem } from './DocumentItem'
import type { DocumentWithFiles } from '@/components/documents/types'

export interface UngroupedCardProps {
  documents: DocumentWithFiles[]
}

export const UngroupedCard = memo(function UngroupedCard({ documents }: UngroupedCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  const updateBgPosition = useCallback(() => {
    const el = containerRef.current
    const bg = bgRef.current
    if (!el || !bg) return

    // Найти ближайший скроллируемый контейнер
    let scrollParent = el.parentElement
    while (scrollParent && scrollParent.scrollHeight <= scrollParent.clientHeight) {
      scrollParent = scrollParent.parentElement
    }
    if (!scrollParent) scrollParent = document.documentElement

    const elRect = el.getBoundingClientRect()
    const parentRect = scrollParent.getBoundingClientRect()

    bg.style.left = `${parentRect.left - elRect.left}px`
    bg.style.width = `${scrollParent.clientWidth}px`
  }, [])

  useLayoutEffect(() => {
    updateBgPosition()
    window.addEventListener('resize', updateBgPosition)
    return () => window.removeEventListener('resize', updateBgPosition)
  }, [updateBgPosition])

  if (documents.length === 0) return null

  return (
    <div ref={containerRef} className="relative py-2">
      {/* Фоновая полоска на всю ширину скроллируемого контейнера */}
      <div ref={bgRef} className="absolute inset-y-0 bg-amber-50/80" />
      {/* Контент поверх фона */}
      <div className="relative">
        <div className="flex items-center gap-3 pl-1 pr-3 pt-0.5 pb-1">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 group shrink-0"
          >
            <Inbox className="w-5 h-5 shrink-0 text-amber-500" />
            <h3 className="text-xl font-bold text-foreground uppercase tracking-wide text-left">
              Без папки
            </h3>
            <ChevronRight
              className={cn(
                'h-4 w-4 text-amber-400 transition-transform',
                !collapsed && 'rotate-90',
              )}
            />
          </button>
          <Badge
            variant="outline"
            className="shrink-0 ml-auto border-amber-300 text-amber-600 bg-amber-50"
          >
            {documents.length}
          </Badge>
        </div>
        {!collapsed && (
          <div className="-mt-1 pr-2 pb-2">
            <table className="w-full border-collapse">
              <tbody>
                {documents.map((doc) => (
                  <DocumentItem key={doc.id} document={doc} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
})
