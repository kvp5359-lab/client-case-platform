/**
 * Pure-логика для drag-end карточек на доске. Декларативно описывает,
 * какое действие должен выполнить BoardView в зависимости от состояния
 * drag (sourceList, target, indicator).
 *
 * Возвращает объект-действие; сам по себе никаких мутаций не делает.
 */

import { extractStatusIdFromFilter, statusEquals } from '../cardDndUtils'
import type { BoardList } from '../types'
import type { BoardItemType } from '../hooks/useBoardListItemOrders'
import type { BoardProject } from '../hooks/useWorkspaceProjects'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

export type CardDrag =
  | { kind: 'project'; project: BoardProject; sourceListId: string }
  | { kind: 'task'; task: WorkspaceTask; sourceListId: string }

export type RowDropIndicator = {
  kind: BoardItemType
  listId: string
  itemId: string
  position: 'top' | 'bottom'
}

export type CardDropAction =
  | { type: 'reorder'; listId: string; itemType: BoardItemType; itemIds: string[]; flashKind: BoardItemType; flashId: string }
  | { type: 'change_project_status'; projectId: string; statusId: string | null }
  | { type: 'change_task_status'; taskId: string; statusId: string | null }
  | { type: 'noop' }

type ReorderInputs = {
  card: CardDrag
  rowInd: RowDropIndicator
  lists: BoardList[]
  currentIds: string[]
}

export function planManualReorder({ card, rowInd, lists, currentIds }: ReorderInputs): CardDropAction {
  if (rowInd.listId !== card.sourceListId) return { type: 'noop' }
  const sourceList = lists.find((l) => l.id === rowInd.listId)
  if (!sourceList || sourceList.sort_by !== 'manual_order') return { type: 'noop' }
  const itemType: BoardItemType = card.kind === 'project' ? 'project' : 'thread'
  if ((rowInd.kind === 'project') !== (itemType === 'project')) return { type: 'noop' }
  const draggedId = card.kind === 'project' ? card.project.id : card.task.id
  if (rowInd.itemId === draggedId) return { type: 'noop' }

  if (currentIds.length === 0) return { type: 'noop' }
  const without = currentIds.filter((id) => id !== draggedId)
  const targetIdx = without.indexOf(rowInd.itemId)
  if (targetIdx === -1) return { type: 'noop' }
  const insertIdx = rowInd.position === 'bottom' ? targetIdx + 1 : targetIdx
  const newIds = [...without.slice(0, insertIdx), draggedId, ...without.slice(insertIdx)]
  if (
    newIds.length === currentIds.length &&
    newIds.every((id, i) => id === currentIds[i])
  ) {
    return { type: 'noop' }
  }
  return {
    type: 'reorder',
    listId: rowInd.listId,
    itemType,
    itemIds: newIds,
    flashKind: itemType,
    flashId: draggedId,
  }
}

export function planStatusChange(card: CardDrag, newStatusId: string | null): CardDropAction {
  if (card.kind === 'project') {
    if (statusEquals(card.project.status_id, newStatusId)) return { type: 'noop' }
    return { type: 'change_project_status', projectId: card.project.id, statusId: newStatusId }
  }
  if (statusEquals(card.task.status_id, newStatusId)) return { type: 'noop' }
  return { type: 'change_task_status', taskId: card.task.id, statusId: newStatusId }
}

export function planListCardsDrop(card: CardDrag, targetListId: string, lists: BoardList[]): CardDropAction {
  if (targetListId === card.sourceListId) return { type: 'noop' }
  const targetList = lists.find((l) => l.id === targetListId)
  if (!targetList) return { type: 'noop' }
  // filters — jsonb-колонка (Json); extractStatusIdFromFilter ждёт FilterGroup, читает лишь status_id
  const newStatusId = extractStatusIdFromFilter(targetList.filters as never)
  if (newStatusId === null) return { type: 'noop' }
  return planStatusChange(card, newStatusId)
}

export function planGroupDrop(card: CardDrag, target: string): CardDropAction {
  const rest = target.slice('group:'.length)
  const sep = rest.indexOf(':')
  if (sep === -1) return { type: 'noop' }
  const targetListIdInGroup = rest.slice(0, sep)
  const targetGroupKey = rest.slice(sep + 1)
  if (targetListIdInGroup !== card.sourceListId) return { type: 'noop' }
  const newStatusId = targetGroupKey === '__none__' ? null : targetGroupKey
  return planStatusChange(card, newStatusId)
}
