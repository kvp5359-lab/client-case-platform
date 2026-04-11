"use client"

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useErrorHandler } from '@/hooks/shared/useErrorHandler'
import type { DocumentWithFiles } from '@/components/documents'
import { formatSize } from '@/utils/files/formatSize'

interface UseDocumentCompressProps {
  projectId: string
  fetchDocumentKits: (projectId: string) => Promise<void>
  clearSelection: () => void
  addCompressingDoc: (documentId: string) => void
  removeCompressingDoc: (documentId: string) => void
  setCompressProgress: (progress: { current: number; total: number } | null) => void
}

/** Вызов Edge Function compress-document для одного документа */
async function callCompressDocument(
  documentId: string,
  accessToken: string,
): Promise<{ originalSize: number; compressedSize: number; savings: number; newVersion: string }> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/compress-document`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentId, quality: 'recommended' }),
    },
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Неизвестная ошибка' }))
    throw new Error(errorData.error || 'Ошибка сжатия')
  }

  return response.json()
}

export function useDocumentCompress({
  projectId,
  fetchDocumentKits,
  clearSelection,
  addCompressingDoc,
  removeCompressingDoc,
  setCompressProgress,
}: UseDocumentCompressProps) {
  const { handleError } = useErrorHandler()
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup refetch timer on unmount
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    }
  }, [])

  // Сжатие одного PDF документа
  const handleCompressSingleDocument = async (
    documentId: string,
    kitDocuments: DocumentWithFiles[] | undefined,
  ) => {
    const doc = kitDocuments?.find((d) => d.id === documentId)
    if (!doc) {
      toast.error('Документ не найден')
      return
    }

    const currentFile = doc.document_files?.find((f) => f.is_current) || doc.document_files?.[0]
    if (!currentFile) {
      toast.error('У документа нет файлов')
      return
    }

    if (currentFile.mime_type !== 'application/pdf') {
      toast.warning('Сжатие доступно только для PDF файлов')
      return
    }

    try {
      addCompressingDoc(documentId)

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('Необходима авторизация')
        return
      }

      const result = await callCompressDocument(doc.id, session.access_token)

      // Задержка, чтобы БД успела закоммитить транзакцию RPC
      await new Promise((r) => setTimeout(r, 500))
      await fetchDocumentKits(projectId)
      // Повторный рефетч через 1.5с — страховка от PostgREST-кэша
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
      refetchTimerRef.current = setTimeout(() => fetchDocumentKits(projectId), 1500)

      toast.success('Документ сжат!', {
        description: (
          <div className="space-y-1 text-sm">
            <div>
              Было: <span className="font-semibold">{formatSize(result.originalSize)}</span>
            </div>
            <div>
              Стало: <span className="font-semibold">{formatSize(result.compressedSize)}</span>
            </div>
            <div>
              Экономия: <span className="font-semibold">{result.savings}%</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">Версия: {result.newVersion}</div>
          </div>
        ),
        duration: 10000,
        closeButton: true,
      })
    } catch (error) {
      handleError(error, 'Ошибка при сжатии документа')
    } finally {
      removeCompressingDoc(documentId)
    }
  }

  // Пакетное сжатие PDF документов
  const handleBatchCompress = async (
    selectedDocuments: Set<string>,
    kitDocuments: DocumentWithFiles[] | undefined,
  ) => {
    if (selectedDocuments.size === 0) {
      toast.warning('Выберите документы для сжатия')
      return
    }

    try {
      setCompressProgress({ current: 0, total: selectedDocuments.size })

      const documentIds = Array.from(selectedDocuments)
      const selectedDocs = kitDocuments?.filter((doc) => documentIds.includes(doc.id)) || []

      const pdfDocs = selectedDocs.filter((doc) => {
        const currentFile = doc.document_files?.find((f) => f.is_current) || doc.document_files?.[0]
        return currentFile?.mime_type === 'application/pdf'
      })

      if (pdfDocs.length === 0) {
        toast.warning('Среди выбранных документов нет PDF файлов')
        setCompressProgress(null)
        return
      }

      // обновляем total — только PDF-документы, не все выбранные
      if (pdfDocs.length < selectedDocuments.size) {
        setCompressProgress({ current: 0, total: pdfDocs.length })
      }

      let totalOriginalSize = 0
      let totalCompressedSize = 0
      let successCount = 0
      const errors: string[] = []

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('Необходима авторизация')
        setCompressProgress(null)
        clearSelection()
        return
      }

      for (let i = 0; i < pdfDocs.length; i++) {
        const doc = pdfDocs[i]
        addCompressingDoc(doc.id)
        setCompressProgress({ current: i, total: pdfDocs.length })

        try {
          const currentFile =
            doc.document_files?.find((f) => f.is_current) || doc.document_files?.[0]
          if (!currentFile) {
            errors.push(`${doc.name}: нет файлов`)
            removeCompressingDoc(doc.id)
            continue
          }

          const result = await callCompressDocument(doc.id, session.access_token)

          totalOriginalSize += result.originalSize
          totalCompressedSize += result.compressedSize
          successCount++
          setCompressProgress({ current: i + 1, total: pdfDocs.length })
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка'
          errors.push(`${doc.name}: ${errorMsg}`)
        } finally {
          removeCompressingDoc(doc.id)
        }
      }

      // Задержка, чтобы БД успела закоммитить транзакцию RPC
      await new Promise((r) => setTimeout(r, 500))
      await fetchDocumentKits(projectId)
      // Повторный рефетч через 1.5с — страховка от PostgREST-кэша
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
      refetchTimerRef.current = setTimeout(() => fetchDocumentKits(projectId), 1500)
      clearSelection()

      const savings =
        totalOriginalSize > 0
          ? Math.round(((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100)
          : 0

      toast.success(`Документы сжаты! (${successCount})`, {
        description: (
          <div className="space-y-1 text-sm">
            <div>
              Было: <span className="font-semibold">{formatSize(totalOriginalSize)}</span>
            </div>
            <div>
              Стало: <span className="font-semibold">{formatSize(totalCompressedSize)}</span>
            </div>
            <div>
              Экономия: <span className="font-semibold">{savings}%</span>
            </div>
          </div>
        ),
        duration: 10000,
        closeButton: true,
      })
    } catch (error) {
      handleError(error, { userMessage: 'Ошибка при сжатии документов', showToast: false })
      toast.error('Ошибка при сжатии документов', {
        duration: 10000,
        closeButton: true,
      })
    } finally {
      setCompressProgress(null)
    }
  }

  return {
    handleCompressSingleDocument,
    handleBatchCompress,
  }
}
