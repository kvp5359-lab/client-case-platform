/**
 * Pure-логика для drag-end списков на доске: расчёт обновлений
 * column_index/sort_order при перемещении списка в другую колонку,
 * в зазор между колонками, или внутри той же колонки.
 */

import type { BoardList } from '../types'

export type ListUpdate = { id: string; column_index: number; sort_order: number }

export type ListDropInputs = {
  dragged: BoardList
  lists: BoardList[]
  gapTarget: number | null
  dropIndicator: { overListId: string; position: 'top' | 'bottom' } | null
  overId: string
}

/** Дроп в зазор между колонками — создаём новую колонку. */
export function planGapDrop(dragged: BoardList, lists: BoardList[], gap: number): ListUpdate[] {
  const updates: ListUpdate[] = []
  for (const l of lists) {
    if (l.id === dragged.id) continue
    if (l.column_index >= gap) {
      updates.push({ id: l.id, column_index: l.column_index + 1, sort_order: l.sort_order })
    }
  }
  const sourceColLists = lists
    .filter((l) => l.column_index === dragged.column_index && l.id !== dragged.id)
    .sort((a, b) => a.sort_order - b.sort_order)
  sourceColLists.forEach((l, i) => {
    const newSort = i * 10
    const existing = updates.find((u) => u.id === l.id)
    const newColIdx = dragged.column_index >= gap ? dragged.column_index + 1 : dragged.column_index
    if (existing) {
      existing.sort_order = newSort
    } else if (l.sort_order !== newSort) {
      updates.push({ id: l.id, column_index: newColIdx, sort_order: newSort })
    }
  })
  updates.push({ id: dragged.id, column_index: gap, sort_order: 0 })
  return updates
}

/** Дроп на список или в колонку (стандартное перемещение). */
export function planListMove({ dragged, lists, dropIndicator, overId }: Omit<ListDropInputs, 'gapTarget'>): ListUpdate[] {
  let targetColumnIndex: number
  let insertBeforeListId: string | null = null

  if (dropIndicator && dropIndicator.overListId) {
    const overList = lists.find((l) => l.id === dropIndicator.overListId)
    if (!overList) return []
    targetColumnIndex = overList.column_index
    const targetColLists = lists
      .filter((l) => l.column_index === targetColumnIndex && l.id !== dragged.id)
      .sort((a, b) => a.sort_order - b.sort_order)
    const overIdx = targetColLists.findIndex((l) => l.id === dropIndicator.overListId)
    if (overIdx === -1) return []
    const insertIdx = dropIndicator.position === 'bottom' ? overIdx + 1 : overIdx
    insertBeforeListId = targetColLists[insertIdx]?.id ?? null
  } else if (overId.startsWith('col-drop:')) {
    targetColumnIndex = parseInt(overId.slice('col-drop:'.length), 10)
    insertBeforeListId = null
  } else {
    return []
  }

  const sourceColumnIndex = dragged.column_index
  const sourceColLists = lists
    .filter((l) => l.column_index === sourceColumnIndex && l.id !== dragged.id)
    .sort((a, b) => a.sort_order - b.sort_order)
  const targetColListsRaw = targetColumnIndex === sourceColumnIndex
    ? sourceColLists
    : lists
        .filter((l) => l.column_index === targetColumnIndex && l.id !== dragged.id)
        .sort((a, b) => a.sort_order - b.sort_order)

  const insertIdx = insertBeforeListId
    ? targetColListsRaw.findIndex((l) => l.id === insertBeforeListId)
    : targetColListsRaw.length
  const newTargetCol = [
    ...targetColListsRaw.slice(0, insertIdx),
    dragged,
    ...targetColListsRaw.slice(insertIdx),
  ]

  const sameColumn = sourceColumnIndex === targetColumnIndex
  if (sameColumn) {
    const before = lists
      .filter((l) => l.column_index === targetColumnIndex)
      .sort((a, b) => a.sort_order - b.sort_order)
    const same = before.length === newTargetCol.length && before.every((l, i) => l.id === newTargetCol[i].id)
    if (same) return []
  }

  const updates: ListUpdate[] = []
  newTargetCol.forEach((l, i) => {
    const newSort = i * 10
    if (l.column_index !== targetColumnIndex || l.sort_order !== newSort) {
      updates.push({ id: l.id, column_index: targetColumnIndex, sort_order: newSort })
    }
  })
  if (!sameColumn) {
    sourceColLists.forEach((l, i) => {
      const newSort = i * 10
      if (l.sort_order !== newSort) {
        updates.push({ id: l.id, column_index: sourceColumnIndex, sort_order: newSort })
      }
    })
  }

  return updates
}
