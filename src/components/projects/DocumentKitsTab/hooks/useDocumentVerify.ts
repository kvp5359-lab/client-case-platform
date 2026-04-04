"use client"

import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { useErrorHandler } from '@/hooks/shared/useErrorHandler'
import { checkDocument } from '@/services/api/googleDriveService'
import { Tables } from '@/types/database'
import { useDocumentKitUIStore } from '@/store/documentKitUI'
import { documentKitKeys } from '@/hooks/queryKeys'

export function useDocumentVerify(
  projectId: string,
  fetchDocumentKits: (id: string) => Promise<void>,
) {
  const queryClient = useQueryClient()
  const { handleError } = useErrorHandler()

  // State
  const documentToEdit = useDocumentKitUIStore((state) => state.documentToEdit)

  // Actions
  const { setCheckingDocument, setSuggestedNames, updateEditForm, updateDocumentTextContent } =
    useDocumentKitUIStore()

  const handleVerifyDocument = async () => {
    if (!documentToEdit) return

    try {
      setCheckingDocument(true)

      // Вызываем сервис для проверки документа
      const result = await checkDocument(documentToEdit.id)

      // Инвалидируем кэш документов, чтобы обновились данные (включая text_content)
      await queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(projectId) })

      const { data: updatedDoc, error: fetchError } = await supabase
        .from('documents')
        .select(
          `
          *,
          document_files(*)
        `,
        )
        .eq('id', documentToEdit.id)
        .single()

      if (fetchError) {
        logger.error('Ошибка загрузки обновлённого документа:', fetchError)
      }

      // Обновляем только documentToEdit и text_content, не сбрасывая форму (name, description, status)
      if (updatedDoc) {
        logger.debug('Обновлённый документ после проверки:', {
          id: updatedDoc.id,
          hasTextContent: !!updatedDoc.text_content,
          textContentLength: updatedDoc.text_content?.length || 0,
        })
        // Обновляем text_content в documentToEdit без пересоздания формы
        updateDocumentTextContent(updatedDoc.text_content ?? null)
      } else {
        logger.warn('Не удалось загрузить обновлённый документ, используем fallback')
        const newTextContent =
          result.text_content !== undefined ? result.text_content : documentToEdit.text_content
        updateDocumentTextContent(newTextContent ?? null)
      }

      // Сохраняем предложенные названия
      if (result.suggested_names && Array.isArray(result.suggested_names)) {
        setSuggestedNames(result.suggested_names)
      }

      // Обновляем описание документа с результатом проверки
      if (result.check_result) {
        updateEditForm('description', result.check_result)
      }

      // Обновляем список документов
      await fetchDocumentKits(projectId)
    } catch (error) {
      handleError(error, 'Ошибка при проверке документа')
    } finally {
      setCheckingDocument(false)
    }
  }

  return {
    handleVerifyDocument,
  }
}
