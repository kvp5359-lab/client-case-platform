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
import type { CreateCommentInput, UpdateCommentInput } from '@/types/comments'

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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: commentKeys.byEntity(variables.entity_type, variables.entity_id),
      })
      queryClient.invalidateQueries({
        queryKey: ['comments', 'counts'],
      })
    },
    onError: (error) => {
      logger.error('Ошибка создания комментария:', error)
      toast.error('Не удалось добавить комментарий')
    },
  })
}

/**
 * Обновление комментария
 */
export function useUpdateComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: UpdateCommentInput }) =>
      updateComment(commentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.all })
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
export function useDeleteComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.all })
      queryClient.invalidateQueries({ queryKey: ['comments', 'counts'] })
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
export function useResolveComment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (commentId: string) => {
      if (!user) throw new Error('Не авторизован')
      return resolveComment(commentId, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.all })
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
export function useUnresolveComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (commentId: string) => unresolveComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.all })
    },
    onError: (error) => {
      logger.error('Ошибка возобновления треда:', error)
      toast.error('Не удалось возобновить обсуждение')
    },
  })
}
