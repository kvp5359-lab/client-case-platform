/**
 * Сервис для работы с Google Drive
 * Инкапсулирует вызовы Edge Functions и Realtime-подписки
 */

import { supabase } from '@/lib/supabase'
import { GoogleDriveError } from '../errors'
import { logger } from '@/utils/logger'
import type { RealtimeChannel } from '@supabase/supabase-js'

// === ТИПЫ ===

interface ExportDocumentPayload {
  document_id: string
  file_path: string
  file_name: string
  mime_type: string
  folder_name?: string
}

interface ExportDocumentsParams {
  folderId: string
  syncMode: 'replace_all' | 'add_only' | 'replace_existing'
  sessionId: string
  workspaceId: string
  documents: ExportDocumentPayload[]
}

interface ExportDocumentsResult {
  results: Array<{
    success: boolean
    document_id: string
    error?: string
  }>
  success_count: number
}

interface ExportToDestinationParams {
  projectId: string
  workspaceId: string
  exportFolderId: string
}

interface ExportToDestinationResult {
  deleted: number
  folders: number
  files: number
  created: number
}

interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
  iconLink?: string
  parentFolderName?: string
}

interface CheckDocumentResult {
  check_result: string
  checked_at: string
  suggested_names?: string[]
  text_content?: string
}

interface ExportProgressPayload {
  document_id: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  error_message?: string
}

// === ВНУТРЕННИЙ ХЕЛПЕР ===

/**
 * Универсальный вызов Edge Function с авторизацией
 * Получает сессию, формирует fetch-запрос и обрабатывает ответ
 */
async function getAccessToken(functionName: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.access_token) return session.access_token

  // Session может быть протухшей — пробуем обновить
  const { data: refreshed } = await supabase.auth.refreshSession()
  if (refreshed.session?.access_token) return refreshed.session.access_token

  throw new GoogleDriveError('Необходима авторизация', { functionName })
}

async function callEdgeFunctionWithToken<T>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<Response> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  })
}

async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  let accessToken = await getAccessToken(functionName)
  let response = await callEdgeFunctionWithToken<T>(functionName, body, accessToken)

  // При 401 — токен мог протухнуть, обновляем и повторяем один раз
  if (response.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed.session?.access_token) {
      accessToken = refreshed.session.access_token
      response = await callEdgeFunctionWithToken<T>(functionName, body, accessToken)
    }
  }

  if (!response.ok) {
    let errorData: Record<string, unknown> | undefined
    try {
      errorData = await response.json()
    } catch {
      // Response body is not JSON — ignore
    }
    throw new GoogleDriveError(
      (errorData?.error as string) || `Ошибка вызова ${functionName} (HTTP ${response.status})`,
      { functionName, status: response.status, data: errorData },
    )
  }

  let data: T
  try {
    data = await response.json()
  } catch {
    throw new GoogleDriveError(`Некорректный ответ от ${functionName}`, {
      functionName,
      status: response.status,
    })
  }
  return data
}

// === ПУБЛИЧНЫЕ ФУНКЦИИ ===

/**
 * Получение названия папки Google Drive по её ID
 */
export async function getFolderName(folderId: string, workspaceId: string): Promise<string | null> {
  try {
    const data = await callEdgeFunction<{ name?: string }>('google-drive-get-folder-name', {
      folderId,
      workspaceId,
    })
    return data.name ?? null
  } catch (error) {
    if (error instanceof GoogleDriveError) throw error
    logger.error('[GoogleDrive] Ошибка получения названия папки:', error)
    throw new GoogleDriveError('Не удалось получить название папки', error)
  }
}

/**
 * Получение списка файлов из папки Google Drive
 */
export async function listFiles(folderId: string, workspaceId: string): Promise<GoogleDriveFile[]> {
  try {
    const data = await callEdgeFunction<{ files?: GoogleDriveFile[] }>('google-drive-list-files', {
      folderId,
      workspaceId,
    })
    return data.files ?? []
  } catch (error) {
    if (error instanceof GoogleDriveError) throw error
    logger.error('[GoogleDrive] Ошибка получения списка файлов:', error)
    throw new GoogleDriveError('Не удалось получить список файлов', error)
  }
}

/**
 * Экспорт документов в указанную папку Google Drive
 * Используется при ручном экспорте выбранных документов
 */
export async function exportDocuments(
  params: ExportDocumentsParams,
): Promise<ExportDocumentsResult> {
  try {
    return await callEdgeFunction<ExportDocumentsResult>('google-drive-export-documents', {
      folder_id: params.folderId,
      sync_mode: params.syncMode,
      session_id: params.sessionId,
      workspace_id: params.workspaceId,
      documents: params.documents,
    })
  } catch (error) {
    if (error instanceof GoogleDriveError) throw error
    logger.error('[GoogleDrive] Ошибка экспорта документов:', error)
    throw new GoogleDriveError('Не удалось экспортировать документы', error)
  }
}

/**
 * Экспорт документов в папку назначения (destination folder)
 * Используется для синхронизации набора документов с Google Drive
 */
export async function exportToDestination(
  params: ExportToDestinationParams,
): Promise<ExportToDestinationResult> {
  try {
    return await callEdgeFunction<ExportToDestinationResult>('export-to-drive', {
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      exportFolderId: params.exportFolderId,
    })
  } catch (error) {
    if (error instanceof GoogleDriveError) throw error
    logger.error('[GoogleDrive] Ошибка экспорта в папку назначения:', error)
    throw new GoogleDriveError('Не удалось экспортировать в папку назначения', error)
  }
}

/**
 * Проверка документа через AI (Edge Function check-document)
 */
export async function checkDocument(documentId: string): Promise<CheckDocumentResult> {
  try {
    return await callEdgeFunction<CheckDocumentResult>('check-document', {
      document_id: documentId,
    })
  } catch (error) {
    if (error instanceof GoogleDriveError) throw error
    logger.error('[GoogleDrive] Ошибка проверки документа:', error)
    throw new GoogleDriveError('Не удалось проверить документ', error)
  }
}

/**
 * Подписка на Realtime-обновления прогресса экспорта
 * Создаёт канал Supabase Realtime, слушающий INSERT в таблицу export_progress
 *
 * @returns RealtimeChannel для последующей отписки через supabase.removeChannel()
 */
export function subscribeToExportProgress(
  sessionId: string,
  onUpdate: (payload: ExportProgressPayload) => void,
): RealtimeChannel | null {
  try {
    return supabase
      .channel(`export-progress-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'export_progress',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const data = payload.new as ExportProgressPayload
          logger.debug(`[GoogleDrive] Progress update: ${data.document_id} -> ${data.status}`)
          onUpdate(data)
        },
      )
      .subscribe()
  } catch (error) {
    logger.error('[GoogleDrive] Ошибка подписки на обновления прогресса:', error)
    return null
  }
}

/**
 * Очистка записей прогресса экспорта после завершения
 */
export async function cleanupExportProgress(sessionId: string): Promise<void> {
  try {
    await supabase.from('export_progress').delete().eq('session_id', sessionId)
  } catch (error) {
    logger.error('[GoogleDrive] Ошибка очистки записей прогресса:', error)
  }
}
