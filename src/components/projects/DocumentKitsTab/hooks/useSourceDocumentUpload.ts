import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { triggerTextExtraction } from '@/services/documents/textExtractionService'
import { getKitIdForFolder } from '@/services/documents/documentKitUtils'
import type { DocumentKit, DocumentKitWithDocuments } from '@/services/api/documents/documentKitService'
import type { SourceDocumentInfo } from '@/components/documents/types'

interface UseSourceDocumentUploadProps {
  kit: DocumentKit | undefined
  allKits: DocumentKitWithDocuments[]
  projectId: string
  workspaceId: string
  fetchDocumentKits: (projectId: string) => Promise<void>
  loadSourceDocuments: () => Promise<void>
  hardDeleteDocument: (documentId: string) => Promise<void>
}

/**
 * Хук для загрузки документов из Google Drive в систему
 * Объединяет логику из handleMoveSourceDocumentToFolder и handleSourceDocDrop
 */
export function useSourceDocumentUpload({
  kit,
  allKits,
  projectId,
  workspaceId,
  fetchDocumentKits,
  loadSourceDocuments,
  hardDeleteDocument,
}: UseSourceDocumentUploadProps) {
  /**
   * Получение и валидация токенов Google Drive
   */
  const getValidTokens = async (): Promise<{
    accessToken: string
    session: { user: { id: string } }
  }> => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) throw new Error('Не авторизован')

    const { data: tokenData, error: tokenError } = await supabase
      .from('google_drive_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (tokenError || !tokenData) {
      throw new Error('Токены Google Drive не найдены. Переподключите Google Drive.')
    }

    const tokenExpiresAt = new Date(tokenData.expires_at).getTime()
    const now = Date.now()
    const bufferMs = 5 * 60 * 1000

    if (tokenExpiresAt <= now + bufferMs) {
      // Попытка рефреша токена через Edge Function
      const { data: refreshData, error: refreshError } = await supabase.functions.invoke(
        'google-drive-refresh-token',
      )

      if (refreshError || !refreshData?.access_token) {
        throw new Error(
          'Токен Google Drive истёк. Обновите подключение в настройках проекта (Google Drive → Переподключить).',
        )
      }

      return { accessToken: refreshData.access_token as string, session }
    }

    return { accessToken: tokenData.access_token, session }
  }

  /**
   * Получение метаданных файла из Google Drive
   */
  const getFileMetadata = async (fileId: string, accessToken: string) => {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!response.ok) throw new Error('Не удалось получить информацию о файле')
    return response.json()
  }

  /**
   * Скачивание файла из Google Drive
   */
  const downloadFile = async (fileId: string, accessToken: string): Promise<Blob> => {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!response.ok) throw new Error('Ошибка скачивания файла с Google Drive')
    return response.blob()
  }

  /**
   * Создание документа и загрузка файла в Storage
   */
  const createDocumentWithFile = async (
    sourceDoc: SourceDocumentInfo,
    folderId: string | null,
    metadata: { name: string; mimeType: string; size: string },
    fileBlob: Blob,
    userId: string,
  ) => {
    const targetKitId = getKitIdForFolder(folderId, allKits, kit?.id)
    if (!targetKitId) throw new Error('Kit не найден')

    // Создаём документ в БД
    const { data: newDoc, error: docError } = await supabase
      .from('documents')
      .insert({
        document_kit_id: targetKitId,
        project_id: projectId,
        workspace_id: workspaceId,
        name: sourceDoc.name.replace(/(?:\.tar)?\.[^/.]+$/, ''),
        folder_id: folderId,
        status: 'pending',
        source_document_id: sourceDoc.sourceDocumentId,
      })
      .select()
      .single()

    if (docError) throw docError

    // Загружаем файл в Storage (бакет 'files')
    const timestamp = Date.now()
    const rawExt = metadata.name.includes('.')
      ? metadata.name.split('.').pop()?.toLowerCase()
      : null
    const fileExt = rawExt && /^[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : 'bin'
    const storagePath = `${workspaceId}/${newDoc.id}/v1_${timestamp}.${fileExt}`
    const fileSize = parseInt(String(metadata.size || '0'), 10)

    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(storagePath, fileBlob, {
        contentType: metadata.mimeType,
        upsert: false,
      })

    if (uploadError) {
      try {
        await hardDeleteDocument(newDoc.id)
      } catch (cleanupError) {
        logger.error('Ошибка очистки документа после неудачной загрузки:', {
          documentId: newDoc.id,
          cleanupError,
        })
      }
      throw new Error(`Ошибка загрузки в Storage: ${uploadError.message}`)
    }

    // Создаём запись в таблице files (единый реестр)
    const { data: filesRecord, error: filesRecordError } = await supabase
      .from('files')
      .insert({
        workspace_id: workspaceId,
        bucket: 'files',
        storage_path: storagePath,
        file_name: metadata.name,
        file_size: fileSize,
        mime_type: metadata.mimeType,
      })
      .select('id')
      .single()

    if (filesRecordError) {
      try {
        await supabase.storage.from('files').remove([storagePath])
        await hardDeleteDocument(newDoc.id)
      } catch (cleanupError) {
        logger.error('Ошибка очистки после неудачной записи файла:', {
          documentId: newDoc.id,
          cleanupError,
        })
      }
      throw new Error(`Ошибка создания записи файла: ${filesRecordError.message}`)
    }

    // Создаём запись document_files с file_id
    const { error: fileRecordError } = await supabase.from('document_files').insert({
      document_id: newDoc.id,
      workspace_id: workspaceId,
      file_path: storagePath,
      file_name: metadata.name,
      file_size: fileSize,
      mime_type: metadata.mimeType,
      uploaded_by: userId,
      file_id: filesRecord.id,
    })

    if (fileRecordError) {
      try {
        await supabase.from('files').delete().eq('id', filesRecord.id)
        await supabase.storage.from('files').remove([storagePath])
        await hardDeleteDocument(newDoc.id)
      } catch (cleanupError) {
        logger.error('Ошибка очистки документа после неудачной записи файла:', {
          documentId: newDoc.id,
          cleanupError,
        })
      }
      throw new Error(`Ошибка создания записи: ${fileRecordError.message}`)
    }

    // Обновляем статус документа
    await supabase.from('documents').update({ status: 'in_progress' }).eq('id', newDoc.id)

    return newDoc
  }

  /**
   * Основная функция: загрузка исходного документа в папку
   * @param sourceDoc - исходный документ из Google Drive
   * @param folderId - ID папки назначения (null для корня)
   * @param showToast - показывать ли toast уведомления
   * @param onPhaseChange - callback для обновления фазы загрузки ('downloading' | 'uploading' | null)
   */
  const uploadSourceDocument = async (
    sourceDoc: SourceDocumentInfo,
    folderId: string | null,
    showToast = true,
    onPhaseChange?: (phase: 'downloading' | 'uploading' | null) => void,
  ): Promise<string | null> => {
    if (!kit) return null

    const toastId = showToast
      ? toast.loading('Перемещение документа из источника...', {
          description: sourceDoc.name,
          duration: 60000,
        })
      : undefined

    try {
      const { accessToken, session } = await getValidTokens()
      const metadata = await getFileMetadata(sourceDoc.id, accessToken)
      onPhaseChange?.('downloading')
      const fileBlob = await downloadFile(sourceDoc.id, accessToken)
      onPhaseChange?.('uploading')

      const newDoc = await createDocumentWithFile(
        sourceDoc,
        folderId,
        metadata,
        fileBlob,
        session.user.id,
      )

      await fetchDocumentKits(projectId)
      await loadSourceDocuments()

      if (newDoc?.id) {
        triggerTextExtraction(newDoc.id)
      }

      if (showToast && toastId) {
        toast.success('Документ перемещён в группу', {
          id: toastId,
          description: sourceDoc.name,
          duration: 4000,
        })
      }
      onPhaseChange?.(null)
      return newDoc?.id ?? null
    } catch (error) {
      logger.error('Ошибка загрузки документа из Google Drive:', error)
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
      if (showToast && toastId) {
        toast.error('Ошибка перемещения', {
          id: toastId,
          description: errorMessage,
          duration: 5000,
        })
      }
      onPhaseChange?.(null)
      return null
    }
  }

  /**
   * Загрузка документа по drag & drop (без toast)
   */
  const uploadSourceDocumentSilent = async (
    sourceDoc: SourceDocumentInfo,
    folderId: string | null,
  ): Promise<string | null> => {
    return uploadSourceDocument(sourceDoc, folderId, false)
  }

  /**
   * Загрузка источника в слот: загружает файл и возвращает ID нового документа
   */
  const uploadSourceDocumentForSlot = async (
    sourceDoc: SourceDocumentInfo,
    folderId: string | null,
  ): Promise<string | null> => {
    if (!kit) return null

    try {
      const { accessToken, session } = await getValidTokens()
      const metadata = await getFileMetadata(sourceDoc.id, accessToken)
      const fileBlob = await downloadFile(sourceDoc.id, accessToken)
      const newDoc = await createDocumentWithFile(
        sourceDoc,
        folderId,
        metadata,
        fileBlob,
        session.user.id,
      )
      // Не вызываем fetchDocumentKits здесь — вызовем после fillSlot в handleSlotDropSourceDoc
      if (newDoc?.id) {
        triggerTextExtraction(newDoc.id)
      }
      return newDoc?.id ?? null
    } catch (error) {
      logger.error('Ошибка загрузки документа из Google Drive в слот:', error)
      return null
    }
  }

  return {
    uploadSourceDocument,
    uploadSourceDocumentSilent,
    uploadSourceDocumentForSlot,
  }
}
