"use client"

/**
 * Строка с полями (droppable) в редакторе Card Layout.
 */

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CardFieldId } from '../types'
import { DraggableLayoutField } from '../DraggableLayoutField'

export function LayoutRow({
  rowId,
  rowIndex,
  totalRows,
  fieldIds,
  activeFieldId,
  onFieldClick,
  onRemoveRow,
  onRemoveField,
}: {
  rowId: string
  rowIndex: number
  totalRows: number
  fieldIds: CardFieldId[]
  activeFieldId: CardFieldId | null
  onFieldClick: (fieldId: CardFieldId) => void
  onRemoveRow: () => void
  onRemoveField: (fieldId: CardFieldId) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: rowId })
  const sortableIds = fieldIds.map((fid) => `${rowId}::${fid}`)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Строка {rowIndex + 1}</span>
        <div className="flex-1" />
        {totalRows > 1 && (
          <button
            type="button"
            onClick={onRemoveRow}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-wrap items-center gap-1.5 min-h-[36px] px-2 py-1.5 rounded-md border border-dashed transition-colors',
          isOver ? 'border-primary bg-primary/5' : 'border-border',
          fieldIds.length === 0 && 'justify-center',
        )}
      >
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {fieldIds.length === 0 && (
            <span className="text-[11px] text-muted-foreground/50">Перетащите поля сюда</span>
          )}
          {fieldIds.map((fid) => (
            <DraggableLayoutField
              key={fid}
              fieldId={fid}
              rowId={rowId}
              isActive={activeFieldId === fid}
              onClick={() => onFieldClick(fid)}
              onRemove={() => onRemoveField(fid)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
