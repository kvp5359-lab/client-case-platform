/**
 * Составные запросы для наборов документов (с JOIN-ами)
 */

import { supabase } from '@/lib/supabase'
import { DocumentKitError, createServiceErrorHandler } from '../../errors'
import { safeDeleteOrThrow } from '../../supabase/queryHelpers'
import { logger } from '@/utils/logger'

import type { DocumentKitWithDocuments } from './types'

export type { DocumentKitWithDocuments }

const handleServiceError = createServiceErrorHandler(DocumentKitError)

/**
 * Получение наборов документов с вложенными папками и документами.
 * Использует один вложенный запрос вместо N+1 отдельных запросов.
 */
export async function getDocumentKitsWithContents(
  projectId: string,
): Promise<DocumentKitWithDocuments[]> {
  try {
    const { data, error } = await supabase
      .from('document_kits')
      .select(
        `
        *,
        folders (*),
        documents (
          *,
          document_files (
            id,
            file_name,
            file_path,
            file_size,
            mime_type,
            version,
            is_current,
            is_compressed,
            created_at,
            uploaded_by,
            file_id
          )
        )
      `,
      )
      .eq('project_id', projectId)
      .eq('documents.document_files.is_current', true)
      .order('sort_order', { ascending: true })
      .order('sort_order', { ascending: true, nullsFirst: false, referencedTable: 'folders' })
      .order('created_at', { ascending: true, referencedTable: 'folders' })
      .order('sort_order', { ascending: true, nullsFirst: false, referencedTable: 'documents' })
      .order('created_at', { ascending: true, referencedTable: 'documents' })

    if (error) {
      logger.error('Ошибка загрузки наборов документов с содержимым:', error)
      throw new DocumentKitError('Не удалось загрузить наборы документов', error)
    }

    return (data || []) as DocumentKitWithDocuments[]
  } catch (error) {
    throw handleServiceError('Не удалось загрузить наборы документов', error)
  }
}

/**
 * Удаление набора документов
 */
export async function deleteDocumentKit(documentKitId: string): Promise<void> {
  return safeDeleteOrThrow(
    supabase.from('document_kits').delete().eq('id', documentKitId),
    'Не удалось удалить набор документов',
    DocumentKitError,
  )
}
