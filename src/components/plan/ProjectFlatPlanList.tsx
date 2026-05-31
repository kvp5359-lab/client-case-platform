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
  FolderOpen,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TaskRow } from '@/components/tasks/TaskRow'
import type { TaskItem } from '@/components/tasks/types'
import type { TaskTimeValue } from '@/components/tasks/TaskTimePickerPopover'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { useProjectPlan } from '@/hooks/plan/useProjectPlan'
import { useFolderSlots } from '@/hooks/documents/useFolderSlots'
import { useProjectPermissions } from '@/hooks/permissions'
import { isStaffRole } from '@/types/permissions'
import { SlotItem } from '@/page-components/ProjectPage/components/Documents/SlotItem'
import type { FolderSlotWithDocument } from '@/components/documents/types'
import { PlanDocsProvider, usePlanSlotHandlers } from './PlanDocsProvider'
import { QuickAddModal, type QuickAddItem } from './QuickAddModal'
import { useCreateThread } from '@/hooks/messenger/useProjectThreads'
import { HeadingBlockBody, TextBlockBody, type PlanBlockDisplay } from './PlanBlockItem'

// Многострочный plain-текст → HTML-параграфы (как сохранил бы Tiptap-редактор).
// htmlToPlain в PlanBlockItem конвертит </p> обратно в \n при отображении,
// а редактор корректно распарсит <p> при правке.
function escapeBlockHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function planTextToHtml(s: string): string {
  return s
    .split('\n')
    .map((l) => `<p>${escapeBlockHtml(l)}</p>`)
    .join('')
}

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
  /** Видимость типов блоков — управляется тумблерами в панели фильтров. */
  showHeadings: boolean
  showText: boolean
  showSlots: boolean
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
  | {
      kind: 'block'
      id: string
      sort: number
      display: PlanBlockDisplay
      /** Полный слот документа — для рендера настоящим SlotItem. */
      fullSlot?: FolderSlotWithDocument | null
    }

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
  showHeadings,
  showText,
  showSlots,
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
  const { userProjectRoles } = useProjectPermissions({ projectId })

  const canEdit = userProjectRoles.length === 0 || userProjectRoles.some(isStaffRole)

  // Видимость типов блоков (showHeadings/showText/showSlots) приходит пропсами
  // из TaskListView — тумблеры живут в панели фильтров (TaskListControls).
  const [pickerOpen, setPickerOpen] = useState(false)
  // Быстрое добавление: позиция (sort), ПОСЛЕ которой вставлять. null = закрыто.
  // Само модальное окно — заглушка, прорабатывается отдельно.
  const [quickAddAfterSort, setQuickAddAfterSort] = useState<number | null>(null)

  const slotById = useMemo(() => {
    const m = new Map<string, FolderSlotWithDocument>()
    for (const s of slots) m.set(s.id, s)
    return m
  }, [slots])

  const hasSlotBlocks = useMemo(() => blocks.some((b) => b.block_type === 'slot'), [blocks])

  // ── Объединённый порядок: задачи (project_threads) + блоки (plan_blocks) ──
  const merged = useMemo<MergedItem[]>(() => {
    const items: MergedItem[] = []
    for (const t of tasks) {
      items.push({ kind: 'task', id: t.id, sort: t.sort_order ?? 0, task: t })
    }
    for (const b of blocks) {
      // Скрытие по типу через независимые тумблеры.
      if (b.block_type === 'heading' && !showHeadings) continue
      if (b.block_type === 'text' && !showText) continue
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
        const fullSlot = b.folder_slot_id ? slotById.get(b.folder_slot_id) ?? null : null
        items.push({
          kind: 'block',
          id: b.id,
          sort: b.sort_order,
          display: {
            id: b.id,
            block_type: 'slot',
            visible_to_client: b.visible_to_client,
            content: null,
            slot: null,
            missing: !fullSlot,
          },
          fullSlot,
        })
      }
    }
    // Сортировка по общему sort_order; на равных — задачи раньше блоков.
    items.sort((a, b) => a.sort - b.sort || (a.kind === 'task' ? -1 : 1))
    return items
  }, [tasks, blocks, slotById, showHeadings, showText, showSlots])

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

  // ── Быстрое добавление: создаём элементы и вставляем ПОСЛЕ строки с «+» ──
  const createTask = useCreateThread(projectId, workspaceId)
  const [quickAddPending, setQuickAddPending] = useState(false)

  const handleQuickAddSubmit = async (items: QuickAddItem[]) => {
    if (!items.length) return
    const baseSort = quickAddAfterSort ?? maxSort
    const N = items.length
    setQuickAddPending(true)
    try {
      // Окно [baseSort+10 .. baseSort+10N] под новые элементы: существующие
      // элементы ПОСЛЕ baseSort сдвигаем на +N*10. Итоговый sort каждой строки
      // детерминирован (по своей строке), поэтому порядок async-вызовов не важен.
      const taskShifts = tasks
        .filter((t) => (t.sort_order ?? 0) > baseSort)
        .map((t) => ({ id: t.id, sort_order: (t.sort_order ?? 0) + N * 10 }))
      const blockShifts = blocks
        .filter((b) => b.sort_order > baseSort)
        .map((b) => ({ id: b.id, sort_order: b.sort_order + N * 10 }))

      const taskNewSorts: { id: string; sort_order: number }[] = []
      for (let p = 0; p < N; p++) {
        const target = baseSort + 10 * (p + 1)
        const it = items[p]
        if (it.type === 'heading') {
          await addHeadingBlock(planTextToHtml(it.value), target)
        } else if (it.type === 'text') {
          await addTextBlock(planTextToHtml(it.value), target)
        } else {
          const thread = await createTask.mutateAsync({
            name: it.value,
            accessType: 'all',
            type: 'task',
          })
          taskNewSorts.push({ id: thread.id, sort_order: target })
        }
      }

      if (blockShifts.length) await setBlockOrders(blockShifts)
      const taskUpdates = [...taskShifts, ...taskNewSorts]
      if (taskUpdates.length) onReorderTasks(taskUpdates)
    } finally {
      setQuickAddPending(false)
    }
  }

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
    <PlanDocsProvider projectId={projectId} workspaceId={workspaceId} enabled={hasSlotBlocks}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={visibleMerged.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col [&>*:last-child]:border-b-0 [&>*:last-child_.border-b]:border-b-0">
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
                onQuickAddHere={canEdit ? () => setQuickAddAfterSort(item.sort) : undefined}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <SlotPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        slots={availableSlots.map((s) => ({ id: s.id, name: s.name }))}
        onAdd={(ids) => {
          addSlotBlocks(ids, maxSort + 10)
          setPickerOpen(false)
        }}
      />

      {/* Быстрое добавление: задачи/заголовки/текст, со вставкой в позицию
          quickAddAfterSort (после строки, под которой нажали «+»). */}
      <QuickAddModal
        open={quickAddAfterSort !== null}
        onClose={() => setQuickAddAfterSort(null)}
        onSubmit={handleQuickAddSubmit}
        isPending={quickAddPending}
      />
    </PlanDocsProvider>
  )
}

// Кнопка «+» по центру нижней границы строки — появляется на hover.
// revealClass передаётся ЛИТЕРАЛОМ (group-hover/<name>:opacity-100), потому
// что Tailwind JIT не видит динамически собранные имена групп.
function QuickAddBelow({ onClick, revealClass }: { onClick: () => void; revealClass: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`absolute -bottom-3 left-1/2 z-20 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-accent hover:text-foreground ${revealClass}`}
      aria-label="Добавить ниже"
      title="Добавить задачу, документ, заголовок или текст"
    >
      <Plus className="size-3.5" />
    </button>
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
  onQuickAddHere,
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
  /** Открыть быстрое добавление с позицией ПОСЛЕ этой строки (task/heading). */
  onQuickAddHere?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  // Свёрнут ли текстовый блок до одной строки (состояние на блок, key=id).
  // По умолчанию текст свёрнут — чтобы длинная «Стратегия» не занимала
  // пол-экрана над списком задач; разворачивается по клику/шеврону.
  const [collapsed, setCollapsed] = useState(
    item.kind === 'block' && item.display.block_type === 'text',
  )

  if (item.kind === 'task') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative group/planrow ${isDragging ? 'opacity-60' : ''}`}
      >
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
        {onQuickAddHere && (
          <QuickAddBelow onClick={onQuickAddHere} revealClass="group-hover/planrow:opacity-100" />
        )}
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
        isHeading
          ? 'mt-3 items-center'
          : bt === 'text'
            ? 'items-start' // текст — без нижнего разделителя
            : 'items-start border-b border-border/50'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {canEdit && (
        <button
          type="button"
          className="absolute -left-6 top-2 cursor-grab touch-none p-0.5 opacity-0 transition-opacity group-hover/row:opacity-100"
          {...attributes}
          {...listeners}
          aria-label="Перетащить"
        >
          <GripVertical className="size-4 text-muted-foreground/40" />
        </button>
      )}

      {/* «+» под заголовком (для текста/слотов не показываем). */}
      {onQuickAddHere && isHeading && (
        <QuickAddBelow onClick={onQuickAddHere} revealClass="group-hover/row:opacity-100" />
      )}

      {/* Текст: шеврон сворачивания в слоте статус-кружка → контент в одной
          колонке с названиями задач. Заголовок и слот — без шеврона. */}
      {bt === 'text' &&
        (canEdit ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-6 shrink-0 items-center text-muted-foreground/50 transition-colors hover:text-foreground"
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
          <PlanSlotItem fullSlot={item.kind === 'block' ? item.fullSlot ?? null : null} />
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

/** Слот документа в плане — настоящий SlotItem из «Документов» (reuse). */
function PlanSlotItem({ fullSlot }: { fullSlot: FolderSlotWithDocument | null }) {
  const { onSlotClick, onSlotRename } = usePlanSlotHandlers()
  if (!fullSlot) {
    return <span className="py-1 text-sm italic text-muted-foreground">Документ удалён</span>
  }
  const el = <SlotItem slot={fullSlot} onSlotClick={onSlotClick} onSlotRename={onSlotRename} />
  // Пустой слот = пилюля (<div>), заполненный = DocumentItem (<tr>). Чтобы <tr>
  // был валидным вне таблицы документов — оборачиваем в собственную таблицу.
  if (fullSlot.document_id) {
    return (
      <table className="w-full">
        <tbody>{el}</tbody>
      </table>
    )
  }
  return el
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
                // role=button, а не <button>: внутри Checkbox (Radix) сам
                // рендерит <button> — вложенные кнопки невалидны и дают
                // hydration error. Поэтому контейнер строки — div.
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle(s.id)
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Checkbox checked={selected.has(s.id)} className="pointer-events-none" />
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.name}</span>
                </div>
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
