"use client"

/**
 * Банк неразмещённых полей для редактора Card Layout в настройках списка доски.
 * Droppable + sortable.
 */

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import type { CardFieldId } from '../types'
import { DraggableLayoutField } from '../DraggableLayoutField'

export const BANK_ID = '__bank__'

export function FieldBank({
  unplacedIds,
  onAddToRow,
}: {
  unplacedIds: CardFieldId[]
  onAddToRow: (fieldId: CardFieldId) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BANK_ID })
  const sortableIds = unplacedIds.map((fid) => `${BANK_ID}::${fid}`)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-wrap items-center gap-1.5 min-h-[36px] px-2 py-1.5 rounded-md border border-dashed transition-colors',
        isOver ? 'border-primary bg-primary/5' : 'border-border/60 bg-muted/30',
      )}
    >
      {unplacedIds.length === 0 ? (
        <span className="text-[11px] text-muted-foreground/50">Все поля размещены</span>
      ) : (
        <>
          <span className="text-[11px] text-muted-foreground mr-1">Доступные:</span>
          <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
            {unplacedIds.map((fid) => (
              <DraggableLayoutField
                key={fid}
                fieldId={fid}
                rowId={BANK_ID}
                onClick={() => onAddToRow(fid)}
              />
            ))}
          </SortableContext>
        </>
      )}
    </div>
  )
}
