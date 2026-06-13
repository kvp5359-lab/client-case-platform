"use client"

/**
 * CommentCountsContext — пакетная загрузка счётчиков комментариев для списков.
 *
 * Проблема (P5 перф-аудита): CommentBadge без пропа `count` грузит счётчик
 * ОТДЕЛЬНЫМ запросом на КАЖДУЮ строку (useCommentCounts([oneId]) — уникальный
 * queryKey на id, дедупа нет). Экран «Документы» с 90 доками/слотами/папками =
 * ~90 запросов при открытии. getCommentCounts давно умеет батч — его просто не
 * звали с полным списком.
 *
 * Решение: провайдер на корне списка грузит счётчики ОДНИМ запросом на каждый
 * тип сущности и отдаёт lookup. CommentBadge читает контекст; если провайдера
 * нет ИЛИ конкретный тип/id не входит в пакет — возвращает undefined, и бейдж
 * падает на собственный одиночный запрос (полная обратная совместимость для
 * форм/задач и любых одиночных мест без провайдера).
 */

import { createContext, useContext, useMemo } from 'react'
import { useCommentCounts } from '@/hooks/comments'
import type { CommentEntityType } from '@/types/comments'

/** undefined → этот провайдер сущность не батчит (CommentBadge сделает свой запрос). */
type CommentCountLookup = (entityType: CommentEntityType, entityId: string) => number | undefined

const CommentCountsContext = createContext<CommentCountLookup | null>(null)

/**
 * Возвращает счётчик из пакетного контекста, либо undefined, если контекста нет
 * или тип/id не управляются этим провайдером. Всегда вызывает useContext
 * (стабильный порядок хуков) — даже без провайдера.
 */
export function useBatchedCommentCount(
  entityType: CommentEntityType,
  entityId: string,
): number | undefined {
  const lookup = useContext(CommentCountsContext)
  return lookup ? lookup(entityType, entityId) : undefined
}

const EMPTY: string[] = []

export type CommentCountsProviderProps = {
  /** id сущностей по типу. Провайдер батчит три документных типа. */
  documentIds?: string[]
  folderIds?: string[]
  slotIds?: string[]
  children: React.ReactNode
}

/**
 * Грузит счётчики комментариев пакетом (по одному запросу на тип) и раздаёт
 * через контекст. Массивы id должны быть мемоизированы у вызывающего — иначе
 * queryKey меняется каждый рендер и провоцирует рефетч.
 */
export function CommentCountsProvider({
  documentIds = EMPTY,
  folderIds = EMPTY,
  slotIds = EMPTY,
  children,
}: CommentCountsProviderProps) {
  const { data: docCounts } = useCommentCounts('document', documentIds)
  const { data: folderCounts } = useCommentCounts('document_folder', folderIds)
  const { data: slotCounts } = useCommentCounts('folder_slot', slotIds)

  const lookup = useMemo<CommentCountLookup>(() => {
    const maps: Partial<Record<CommentEntityType, Map<string, number> | undefined>> = {
      document: docCounts,
      document_folder: folderCounts,
      folder_slot: slotCounts,
    }
    const managed: Partial<Record<CommentEntityType, Set<string>>> = {
      document: new Set(documentIds),
      document_folder: new Set(folderIds),
      folder_slot: new Set(slotIds),
    }
    return (entityType, entityId) => {
      // Управляем только тем, что в пакете; остальное → undefined (свой запрос бейджа).
      if (!managed[entityType]?.has(entityId)) return undefined
      return maps[entityType]?.get(entityId) ?? 0
    }
  }, [docCounts, folderCounts, slotCounts, documentIds, folderIds, slotIds])

  return <CommentCountsContext.Provider value={lookup}>{children}</CommentCountsContext.Provider>
}
