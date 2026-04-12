"use client"

/**
 * Фабрика для optimistic-мутаций с автоматическим rollback и invalidation.
 *
 * Устраняет бойлерплейт: cancel → snapshot → setQueryData → onError rollback → onSettled invalidate.
 * Используется в useDocumentKitsQuery и подобных хуках.
 */

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'

interface OptimisticMutationConfig<TData, TVariables> {
  /** Ключ кэша для optimistic update */
  queryKey: (variables: TVariables) => QueryKey
  /** Серверная операция */
  mutationFn: (variables: TVariables) => Promise<unknown>
  /** Оптимистичная трансформация кэша */
  optimisticUpdate: (old: TData | undefined, variables: TVariables) => TData | undefined
  /** Текст ошибки для toast и логов */
  errorMessage: string
  /** Текст успеха (если не нужен — не передавать) */
  successMessage?: string
  /** Дополнительные ключи для инвалидации */
  extraInvalidateKeys?: (variables: TVariables) => QueryKey[]
}

export function useOptimisticMutation<TData, TVariables>(
  config: OptimisticMutationConfig<TData, TVariables>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: config.mutationFn,
    onMutate: async (variables) => {
      const key = config.queryKey(variables)
      await queryClient.cancelQueries({ queryKey: key })
      const previousData = queryClient.getQueryData<TData>(key)
      queryClient.setQueryData<TData>(key, (old) => config.optimisticUpdate(old, variables))
      return { previousData }
    },
    onError: (error, variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(config.queryKey(variables), context.previousData)
      }
      logger.error(`${config.errorMessage}:`, error)
      toast.error(config.errorMessage)
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: config.queryKey(variables) })
      config.extraInvalidateKeys?.(variables).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key })
      })
    },
    onSuccess: () => {
      if (config.successMessage) {
        toast.success(config.successMessage)
      }
    },
  })
}
