/**
 * Таблица статусов с drag & drop сортировкой
 */

import { Pencil, Trash2, GripVertical, Check, Flag } from 'lucide-react'
import { ColorDot } from '@/components/ui/color-dot'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Status } from './hooks/useStatusesDirectory'

// --- Сортируемая строка таблицы ---
function SortableStatusRow({
  status,
  onEdit,
  onDelete,
  isDeleting,
}: {
  status: Status
  onEdit: (s: Status) => void
  onDelete: (s: Status) => void
  isDeleting: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: status.id,
  })

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell>
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-gray-400" aria-hidden="true" />
        </button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <ColorDot color={status.color} />
          <span className="font-medium">{status.name}</span>
          {status.is_system && (
            <Badge variant="secondary" className="text-xs">
              Системный
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-gray-500 text-sm">{status.description || '—'}</TableCell>
      <TableCell className="text-gray-700 text-sm">{status.button_label || '—'}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          {status.is_default && (
            <Badge variant="outline" className="text-xs" title="По умолчанию">
              <Check className="h-3 w-3" />
            </Badge>
          )}
          {status.is_final && (
            <Badge variant="outline" className="text-xs" title="Финальный">
              <Flag className="h-3 w-3" />
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {!status.is_system && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(status)}
              aria-label="Редактировать"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {!status.is_system && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(status)}
              disabled={isDeleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              aria-label="Удалить"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

interface StatusesTableProps {
  statuses: Status[]
  onEdit: (status: Status) => void
  onDelete: (status: Status) => void
  onDragEnd: (event: DragEndEvent) => void
  isDeleting: boolean
}

export function StatusesTable({
  statuses,
  onEdit,
  onDelete,
  onDragEnd,
  isDeleting,
}: StatusesTableProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Описание</TableHead>
            <TableHead>Название кнопки</TableHead>
            <TableHead className="w-24">Флаги</TableHead>
            <TableHead className="w-20 text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <TableBody>
            {statuses.map((status) => (
              <SortableStatusRow
                key={status.id}
                status={status}
                onEdit={onEdit}
                onDelete={onDelete}
                isDeleting={isDeleting}
              />
            ))}
          </TableBody>
        </SortableContext>
      </Table>
    </DndContext>
  )
}
