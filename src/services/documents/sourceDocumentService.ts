/**
 * Сервис для работы с документами-источниками (Google Drive)
 *
 * Сервис НЕ вызывает toast/alert — ошибки выбрасываются для обработки в UI-слое.
 */

import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { DocumentError } from '../errors'
import { callEdgeFunctionRaw } from '../supabase/edgeFunctionClient'
import { Tables } from '@/types/database'
import type { GoogleDriveFile } from './googleDriveTypes'

type SourceDocumentRow = Tables<'source_documents'>

export interface SourceDocumentWithUsage extends SourceDocumentRow {
  isUsed: boolean
}

export interface SyncResult {
  filesFound: number
  deleted: number
  folderName?: string | null
}

/**
 * Получение документов-источников для проекта (общие для всех наборов)
 */
export async function getSourceDocumentsByProject(projectId: string): Promise<{
  documents: SourceDocumentRow[]
  usedSourceIds: Set<string>
}> {
  try {
    const { data: sourceDocs, error: sourceError } = await supabase
      .from('source_documents')
      .select('*')
      .eq('project_id', projectId)
      .order('parent_folder_name', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (sourceError) {
      logger.error('Ошибка загрузки документов-источников:', sourceError)
      throw new DocumentError('Не удалось загрузить документы-источники', sourceError)
    }

    // Собираем использованные source_document_id по ВСЕМ наборам проекта
    const { data: kitIds } = await supabase
      .from('document_kits')
      .select('id')
      .eq('project_id', projectId)

    const allKitIds = (kitIds || []).map((k) => k.id)

    let usedSourceIds = new Set<string>()
    if (allKitIds.length > 0) {
      const { data: usedSources, error: usedError } = await supabase
        .from('documents')
        .select('source_document_id')
        .in('document_kit_id', allKitIds)
        .not('source_document_id', 'is', null)

      if (usedError) {
        logger.error('Ошибка загрузки использованных источников:', usedError)
        throw new DocumentError('Не удалось загрузить данные об источниках', usedError)
      }

      usedSourceIds = new Set(
        usedSources?.map((d) => d.source_document_id).filter(Boolean) as string[],
      )
    }

    return { documents: sourceDocs || [], usedSourceIds }
  } catch (error) {
    if (error instanceof DocumentError) throw error
    logger.error('Ошибка получения документов-источников:', error)
    throw new DocumentError('Не удалось получить документы-источники', error)
  }
}

/**
 * Переключение видимости документа-источника
 */
export async function toggleSourceDocumentHidden(
  sourceDocId: string,
  currentHiddenState: boolean,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('source_documents')
      .update({ is_hidden: !currentHiddenState })
      .eq('id', sourceDocId)

    if (error) {
      logger.error('Ошибка изменения видимости:', error)
      throw new DocumentError('Не удалось изменить видимость документа', error)
    }
  } catch (error) {
    if (error instanceof DocumentError) throw error
    logger.error('Ошибка изменения видимости:', error)
    throw new DocumentError('Не удалось изменить видимость документа', error)
  }
}

/**
 * Скрытие/показ всех документов-источников в папке (по parent_folder_name)
 */
export async function toggleSourceFolderHidden(
  projectId: string,
  folderName: string,
  hide: boolean,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('source_documents')
      .update({ is_hidden: hide })
      .eq('project_id', projectId)
      .eq('parent_folder_name', folderName)

    if (error) {
      logger.error('Ошибка изменения видимости папки:', error)
      throw new DocumentError('Не удалось изменить видимость папки', error)
    }
  } catch (error) {
    if (error instanceof DocumentError) throw error
    logger.error('Ошибка изменения видимости папки:', error)
    throw new DocumentError('Не удалось изменить видимость папки', error)
  }
}

/**
 * Синхронизация документов-источников из Google Drive
 */
export async function syncSourceDocumentsFromDrive(params: {
  projectId: string
  workspaceId: string
  sourceFolderId: string
}): Promise<SyncResult> {
  const { projectId, workspaceId, sourceFolderId } = params

  try {
    // 1. Получаем файлы из Google Drive через Edge Function
    const response = await callEdgeFunctionRaw({
      functionName: 'google-drive-list-files',
      body: { folderId: sourceFolderId, workspaceId },
    }).catch(() => {
      throw new DocumentError('Ошибка соединения с сервером')
    })

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: `Ошибка получения файлов (HTTP ${response.status})` }))

      if (
        errorData.error?.includes('Google Drive API has not been used') ||
        errorData.error?.includes('accessNotConfigured')
      ) {
        throw new DocumentError(
          'Google Drive API не активирован. Включите API в Google Cloud Console и попробуйте снова.',
        )
      }

      if (errorData.error?.includes('Google Drive not connected')) {
        throw new DocumentError(
          'Google Drive не подключен. Необходимо авторизоваться через Google Drive.',
        )
      }

      if (errorData.error?.includes('Google Drive token expired')) {
        throw new DocumentError(
          'Токен Google Drive истёк. Обновите подключение в настройках проекта (Google Drive → Переподключить).',
        )
      }

      throw new DocumentError(errorData.error || 'Ошибка синхронизации')
    }

    const result = await response.json()
    const files: (GoogleDriveFile & { parentFolderName?: string })[] = result.files || []
    const folderName: string | null = result.folderName ?? null

    // 2. Upsert документов в БД
    const documentsToUpsert = files.map((file) => ({
      project_id: projectId,
      workspace_id: workspaceId,
      google_drive_file_id: file.id,
      name: file.name,
      mime_type: file.mimeType,
      file_size: file.size ? parseInt(file.size) : null,
      parent_folder_name: file.parentFolderName,
      web_view_link: file.webViewLink,
      icon_link: file.iconLink,
      created_time: file.createdTime,
      modified_time: file.modifiedTime,
      synced_at: new Date().toISOString(),
    }))

    const { error: upsertError } = await supabase
      .from('source_documents')
      .upsert(documentsToUpsert, {
        onConflict: 'project_id,google_drive_file_id',
        ignoreDuplicates: false,
      })

    if (upsertError) {
      throw new DocumentError('Ошибка сохранения документов в базу данных', upsertError)
    }

    // 3. Удаление файлов, которых больше нет в Google Drive (batch, N+1 fix)
    const googleDriveFileIds = new Set(files.map((file) => file.id))

    const { data: existingSourceDocs, error: fetchError } = await supabase
      .from('source_documents')
      .select('id, google_drive_file_id')
      .eq('project_id', projectId)

    if (fetchError) {
      throw new DocumentError('Ошибка получения списка документов из БД', fetchError)
    }

    const docsToDelete = (existingSourceDocs || []).filter(
      (doc) => !googleDriveFileIds.has(doc.google_drive_file_id),
    )

    if (docsToDelete.length > 0) {
      const idsToDelete = docsToDelete.map((d) => d.id)

      // Batch DELETE вместо цикла (ON DELETE SET NULL обработает связи в documents)
      const { error: deleteError } = await supabase
        .from('source_documents')
        .delete()
        .in('id', idsToDelete)

      if (deleteError) {
        logger.error('Ошибка удаления устаревших документов:', deleteError)
      }
    }

    return {
      filesFound: files.length,
      deleted: docsToDelete.length,
      folderName,
    }
  } catch (error) {
    if (error instanceof DocumentError) throw error
    logger.error('Ошибка синхронизации источника:', error)
    throw new DocumentError(
      error instanceof Error ? error.message : 'Ошибка при синхронизации источника',
      error,
    )
  }
}

/**
 * Получение токена Google Drive для текущего пользователя
 */
export async function getGoogleDriveToken(userId: string): Promise<{
  access_token: string
  refresh_token: string
  expires_at: string
}> {
  const { data: tokenData, error: tokenError } = await supabase
    .from('google_drive_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (tokenError) {
    throw new DocumentError('Ошибка получения токенов Google Drive', tokenError)
  }

  if (!tokenData) {
    throw new DocumentError('Токены Google Drive не найдены. Переподключите Google Drive.')
  }

  return tokenData
}

/**
 * Обновление access token через серверную Edge Function.
 * client_secret хранится только на сервере (не в клиентском коде).
 * Возвращает актуальный access_token.
 */
export async function refreshGoogleDriveTokenIfNeeded(
  token: { access_token: string; refresh_token: string; expires_at: string },
  _userId: string,
): Promise<string> {
  const tokenExpiresAt = new Date(token.expires_at).getTime()
  const now = Date.now()
  const bufferMs = 5 * 60 * 1000

  if (tokenExpiresAt > now + bufferMs) {
    return token.access_token
  }

  // Refresh через Edge Function (client_secret только на сервере)
  const { data, error } = await supabase.functions.invoke('google-drive-refresh-token')

  if (error) {
    throw new DocumentError('Не удалось обновить токен Google Drive. Переподключите аккаунт.')
  }

  if (!data?.access_token) {
    throw new DocumentError(data?.error || 'Не удалось обновить токен Google Drive.')
  }

  return data.access_token
}

/**
 * Скачивание файла из Google Drive по fileId
 * Возвращает Blob и имя файла
 */
export async function downloadGoogleDriveFile(
  fileId: string,
  accessToken: string,
): Promise<{ blob: Blob; fileName: string }> {
  // Валидация fileId (допустимы буквы, цифры, дефисы, подчёркивания)
  if (!fileId || !/^[\w-]+$/.test(fileId)) {
    throw new DocumentError('Некорректный ID файла Google Drive')
  }

  // Получаем метаданные файла
  const metadataResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  if (!metadataResponse.ok) {
    throw new DocumentError('Не удалось получить информацию о файле')
  }

  const metadata = await metadataResponse.json()

  // Скачиваем файл
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  if (!response.ok) {
    throw new DocumentError('Ошибка скачивания файла')
  }

  const blob = await response.blob()

  if (blob.size === 0) {
    throw new DocumentError('Файл пустой')
  }

  // Безопасное имя файла без control-символов и недопустимых символов Windows/Unix
  const unsafeName = metadata.name || 'document'
  // Символы: < > : " / \ | ? * и управляющие символы (код 0-31 в Unicode)
  // eslint-disable-next-line no-control-regex
  const fileName = unsafeName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()

  return { blob, fileName }
}
