"use client"

/**
 * Быстрое добавление элементов плана.
 *
 * UI сверху вниз:
 *   1. Селектор типа (переключатель ОДНОГО типа): Задача / Заголовок / Текст / Документ.
 *   2. Поле ввода. «Текст» — textarea (Enter добавляет, Shift+Enter — перенос),
 *      задача/заголовок — input, «Документ» — кнопка выбора слота (SlotPicker).
 *   3. Список «к добавлению» — тег типа (кликабельный, можно сменить тип для
 *      текстовых), DnD-порядок, удаление. По «Добавить» родитель создаёт все по
 *      очереди и вставляет в точку, где нажали «+».
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
  FolderOpen,
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
import { SlotPicker, type SlotOption } from './SlotPicker'

export type QuickAddType = 'task' | 'heading' | 'text' | 'document'
export type QuickAddItem =
  | { type: 'task' | 'heading' | 'text'; value: string }
  | { type: 'document'; value: string; slotId: string }

const TYPES: { type: QuickAddType; label: string; icon: typeof CheckSquare }[] = [
  { type: 'task', label: 'Задача', icon: CheckSquare },
  { type: 'heading', label: 'Заголовок', icon: Heading },
  { type: 'text', label: 'Текст', icon: TypeIcon },
  { type: 'document', label: 'Документ', icon: FolderOpen },
]
// В дропдауне смены типа у уже добавленной строки — только свободно-текстовые
// типы (документ требует выбора слота, его так не назначить).
const SWAPPABLE_TYPES = TYPES.filter((t) => t.type !== 'document')

type StagedItem = { uid: number; type: QuickAddType; value: string; slotId?: string }

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (items: QuickAddItem[]) => Promise<void> | void
  /** Свободные слоты документов (ещё не в плане) — для типа «Документ». */
  availableSlots: SlotOption[]
  isPending?: boolean
}

export function QuickAddModal({ open, onClose, onSubmit, availableSlots, isPending }: Props) {
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
        <QuickAddBody
          onSubmit={onSubmit}
          onClose={onClose}
          availableSlots={availableSlots}
          isPending={isPending}
        />
      </DialogContent>
    </Dialog>
  )
}

function QuickAddBody({
  onSubmit,
  onClose,
  availableSlots,
  isPending,
}: {
  onSubmit: (items: QuickAddItem[]) => Promise<void> | void
  onClose: () => void
  availableSlots: SlotOption[]
  isPending?: boolean
}) {
  const [activeType, setActiveType] = useState<QuickAddType>('task')
  const [value, setValue] = useState('')
  const [staged, setStaged] = useState<StagedItem[]>([])
  const [slotPickerOpen, setSlotPickerOpen] = useState(false)
  const uidRef = useRef(0)
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const isText = activeType === 'text'
  const isDocument = activeType === 'document'
  const placeholder = isText
    ? 'Текст… (Shift+Enter — новая строка)'
    : activeType === 'heading'
      ? 'Текст заголовка…'
      : 'Название задачи…'

  // Слоты, ещё не добавленные в список этой сессии.
  const stagedSlotIds = new Set(staged.filter((s) => s.slotId).map((s) => s.slotId))
  const pickableSlots = availableSlots.filter((s) => !stagedSlotIds.has(s.id))

  const commit = () => {
    const v = value.trim()
    if (!v) return
    setStaged((prev) => [...prev, { uid: uidRef.current++, type: activeType, value: v }])
    setValue('')
    fieldRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !(isText && e.shiftKey)) {
      e.preventDefault()
      commit()
    }
  }

  const addSlots = (slots: SlotOption[]) => {
    setStaged((prev) => [
      ...prev,
      ...slots.map((s) => ({ uid: uidRef.current++, type: 'document' as const, value: s.name, slotId: s.id })),
    ])
    setSlotPickerOpen(false)
  }

  const removeStaged = (uid: number) => setStaged((prev) => prev.filter((s) => s.uid !== uid))
  const changeType = (uid: number, type: QuickAddType) =>
    // Смена на текстовый тип сбрасывает slotId (перестаёт быть документом).
    setStaged((prev) => prev.map((s) => (s.uid === uid ? { ...s, type, slotId: undefined } : s)))

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

  const toItem = (s: StagedItem): QuickAddItem =>
    s.type === 'document' && s.slotId
      ? { type: 'document', value: s.value, slotId: s.slotId }
      : { type: s.type === 'document' ? 'task' : s.type, value: s.value }

  const handleSubmit = async () => {
    const tail = !isDocument ? value.trim() : ''
    const items: QuickAddItem[] = [
      ...staged.map(toItem),
      ...(tail ? [{ type: activeType === 'document' ? 'task' : activeType, value: tail } as QuickAddItem] : []),
    ]
    if (!items.length) {
      onClose()
      return
    }
    await onSubmit(items)
    onClose()
  }

  const total = staged.length + (!isDocument && value.trim() ? 1 : 0)

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
              if (type !== 'document') fieldRef.current?.focus()
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

      {/* 2. Поле ввода / выбор документа */}
      {isDocument ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setSlotPickerOpen(true)}
            disabled={pickableSlots.length === 0}
          >
            <FolderOpen className="mr-2 size-4" />
            {pickableSlots.length === 0 ? 'Свободных документов нет' : 'Выбрать документ…'}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Выбранные документы добавятся в список ниже.
          </p>
        </div>
      ) : (
        <>
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
        </>
      )}

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

      <SlotPicker
        open={slotPickerOpen}
        onClose={() => setSlotPickerOpen(false)}
        slots={pickableSlots}
        onAdd={addSlots}
      />
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
  const isDocument = item.type === 'document'
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

      {/* Тег типа. Для документа — статичный (нельзя поменять, привязан к слоту). */}
      {isDocument ? (
        <span className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          <Icon className="size-3" />
          {meta.label}
        </span>
      ) : (
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
            {SWAPPABLE_TYPES.map((t) => {
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
      )}

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
