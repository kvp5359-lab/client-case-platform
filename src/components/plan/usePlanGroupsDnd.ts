"use client"

/**
 * Вся DnD-логика плана проекта (вынесена из ProjectFlatPlanList).
 *
 * Модель порядка (единая шкала — см. миграцию 20260705180000):
 * - ВЕРХНИЙ УРОВЕНЬ — одна последовательность из одиночных строк (group_id NULL)
 *   и ГРУПП, вперемешку по общей sort_order. Поэтому группу можно перетащить
 *   между одиночными задачами.
 * - ДЕТИ ГРУППЫ — своя внутригрупповая последовательность (sort_order среди
 *   строк этой группы).
 *
 * Персистенция после ЛЮБОГО drop — через `persistLayout`: одиночные строки и
 * группы нумеруются idx*10 по верхнему уровню, дети — idx*10 внутри группы.
 * Это исключает дрейф двух шкал.
 *
 * Плоский вид (без групп) — прежний одиночный arrayMove.
 *
 * Хук колокейтед с фичей (тянет MergedItem из ./planTypes) — в общий слой
 * src/hooks/ его не выносить, тот не должен зависеть от components/.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PointerSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { TaskGroupRow } from '@/types/taskGroups'
import type { MergedItem } from './planTypes'

type SortUpdate = { id: string; sort_order: number }

/** Элемент верхнего уровня: одиночная строка ИЛИ группа. */
export type TopEntry =
  | { kind: 'item'; id: string; item: MergedItem }
  | { kind: 'group'; id: string; group: TaskGroupRow }

const GRP = 'grp:'
const isGroupId = (id: string) => id.startsWith(GRP)

type UsePlanGroupsDndInput = {
  /** Элементы плана в серверном порядке (уже отфильтрованные по видимости). */
  visibleMerged: MergedItem[]
  groups: TaskGroupRow[]
  /** Карта «задача → группа» (useProjectThreadGroupMap). */
  threadGroupMap: Record<string, string | null> | undefined
  /** Карта «блок плана → группа» (по blocks из useProjectPlan). */
  blockGroupById: Map<string, string | null>
  canEdit: boolean
  onReorderTasks: (updates: SortUpdate[]) => void
  setBlockOrders: (updates: SortUpdate[]) => Promise<unknown>
  assignThreadToGroup: (threadId: string, groupId: string | null) => Promise<unknown>
  assignBlockToGroup: (blockId: string, groupId: string | null) => Promise<unknown>
  setGroupOrders: (updates: SortUpdate[]) => Promise<unknown>
}

export function usePlanGroupsDnd({
  visibleMerged,
  groups,
  threadGroupMap,
  blockGroupById,
  canEdit,
  onReorderTasks,
  setBlockOrders,
  assignThreadToGroup,
  assignBlockToGroup,
  setGroupOrders,
}: UsePlanGroupsDndInput) {
  const hasGroups = groups.length > 0

  // Живой перенос строки в другой контейнер во время drag'а (onDragOver): id +
  // целевая группа. Держится и после drop'а до подтверждения сервером.
  const [dragOverride, setDragOverride] = useState<{ id: string; group: string | null } | null>(null)
  // Локальный порядок СТРОК (dnd-kit требует синхронного применения на drop).
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  // Локальный порядок ВЕРХНЕГО УРОВНЯ (id одиночных строк + 'grp:<id>').
  const [localTopOrder, setLocalTopOrder] = useState<string[] | null>(null)

  const realGroupIdOfItem = (item: MergedItem): string | null =>
    item.kind === 'task'
      ? (threadGroupMap?.[item.id] ?? null)
      : (blockGroupById.get(item.id) ?? null)

  const groupIdOfItem = (item: MergedItem): string | null =>
    dragOverride && dragOverride.id === item.id ? dragOverride.group : realGroupIdOfItem(item)

  // Сброс override, когда серверные данные догнали превью.
  useEffect(() => {
    const sync = () => {
      if (!dragOverride) return
      const isTask = dragOverride.id in (threadGroupMap ?? {})
      const real = isTask
        ? (threadGroupMap?.[dragOverride.id] ?? null)
        : (blockGroupById.get(dragOverride.id) ?? null)
      if (real === dragOverride.group) setDragOverride(null)
    }
    sync()
  }, [threadGroupMap, blockGroupById, dragOverride])

  const displayItems = useMemo(() => {
    if (!localOrder) return visibleMerged
    const byId = new Map(visibleMerged.map((i) => [i.id, i]))
    const ordered = localOrder.map((id) => byId.get(id)).filter((x): x is MergedItem => !!x)
    const known = new Set(localOrder)
    const extra = visibleMerged.filter((i) => !known.has(i.id))
    return [...ordered, ...extra]
  }, [visibleMerged, localOrder])

  useEffect(() => {
    const sync = () => {
      if (!localOrder) return
      const ids = visibleMerged.map((i) => i.id)
      if (ids.length === localOrder.length && ids.every((id, i) => id === localOrder[i])) {
        setLocalOrder(null)
      }
    }
    sync()
  }, [visibleMerged, localOrder])

  const itemById = useMemo(() => new Map(displayItems.map((i) => [i.id, i])), [displayItems])

  const childrenOfGroup = (gid: string) => displayItems.filter((i) => groupIdOfItem(i) === gid)

  // Видимые группы в серверном порядке (клиенту скрытые не показываем целиком).
  const visibleGroups = useMemo(
    () =>
      [...groups]
        .filter((g) => canEdit || g.visible_to_client)
        .sort((a, b) => a.sort_order - b.sort_order),
    [groups, canEdit],
  )

  // ── Верхний уровень: одиночные строки + группы, вперемешку по общей шкале ──
  const topLevelEntries = useMemo<TopEntry[]>(() => {
    const loose: { entry: TopEntry; sort: number }[] = displayItems
      .filter((i) => groupIdOfItem(i) === null)
      .map((i) => ({ entry: { kind: 'item', id: i.id, item: i } as TopEntry, sort: i.sort }))
    const grp: { entry: TopEntry; sort: number }[] = visibleGroups.map((g) => ({
      entry: { kind: 'group', id: `${GRP}${g.id}`, group: g } as TopEntry,
      sort: g.sort_order,
    }))
    // На равной sort — одиночная строка раньше группы (детерминированный tiebreak).
    const base = [...loose, ...grp].sort(
      (a, b) => a.sort - b.sort || (a.entry.kind === 'item' ? -1 : 1),
    )
    let entries = base.map((x) => x.entry)
    if (localTopOrder) {
      const byId = new Map(entries.map((e) => [e.id, e]))
      const ordered = localTopOrder.map((id) => byId.get(id)).filter((x): x is TopEntry => !!x)
      const known = new Set(localTopOrder)
      const extra = entries.filter((e) => !known.has(e.id))
      entries = [...ordered, ...extra]
    }
    return entries
    // groupIdOfItem зависит от dragOverride/карт — покрыто зависимостями.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayItems, visibleGroups, localTopOrder, dragOverride, threadGroupMap, blockGroupById])

  const topEntryIds = useMemo(() => topLevelEntries.map((e) => e.id), [topLevelEntries])

  // Сброс локального порядка верхнего уровня, когда серверный догнал.
  useEffect(() => {
    const sync = () => {
      if (!localTopOrder) return
      const looseSorted = displayItems
        .filter((i) => realGroupIdOfItem(i) === null)
        .map((i) => ({ id: i.id, sort: i.sort }))
      const grpSorted = [...visibleGroups].map((g) => ({ id: `${GRP}${g.id}`, sort: g.sort_order }))
      const serverIds = [...looseSorted, ...grpSorted]
        .sort((a, b) => a.sort - b.sort)
        .map((x) => x.id)
      if (
        serverIds.length === localTopOrder.length &&
        serverIds.every((id, i) => id === localTopOrder[i])
      ) {
        setLocalTopOrder(null)
      }
    }
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayItems, visibleGroups, localTopOrder])

  const containerOf = (itemId: string): string => {
    const it = itemById.get(itemId)
    if (!it) return '__top__'
    const g = groupIdOfItem(it)
    return g ? `g:${g}` : '__top__'
  }

  // ── Единая персистенция раскладки ──
  // rows — желаемый порядок ВСЕХ строк (loose + дети) с их группой;
  // topIds — желаемый порядок верхнего уровня (loose id + 'grp:<id>').
  // Loose-строки и группы нумеруются idx*10 по topIds; дети — idx*10 внутри группы.
  const persistLayout = (rows: { id: string; kind: MergedItem['kind']; group: string | null }[], topIds: string[]) => {
    const taskU: SortUpdate[] = []
    const blockU: SortUpdate[] = []
    const push = (id: string, kind: MergedItem['kind'], so: number) =>
      (kind === 'task' ? taskU : blockU).push({ id, sort_order: so })

    // Дети групп — по порядку внутри своей группы.
    const childCounter = new Map<string, number>()
    for (const r of rows) {
      if (r.group !== null) {
        const idx = childCounter.get(r.group) ?? 0
        childCounter.set(r.group, idx + 1)
        push(r.id, r.kind, idx * 10)
      }
    }
    // Верхний уровень — loose-строки и группы по topIds.
    const kindById = new Map(rows.map((r) => [r.id, r.kind]))
    const groupU: SortUpdate[] = []
    topIds.forEach((id, idx) => {
      const so = idx * 10
      if (isGroupId(id)) groupU.push({ id: id.slice(GRP.length), sort_order: so })
      else push(id, kindById.get(id) ?? 'task', so)
    })

    if (taskU.length) onReorderTasks(taskU)
    if (blockU.length) void setBlockOrders(blockU)
    if (groupU.length) void setGroupOrders(groupU)
  }

  const rowsFromDisplay = (
    order: MergedItem[],
    overrideId?: string,
    overrideGroup?: string | null,
  ) =>
    order.map((i) => ({
      id: i.id,
      kind: i.kind,
      group: i.id === overrideId ? (overrideGroup ?? null) : realGroupIdOfItem(i),
    }))

  // ── Живое превью строки при переносе в другой контейнер ──
  const handleDragOver = (e: DragOverEvent) => {
    if (!hasGroups) return
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    // Перетаскивание ГРУППЫ: живое превью — нативной стратегией верхнего уровня.
    if (isGroupId(activeId)) return
    const activeItem = itemById.get(activeId)
    if (!activeItem) return
    const targetContainer = overId === '__top__' || overId.startsWith('g:') ? overId : containerOf(overId)
    const targetGroupId = targetContainer.startsWith('g:') ? targetContainer.slice(2) : null
    if (groupIdOfItem(activeItem) === targetGroupId) return
    setDragOverride({ id: activeId, group: targetGroupId })
    // Позиция превью строки: перед over-строкой; в пустую зону — в конец контейнера.
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

    // ── 1. Перетаскивание ГРУППЫ среди верхнего уровня (между задачами) ──
    if (isGroupId(activeId)) {
      if (!over) {
        setLocalTopOrder(null)
        return
      }
      const overId = String(over.id)
      // Цель — элемент верхнего уровня (одиночная строка или другая группа).
      const from = topEntryIds.indexOf(activeId)
      const to = topEntryIds.indexOf(overId)
      // Группа целится только в верхний уровень (коллизии отфильтрованы). Если
      // over не элемент верхнего уровня — игнор.
      if (to < 0 || from < 0 || from === to) return
      const newTop = arrayMove(topEntryIds, from, to)
      setLocalTopOrder(newTop)
      persistLayout(rowsFromDisplay(displayItems), newTop)
      return
    }

    if (!over) {
      setDragOverride(null)
      setLocalOrder(null)
      return
    }
    const overId = String(over.id)
    const activeItem = itemById.get(activeId)
    if (!activeItem) return
    const targetContainer = overId === '__top__' || overId.startsWith('g:') ? overId : containerOf(overId)
    const targetGroupId = targetContainer.startsWith('g:') ? targetContainer.slice(2) : null

    // ── 2. Одиночная строка ↔ одиночная строка на верхнем уровне (реордер) ──
    const overIsTopEntry = topEntryIds.includes(overId)
    if (targetGroupId === null && overIsTopEntry && !isGroupId(overId)) {
      const from = topEntryIds.indexOf(activeId)
      const to = topEntryIds.indexOf(overId)
      if (from >= 0 && to >= 0 && from !== to) {
        const newTop = arrayMove(topEntryIds, from, to)
        setLocalTopOrder(newTop)
        const curGroup = realGroupIdOfItem(activeItem)
        if (curGroup !== null) {
          const assign =
            activeItem.kind === 'task'
              ? assignThreadToGroup(activeId, null)
              : assignBlockToGroup(activeId, null)
          assign.catch(() => setDragOverride(null))
        }
        persistLayout(rowsFromDisplay(displayItems, activeId, null), newTop)
        return
      }
    }

    // ── 3. Строка внутри/между группами (и выход на верхний уровень) ──
    // Новый порядок строк через arrayMove (ключ к «встать в самый низ»).
    const rowIds = displayItems.map((i) => i.id)
    let newRowIds: string[]
    if (overId === activeId || overId === '__top__' || overId.startsWith('g:')) {
      newRowIds = rowIds // позиция уже расставлена onDragOver'ом
    } else {
      const from = rowIds.indexOf(activeId)
      const to = rowIds.indexOf(overId)
      newRowIds = from >= 0 && to >= 0 ? arrayMove(rowIds, from, to) : rowIds
    }
    setLocalOrder(newRowIds)

    const curGroup = realGroupIdOfItem(activeItem)
    if (curGroup !== targetGroupId) {
      const assign =
        activeItem.kind === 'task'
          ? assignThreadToGroup(activeId, targetGroupId)
          : assignBlockToGroup(activeId, targetGroupId)
      assign.catch(() => setDragOverride(null))
    }

    // Верхний уровень: если строка теперь loose — вставить её id рядом с over;
    // если ушла в группу — убрать из верхнего уровня.
    let newTop = topEntryIds.filter((id) => id !== activeId)
    if (targetGroupId === null) {
      // Куда вставить: перед over-элементом верхнего уровня, иначе в конец.
      const overTopIdx = overIsTopEntry ? newTop.indexOf(overId) : -1
      if (overTopIdx >= 0) newTop.splice(overTopIdx, 0, activeId)
      else newTop = [...newTop, activeId]
    }
    setLocalTopOrder(newTop)

    const newRowsOrdered = newRowIds
      .map((id) => itemById.get(id))
      .filter((x): x is MergedItem => !!x)
    persistLayout(rowsFromDisplay(newRowsOrdered, activeId, targetGroupId), newTop)
  }

  // Плоский вид (без групп): reorder всего списка одним arrayMove.
  const handleFlatDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = displayItems.map((i) => i.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const newIds = arrayMove(ids, oldIndex, newIndex)
    setLocalOrder(newIds)
    const taskU: SortUpdate[] = []
    const blockU: SortUpdate[] = []
    newIds.forEach((id, idx) => {
      const it = itemById.get(id)
      if (it?.kind === 'task') taskU.push({ id, sort_order: idx * 10 })
      else blockU.push({ id, sort_order: idx * 10 })
    })
    if (taskU.length) onReorderTasks(taskU)
    if (blockU.length) void setBlockOrders(blockU)
  }

  const handleDragEnd = (e: DragEndEvent) =>
    hasGroups ? handleGroupedDragEnd(e) : handleFlatDragEnd(e)

  const handleDragCancel = () => {
    setDragOverride(null)
    setLocalOrder(null)
    setLocalTopOrder(null)
  }

  // Реордер верхнего уровня стрелками (кнопки в шапке группы): move entry ± 1.
  const moveTopEntry = (entryId: string, dir: 'up' | 'down') => {
    const idx = topEntryIds.indexOf(entryId)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (idx < 0 || swap < 0 || swap >= topEntryIds.length) return
    const newTop = arrayMove(topEntryIds, idx, swap)
    setLocalTopOrder(newTop)
    persistLayout(rowsFromDisplay(displayItems), newTop)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Коллизии по типу active: группа целится ТОЛЬКО в элементы верхнего уровня
  // (одиночные строки + группы), строка — только в строки/зоны (не в grp:).
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      if (!hasGroups) return closestCenter(args)
      const isGroupDrag = isGroupId(String(args.active.id))
      if (isGroupDrag) {
        const droppableContainers = args.droppableContainers.filter((c) =>
          topEntryIds.includes(String(c.id)),
        )
        return closestCenter({ ...args, droppableContainers })
      }
      const droppableContainers = args.droppableContainers.filter((c) => !isGroupId(String(c.id)))
      return closestCorners({ ...args, droppableContainers })
    },
    [hasGroups, topEntryIds],
  )

  return {
    hasGroups,
    displayItems,
    topLevelEntries,
    childrenOfGroup,
    sensors,
    collisionDetection,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    moveTopEntry,
  }
}
