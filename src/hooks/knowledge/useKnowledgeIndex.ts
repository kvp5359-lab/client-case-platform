"use client"

/**
 * Хук для fire-and-forget индексации статьи базы знаний.
 * Вызывает Edge Function knowledge-index с debounce 10 секунд.
 */

import { useRef, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { indexArticle } from '@/services/api/knowledgeSearchService'
import { knowledgeBaseKeys } from '../queryKeys'

const INDEX_DEBOUNCE_MS = 10_000

export function useKnowledgeIndex() {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const indexMutation = useMutation({
    mutationFn: ({ articleId, workspaceId }: { articleId: string; workspaceId: string }) =>
      indexArticle(articleId, workspaceId),
    onSuccess: (_, variables) => {
      toast.success('Индексация завершена')
      queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.indexStatus(variables.articleId),
      })
      queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.article(variables.articleId),
      })
      queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.articles(variables.workspaceId),
      })
    },
    onError: (err) => {
      console.warn('Knowledge indexing failed:', err)
      toast.error('Ошибка индексации', {
        description: err instanceof Error ? err.message : 'Неизвестная ошибка',
      })
    },
  })

  /** Fire-and-forget с debounce 10 секунд */
  const triggerIndex = useCallback(
    (articleId: string, workspaceId: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        indexMutation.mutate({ articleId, workspaceId })
        timerRef.current = null
      }, INDEX_DEBOUNCE_MS)
    },
    [indexMutation],
  )

  // Cleanup timer on unmount to prevent memory leak and firing after component is gone
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  /** Немедленная индексация (без debounce) */
  const indexNow = useCallback(
    (articleId: string, workspaceId: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      indexMutation.mutate({ articleId, workspaceId })
    },
    [indexMutation],
  )

  return {
    triggerIndex,
    indexNow,
    isIndexing: indexMutation.isPending,
  }
}
