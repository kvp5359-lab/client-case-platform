"use client"

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CardFieldId } from './types'
import { getFieldLabel } from './listSettingsConfigs'

interface DraggableLayoutFieldProps {
  fieldId: CardFieldId
  rowId: string
  isActive?: boolean
  onClick?: () => void
  onRemove?: () => void
}

export function DraggableLayoutField({
  fieldId,
  rowId,
  isActive,
  onClick,
  onRemove,
}: DraggableLayoutFieldProps) {
  const sortableId = `${rowId}::${fieldId}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: { fieldId, rowId },
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-md border text-xs cursor-pointer select-none transition-colors',
        isActive
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-foreground hover:border-primary/50',
        isDragging && 'shadow-lg',
      )}
      onClick={onClick}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-3 w-3" />
      </span>
      <span className="whitespace-nowrap">{getFieldLabel(fieldId)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
