/**
 * Pure-анализ drag-over события — что подсветить. Возвращает discriminated
 * union, BoardView применяет его через setState.
 */

import type { DragOverEvent } from '@dnd-kit/core'
import type { BoardItemType } from '../hooks/useBoardListItemOrders'
import type { CardDrag, RowDropIndicator } from './cardDragHandlers'

export type CardOverState = {
  type: 'card'
  isOverCalendar: boolean
  rowDropIndicator: RowDropIndicator | null
  overCardTarget: string | null
}

export type ListOverState = {
  type: 'list'
  dropIndicator: { overListId: string; position: 'top' | 'bottom' } | null
  overColumnIndex: number | null
  gapTarget: number | null
}

export type DragOverState = CardOverState | ListOverState

function pointerY(e: DragOverEvent): number {
  if (!e.activatorEvent) return 0
  return (e.activatorEvent as PointerEvent).clientY + (e.delta?.y ?? 0)
}

function analyzeCardOver(e: DragOverEvent, activeCard: CardDrag | null): CardOverState {
  const { over } = e
  const overId = over ? String(over.id) : null
  const isOverCalendar = !!overId && overId.startsWith('calendar-drop:')

  if (overId && (overId.startsWith('task-row:') || overId.startsWith('project-row:'))) {
    const kind: BoardItemType = overId.startsWith('task-row:') ? 'thread' : 'project'
    const prefix = kind === 'thread' ? 'task-row:' : 'project-row:'
    const rest = overId.slice(prefix.length)
    const sepIdx = rest.indexOf(':')
    if (sepIdx !== -1) {
      const itemId = rest.slice(0, sepIdx)
      const listId = rest.slice(sepIdx + 1)
      const draggedId = activeCard
        ? activeCard.kind === 'task' ? activeCard.task.id : activeCard.project.id
        : null
      if (draggedId === itemId) {
        return { type: 'card', isOverCalendar, rowDropIndicator: null, overCardTarget: null }
      }
      const overRect = over!.rect
      const midY = overRect.top + overRect.height / 2
      return {
        type: 'card',
        isOverCalendar,
        rowDropIndicator: {
          kind,
          listId,
          itemId,
          position: pointerY(e) < midY ? 'top' : 'bottom',
        },
        overCardTarget: null,
      }
    }
  }

  const overCardTarget =
    overId && (overId.startsWith('group:') || overId.startsWith('list-cards:')) ? overId : null
  return { type: 'card', isOverCalendar, rowDropIndicator: null, overCardTarget }
}

function analyzeListOver(e: DragOverEvent): ListOverState {
  const { over } = e
  if (!over) {
    return { type: 'list', dropIndicator: null, overColumnIndex: null, gapTarget: null }
  }
  const overId = String(over.id)
  if (overId.startsWith('gap-drop:')) {
    return {
      type: 'list',
      dropIndicator: null,
      overColumnIndex: null,
      gapTarget: parseInt(overId.slice('gap-drop:'.length), 10),
    }
  }
  if (overId.startsWith('list-drop:')) {
    const overListId = overId.slice('list-drop:'.length)
    const overRect = over.rect
    const midY = overRect.top + overRect.height / 2
    const colIdx = (over.data.current as { columnIndex?: number } | undefined)?.columnIndex
    return {
      type: 'list',
      dropIndicator: { overListId, position: pointerY(e) < midY ? 'top' : 'bottom' },
      overColumnIndex: typeof colIdx === 'number' ? colIdx : null,
      gapTarget: null,
    }
  }
  if (overId.startsWith('col-drop:')) {
    return {
      type: 'list',
      dropIndicator: null,
      overColumnIndex: parseInt(overId.slice('col-drop:'.length), 10),
      gapTarget: null,
    }
  }
  return { type: 'list', dropIndicator: null, overColumnIndex: null, gapTarget: null }
}

export function analyzeDragOver(e: DragOverEvent, activeCard: CardDrag | null): DragOverState {
  const activeId = e.active ? String(e.active.id) : ''
  const isCardDrag = activeId.startsWith('task:') || activeId.startsWith('project:')
  return isCardDrag ? analyzeCardOver(e, activeCard) : analyzeListOver(e)
}
