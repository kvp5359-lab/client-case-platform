"use client"

/**
 * SortableTemplateRow — строка таблицы шаблонов с drag-ручкой.
 *
 * Используется в списках шаблонов проектов и наборов документов для
 * сортировки перетаскиванием. Сама перестановка/сохранение порядка — снаружи
 * (DndContext + handleReorder из useTemplateList).
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type SortableTemplateRowProps = {
  id: string
  /** Отключить перетаскивание (например, во время поиска) */
  disabled?: boolean
  /** Уплотнённая строка: меньше вертикальные отступы и ручка. Высота строки задаётся
   *  самым высоким элементом внутри, поэтому ручку тоже надо ужимать — иначе она
   *  удержит прежнюю высоту, сколько ни срезай padding. */
  compact?: boolean
  children: React.ReactNode
}

export function SortableTemplateRow({
  id,
  disabled,
  compact,
  children,
}: SortableTemplateRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  }

  return (
    <TableRow ref={setNodeRef} style={style} className="group">
      <TableCell className={cn('w-8 pr-0', compact && 'py-1')}>
        <button
          type="button"
          className={cn(
            'flex w-6 items-center justify-center text-muted-foreground/40 transition-opacity',
            compact ? 'h-6' : 'h-7',
            disabled
              ? 'cursor-not-allowed opacity-0'
              : 'cursor-grab md:opacity-0 md:group-hover:opacity-100 active:cursor-grabbing hover:text-muted-foreground',
          )}
          {...attributes}
          {...listeners}
          aria-label="Перетащить для сортировки"
          disabled={disabled}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  )
}
