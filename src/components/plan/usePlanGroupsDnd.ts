"use client"

/**
 * Вся DnD-логика плана проекта (вынесена из ProjectFlatPlanList):
 *
 * - плоский вид (без групп): reorder строк одним arrayMove;
 * - вид с группами: multi-container DnD строк (внутри группы, между группами,
 *   на верхний уровень) + перетаскивание САМИХ групп (sortable 'grp:<id>');
 * - живое превью (onDragOver): элемент локально переносится в целевой
 *   контейнер ДО отпускания мыши (dragOverride + localOrder);
 * - синхронная фиксация порядка на drop (localOrder / localGroupOrder —
 *   кэш React Query недостаточно синхронен, иначе отскок строки), сброс
 *   когда серверные данные догнали превью;
 * - collision-стратегия по типу active: группа целится только в группы,
 *   строка — только в строки/зоны.
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

  // Локальный перенос перетаскиваемого элемента в целевую группу ВО ВРЕМЯ
  // drag'а (onDragOver) — иначе превью «внутри группы» появляется только
  // после отпускания мыши. Держится и после drop'а, пока сервер (карта
  // membership / блоки) не подтвердит новую группу — без мигания назад.
  const [dragOverride, setDragOverride] = useState<{ id: string; group: string | null } | null>(null)
  // Локальный порядок СТРОК для dnd: dnd-kit требует, чтобы новый порядок
  // применялся СИНХРОННО в onDragEnd (как канонический setItems(arrayMove)).
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  // Локальный порядок ГРУПП после их перетаскивания (id по порядку).
  const [localGroupOrder, setLocalGroupOrder] = useState<string[] | null>(null)

  const realGroupIdOfItem = (item: MergedItem): string | null =>
    item.kind === 'task'
      ? (threadGroupMap?.[item.id] ?? null)
      : (blockGroupById.get(item.id) ?? null)

  const groupIdOfItem = (item: MergedItem): string | null =>
    dragOverride && dragOverride.id === item.id ? dragOverride.group : realGroupIdOfItem(item)

  // Сбрасываем override, когда серверные данные догнали превью (или элемент пропал).
  // setState — во вложенной функции (конвенция проекта под react-hooks/set-state-in-effect).
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

  // Сбрасываем локальный порядок строк, когда серверный догнал.
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
    const sync = () => {
      if (!localGroupOrder) return
      const serverIds = [...groups].sort((a, b) => a.sort_order - b.sort_order).map((g) => g.id)
      if (
        serverIds.length === localGroupOrder.length &&
        serverIds.every((id, i) => id === localGroupOrder[i])
      ) {
        setLocalGroupOrder(null)
      }
    }
    sync()
  }, [groups, localGroupOrder])

  const itemById = useMemo(() => new Map(displayItems.map((i) => [i.id, i])), [displayItems])

  const topLevelItems = hasGroups
    ? displayItems.filter((i) => groupIdOfItem(i) === null)
    : displayItems
  const childrenOfGroup = (gid: string) => displayItems.filter((i) => groupIdOfItem(i) === gid)

  const containerOf = (itemId: string): string => {
    const it = itemById.get(itemId)
    if (!it) return '__top__'
    const g = groupIdOfItem(it)
    return g ? `g:${g}` : '__top__'
  }

  const persistReorderSubset = (orderedIds: string[]) => {
    const taskU: SortUpdate[] = []
    const blockU: SortUpdate[] = []
    orderedIds.forEach((id, idx) => {
      const so = idx * 10
      if (itemById.get(id)?.kind === 'task') taskU.push({ id, sort_order: so })
      else blockU.push({ id, sort_order: so })
    })
    if (taskU.length) onReorderTasks(taskU)
    if (blockU.length) void setBlockOrders(blockU)
  }

  // Живое превью: при наведении на другой контейнер локально переносим active
  // туда (override группы + позиция в localOrder) — элемент виден внутри
  // группы ДО отпускания мыши. Коммит в БД — в onDragEnd.
  const handleDragOver = (e: DragOverEvent) => {
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

  // Плоский вид (без групп): reorder всего списка одним arrayMove.
  const handleFlatDragEnd = (e: DragEndEvent) => {
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
    persistReorderSubset(newIds)
  }

  const handleDragEnd = (e: DragEndEvent) =>
    hasGroups ? handleGroupedDragEnd(e) : handleFlatDragEnd(e)

  const handleDragCancel = () => {
    setDragOverride(null)
    setLocalOrder(null)
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

  return {
    hasGroups,
    displayItems,
    topLevelItems,
    childrenOfGroup,
    sortedGroups,
    sensors,
    collisionDetection,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
