"use client"

/**
 * React Query хуки для загрузки комментариев
 */

import { useQuery } from '@tanstack/react-query'
import { commentKeys } from '../queryKeys'
import { getCommentsByEntity, getCommentCounts } from '@/services/api/commentService'
import type { CommentEntityType } from '@/types/comments'
import { STALE_TIME } from '@/hooks/queryKeys'

/**
 * Загрузка тредов комментариев по сущности
 */
export function useComments(entityType: CommentEntityType, entityId: string, workspaceId: string) {
  return useQuery({
    queryKey: commentKeys.byEntity(entityType, entityId),
    queryFn: () => getCommentsByEntity(entityType, entityId, workspaceId),
    enabled: !!entityId && !!workspaceId,
    staleTime: STALE_TIME.SHORT,
  })
}

/**
 * Пакетная загрузка счётчиков комментариев для списка сущностей
 */
export function useCommentCounts(entityType: CommentEntityType, entityIds: string[]) {
  return useQuery({
    queryKey: commentKeys.counts(entityType, entityIds),
    queryFn: () => getCommentCounts(entityType, entityIds),
    enabled: entityIds.length > 0,
    staleTime: STALE_TIME.STANDARD,
  })
}
