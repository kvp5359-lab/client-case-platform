/**
 * Сервис для работы с документами
 * Инкапсулирует всю логику взаимодействия с Supabase для документов
 *
 * Сервис НЕ вызывает toast — ошибки выбрасываются для обработки в UI-слое.
 */

import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { DocumentError } from '../errors'
import { safeFetchOrThrow, safeDeleteOrThrow, safeUpdateOrThrow } from '../supabase/queryHelpers'
import { logAuditAction } from '../auditService'
import { downloadBlob } from '@/utils/downloadBlob'
import {
  DocumentUploadParams,
  DocumentMoveParams,
  DocumentStatusUpdateParams,
  DocumentReorderParams,
  Document,
  DocumentFile,
} from './types'

/**
 * Загрузка файла документа
 */
export async function uploadDocument({
  file,
  kitId,
  folderId = null,
  status = null,
  projectId,
  workspaceId,
}: DocumentUploadParams): Promise<{ document: Document; file: DocumentFile }> {
  try {
    // 1. Создаем запись документа
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        name: file.name,
        document_kit_id: kitId,
        folder_id: folderId,
        status,
        project_id: projectId,
        workspace_id: workspaceId,
      })
      .select()
      .single()

    if (docError || !document) {
      throw new DocumentError(docError?.message || 'Не удалось создать документ', docError)
    }

    // 2. Загружаем файл в storage (бакет 'files')
    const fileExt = file.name.split('.').pop()
    const fileName = `${crypto.randomUUID()}.${fileExt}`
    const filePath = `${workspaceId}/${projectId}/${kitId}/${fileName}`

    const { error: uploadError } = await supabase.storage.from('files').upload(filePath, file)

    if (uploadError) {
      try {
        await supabase.from('documents').delete().eq('id', document.id)
      } catch (cleanupErr) {
        logger.error('uploadDocument cleanup failed:', cleanupErr)
      }
      throw new DocumentError(uploadError.message, uploadError)
    }

    // 3. Создаем запись в реестре файлов
    const { data: fileRecord, error: fileRecordError } = await supabase
      .from('files')
      .insert({
        workspace_id: workspaceId,
        bucket: 'files',
        storage_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
      })
      .select()
      .single()

    if (fileRecordError || !fileRecord) {
      try {
        await supabase.storage.from('files').remove([filePath])
        await supabase.from('documents').delete().eq('id', document.id)
      } catch (cleanupErr) {
        logger.error('uploadDocument cleanup failed:', cleanupErr)
      }
      throw new DocumentError(
        fileRecordError?.message || 'Не удалось создать запись файла',
        fileRecordError,
      )
    }

    // 4. Создаем запись о файле документа (с file_id)
    const { data: documentFile, error: fileError } = await supabase
      .from('document_files')
      .insert({
        document_id: document.id,
        workspace_id: workspaceId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        is_current: true,
        file_id: fileRecord.id,
      })
      .select()
      .single()

    if (fileError || !documentFile) {
      try {
        await supabase.from('files').delete().eq('id', fileRecord.id)
        await supabase.storage.from('files').remove([filePath])
        await supabase.from('documents').delete().eq('id', document.id)
      } catch (cleanupErr) {
        logger.error('uploadDocument cleanup failed:', cleanupErr)
      }
      throw new DocumentError(fileError?.message || 'Не удалось создать запись о файле', fileError)
    }

    return { document, file: documentFile }
  } catch (error) {
    if (error instanceof DocumentError) throw error
    logger.error('Ошибка загрузки документа:', error)
    throw new DocumentError(
      error instanceof Error ? error.message : 'Неизвестная ошибка загрузки',
      error,
    )
  }
}

/**
 * Перемещение документа в папку
 */
export async function moveDocument({ documentId, folderId }: DocumentMoveParams): Promise<void> {
  await safeUpdateOrThrow(
    supabase.from('documents').update({ folder_id: folderId }).eq('id', documentId),
    'Не удалось переместить документ',
    DocumentError,
  )
}

/**
 * Обновление статуса документа
 */
export async function updateDocumentStatus({
  documentId,
  status,
}: DocumentStatusUpdateParams): Promise<void> {
  await safeUpdateOrThrow(
    supabase.from('documents').update({ status }).eq('id', documentId),
    'Не удалось обновить статус документа',
    DocumentError,
  )
}

/**
 * Мягкое удаление документа (перемещение в корзину)
 */
export async function softDeleteDocument(documentId: string): Promise<void> {
  await safeUpdateOrThrow(
    supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', documentId),
    'Не удалось переместить документ в корзину',
    DocumentError,
  )
}

/**
 * Восстановление документа из корзины
 */
export async function restoreDocument(documentId: string): Promise<void> {
  await safeUpdateOrThrow(
    supabase.from('documents').update({ deleted_at: null }).eq('id', documentId),
    'Не удалось восстановить документ',
    DocumentError,
  )
}

/**
 * Полное удаление документа
 */
export async function hardDeleteDocument(documentId: string): Promise<void> {
  // 1. Получаем все файлы документа с file_id
  const docFiles = await safeFetchOrThrow<{ file_path: string; file_id: string | null }[]>(
    supabase.from('document_files').select('file_path, file_id').eq('document_id', documentId),
    'Не удалось получить файлы документа',
    DocumentError,
  )

  // 2. Для каждого файла проверяем, есть ли другие ссылки
  // Оптимизация: вместо N+1 запросов в цикле — 3 батч-запроса через .in(file_ids).
  if (docFiles && docFiles.length > 0) {
    const fileIds = docFiles
      .map((df) => df.file_id)
      .filter((id): id is string => !!id)

    // Файлы без file_id (legacy): удаляем по file_path из бакета
    const legacyPaths = docFiles.filter((df) => !df.file_id).map((df) => df.file_path)
    if (legacyPaths.length > 0) {
      await supabase.storage.from('document-files').remove(legacyPaths)
    }

    if (fileIds.length > 0) {
      // 2.1. Батч-запрос: ссылки из document_files в других документах
      const [{ data: otherDocFiles }, { data: messageAttachments }, { data: fileRecords }] =
        await Promise.all([
          supabase
            .from('document_files')
            .select('file_id')
            .in('file_id', fileIds)
            .neq('document_id', documentId),
          supabase.from('message_attachments').select('file_id').in('file_id', fileIds),
          supabase.from('files').select('id, bucket, storage_path').in('id', fileIds),
        ])

      // 2.2. Считаем ссылки на каждый file_id
      const refCounts = new Map<string, number>()
      otherDocFiles?.forEach((r) => {
        if (r.file_id) refCounts.set(r.file_id, (refCounts.get(r.file_id) ?? 0) + 1)
      })
      messageAttachments?.forEach((r) => {
        if (r.file_id) refCounts.set(r.file_id, (refCounts.get(r.file_id) ?? 0) + 1)
      })

      // 2.3. Собираем file_id без других ссылок — их удаляем из Storage и files
      const orphanIds = fileIds.filter((id) => (refCounts.get(id) ?? 0) === 0)
      if (orphanIds.length > 0) {
        // Группируем по bucket для батч-удаления из Storage
        const byBucket = new Map<string, string[]>()
        fileRecords?.forEach((f) => {
          if (orphanIds.includes(f.id)) {
            if (!byBucket.has(f.bucket)) byBucket.set(f.bucket, [])
            byBucket.get(f.bucket)!.push(f.storage_path)
          }
        })
        await Promise.all(
          Array.from(byBucket.entries()).map(([bucket, paths]) =>
            supabase.storage.from(bucket).remove(paths),
          ),
        )
        await supabase.from('files').delete().in('id', orphanIds)
      }
    }
  }

  // 3. Удаляем запись документа (document_files удалятся каскадно)
  await safeDeleteOrThrow(
    supabase.from('documents').delete().eq('id', documentId),
    'Не удалось удалить документ',
    DocumentError,
  )
}

/**
 * Изменение порядка документов
 */
export async function reorderDocuments({
  documentId,
  newSortOrder,
}: DocumentReorderParams): Promise<void> {
  await safeUpdateOrThrow(
    supabase.from('documents').update({ sort_order: newSortOrder }).eq('id', documentId),
    'Не удалось изменить порядок документов',
    DocumentError,
  )
}

/**
 * Определяет bucket и path для файла: если есть fileId — из таблицы files, иначе fallback
 */
async function resolveFileBucket(
  filePath: string,
  fileId?: string | null,
): Promise<{ bucket: string; path: string }> {
  let bucket = 'document-files'
  let path = filePath
  if (fileId) {
    const { data: fileRecord } = await supabase
      .from('files')
      .select('bucket, storage_path')
      .eq('id', fileId)
      .single()
    if (fileRecord) {
      bucket = fileRecord.bucket
      path = fileRecord.storage_path
    }
  }
  return { bucket, path }
}

/**
 * Получение signed URL документа для просмотра (для приватных бакетов)
 * URL действителен в течение 1 часа
 */
export async function getDocumentPublicUrl(
  filePath: string,
  fileId?: string | null,
): Promise<string | null> {
  try {
    const { bucket, path } = await resolveFileBucket(filePath, fileId)

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)

    if (error || !data) {
      logger.error('Ошибка создания signed URL:', error)
      return null
    }

    return data.signedUrl
  } catch (error) {
    logger.error('Ошибка при получении signed URL:', error)
    return null
  }
}

/**
 * Скачивание файла документа как Blob
 */
export async function downloadDocumentBlob(
  filePath: string,
  fileId?: string | null,
): Promise<Blob> {
  try {
    const { bucket, path } = await resolveFileBucket(filePath, fileId)

    const { data, error } = await supabase.storage.from(bucket).download(path)

    if (error || !data) {
      throw new DocumentError('Не удалось скачать файл', error)
    }

    return data
  } catch (error) {
    if (error instanceof DocumentError) throw error
    logger.error('Ошибка скачивания файла:', error)
    throw new DocumentError('Не удалось скачать файл', error)
  }
}

/**
 * Открытие документа в новой вкладке через Blob URL
 * Файл скачивается через авторизованный запрос и открывается как blob:
 * — пользователь видит blob:https://app.relostart.com/... вместо signed URL
 * — ссылку нельзя скопировать и передать третьим лицам
 */
export async function openDocumentInNewTab(
  filePath: string,
  fileId?: string | null,
): Promise<void> {
  const blob = await downloadDocumentBlob(filePath, fileId)
  const url = window.URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Освобождаем Object URL после 5 с — задержка нужна, чтобы браузер успел
  // инициировать загрузку blob-данных в новую вкладку. При немедленном revoke
  // вкладка получит пустой/обрывающийся ответ, т.к. blob ещё не прочитан.
  setTimeout(() => window.URL.revokeObjectURL(url), 5000)
}

/**
 * Скачивание файла документа (инициирует скачивание в браузере)
 */
export async function downloadDocumentFile(
  filePath: string,
  fileName: string,
  fileId?: string | null,
): Promise<void> {
  const blob = await downloadDocumentBlob(filePath, fileId)
  downloadBlob(blob, fileName)

  // Аудит-лог скачивания (fire-and-forget)
  logAuditAction('download', 'document', undefined, { file_name: fileName, file_path: filePath })
}

/**
 * Обновление информации о документе
 */
export async function updateDocument(
  documentId: string,
  updates: {
    name?: string
    description?: string
    status?: string | null
  },
): Promise<void> {
  await safeUpdateOrThrow(
    supabase.from('documents').update(updates).eq('id', documentId),
    'Не удалось обновить документ',
    DocumentError,
  )
}
