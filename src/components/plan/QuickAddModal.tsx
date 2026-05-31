"use client"

/**
 * Быстрое добавление элементов плана.
 *
 * UI сверху вниз:
 *   1. Селектор типа (переключатель ОДНОГО типа): Задача / Заголовок / Текст.
 *   2. Поле ввода. Для «Текст» — многострочное (textarea): Enter добавляет в
 *      список, Shift+Enter — перенос строки. Для остальных — однострочный input.
 *   3. Нижний список «к добавлению» — тег типа (кликабельный, можно сменить тип),
 *      DnD-перетаскивание порядка, удаление. По «Добавить» родитель создаёт все
 *      по очереди, вставляя в точку, где нажали «+».
 *
 * Тело вынесено в QuickAddBody внутри DialogContent (Radix размонтирует при
 * закрытии) → состояние сбрасывается при каждом открытии без useEffect-резета.
 */

import { useRef, useState, type KeyboardEvent } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CheckSquare,
  Heading,
  Type as TypeIcon,
  GripVertical,
  X,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export type QuickAddType = 'task' | 'heading' | 'text'
export type QuickAddItem = { type: QuickAddType; value: string }

const TYPES: { type: QuickAddType; label: string; icon: typeof CheckSquare }[] = [
  { type: 'task', label: 'Задача', icon: CheckSquare },
  { type: 'heading', label: 'Заголовок', icon: Heading },
  { type: 'text', label: 'Текст', icon: TypeIcon },
]

type StagedItem = { uid: number; type: QuickAddType; value: string }

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (items: QuickAddItem[]) => Promise<void> | void
  isPending?: boolean
}

export function QuickAddModal({ open, onClose, onSubmit, isPending }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Быстрое добавление</DialogTitle>
        </DialogHeader>
        <QuickAddBody onSubmit={onSubmit} onClose={onClose} isPending={isPending} />
      </DialogContent>
    </Dialog>
  )
}

function QuickAddBody({
  onSubmit,
  onClose,
  isPending,
}: {
  onSubmit: (items: QuickAddItem[]) => Promise<void> | void
  onClose: () => void
  isPending?: boolean
}) {
  const [activeType, setActiveType] = useState<QuickAddType>('task')
  const [value, setValue] = useState('')
  const [staged, setStaged] = useState<StagedItem[]>([])
  const uidRef = useRef(0)
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const isText = activeType === 'text'
  const placeholder = isText
    ? 'Текст… (Shift+Enter — новая строка)'
    : activeType === 'heading'
      ? 'Текст заголовка…'
      : 'Название задачи…'

  const commit = () => {
    const v = value.trim()
    if (!v) return
    setStaged((prev) => [...prev, { uid: uidRef.current++, type: activeType, value: v }])
    setValue('')
    fieldRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Enter добавляет в список. Для textarea Shift+Enter оставляем под перенос.
    if (e.key === 'Enter' && !(isText && e.shiftKey)) {
      e.preventDefault()
      commit()
    }
  }

  const removeStaged = (uid: number) => setStaged((prev) => prev.filter((s) => s.uid !== uid))
  const changeType = (uid: number, type: QuickAddType) =>
    setStaged((prev) => prev.map((s) => (s.uid === uid ? { ...s, type } : s)))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setStaged((prev) => {
      const oldIndex = prev.findIndex((s) => s.uid === active.id)
      const newIndex = prev.findIndex((s) => s.uid === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const handleSubmit = async () => {
    const tail = value.trim()
    const items: QuickAddItem[] = [
      ...staged.map((s) => ({ type: s.type, value: s.value })),
      ...(tail ? [{ type: activeType, value: tail }] : []),
    ]
    if (!items.length) {
      onClose()
      return
    }
    await onSubmit(items)
    onClose()
  }

  const total = staged.length + (value.trim() ? 1 : 0)

  const fieldClass =
    'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring'

  return (
    <>
      {/* 1. Селектор типа */}
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setActiveType(type)
              fieldRef.current?.focus()
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              activeType === type
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* 2. Поле ввода */}
      {isText ? (
        <textarea
          ref={(el) => {
            fieldRef.current = el
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={3}
          placeholder={placeholder}
          className={cn(fieldClass, 'resize-y')}
        />
      ) : (
        <input
          ref={(el) => {
            fieldRef.current = el
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder={placeholder}
          className={fieldClass}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Enter — добавить в список ниже{isText ? ', Shift+Enter — перенос строки' : ''}. Срок и
        исполнителей можно указать позже.
      </p>

      {/* 3. Список к добавлению */}
      {staged.length > 0 && (
        <div className="-mx-1 max-h-64 space-y-1 overflow-y-auto px-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={staged.map((s) => s.uid)} strategy={verticalListSortingStrategy}>
              {staged.map((s) => (
                <StagedRow
                  key={s.uid}
                  item={s}
                  onRemove={() => removeStaged(s.uid)}
                  onChangeType={(t) => changeType(s.uid, t)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} disabled={isPending || total === 0}>
          {isPending ? 'Добавляю…' : total > 1 ? `Добавить (${total})` : 'Добавить'}
        </Button>
      </div>
    </>
  )
}

function StagedRow({
  item,
  onRemove,
  onChangeType,
}: {
  item: StagedItem
  onRemove: () => void
  onChangeType: (type: QuickAddType) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.uid,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const meta = TYPES.find((t) => t.type === item.type)!
  const Icon = meta.icon
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm',
        isDragging && 'opacity-60',
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Перетащить"
      >
        <GripVertical className="size-4" />
      </button>

      {/* Тег типа — кликабельный, меняет тип элемента */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <Icon className="size-3" />
            {meta.label}
            <ChevronDown className="size-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[8rem]">
          {TYPES.map((t) => {
            const ItemIcon = t.icon
            return (
              <DropdownMenuItem key={t.type} onClick={() => onChangeType(t.type)}>
                <ItemIcon className="mr-2 size-3.5" />
                {t.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="min-w-0 flex-1 truncate">{item.value}</span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
        aria-label="Убрать"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
