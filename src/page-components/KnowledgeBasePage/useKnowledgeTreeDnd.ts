/**
 * Z5-05: Drag & drop логика для KnowledgeTreeView, вынесенная из 611-строчного файла.
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
import type { useKnowledgeBasePage, KnowledgeArticle } from './useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

const UNGROUPED_ID = '__ungrouped__'

export interface DropIndicatorState {
  articleId: string
  position: 'top' | 'bottom'
}

export { UNGROUPED_ID }

export function useKnowledgeTreeDnd(page: PageReturn) {
  const [activeArticle, setActiveArticle] = useState<KnowledgeArticle | null>(null)
  const [overGroupId, setOverGroupId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const getArticleGroupId = useCallback(
    (articleId: string): string | null => {
      const article = page.articles.find((a) => a.id === articleId)
      if (!article || article.knowledge_article_groups.length === 0) return null
      return article.knowledge_article_groups[0].group_id
    },
    [page.articles],
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const article = page.articles.find((a) => a.id === event.active.id)
      setActiveArticle(article || null)
    },
    [page.articles],
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

      if (overId.startsWith('group:') || overId === UNGROUPED_ID) {
        setOverGroupId(overId === UNGROUPED_ID ? UNGROUPED_ID : overId.slice(6))
        setDropIndicator(null)
        return
      }

      if (overId !== activeId) {
        const overRect = over.rect
        if (overRect) {
          const pointerY = (event.activatorEvent as PointerEvent)?.clientY
          const deltaY = event.delta?.y ?? 0
          const currentY = pointerY != null ? pointerY + deltaY : 0
          const midY = overRect.top + overRect.height / 2
          const position: 'top' | 'bottom' = currentY < midY ? 'top' : 'bottom'

          setDropIndicator({ articleId: overId, position })
          const targetGroupId = getArticleGroupId(overId)
          setOverGroupId(targetGroupId)
        }
      } else {
        setDropIndicator(null)
        setOverGroupId(null)
      }
    },
    [getArticleGroupId],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentDropIndicator = dropIndicator
      setActiveArticle(null)
      setOverGroupId(null)
      setDropIndicator(null)

      const { active, over } = event
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)
      const fromGroupId = getArticleGroupId(activeId)

      // Dropping on "ungrouped" zone
      if (overId === UNGROUPED_ID) {
        if (fromGroupId) {
          page.moveArticleToGroupMutation.mutate({
            articleId: activeId,
            fromGroupId,
            toGroupId: null,
          })
        }
        return
      }

      // Dropping on a group header
      if (overId.startsWith('group:')) {
        const toGroupId = overId.slice(6)
        if (fromGroupId !== toGroupId) {
          page.moveArticleToGroupMutation.mutate({
            articleId: activeId,
            fromGroupId,
            toGroupId,
          })
        }
        return
      }

      // Dropping on another article
      if (activeId === overId) return

      const toGroupId = getArticleGroupId(overId)

      // Moving between different groups
      if (toGroupId && fromGroupId !== toGroupId) {
        page.moveArticleToGroupMutation.mutate(
          { articleId: activeId, fromGroupId, toGroupId },
          {
            onSuccess: () => {
              if (currentDropIndicator) {
                const articles = page.getArticlesForGroup(toGroupId)
                const targetIdx = articles.findIndex((a) => a.id === overId)
                if (targetIdx !== -1) {
                  const insertIdx =
                    currentDropIndicator.position === 'bottom' ? targetIdx + 1 : targetIdx
                  const filtered = articles.filter((a) => a.id !== activeId)
                  const newOrder = [
                    ...filtered.slice(0, insertIdx),
                    { id: activeId },
                    ...filtered.slice(insertIdx),
                  ]
                  page.reorderArticlesMutation.mutate({
                    groupId: toGroupId,
                    articleIds: newOrder.map((a) => a.id),
                  })
                }
              }
            },
          },
        )
        return
      }

      // Reorder within the same group
      if (toGroupId && fromGroupId === toGroupId && currentDropIndicator) {
        const articles = page.getArticlesForGroup(toGroupId)
        const fromIdx = articles.findIndex((a) => a.id === activeId)
        const toIdx = articles.findIndex((a) => a.id === overId)
        if (fromIdx === -1 || toIdx === -1) return

        const filtered = articles.filter((a) => a.id !== activeId)
        const adjustedToIdx = filtered.findIndex((a) => a.id === overId)
        if (adjustedToIdx === -1) return

        const insertIdx =
          currentDropIndicator.position === 'bottom' ? adjustedToIdx + 1 : adjustedToIdx

        const newOrder = [
          ...filtered.slice(0, insertIdx),
          articles[fromIdx],
          ...filtered.slice(insertIdx),
        ]

        page.reorderArticlesMutation.mutate({
          groupId: toGroupId,
          articleIds: newOrder.map((a) => a.id),
        })
      }
    },
    [getArticleGroupId, page, dropIndicator],
  )

  const handleDragCancel = useCallback(() => {
    setActiveArticle(null)
    setOverGroupId(null)
    setDropIndicator(null)
  }, [])

  return {
    sensors,
    activeArticle,
    overGroupId,
    dropIndicator,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
