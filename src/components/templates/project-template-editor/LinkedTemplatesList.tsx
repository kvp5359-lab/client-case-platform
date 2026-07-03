"use client"

import { type LucideIcon, GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'

type LinkedItem = {
  id: string
  name: string
}

type LinkedTemplatesListProps = {
  title: string
  count: number
  items: LinkedItem[]
  icon: LucideIcon
  onAdd: () => void
  onRemove: (id: string) => void
  isRemoving: boolean
  /**
   * Если передан — список можно перетаскивать. Получает новый порядок id связей.
   * Оптимистичное обновление делает мутация-обработчик (setQueryData в onMutate),
   * поэтому `items` тут же отражает новый порядок — локального стейта не держим.
   */
  onReorder?: (orderedIds: string[]) => void
}

/** Перетаскиваемая строка — используется когда задан onReorder. */
function SortableRow({
  item,
  icon: Icon,
  onRemove,
  isRemoving,
}: {
  item: LinkedItem
  icon: LucideIcon
  onRemove: (id: string) => void
  isRemoving: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between py-1 px-2 rounded group hover:bg-background/60 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-0.5 -m-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
          aria-label="Переупорядочить"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm truncate">{item.name}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 transition-all"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(item.id)
        }}
        disabled={isRemoving}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

export function LinkedTemplatesList({
  title: _title,
  count: _count,
  items,
  icon: Icon,
  onAdd,
  onRemove,
  isRemoving,
  onReorder,
}: LinkedTemplatesListProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(items, oldIndex, newIndex)
    onReorder?.(reordered.map((i) => i.id))
  }

  return (
    <div className="bg-muted/20 px-4 py-2.5 border-t">
      <div className="space-y-1">
        {onReorder ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  icon={Icon}
                  onRemove={onRemove}
                  isRemoving={isRemoving}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-1 px-2 rounded group hover:bg-background/60 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{item.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 transition-all"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(item.id)
                }}
                disabled={isRemoving}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
          className="h-7 text-xs text-muted-foreground"
        >
          <Plus className="w-3 h-3 mr-1" />
          Добавить
        </Button>
      </div>
    </div>
  )
}
