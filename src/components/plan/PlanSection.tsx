"use client"

/**
 * Модуль «План» — сворачиваемый блок под списком задач на вкладке «Задачи».
 *
 * Документ-конструктор из блоков (текст / задача / слот). Задачи и слоты —
 * живые ссылки: данные подмешиваются из useProjectThreads / useFolderSlots
 * (их кэши переиспользуются, без дублирующих запросов). Текст хранится в
 * самом блоке.
 *
 * Фазы 0–2: создание/редактирование плана внутри проекта (для команды).
 * Видимость клиенту по модулям и отдельный клиентский экран — Фаза 4.
 *
 * См. docs/feature-backlog/2026-05-30-plan-module.md
 */

import { createElement, useMemo, useState, type ReactNode } from 'react'
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
import { ListChecks, ChevronDown, Type as TypeIcon, CheckSquare, FolderOpen } from 'lucide-react'
import { getChatIconComponent } from '@/components/messenger/EditChatDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useProjectPlan } from '@/hooks/plan/useProjectPlan'
import { useUpdateSlotDeadline } from '@/hooks/plan/useUpdateSlotDeadline'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { useFolderSlots } from '@/hooks/documents/useFolderSlots'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useProjectPermissions } from '@/hooks/permissions'
import { isStaffRole } from '@/types/permissions'
import { PlanBlockItem, type PlanBlockDisplay } from './PlanBlockItem'

type Props = {
  projectId: string
  workspaceId: string
}

export function PlanSection({ projectId, workspaceId }: Props) {
  const {
    blocks,
    isLoading,
    addTextBlock,
    addTaskBlocks,
    addSlotBlocks,
    updateBlock,
    deleteBlock,
    reorderBlocks,
  } = useProjectPlan(projectId, workspaceId)
  const updateSlotDeadline = useUpdateSlotDeadline(projectId)
  const { data: threads = [] } = useProjectThreads(projectId)
  const { slots } = useFolderSlots(projectId)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const { userProjectRoles } = useProjectPermissions({ projectId: projectId || '' })

  // Клиент (роль не из STAFF_ROLES) видит план только для чтения и только
  // блоки с visible_to_client. Пустой список ролей = доступ через
  // workspace-админа (полный доступ) → редактирование разрешено.
  const canEdit = userProjectRoles.length === 0 || userProjectRoles.some(isStaffRole)

  const [open, setOpen] = useState(true)
  const [picker, setPicker] = useState<null | 'task' | 'slot'>(null)

  // ── Карты для обогащения блоков живыми данными ──────────
  const statusFinal = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const s of taskStatuses) m.set(s.id, !!s.is_final)
    return m
  }, [taskStatuses])

  const threadMap = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string
        deadline: string | null
        status_id: string | null
        icon: string | null
        accent_color: string | null
      }
    >()
    for (const t of threads) {
      m.set(t.id, {
        name: t.name,
        deadline: t.deadline,
        status_id: t.status_id,
        icon: t.icon,
        accent_color: t.accent_color,
      })
    }
    return m
  }, [threads])

  const slotMap = useMemo(() => {
    const m = new Map<string, { name: string; deadline: string | null; filled: boolean }>()
    for (const s of slots) {
      m.set(s.id, {
        name: s.name,
        deadline: (s as { deadline?: string | null }).deadline ?? null,
        filled: !!s.document_id,
      })
    }
    return m
  }, [slots])

  const displays: PlanBlockDisplay[] = useMemo(
    () =>
      blocks.map((b): PlanBlockDisplay => {
        if (b.block_type === 'task') {
          const th = b.thread_id ? threadMap.get(b.thread_id) : undefined
          return {
            id: b.id,
            block_type: 'task',
            visible_to_client: b.visible_to_client,
            content: null,
            task: th
              ? {
                  name: th.name,
                  deadline: th.deadline,
                  done: th.status_id ? !!statusFinal.get(th.status_id) : false,
                  icon: th.icon,
                  accent_color: th.accent_color,
                }
              : null,
            slot: null,
            missing: !th,
          }
        }
        if (b.block_type === 'slot') {
          const sl = b.folder_slot_id ? slotMap.get(b.folder_slot_id) : undefined
          return {
            id: b.id,
            block_type: 'slot',
            visible_to_client: b.visible_to_client,
            content: null,
            task: null,
            slot: sl ? { name: sl.name, deadline: sl.deadline, filled: sl.filled } : null,
            missing: !sl,
          }
        }
        return {
          id: b.id,
          block_type: 'text',
          visible_to_client: b.visible_to_client,
          content: b.content,
          task: null,
          slot: null,
          missing: false,
        }
      }),
    [blocks, threadMap, slotMap, statusFinal],
  )

  // Для клиента — только блоки, помеченные «виден клиенту».
  const visibleDisplays = useMemo(
    () => (canEdit ? displays : displays.filter((d) => d.visible_to_client)),
    [displays, canEdit],
  )

  // ── Пикеры: что ещё можно добавить (без дублей) ─────────
  const usedThreadIds = useMemo(
    () => new Set(blocks.filter((b) => b.block_type === 'task').map((b) => b.thread_id)),
    [blocks],
  )
  // Пикер показывает все треды проекта (задачи/чаты/письма) — то же, что
  // в списке на вкладке «Задачи». В проекте может не быть type='task' вовсе
  // (только чаты/письма), но добавить в план их всё равно нужно.
  const availableTasks = useMemo(
    () => threads.filter((t) => !usedThreadIds.has(t.id)),
    [threads, usedThreadIds],
  )
  const usedSlotIds = useMemo(
    () => new Set(blocks.filter((b) => b.block_type === 'slot').map((b) => b.folder_slot_id)),
    [blocks],
  )
  const availableSlots = useMemo(
    () => slots.filter((s) => !usedSlotIds.has(s.id)),
    [slots, usedSlotIds],
  )

  // ── DnD ─────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = displays.map((d) => d.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex < 0 || newIndex < 0) return
    reorderBlocks(arrayMove(ids, oldIndex, newIndex))
  }

  const hasBlocks = visibleDisplays.length > 0

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-card/50"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold">
          <ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          <ListChecks className="size-4 text-muted-foreground" />
          План
          {hasBlocks && (
            <span className="rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground">
              {displays.length}
            </span>
          )}
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="px-2 pb-2">
        {isLoading ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">Загрузка плана…</p>
        ) : !hasBlocks ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {canEdit
              ? 'План пуст. Добавьте текст, задачу или документ ниже.'
              : 'План пока пуст.'}
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={visibleDisplays.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col">
                {visibleDisplays.map((display) => (
                  <SortableBlock
                    key={display.id}
                    display={display}
                    editable={canEdit}
                    onChangeText={(html) => updateBlock(display.id, { content: html })}
                    onToggleVisible={(next) => updateBlock(display.id, { visible_to_client: next })}
                    onDelete={() => deleteBlock(display.id)}
                    onChangeSlotDeadline={(deadline) => {
                      const block = blocks.find((b) => b.id === display.id)
                      if (block?.folder_slot_id) {
                        updateSlotDeadline.mutate({ slotId: block.folder_slot_id, deadline })
                      }
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {canEdit && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t px-2 pt-2">
            <span className="text-xs text-muted-foreground">Добавить:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => addTextBlock('<p></p>')}
            >
              <TypeIcon className="size-3.5" /> Текст
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setPicker('task')}
            >
              <CheckSquare className="size-3.5" /> Задача
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setPicker('slot')}
            >
              <FolderOpen className="size-3.5" /> Документ
            </Button>
          </div>
        )}
      </CollapsibleContent>

      {/* Пикер задач */}
      <PickerDialog
        open={picker === 'task'}
        onClose={() => setPicker(null)}
        title="Добавить задачу в план"
        emptyLabel="Все задачи проекта уже в плане или задач нет."
        items={availableTasks.map((t) => ({
          id: t.id,
          label: t.name,
          iconEl: createElement(getChatIconComponent(t.icon ?? ''), {
            className: `size-4 shrink-0 ${COLOR_TEXT[t.accent_color ?? ''] ?? 'text-muted-foreground'}`,
          }),
        }))}
        onAdd={(ids) => {
          addTaskBlocks(ids)
          setPicker(null)
        }}
      />

      {/* Пикер слотов */}
      <PickerDialog
        open={picker === 'slot'}
        onClose={() => setPicker(null)}
        title="Добавить документ в план"
        emptyLabel="Все документы-ячейки уже в плане или их нет. Создайте слот на вкладке «Документы»."
        items={availableSlots.map((s) => ({
          id: s.id,
          label: s.name,
          iconEl: <FolderOpen className="size-4 shrink-0 text-muted-foreground" />,
        }))}
        onAdd={(ids) => {
          addSlotBlocks(ids)
          setPicker(null)
        }}
      />
    </Collapsible>
  )
}

// ── Sortable-обёртка для блока ────────────────────────────

function SortableBlock({
  display,
  editable,
  onChangeText,
  onToggleVisible,
  onDelete,
  onChangeSlotDeadline,
}: {
  display: PlanBlockDisplay
  editable: boolean
  onChangeText: (html: string) => void
  onToggleVisible: (next: boolean) => void
  onDelete: () => void
  onChangeSlotDeadline: (deadline: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: display.id,
    disabled: !editable,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-60' : ''}
    >
      <PlanBlockItem
        display={display}
        editable={editable}
        onChangeText={onChangeText}
        onToggleVisible={onToggleVisible}
        onDelete={onDelete}
        onChangeSlotDeadline={onChangeSlotDeadline}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

// ── Простой пикер сущностей ──────────────────────────────

function PickerDialog({
  open,
  onClose,
  title,
  emptyLabel,
  items,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  title: string
  emptyLabel: string
  items: Array<{ id: string; label: string; iconEl: ReactNode }>
  onAdd: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleAdd = (ids: string[]) => {
    onAdd(ids)
    setSelected(new Set())
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setSelected(new Set())
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            <div className="-mx-1 max-h-80 space-y-0.5 overflow-y-auto px-1">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => toggle(it.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Checkbox checked={selected.has(it.id)} className="pointer-events-none" />
                  {it.iconEl}
                  <span className="truncate">{it.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleAdd(items.map((i) => i.id))}
              >
                Добавить все ({items.length})
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selected.size === 0}
                onClick={() => handleAdd([...selected])}
              >
                Добавить{selected.size > 0 ? ` (${selected.size})` : ''}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
