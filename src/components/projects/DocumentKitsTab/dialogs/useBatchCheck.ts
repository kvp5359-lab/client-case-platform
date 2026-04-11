"use client"

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'

/**
 * Результат проверки одного документа
 */
export interface BatchCheckResult {
  documentId: string
  originalName: string
  suggestedName: string
  description: string
  status: string | null
  isChecked: boolean
  isLoading: boolean
  error?: string
}

interface UseBatchCheckOptions {
  open: boolean
  documentIds: string[]
  documentNames: Map<string, string>
  onComplete: () => void
  onClose: () => void
}

export function useBatchCheck({
  open,
  documentIds,
  documentNames,
  onComplete,
  onClose,
}: UseBatchCheckOptions) {
  const queryClient = useQueryClient()
  const [results, setResults] = useState<BatchCheckResult[]>([])
  const [updateNames, setUpdateNames] = useState(true)
  const [updateStatuses, setUpdateStatuses] = useState(false)
  const [batchStatus, setBatchStatus] = useState<string>('none')
  const [isApplying, setIsApplying] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  // Инициализация при открытии
  useEffect(() => {
    if (open && documentIds.length > 0) {
      const initialResults: BatchCheckResult[] = documentIds.map((id) => ({
        documentId: id,
        originalName: documentNames.get(id) || 'Без названия',
        suggestedName: '',
        description: '',
        status: null,
        isChecked: true,
        isLoading: false,
      }))
      setResults(initialResults)
    } else if (!open) {
      setResults([])
      setIsChecking(false)
      setIsApplying(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- documentNames Map recreated each render, but only used for initial population
  }, [open, documentIds])

  /**
   * Запуск пакетной проверки документов
   */
  const startBatchCheck = async (currentResults: BatchCheckResult[]) => {
    setIsChecking(true)
    setResults((prev) => prev.map((r) => ({ ...r, isLoading: true, error: undefined })))

    try {
      const BATCH_SIZE = 3
      for (let i = 0; i < currentResults.length; i += BATCH_SIZE) {
        const batch = currentResults.slice(i, i + BATCH_SIZE)
        await Promise.all(
          batch.map(async (result) => {
            try {
              const { data, error: invokeError } = await supabase.functions.invoke(
                'check-document',
                { body: { document_id: result.documentId } },
              )
              if (invokeError) throw invokeError

              setResults((prev) =>
                prev.map((r) =>
                  r.documentId === result.documentId
                    ? {
                        ...r,
                        suggestedName: data.suggested_names?.[0] || result.originalName,
                        description: data.check_result || '',
                        isLoading: false,
                      }
                    : r,
                ),
              )
            } catch (error) {
              logger.error(`Ошибка проверки документа ${result.documentId}:`, error)
              setResults((prev) =>
                prev.map((r) =>
                  r.documentId === result.documentId
                    ? {
                        ...r,
                        isLoading: false,
                        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
                      }
                    : r,
                ),
              )
            }
          }),
        )
      }
      toast.success('Проверка завершена', { description: 'Результаты готовы к применению' })
    } catch (error) {
      logger.error('Ошибка при пакетной проверке:', error)
      toast.error('Ошибка при проверке документов')
    } finally {
      setIsChecking(false)
    }
  }

  /**
   * Применить изменения к выбранным документам
   */
  const handleApply = async () => {
    const selectedResults = results.filter((r) => r.isChecked && !r.error)
    if (selectedResults.length === 0) {
      toast.error('Выберите хотя бы один документ для применения изменений')
      return
    }

    setIsApplying(true)
    try {
      let successCount = 0
      let errorCount = 0

      await Promise.all(
        selectedResults.map(async (result) => {
          const updateData: { name?: string; description?: string; status?: string | null } = {}

          if (updateNames && result.suggestedName) updateData.name = result.suggestedName
          if (result.description) updateData.description = result.description
          if (updateStatuses && batchStatus !== 'none') updateData.status = batchStatus

          if (Object.keys(updateData).length > 0) {
            try {
              const { error } = await supabase
                .from('documents')
                .update(updateData)
                .eq('id', result.documentId)
              if (error) throw error
              successCount++
            } catch (err) {
              errorCount++
              logger.error(`Ошибка обновления документа ${result.documentId}:`, err)
            }
          } else {
            successCount++
          }
        }),
      )

      await queryClient.invalidateQueries({ queryKey: ['documents'] })

      if (errorCount === 0) {
        toast.success('Изменения применены', {
          description: `Обновлено ${successCount} документ(ов)`,
        })
      } else {
        toast.warning('Частично применено', {
          description: `Обновлено ${successCount}, ошибок: ${errorCount}`,
        })
      }

      onComplete()
      onClose()
    } catch (error) {
      logger.error('Ошибка при применении изменений:', error)
      toast.error('Ошибка при сохранении изменений')
    } finally {
      setIsApplying(false)
    }
  }

  const toggleCheck = (index: number) => {
    setResults((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], isChecked: !updated[index].isChecked }
      return updated
    })
  }

  const toggleAll = (checked: boolean) => {
    setResults((prev) => prev.map((r) => ({ ...r, isChecked: checked })))
  }

  const updateField = (
    index: number,
    field: 'suggestedName' | 'description' | 'status',
    value: string,
  ) => {
    setResults((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const checkedCount = results.filter((r) => r.isChecked).length
  const loadingCount = results.filter((r) => r.isLoading).length
  const errorCount = results.filter((r) => r.error).length

  return {
    results,
    updateNames,
    setUpdateNames,
    updateStatuses,
    setUpdateStatuses,
    batchStatus,
    setBatchStatus,
    isApplying,
    isChecking,
    checkedCount,
    loadingCount,
    errorCount,
    startBatchCheck,
    handleApply,
    toggleCheck,
    toggleAll,
    updateField,
  }
}
