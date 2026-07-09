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
export type DocumentSourceRow = Tables<'document_sources'>

export type SourceDocumentWithUsage = {
  isUsed: boolean
} & SourceDocumentRow

/**
 * Список источников проекта (папки Google Drive). Наборные (document_kit_id) и
 * отдельные (null) — вместе.
 */
export async function getDocumentSourcesByProject(
  projectId: string,
): Promise<DocumentSourceRow[]> {
  const { data, error } = await supabase
    .from('document_sources')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    logger.error('Ошибка загрузки источников проекта:', error)
    throw new DocumentError('Не удалось загрузить источники', error)
  }
  return data || []
}

/**
 * Гарантирует запись источника (document_sources) для папки Drive и возвращает id.
 * Идемпотентно по (project_id, drive_folder_id).
 */
export async function ensureDocumentSource(params: {
  projectId: string
  workspaceId: string
  driveFolderId: string
  documentKitId?: string | null
  name?: string | null
}): Promise<string> {
  const { projectId, workspaceId, driveFolderId, documentKitId = null, name = null } = params

  const { data: existing } = await supabase
    .from('document_sources')
    .select('id')
    .eq('project_id', projectId)
    .eq('drive_folder_id', driveFolderId)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: created, error } = await supabase
    .from('document_sources')
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      drive_folder_id: driveFolderId,
      document_kit_id: documentKitId,
      name,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new DocumentError('Не удалось создать источник', error)
  }
  return created.id
}

/**
 * Удаление источника проекта вместе с его файлами-зеркалом.
 */
export async function deleteDocumentSource(sourceId: string): Promise<void> {
  // Файлы-зеркало этого источника (сами документы набора не трогаем)
  await supabase.from('source_documents').delete().eq('source_id', sourceId)
  const { error } = await supabase.from('document_sources').delete().eq('id', sourceId)
  if (error) {
    logger.error('Ошибка удаления источника:', error)
    throw new DocumentError('Не удалось удалить источник', error)
  }
}

export type SyncResult = {
  filesFound: number
  deleted: number
  folderName?: string | null
}

/**
 * Получение ВСЕХ документов-источников проекта (правая панель «Из источника»).
 * Показываются все источники — и привязанные к наборам, и отдельные. Наборные
 * файлы при этом видны и в лотке набора (один файл в двух местах, by design).
 * Скрытие (is_hidden) — общий флаг, синхронно во всех местах.
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
        .eq('is_deleted', false)
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
 * Получение документов-источников, привязанных к конкретному набору документов.
 * Показываются внутри папок набора (под сохранёнными документами).
 */
export async function getSourceDocumentsByKit(documentKitId: string): Promise<{
  documents: SourceDocumentRow[]
  usedSourceIds: Set<string>
}> {
  try {
    const { data: sourceDocs, error: sourceError } = await supabase
      .from('source_documents')
      .select('*')
      .eq('document_kit_id', documentKitId)
      .order('parent_folder_name', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (sourceError) {
      logger.error('Ошибка загрузки документов-источников набора:', sourceError)
      throw new DocumentError('Не удалось загрузить документы-источники набора', sourceError)
    }

    // Использованные source_document_id — среди документов этого набора
    const { data: usedSources, error: usedError } = await supabase
      .from('documents')
      .select('source_document_id')
      .eq('document_kit_id', documentKitId)
      .eq('is_deleted', false)
      .not('source_document_id', 'is', null)

    if (usedError) {
      logger.error('Ошибка загрузки использованных источников набора:', usedError)
      throw new DocumentError('Не удалось загрузить данные об источниках набора', usedError)
    }

    const usedSourceIds = new Set(
      usedSources?.map((d) => d.source_document_id).filter(Boolean) as string[],
    )

    return { documents: sourceDocs || [], usedSourceIds }
  } catch (error) {
    if (error instanceof DocumentError) throw error
    logger.error('Ошибка получения документов-источников набора:', error)
    throw new DocumentError('Не удалось получить документы-источники набора', error)
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
 * Синхронизация документов-источников из Google Drive.
 *
 * `documentKitId`:
 *   - не задан → общий источник проекта (document_kit_id = null), файлы видны
 *     в правой панели «Из источника»;
 *   - задан → файлы привязываются к набору (document_kit_id = kitId) и видны
 *     внутри папок набора.
 * Удаление устаревших ограничено тем же скоупом, чтобы синк одного источника
 * не сносил файлы другого.
 */
export async function syncSourceDocumentsFromDrive(params: {
  projectId: string
  workspaceId: string
  sourceFolderId: string
  documentKitId?: string | null
  /** Имя источника при первом создании записи document_sources. */
  sourceName?: string | null
  /** Относить файлы к подпапке ПЕРВОГО уровня (для наборов из Drive), а не к
   *  ближайшей. Корневые файлы получают пустое имя папки. */
  groupByTopLevel?: boolean
}): Promise<SyncResult> {
  const {
    projectId,
    workspaceId,
    sourceFolderId,
    documentKitId = null,
    sourceName = null,
    groupByTopLevel = false,
  } = params

  // Источник как сущность (document_sources) — создаём при необходимости.
  const sourceId = await ensureDocumentSource({
    projectId,
    workspaceId,
    driveFolderId: sourceFolderId,
    documentKitId,
    name: sourceName,
  })

  try {
    // 1. Получаем файлы из Google Drive через Edge Function
    const response = await callEdgeFunctionRaw({
      functionName: 'google-drive-list-files',
      body: { folderId: sourceFolderId, workspaceId, groupByTopLevel },
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
    const files: (GoogleDriveFile & {
      parentFolderName?: string
      parentFolderId?: string
    })[] = result.files || []
    const folderName: string | null = result.folderName ?? null

    // 2. Upsert документов в БД
    const documentsToUpsert = files.map((file) => ({
      project_id: projectId,
      workspace_id: workspaceId,
      document_kit_id: documentKitId,
      source_id: sourceId,
      google_drive_file_id: file.id,
      name: file.name,
      mime_type: file.mimeType,
      file_size: file.size ? parseInt(file.size) : null,
      parent_folder_name: file.parentFolderName,
      // id Drive-подпапки первого уровня (только в режиме groupByTopLevel);
      // "" (корень) нормализуем в null.
      parent_drive_folder_id: file.parentFolderId ? file.parentFolderId : null,
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

    // 3. Удаление файлов, которых больше нет в Google Drive (batch, N+1 fix).
    // Ограничиваем скоупом источника (по source_id), чтобы синк одного источника
    // не сносил файлы другого.
    const googleDriveFileIds = new Set(files.map((file) => file.id))

    const { data: existingSourceDocs, error: fetchError } = await supabase
      .from('source_documents')
      .select('id, google_drive_file_id')
      .eq('source_id', sourceId)

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
   
  const fileName = unsafeName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()

  return { blob, fileName }
}
