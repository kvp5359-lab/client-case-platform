"use client"

/**
 * React Query мутации для комментариев
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commentKeys } from '../queryKeys'
import {
  createComment,
  updateComment,
  deleteComment,
  resolveComment,
  unresolveComment,
} from '@/services/api/commentService'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import type {
  CreateCommentInput,
  UpdateCommentInput,
  CommentThread,
  CommentWithAuthor,
} from '@/types/comments'

/**
 * Создание комментария
 */
export function useCreateComment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CreateCommentInput) => {
      if (!user) throw new Error('Не авторизован')
      return createComment(input, user.id)
    },
    // Optimistic: свой комментарий появляется в треде сразу, не дожидаясь сервера.
    // Временный объект заменится реальным после refetch в onSettled; при ошибке — откат.
    onMutate: async (input) => {
      if (!user) return { previous: undefined, key: undefined }
      const key = commentKeys.byEntity(input.entity_type, input.entity_id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CommentThread[]>(key)

      const now = new Date().toISOString()
      const optimistic: CommentWithAuthor = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        workspace_id: input.workspace_id,
        project_id: input.project_id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        parent_id: input.parent_id ?? null,
        content: input.content,
        is_resolved: false,
        resolved_by: null,
        resolved_at: null,
        created_by: user.id,
        updated_at: now,
        created_at: now,
        author: {
          id: '',
          name:
            (user.user_metadata?.name as string | undefined) ?? user.email ?? 'Вы',
          email: user.email ?? '',
        },
      }

      queryClient.setQueryData<CommentThread[]>(key, (old) => {
        const threads = old ?? []
        if (optimistic.parent_id === null) {
          return [...threads, { root: optimistic, replies: [] }]
        }
        return threads.map((t) =>
          t.root.id === optimistic.parent_id
            ? { ...t, replies: [...t.replies, optimistic] }
            : t,
        )
      })
      return { previous, key }
    },
    onError: (error, _input, context) => {
      if (context?.key && context.previous !== undefined) {
        queryClient.setQueryData(context.key, context.previous)
      }
      logger.error('Ошибка создания комментария:', error)
      toast.error('Не удалось добавить комментарий')
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: commentKeys.byEntity(variables.entity_type, variables.entity_id),
      })
      queryClient.invalidateQueries({
        queryKey: commentKeys.countsAll,
      })
    },
  })
}

/**
 * Обновление комментария
 */
export function useUpdateComment(entityType?: string, entityId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: UpdateCommentInput }) =>
      updateComment(commentId, input),
    onSuccess: () => {
      if (entityType && entityId) {
        queryClient.invalidateQueries({ queryKey: commentKeys.byEntity(entityType, entityId) })
      } else {
        queryClient.invalidateQueries({ queryKey: commentKeys.all })
      }
    },
    onError: (error) => {
      logger.error('Ошибка обновления комментария:', error)
      toast.error('Не удалось обновить комментарий')
    },
  })
}

/**
 * Удаление комментария
 */
export function useDeleteComment(entityType?: string, entityId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => {
      if (entityType && entityId) {
        queryClient.invalidateQueries({ queryKey: commentKeys.byEntity(entityType, entityId) })
      } else {
        queryClient.invalidateQueries({ queryKey: commentKeys.all })
      }
      queryClient.invalidateQueries({ queryKey: commentKeys.countsAll })
    },
    onError: (error) => {
      logger.error('Ошибка удаления комментария:', error)
      toast.error('Не удалось удалить комментарий')
    },
  })
}

/**
 * Отметка треда как выполненного
 */
export function useResolveComment(entityType?: string, entityId?: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (commentId: string) => {
      if (!user) throw new Error('Не авторизован')
      return resolveComment(commentId, user.id)
    },
    onSuccess: () => {
      if (entityType && entityId) {
        queryClient.invalidateQueries({ queryKey: commentKeys.byEntity(entityType, entityId) })
      } else {
        queryClient.invalidateQueries({ queryKey: commentKeys.all })
      }
    },
    onError: (error) => {
      logger.error('Ошибка завершения треда:', error)
      toast.error('Не удалось завершить обсуждение')
    },
  })
}

/**
 * Снятие отметки выполнения
 */
export function useUnresolveComment(entityType?: string, entityId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (commentId: string) => unresolveComment(commentId),
    onSuccess: () => {
      if (entityType && entityId) {
        queryClient.invalidateQueries({ queryKey: commentKeys.byEntity(entityType, entityId) })
      } else {
        queryClient.invalidateQueries({ queryKey: commentKeys.all })
      }
    },
    onError: (error) => {
      logger.error('Ошибка возобновления треда:', error)
      toast.error('Не удалось возобновить обсуждение')
    },
  })
}
