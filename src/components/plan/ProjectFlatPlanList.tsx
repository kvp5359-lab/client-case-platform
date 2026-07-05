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

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import type { TaskItem } from '@/components/tasks/types'
import type { TaskTimeValue } from '@/components/tasks/TaskTimePickerPopover'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { FolderSlotWithDocument } from '@/components/documents/types'
import { useProjectPlan } from '@/hooks/plan/useProjectPlan'
import { useProjectTaskGroups, useProjectThreadGroupMap } from '@/hooks/plan/useProjectTaskGroups'
import { PlanGroupContainer } from './PlanGroupContainer'
import { useFolderSlots } from '@/hooks/documents/useFolderSlots'
import { useProjectPermissions } from '@/hooks/permissions'
import { isStaffRole } from '@/types/permissions'
import { useCreateThread, type ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { useWorkspace } from '@/hooks/useWorkspace'
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

// Droppable-зона верхнего уровня (для дропа задач вне групп).
function TopLevelDroppable({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: '__top__' })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg flex flex-col [&>*:last-child]:border-b-0 [&>*:last-child_.border-b]:border-b-0 ${isOver ? 'bg-accent/40' : ''}`}
    >
      {children}
    </div>
  )
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

  // ── Группы задач ─────────────────────────────────────────
  const {
    groups, renameGroup, setGroupCollapsed, setGroupColor, setGroupVisibleToClient, deleteGroup,
    assignThreadToGroup, assignBlockToGroup, setGroupOrders,
  } = useProjectTaskGroups(projectId, workspaceId)
  const { data: threadGroupMap } = useProjectThreadGroupMap(projectId)
  const hasGroups = groups.length > 0

  const blockGroupById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const b of blocks) m.set(b.id, b.group_id ?? null)
    return m
  }, [blocks])

  // Локальный перенос перетаскиваемого элемента в целевую группу ВО ВРЕМЯ
  // drag'а (onDragOver) — иначе превью «внутри группы» появляется только
  // после отпускания мыши. Держится и после drop'а, пока сервер (карта
  // membership / блоки) не подтвердит новую группу — без мигания назад.
  const [dragOverride, setDragOverride] = useState<{ id: string; group: string | null } | null>(null)
  // Локальный порядок ГРУПП после их перетаскивания (id по порядку).
  const [localGroupOrder, setLocalGroupOrder] = useState<string[] | null>(null)

  const realGroupIdOfItem = (item: MergedItem): string | null =>
    item.kind === 'task'
      ? (threadGroupMap?.[item.id] ?? null)
      : (blockGroupById.get(item.id) ?? null)

  const groupIdOfItem = (item: MergedItem): string | null =>
    dragOverride && dragOverride.id === item.id ? dragOverride.group : realGroupIdOfItem(item)

  // Сбрасываем override, когда серверные данные догнали превью (или элемент пропал).
  useEffect(() => {
    if (!dragOverride) return
    const isTask = dragOverride.id in (threadGroupMap ?? {})
    const real = isTask
      ? (threadGroupMap?.[dragOverride.id] ?? null)
      : (blockGroupById.get(dragOverride.id) ?? null)
    if (real === dragOverride.group) setDragOverride(null)
  }, [threadGroupMap, blockGroupById, dragOverride])

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
  const { data: workspace } = useWorkspace(workspaceId)
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
            ...(workspace?.default_task_accent && {
              accentColor: workspace.default_task_accent as ThreadAccentColor,
            }),
            ...(workspace?.default_task_icon && { icon: workspace.default_task_icon }),
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

  // Переместить группу вверх/вниз — обмен sort_order с соседней группой.
  const moveGroup = (groupId: string, dir: 'up' | 'down') => {
    const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((g) => g.id === groupId)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[swapIdx]
    setGroupOrders([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ])
  }

  // ── DnD между/внутри групп (multi-container, только onDragEnd) ──
  const itemById = useMemo(() => new Map(displayItems.map((i) => [i.id, i])), [displayItems])
  const containerOf = (itemId: string): string => {
    const it = itemById.get(itemId)
    if (!it) return '__top__'
    const g = groupIdOfItem(it)
    return g ? `g:${g}` : '__top__'
  }
  const persistReorderSubset = (orderedIds: string[]) => {
    const taskU: { id: string; sort_order: number }[] = []
    const blockU: { id: string; sort_order: number }[] = []
    orderedIds.forEach((id, idx) => {
      const so = idx * 10
      if (itemById.get(id)?.kind === 'task') taskU.push({ id, sort_order: so })
      else blockU.push({ id, sort_order: so })
    })
    if (taskU.length) onReorderTasks(taskU)
    if (blockU.length) setBlockOrders(blockU)
  }
  // Живое превью: при наведении на другой контейнер локально переносим active
  // туда (override группы + позиция в localOrder) — элемент виден внутри
  // группы ДО отпускания мыши. Коммит в БД — в onDragEnd.
  const handleGroupedDragOver = (e: DragOverEvent) => {
    if (!hasGroups) return
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    const activeItem = itemById.get(activeId)
    if (!activeItem) return
    const targetContainer = overId === '__top__' || overId.startsWith('g:') ? overId : containerOf(overId)
    const targetGroupId = targetContainer.startsWith('g:') ? targetContainer.slice(2) : null
    if (groupIdOfItem(activeItem) === targetGroupId) return
    setDragOverride({ id: activeId, group: targetGroupId })
    // Позиция превью: перед over-элементом; в пустую зону — в конец контейнера.
    const ids = displayItems.map((i) => i.id).filter((id) => id !== activeId)
    let insertIdx: number
    if (overId === '__top__' || overId.startsWith('g:')) {
      let last = -1
      ids.forEach((id, idx) => {
        const it = itemById.get(id)
        if (it && groupIdOfItem(it) === targetGroupId) last = idx
      })
      insertIdx = last >= 0 ? last + 1 : ids.length
    } else {
      insertIdx = ids.indexOf(overId)
      if (insertIdx < 0) insertIdx = ids.length
    }
    ids.splice(insertIdx, 0, activeId)
    setLocalOrder(ids)
  }

  const handleGroupedDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    const activeId = String(active.id)
    // ── Перетаскивание САМОЙ группы (за ручку) — реордер групп ──
    if (activeId.startsWith('grp:')) {
      const overRaw = over ? String(over.id) : ''
      if (!overRaw.startsWith('grp:')) return
      const aId = activeId.slice(4)
      const oId = overRaw.slice(4)
      if (aId === oId) return
      const ids = sortedGroups.map((g) => g.id)
      const oldIdx = ids.indexOf(aId)
      const newIdx = ids.indexOf(oId)
      if (oldIdx < 0 || newIdx < 0) return
      const newIds = arrayMove(ids, oldIdx, newIdx)
      // Синхронный локальный порядок (как localOrder у строк) — без отскока.
      setLocalGroupOrder(newIds)
      setGroupOrders(newIds.map((id, i) => ({ id, sort_order: i * 10 }))).catch(() =>
        setLocalGroupOrder(null),
      )
      return
    }
    if (!over) {
      // Дроп мимо — откатываем превью.
      setDragOverride(null)
      setLocalOrder(null)
      return
    }
    const overId = String(over.id)
    const activeItem = itemById.get(activeId)
    if (!activeItem) return
    // Целевой контейнер: droppable-зона ('__top__' / 'g:<id>') или элемент.
    const targetContainer = overId === '__top__' || overId.startsWith('g:') ? overId : containerOf(overId)
    const targetGroupId = targetContainer.startsWith('g:') ? targetContainer.slice(2) : null
    // Новый порядок целевого контейнера: его элементы (без active) + active на позиции over.
    const targetIds = displayItems
      .filter((i) => i.id !== activeId && containerOf(i.id) === targetContainer)
      .map((i) => i.id)
    let insertIdx: number
    if (overId === activeId || overId === '__top__' || overId.startsWith('g:')) {
      // Дроп на собственное превью или пустую зону — позиция уже отражена в
      // displayItems (расставлена onDragOver'ом), берём её.
      const cur = displayItems
        .filter((i) => containerOf(i.id) === targetContainer)
        .findIndex((i) => i.id === activeId)
      insertIdx = cur >= 0 ? cur : targetIds.length
    } else {
      insertIdx = targetIds.indexOf(overId)
      if (insertIdx < 0) insertIdx = targetIds.length
    }
    targetIds.splice(insertIdx, 0, activeId)
    // Сменить группу, если поменялась (сравниваем с СЕРВЕРНОЙ группой, не с
    // превью-override). Если мутация упала — снимаем превью, элемент вернётся.
    const curGroup = realGroupIdOfItem(activeItem)
    if (curGroup !== targetGroupId) {
      const assign =
        activeItem.kind === 'task'
          ? assignThreadToGroup(activeId, targetGroupId)
          : assignBlockToGroup(activeId, targetGroupId)
      assign.catch(() => setDragOverride(null))
    }
    persistReorderSubset(targetIds)
  }

  const handleAddTaskToGroup = async (groupId: string) => {
    const thread = await createTask.mutateAsync({
      name: 'Новая задача',
      accessType: 'all',
      type: 'task',
      ...(workspace?.default_task_accent && { accentColor: workspace.default_task_accent as ThreadAccentColor }),
      ...(workspace?.default_task_icon && { icon: workspace.default_task_icon }),
    })
    // Порядок = конец этой группы.
    const childSorts = [
      ...tasks.filter((t) => (threadGroupMap?.[t.id] ?? null) === groupId).map((t) => t.sort_order ?? 0),
      ...blocks.filter((b) => (b.group_id ?? null) === groupId).map((b) => b.sort_order),
    ]
    const nextSort = childSorts.length ? Math.max(...childSorts) + 10 : 0
    onReorderTasks([{ id: thread.id, sort_order: nextSort }])
    await assignThreadToGroup(thread.id, groupId)
    onOpenTask(thread.id)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Коллизии по типу перетаскиваемого: группа целится ТОЛЬКО в другие группы
  // ('grp:'), строка — только в строки/зоны (grp-сортablы исключаем, иначе
  // closestCorners цепляла бы рамку группы вместо её содержимого).
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      if (!hasGroups) return closestCenter(args)
      const isGroupDrag = String(args.active.id).startsWith('grp:')
      const droppableContainers = args.droppableContainers.filter((c) =>
        isGroupDrag ? String(c.id).startsWith('grp:') : !String(c.id).startsWith('grp:'),
      )
      return isGroupDrag
        ? closestCenter({ ...args, droppableContainers })
        : closestCorners({ ...args, droppableContainers })
    },
    [hasGroups],
  )

  const handleDragEnd = (e: DragEndEvent) => {
    // В виде с группами DnD пока выключен (Фаза 4) — двухуровневый порядок
    // требует отдельной логики; плоский arrayMove здесь некорректен.
    if (hasGroups) return
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

  // Строка плана. `disabled` — выключить DnD (в виде с группами, до Фазы 4).
  const renderRow = (item: MergedItem, disabled?: boolean) => (
    <SortableRow
      key={item.id}
      item={item}
      canEdit={canEdit}
      sortableDisabled={disabled}
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
      onQuickAddHere={canEdit && !disabled ? () => setQuickAddAfterSort(item.sort) : undefined}
    />
  )

  const topLevelItems = hasGroups ? displayItems.filter((i) => groupIdOfItem(i) === null) : displayItems
  const childrenOfGroup = (gid: string) => displayItems.filter((i) => groupIdOfItem(i) === gid)
  // Клиенту (не-staff) скрытые группы не показываем ЦЕЛИКОМ — вместе с
  // содержимым (как visible_to_client у блоков; UI-фильтр, доступ к задачам
  // по-прежнему решает RLS).
  const sortedGroupsBase = [...groups]
    .filter((g) => canEdit || g.visible_to_client)
    .sort((a, b) => a.sort_order - b.sort_order)
  // Локальный порядок групп после drop'а (зеркало localOrder у строк).
  const sortedGroups = localGroupOrder
    ? [...sortedGroupsBase].sort(
        (a, b) => localGroupOrder.indexOf(a.id) - localGroupOrder.indexOf(b.id),
      )
    : sortedGroupsBase

  // Сбрасываем локальный порядок групп, когда серверный догнал.
  useEffect(() => {
    if (!localGroupOrder) return
    const serverIds = [...groups].sort((a, b) => a.sort_order - b.sort_order).map((g) => g.id)
    if (
      serverIds.length === localGroupOrder.length &&
      serverIds.every((id, i) => id === localGroupOrder[i])
    ) {
      setLocalGroupOrder(null)
    }
  }, [groups, localGroupOrder])

  return (
    <PlanDocsProvider projectId={projectId} workspaceId={workspaceId} enabled={hasSlotBlocks}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragOver={handleGroupedDragOver}
        onDragEnd={hasGroups ? handleGroupedDragEnd : handleDragEnd}
        onDragCancel={() => {
          setDragOverride(null)
          setLocalOrder(null)
        }}
      >
        <SortableContext items={displayItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {!hasGroups ? (
            // ── Вид без групп: как раньше, полноценный DnD ──
            <div className="flex flex-col [&>*:last-child]:border-b-0 [&>*:last-child_.border-b]:border-b-0">
              {displayItems.map((item) => renderRow(item))}
            </div>
          ) : (
            // ── Вид с группами: контейнеры групп + верхний уровень.
            //    DnD внутри и между группами (multi-container).
            <div className="group/planroot flex flex-col gap-1">
              <SortableContext items={topLevelItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <TopLevelDroppable>
                  {topLevelItems.map((item) => renderRow(item))}
                </TopLevelDroppable>
              </SortableContext>
              <SortableContext
                items={sortedGroups.map((g) => `grp:${g.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {sortedGroups.map((g, gi) => (
                  <PlanGroupContainer
                    key={g.id}
                    group={g}
                    canEdit={canEdit}
                    onRename={(name) => renameGroup(g.id, name)}
                    onToggleCollapse={() => setGroupCollapsed(g.id, !g.is_collapsed)}
                    onDelete={() => deleteGroup(g.id)}
                    onAddTask={() => handleAddTaskToGroup(g.id)}
                    onSetColor={(c) => setGroupColor(g.id, c)}
                    onToggleClientVisible={() => setGroupVisibleToClient(g.id, !g.visible_to_client)}
                    onMoveUp={gi > 0 ? () => moveGroup(g.id, 'up') : undefined}
                    onMoveDown={gi < sortedGroups.length - 1 ? () => moveGroup(g.id, 'down') : undefined}
                    renderChild={(item) => renderRow(item)}
                  >
                    {childrenOfGroup(g.id)}
                  </PlanGroupContainer>
                ))}
              </SortableContext>
            </div>
          )}
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
