/**
 * Перетаскиваемая строка поля
 */

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NativeTableRow, NativeTableCell } from '@/components/ui/native-table'
import {
  GripVertical,
  Pencil,
  Trash2,
  Columns2,
  Columns3,
  RectangleHorizontal,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react'
import { DraggableFieldRowProps } from '../types'
import type { FieldOptions, FieldWidth } from '@/types/formKit'

// Иконка ширины поля для индикатора в строке списка
const WIDTH_ICON: Record<FieldWidth, LucideIcon> = {
  '1/3': Columns3,
  '1/2': Columns2,
  full: RectangleHorizontal,
}
const WIDTH_TITLE: Record<FieldWidth, string> = {
  '1/3': 'Ширина: треть',
  '1/2': 'Ширина: половина',
  full: 'Ширина: вся строка',
}
// Поля, у которых раскладка не настраивается (всегда во всю ширину)
const LAYOUT_UNSUPPORTED = ['divider', 'composite', 'key-value-table']

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

  // Индикаторы раскладки (ширина + перенос) для обычных полей
  const supportsLayout = !LAYOUT_UNSUPPORTED.includes(field.field_definition.field_type)
  const layoutOpts = (field.options ?? {}) as FieldOptions
  const fieldWidth: FieldWidth = layoutOpts.width ?? '1/3'
  const WidthIcon = WIDTH_ICON[fieldWidth]

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
          <div className="flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors inline-flex">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </NativeTableCell>
        <NativeTableCell withDivider={false} colSpan={2}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-400">{field.field_definition.name}</span>
            <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
            {field.risk_assessment_enabled && (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-700 border-0 px-1.5 py-0 text-[11px] font-normal shrink-0"
              >
                риск
              </Badge>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            {/* Индикаторы раскладки — маленькие серые иконки */}
            {supportsLayout && (
              <span className="flex items-center gap-1 text-muted-foreground/40">
                {layoutOpts.newRow && (
                  <span title="С новой строки" className="inline-flex">
                    <CornerDownLeft className="w-3.5 h-3.5" />
                  </span>
                )}
                <span title={WIDTH_TITLE[fieldWidth]} className="inline-flex">
                  <WidthIcon className="w-3.5 h-3.5" />
                </span>
              </span>
            )}
            <div className="md:hidden md:group-hover:flex items-center gap-0.5">
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
        </div>
      </NativeTableCell>
      <NativeTableCell>
        <div className="truncate">{field.field_definition.description || '—'}</div>
      </NativeTableCell>
    </NativeTableRow>
  )
}
