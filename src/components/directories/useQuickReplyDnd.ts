/**
 * Drag & drop для дерева быстрых ответов.
 * Скопирован по паттерну useKnowledgeTreeDnd: статическое дерево,
 * голубая полоса показывает место вставки. Без SortableContext.
 */

import { useState, useCallback } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import type { useQuickRepliesPage } from '@/hooks/quick-replies/useQuickRepliesPage'
import type { QuickReply } from '@/hooks/quick-replies/useQuickReplies'

type PageReturn = ReturnType<typeof useQuickRepliesPage>

export const UNGROUPED_ID = '__ungrouped__'
export const GROUP_DROP_PREFIX = 'group:'

export type DropIndicatorState = {
  replyId: string
  position: 'top' | 'bottom'
}

export function useQuickReplyDnd(page: PageReturn) {
  const [activeReply, setActiveReply] = useState<QuickReply | null>(null)
  const [overGroupId, setOverGroupId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const getReplyGroupId = useCallback(
    (replyId: string): string | null => {
      const r = page.replies.find((x) => x.id === replyId)
      return r?.group_id ?? null
    },
    [page.replies],
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const reply = page.replies.find((r) => r.id === event.active.id) ?? null
      setActiveReply(reply)
    },
    [page.replies],
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over, active } = event
      if (!over || !active) {
        setOverGroupId(null)
        setDropIndicator(null)
        return
      }

      const overId = String(over.id)
      const activeId = String(active.id)

      // Drop на заголовок группы или в ungrouped-зону
      if (overId.startsWith(GROUP_DROP_PREFIX) || overId === UNGROUPED_ID) {
        setOverGroupId(
          overId === UNGROUPED_ID ? UNGROUPED_ID : overId.slice(GROUP_DROP_PREFIX.length),
        )
        setDropIndicator(null)
        return
      }

      // Drop на другую реплику — вычисляем top/bottom
      if (overId !== activeId) {
        const overRect = over.rect
        if (overRect) {
          const pointerY = (event.activatorEvent as PointerEvent)?.clientY
          const deltaY = event.delta?.y ?? 0
          const currentY = pointerY != null ? pointerY + deltaY : 0
          const midY = overRect.top + overRect.height / 2
          const position: 'top' | 'bottom' = currentY < midY ? 'top' : 'bottom'

          setDropIndicator({ replyId: overId, position })
          const targetGroupId = getReplyGroupId(overId)
          setOverGroupId(targetGroupId ?? UNGROUPED_ID)
        }
      } else {
        setDropIndicator(null)
        setOverGroupId(null)
      }
    },
    [getReplyGroupId],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentDropIndicator = dropIndicator
      setActiveReply(null)
      setOverGroupId(null)
      setDropIndicator(null)

      const { active, over } = event
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)
      const fromGroupId = getReplyGroupId(activeId)

      const buildList = (gid: string | null, excludeMoved = true) =>
        page.replies
          .filter((r) => (r.group_id ?? null) === gid && (!excludeMoved || r.id !== activeId))
          .sort((a, b) => a.order_index - b.order_index)
          .map((r) => r.id)

      // Drop в ungrouped-зону
      if (overId === UNGROUPED_ID) {
        if (fromGroupId === null) return
        const sourceOrdered = buildList(fromGroupId)
        const targetOrdered = [...buildList(null), activeId]
        page.moveReplyMutation.mutate({
          replyId: activeId,
          newGroupId: null,
          sourceOrderedIds: sourceOrdered,
          targetOrderedIds: targetOrdered,
        })
        return
      }

      // Drop на заголовок группы
      if (overId.startsWith(GROUP_DROP_PREFIX)) {
        const toGroupId = overId.slice(GROUP_DROP_PREFIX.length)
        if (fromGroupId === toGroupId) return
        const sourceOrdered = buildList(fromGroupId)
        const targetOrdered = [...buildList(toGroupId), activeId]
        page.moveReplyMutation.mutate({
          replyId: activeId,
          newGroupId: toGroupId,
          sourceOrderedIds: sourceOrdered,
          targetOrderedIds: targetOrdered,
        })
        return
      }

      // Drop на другую реплику
      if (activeId === overId) return
      const toGroupId = getReplyGroupId(overId)

      // Перенос между разными группами
      if (fromGroupId !== toGroupId) {
        const sourceOrdered = buildList(fromGroupId)
        const targetList = buildList(toGroupId)
        const idx = targetList.indexOf(overId)
        const insertIdx =
          idx === -1
            ? targetList.length
            : currentDropIndicator?.position === 'bottom'
              ? idx + 1
              : idx
        const targetOrdered = [
          ...targetList.slice(0, insertIdx),
          activeId,
          ...targetList.slice(insertIdx),
        ]
        page.moveReplyMutation.mutate({
          replyId: activeId,
          newGroupId: toGroupId,
          sourceOrderedIds: sourceOrdered,
          targetOrderedIds: targetOrdered,
        })
        return
      }

      // Перестановка внутри одной группы
      const list = buildList(fromGroupId)
      const idx = list.indexOf(overId)
      if (idx === -1) return
      const insertIdx = currentDropIndicator?.position === 'bottom' ? idx + 1 : idx
      const newOrder = [...list.slice(0, insertIdx), activeId, ...list.slice(insertIdx)]
      page.reorderRepliesMutation.mutate({
        groupId: fromGroupId ?? '',
        replyIds: newOrder,
      })
    },
    [dropIndicator, getReplyGroupId, page],
  )

  const handleDragCancel = useCallback(() => {
    setActiveReply(null)
    setOverGroupId(null)
    setDropIndicator(null)
  }, [])

  return {
    sensors,
    activeReply,
    overGroupId,
    dropIndicator,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
