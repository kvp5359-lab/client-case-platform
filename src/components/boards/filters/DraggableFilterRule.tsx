"use client"

/**
 * Обёртка вокруг правила фильтра, добавляющая drag-handle и drop-target
 * через dnd-kit. Показывает горизонтальную линию drop-индикатора сверху
 * или снизу в зависимости от позиции курсора.
 *
 * Вынесено из FilterGroupEditor.tsx, чтобы главный компонент не превышал
 * 400 строк (аудит 2026-04-11, Зона 6).
 */

import type { ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RulePath } from './filterPathUtils'

export interface DropIndicatorState {
  /** Path элемента, рядом с которым показать линию */
  targetPath: RulePath
  /** Позиция линии */
  position: 'top' | 'bottom'
}

interface DraggableFilterRuleProps {
  dndId: string
  children: ReactNode
  dropIndicator: DropIndicatorState | null
  rulePath: RulePath
}

export function DraggableFilterRule({
  dndId,
  children,
  dropIndicator,
  rulePath,
}: DraggableFilterRuleProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: dndId })
  const { setNodeRef: setDropRef } = useDroppable({ id: dndId })

  const showTop =
    dropIndicator &&
    dropIndicator.position === 'top' &&
    dropIndicator.targetPath.join('-') === rulePath.join('-')
  const showBottom =
    dropIndicator &&
    dropIndicator.position === 'bottom' &&
    dropIndicator.targetPath.join('-') === rulePath.join('-')

  return (
    <div
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      className={cn(
        'relative flex items-center gap-1 border rounded-md px-2 py-1.5 bg-background',
        isDragging && 'opacity-30',
      )}
    >
      {showTop && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {showBottom && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/50 hover:text-muted-foreground shrink-0 touch-none"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
