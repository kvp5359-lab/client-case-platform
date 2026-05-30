"use client"

/**
 * Объединённый плоский список проекта = задачи + текстовые блоки + слоты.
 *
 * Сквозная модель (см. docs/feature-backlog/2026-05-30-plan-module.md →
 * «ПЕРЕСМОТР»): отдельной сущности «План» нет. Задачи рисуются ТЕМ ЖЕ
 * `TaskRow`, что и обычный список (ноль дублей). Между ними по общему порядку
 * встраиваются текстовые блоки и слоты (`project_plan_blocks`, только
 * text+slot). Один `@dnd-kit` DnD на всё; при перетаскивании пересчитываем
 * общий `sort_order` и пишем в обе таблицы (задачи + блоки).
 *
 * Рендерится только в проектном режиме в ручном плоском порядке (без активных
 * фильтров/поиска/группировки). При фильтре/сортировке/календаре TaskListView
 * показывает обычный TaskGroupList без аннотаций.
 */

import { useMemo, useState } from 'react'
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
  GripVertical,
  Trash2,
  Type as TypeIcon,
  Heading,
  FolderOpen,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TaskRow } from '@/components/tasks/TaskRow'
import type { TaskItem } from '@/components/tasks/types'
import type { TaskTimeValue } from '@/components/tasks/TaskTimePickerPopover'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { useProjectPlan } from '@/hooks/plan/useProjectPlan'
import { useUpdateSlotDeadline } from '@/hooks/plan/useUpdateSlotDeadline'
import { useFolderSlots } from '@/hooks/documents/useFolderSlots'
import { useProjectPermissions } from '@/hooks/permissions'
import { isStaffRole } from '@/types/permissions'
import {
  HeadingBlockBody,
  TextBlockBody,
  SlotBlockBody,
  type PlanBlockDisplay,
} from './PlanBlockItem'

type Props = {
  projectId: string
  workspaceId: string
  tasks: TaskItem[]
  taskStatuses: TaskStatus[]
  membersMap: Record<string, AvatarParticipant[]>
  finalStatusIds: Set<string>
  selectedThreadId: string | null
  showProject: boolean
  deadlinePending: boolean
  onOpenTask: (id: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  onDeadlineSet: (taskId: string, date: Date) => void
  onDeadlineClear: (taskId: string) => void
  onTimeChange?: (taskId: string, v: TaskTimeValue) => void
  onReorderTasks: (updates: { id: string; sort_order: number }[]) => void
  onRequestDeleteTask?: (task: TaskItem) => void
}

type MergedItem =
  | { kind: 'task'; id: string; sort: number; task: TaskItem }
  | { kind: 'block'; id: string; sort: number; display: PlanBlockDisplay }

export function ProjectFlatPlanList({
  projectId,
  workspaceId,
  tasks,
  taskStatuses,
  membersMap,
  finalStatusIds,
  selectedThreadId,
  showProject,
  deadlinePending,
  onOpenTask,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  onTimeChange,
  onReorderTasks,
  onRequestDeleteTask,
}: Props) {
  const {
    blocks,
    addTextBlock,
    addHeadingBlock,
    addSlotBlocks,
    updateBlock,
    deleteBlock,
    setBlockOrders,
  } = useProjectPlan(projectId, workspaceId)
  const { slots } = useFolderSlots(projectId)
  const updateSlotDeadline = useUpdateSlotDeadline(projectId)
  const { userProjectRoles } = useProjectPermissions({ projectId })

  const canEdit = userProjectRoles.length === 0 || userProjectRoles.some(isStaffRole)

  const [showSlots, setShowSlots] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

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

  // ── Объединённый порядок: задачи (project_threads) + блоки (plan_blocks) ──
  const merged = useMemo<MergedItem[]>(() => {
    const items: MergedItem[] = []
    for (const t of tasks) {
      items.push({ kind: 'task', id: t.id, sort: t.sort_order ?? 0, task: t })
    }
    for (const b of blocks) {
      if (b.block_type === 'text' || b.block_type === 'heading') {
        items.push({
          kind: 'block',
          id: b.id,
          sort: b.sort_order,
          display: {
            id: b.id,
            block_type: b.block_type,
            visible_to_client: b.visible_to_client,
            content: b.content,
            slot: null,
            missing: false,
          },
        })
      } else if (b.block_type === 'slot' && showSlots) {
        const sl = b.folder_slot_id ? slotMap.get(b.folder_slot_id) : undefined
        items.push({
          kind: 'block',
          id: b.id,
          sort: b.sort_order,
          display: {
            id: b.id,
            block_type: 'slot',
            visible_to_client: b.visible_to_client,
            content: null,
            slot: sl ? { name: sl.name, deadline: sl.deadline, filled: sl.filled } : null,
            missing: !sl,
          },
        })
      }
    }
    // Сортировка по общему sort_order; на равных — задачи раньше блоков.
    items.sort((a, b) => a.sort - b.sort || (a.kind === 'task' ? -1 : 1))
    return items
  }, [tasks, blocks, slotMap, showSlots])

  const visibleMerged = useMemo(
    () =>
      canEdit
        ? merged
        : merged.filter((i) => i.kind === 'task' || i.display.visible_to_client),
    [merged, canEdit],
  )

  const maxSort = useMemo(
    () => (merged.length ? Math.max(...merged.map((i) => i.sort)) : 0),
    [merged],
  )

  const usedSlotIds = useMemo(
    () => new Set(blocks.filter((b) => b.block_type === 'slot').map((b) => b.folder_slot_id)),
    [blocks],
  )
  const availableSlots = useMemo(
    () => slots.filter((s) => !usedSlotIds.has(s.id)),
    [slots, usedSlotIds],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = merged.findIndex((i) => i.id === active.id)
    const newIndex = merged.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(merged, oldIndex, newIndex)
    const taskUpdates: { id: string; sort_order: number }[] = []
    const blockUpdates: { id: string; sort_order: number }[] = []
    next.forEach((item, idx) => {
      const so = idx * 10
      if (item.kind === 'task') taskUpdates.push({ id: item.id, sort_order: so })
      else blockUpdates.push({ id: item.id, sort_order: so })
    })
    if (taskUpdates.length) onReorderTasks(taskUpdates)
    if (blockUpdates.length) setBlockOrders(blockUpdates)
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={visibleMerged.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col">
            {visibleMerged.map((item) => (
              <SortableRow
                key={item.id}
                item={item}
                canEdit={canEdit}
                workspaceId={workspaceId}
                taskStatuses={taskStatuses}
                membersMap={membersMap}
                finalStatusIds={finalStatusIds}
                selectedThreadId={selectedThreadId}
                showProject={showProject}
                deadlinePending={deadlinePending}
                onOpenTask={onOpenTask}
                onStatusChange={onStatusChange}
                onDeadlineSet={onDeadlineSet}
                onDeadlineClear={onDeadlineClear}
                onTimeChange={onTimeChange}
                onRequestDeleteTask={onRequestDeleteTask}
                onChangeText={(html) => updateBlock(item.id, { content: html })}
                onDeleteBlock={() => deleteBlock(item.id)}
                onChangeSlotDeadline={(deadline) => {
                  if (item.kind === 'block' && item.display.block_type === 'slot') {
                    const b = blocks.find((x) => x.id === item.id)
                    if (b?.folder_slot_id) {
                      updateSlotDeadline.mutate({ slotId: b.folder_slot_id, deadline })
                    }
                  }
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Добавить:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => addHeadingBlock('', maxSort + 10)}
          >
            <Heading className="size-3.5" /> Заголовок
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => addTextBlock('', maxSort + 10)}
          >
            <TypeIcon className="size-3.5" /> Текст
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setPickerOpen(true)}
          >
            <FolderOpen className="size-3.5" /> Документ
          </Button>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={showSlots} onCheckedChange={setShowSlots} />
            Показывать документы
          </label>
        </div>
      )}

      <SlotPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        slots={availableSlots.map((s) => ({ id: s.id, name: s.name }))}
        onAdd={(ids) => {
          addSlotBlocks(ids, maxSort + 10)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}

// ── Sortable-строка (задача или блок) ─────────────────────

function SortableRow({
  item,
  canEdit,
  workspaceId,
  taskStatuses,
  membersMap,
  finalStatusIds,
  selectedThreadId,
  showProject,
  deadlinePending,
  onOpenTask,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  onTimeChange,
  onRequestDeleteTask,
  onChangeText,
  onDeleteBlock,
  onChangeSlotDeadline,
}: {
  item: MergedItem
  canEdit: boolean
  workspaceId: string
  taskStatuses: TaskStatus[]
  membersMap: Record<string, AvatarParticipant[]>
  finalStatusIds: Set<string>
  selectedThreadId: string | null
  showProject: boolean
  deadlinePending: boolean
  onOpenTask: (id: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  onDeadlineSet: (taskId: string, date: Date) => void
  onDeadlineClear: (taskId: string) => void
  onTimeChange?: (taskId: string, v: TaskTimeValue) => void
  onRequestDeleteTask?: (task: TaskItem) => void
  onChangeText: (html: string) => void
  onDeleteBlock: () => void
  onChangeSlotDeadline: (deadline: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  // Свёрнут ли текстовый блок до одной строки (состояние на блок, key=id).
  const [collapsed, setCollapsed] = useState(false)

  if (item.kind === 'task') {
    return (
      <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-60' : ''}>
        <TaskRow
          task={item.task}
          workspaceId={workspaceId}
          statuses={taskStatuses}
          members={membersMap[item.id] ?? []}
          onOpen={() => onOpenTask(item.id)}
          onStatusChange={(statusId) => onStatusChange(item.id, statusId)}
          onDeadlineSet={(date) => onDeadlineSet(item.id, date)}
          onDeadlineClear={() => onDeadlineClear(item.id)}
          onTimeChange={onTimeChange ? (v) => onTimeChange(item.id, v) : undefined}
          deadlinePending={deadlinePending}
          finalStatusIds={finalStatusIds}
          showProject={showProject}
          onRequestDelete={
            onRequestDeleteTask ? () => onRequestDeleteTask(item.task) : undefined
          }
          isActive={item.id === selectedThreadId}
          dragHandleProps={canEdit ? { attributes, listeners } : undefined}
        />
      </div>
    )
  }

  // Блок: заголовок / текст / слот. Контейнер повторяет TaskRow (px-3, gap-3,
  // грип абсолютным оверлеем), чтобы контент вставал в ту же левую колонку.
  const bt = item.display.block_type
  const isHeading = bt === 'heading'
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/row relative flex gap-3 px-3 py-1.5 transition-colors hover:bg-muted/30 ${
        isHeading ? 'mt-3 items-center' : 'items-start border-b border-border/50'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {canEdit && (
        <button
          type="button"
          className="absolute -left-2.5 top-2 cursor-grab touch-none p-0.5 opacity-0 transition-opacity group-hover/row:opacity-100"
          {...attributes}
          {...listeners}
          aria-label="Перетащить"
        >
          <GripVertical className="size-4 text-muted-foreground/40" />
        </button>
      )}

      {/* Текст: шеврон сворачивания в слоте статус-кружка → контент в одной
          колонке с названиями задач. Заголовок и слот — без шеврона. */}
      {bt === 'text' &&
        (canEdit ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="mt-0.5 shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
            aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        ))}

      <div className="min-w-0 flex-1">
        {bt === 'heading' ? (
          <HeadingBlockBody
            content={item.display.content}
            editing={canEdit}
            onChange={onChangeText}
          />
        ) : bt === 'text' ? (
          collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="block w-full truncate py-0.5 text-left text-sm text-muted-foreground hover:text-foreground"
              title="Развернуть"
            >
              {stripHtml(item.display.content) || 'Пустой текст'}
            </button>
          ) : (
            <TextBlockBody
              content={item.display.content}
              editing={canEdit}
              onChange={onChangeText}
            />
          )
        ) : (
          <SlotBlockBody
            display={item.display}
            editing={canEdit}
            onChangeSlotDeadline={onChangeSlotDeadline}
          />
        )}
      </div>

      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-0.5 size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100"
          onClick={onDeleteBlock}
          aria-label="Удалить блок"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  )
}

/** HTML → одна строка текста (для свёрнутого вида). */
function stripHtml(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Пикер слотов (множественный выбор) ───────────────────

function SlotPicker({
  open,
  onClose,
  slots,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  slots: Array<{ id: string; name: string }>
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
          <DialogTitle>Добавить документ в план</DialogTitle>
        </DialogHeader>
        {slots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Все документы-ячейки уже в списке или их нет. Создайте слот на вкладке «Документы».
          </p>
        ) : (
          <>
            <div className="-mx-1 max-h-80 space-y-0.5 overflow-y-auto px-1">
              {slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Checkbox checked={selected.has(s.id)} className="pointer-events-none" />
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleAdd(slots.map((s) => s.id))}
              >
                <Plus className="mr-1 size-3.5" /> Все ({slots.length})
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
