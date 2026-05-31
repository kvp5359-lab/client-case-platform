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
 * Этот файл — оркестратор: данные/порядок/хендлеры. Рендер строки — в
 * `PlanSortableRow`, пикер документов — в `SlotPicker`, быстрый ввод —
 * в `QuickAddModal`.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import type { TaskItem } from '@/components/tasks/types'
import type { TaskTimeValue } from '@/components/tasks/TaskTimePickerPopover'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { FolderSlotWithDocument } from '@/components/documents/types'
import { useProjectPlan } from '@/hooks/plan/useProjectPlan'
import { useFolderSlots } from '@/hooks/documents/useFolderSlots'
import { useProjectPermissions } from '@/hooks/permissions'
import { isStaffRole } from '@/types/permissions'
import { useCreateThread } from '@/hooks/messenger/useProjectThreads'
import { PlanDocsProvider } from './PlanDocsProvider'
import { QuickAddModal, type QuickAddItem } from './QuickAddModal'
import { SortableRow } from './PlanSortableRow'
import type { MergedItem } from './planTypes'

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

  // Быстрое добавление: позиция (sort), ПОСЛЕ которой вставлять. null = закрыто.
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

  // Локальный порядок для dnd: dnd-kit требует, чтобы новый порядок применялся
  // СИНХРОННО в onDragEnd (как канонический setItems(arrayMove)). Рендер из
  // кэша React Query недостаточно синхронен — между снятием transform и
  // обновлением данных остаётся кадр → отскок строки. Поэтому держим
  // localOrder (id в нужном порядке), меняем его мгновенно при drop, а
  // кэш-мутации догоняют фоном и сбрасывают override, когда сервер совпал.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)

  const displayItems = useMemo(() => {
    if (!localOrder) return visibleMerged
    const byId = new Map(visibleMerged.map((i) => [i.id, i]))
    const ordered = localOrder.map((id) => byId.get(id)).filter((x): x is MergedItem => !!x)
    const known = new Set(localOrder)
    const extra = visibleMerged.filter((i) => !known.has(i.id))
    return [...ordered, ...extra]
  }, [visibleMerged, localOrder])

  // Сбрасываем override, когда серверный порядок догнал локальный.
  useEffect(() => {
    if (!localOrder) return
    const ids = visibleMerged.map((i) => i.id)
    if (ids.length === localOrder.length && ids.every((id, i) => id === localOrder[i])) {
      setLocalOrder(null)
    }
  }, [visibleMerged, localOrder])

  const maxSort = useMemo(
    () => (merged.length ? Math.max(...merged.map((i) => i.sort)) : 0),
    [merged],
  )

  const usedSlotIds = useMemo(
    () => new Set(blocks.filter((b) => b.block_type === 'slot').map((b) => b.folder_slot_id)),
    [blocks],
  )
  const availableSlots = useMemo(
    () => slots.filter((s) => !usedSlotIds.has(s.id)).map((s) => ({ id: s.id, name: s.name })),
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
        } else if (it.type === 'document') {
          await addSlotBlocks([it.slotId], target)
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
    const ids = displayItems.map((i) => i.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const newIds = arrayMove(ids, oldIndex, newIndex)
    // СИНХРОННО фиксируем новый порядок — dnd-kit анимирует из текущего DOM
    // в новые позиции в том же кадре, без отскока.
    setLocalOrder(newIds)
    // Пересчёт sort_order по новому порядку → фоновые мутации (оптимистичны).
    const byId = new Map(displayItems.map((i) => [i.id, i]))
    const taskUpdates: { id: string; sort_order: number }[] = []
    const blockUpdates: { id: string; sort_order: number }[] = []
    newIds.forEach((id, idx) => {
      const so = idx * 10
      if (byId.get(id)?.kind === 'task') taskUpdates.push({ id, sort_order: so })
      else blockUpdates.push({ id, sort_order: so })
    })
    if (taskUpdates.length) onReorderTasks(taskUpdates)
    if (blockUpdates.length) setBlockOrders(blockUpdates)
  }

  return (
    <PlanDocsProvider projectId={projectId} workspaceId={workspaceId} enabled={hasSlotBlocks}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={displayItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col [&>*:last-child]:border-b-0 [&>*:last-child_.border-b]:border-b-0">
            {displayItems.map((item) => (
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

      {/* Быстрое добавление: задачи/заголовки/текст/документы, со вставкой в
          позицию quickAddAfterSort (после строки, под которой нажали «+»). */}
      <QuickAddModal
        open={quickAddAfterSort !== null}
        onClose={() => setQuickAddAfterSort(null)}
        onSubmit={handleQuickAddSubmit}
        availableSlots={availableSlots}
        isPending={quickAddPending}
      />
    </PlanDocsProvider>
  )
}
