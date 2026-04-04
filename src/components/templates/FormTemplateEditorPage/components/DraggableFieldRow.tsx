/**
 * Перетаскиваемая строка поля
 */

import { Button } from '@/components/ui/button'
import { NativeTableRow, NativeTableCell } from '@/components/ui/native-table'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import { DraggableFieldRowProps } from '../types'

export function DraggableFieldRow({
  field,
  index,
  isDragging,
  isOver,
  overPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onEdit,
  onRemove,
}: DraggableFieldRowProps) {
  const isDivider = field.field_definition.field_type === 'divider'

  const dragClassName = isDragging
    ? 'opacity-40 bg-blue-50'
    : isOver
      ? overPosition === 'top'
        ? 'bg-blue-100 border-t-2 border-t-blue-500'
        : 'bg-blue-100 border-b-2 border-b-blue-500'
      : 'hover:bg-muted/30'

  const dragHandlers = {
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => onDragStart(e, field.id),
    onDragOver: (e: React.DragEvent) => onDragOver(e, field.id),
    onDragLeave,
    onDrop: (e: React.DragEvent) => onDrop(e, field),
    onDragEnd,
  }

  if (isDivider) {
    return (
      <NativeTableRow className={`group transition-colors ${dragClassName}`} {...dragHandlers}>
        <NativeTableCell withDivider={false}>
          <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors inline-flex">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </NativeTableCell>
        <NativeTableCell withDivider={false} colSpan={2}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-400">{field.field_definition.name}</span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => onEdit(field)}
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => onRemove(field.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </NativeTableCell>
      </NativeTableRow>
    )
  }

  return (
    <NativeTableRow className={`group transition-colors ${dragClassName}`} {...dragHandlers}>
      <NativeTableCell>
        <div className="flex items-center justify-center">
          <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors inline-flex">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </NativeTableCell>
      <NativeTableCell>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {index !== undefined && <span className="text-muted-foreground">{index}.</span>}
            {field.field_definition.name}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onEdit(field)}>
              <Pencil className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onRemove(field.id)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </NativeTableCell>
      <NativeTableCell>{field.field_definition.description || '—'}</NativeTableCell>
    </NativeTableRow>
  )
}
