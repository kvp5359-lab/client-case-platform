/**
 * Создание набора документов из папки Google Drive.
 *
 * Корневая папка → набор (document_kits), подпапки первого уровня → папки
 * набора (folders). Файлы из Drive зеркалятся в source_documents с привязкой
 * к набору (document_kit_id) и показываются внутри папок как «лоток»
 * (раскладываются по слотам/папкам перетаскиванием вручную).
 */

import { supabase } from '@/lib/supabase'
import { DocumentKitError } from '../../../errors'
import { logger } from '@/utils/logger'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'
import { callEdgeFunctionRaw } from '@/services/supabase/edgeFunctionClient'
import { syncSourceDocumentsFromDrive } from '@/services/documents/sourceDocumentService'

type DriveFolderStructure = {
  folderId: string
  folderName: string | null
  folders: Array<{ id: string; name: string }>
}

/** Читает структуру папки Google Drive: имя корня + подпапки первого уровня. */
async function fetchDriveFolderStructure(
  folderId: string,
  workspaceId: string,
): Promise<DriveFolderStructure> {
  const response = await callEdgeFunctionRaw({
    functionName: 'google-drive-list-folders',
    body: { folderId, workspaceId },
  }).catch(() => {
    throw new DocumentKitError('Ошибка соединения с сервером')
  })

  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ error: `Ошибка чтения папки (HTTP ${response.status})` }))

    if (err.code === 'NOT_CONNECTED' || err.error?.includes('Google Drive not connected')) {
      throw new DocumentKitError(
        'Google Drive не подключён. Авторизуйтесь через Google Drive в настройках.',
      )
    }
    if (err.code === 'NOT_FOUND') {
      throw new DocumentKitError('Папка не найдена. Проверьте ссылку и доступ к папке.')
    }
    if (err.code === 'NOT_A_FOLDER') {
      throw new DocumentKitError('Ссылка ведёт не на папку Google Drive.')
    }
    throw new DocumentKitError(err.error || 'Не удалось прочитать папку Google Drive')
  }

  return (await response.json()) as DriveFolderStructure
}

/**
 * Создаёт набор документов из папки Google Drive.
 * Возвращает id созданного набора.
 */
export async function createDocumentKitFromDriveFolder(params: {
  link: string
  projectId: string
  workspaceId: string
}): Promise<string> {
  const { link, projectId, workspaceId } = params

  const folderId = extractGoogleDriveFolderId(link)
  if (!folderId) {
    throw new DocumentKitError('Некорректная ссылка на папку Google Drive')
  }

  // 1. Структура папки
  const structure = await fetchDriveFolderStructure(folderId, workspaceId)

  // 2. Порядок нового набора (в конец списка)
  const { data: existingKits } = await supabase
    .from('document_kits')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextSort =
    existingKits && existingKits.length > 0 ? (existingKits[0].sort_order ?? 0) + 1 : 0

  // 3. Набор
  const { data: kit, error: kitError } = await supabase
    .from('document_kits')
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      template_id: null,
      name: structure.folderName?.trim() || 'Набор из Google Drive',
      // Единая связь с Drive-папкой набора (используется для чтения файлов,
      // показа во «Внешних», выкладки). Заполняется и мастером «Создать папки».
      drive_folder_id: folderId,
      sort_order: nextSort,
    })
    .select('id')
    .single()

  if (kitError || !kit) {
    throw new DocumentKitError('Не удалось создать набор документов', kitError)
  }

  // 4. Папки первого уровня
  if (structure.folders.length > 0) {
    const folderRows = structure.folders.map((f, index) => ({
      document_kit_id: kit.id,
      project_id: projectId,
      workspace_id: workspaceId,
      name: f.name,
      folder_template_id: null,
      // Связь папки набора с её Drive-подпапкой (для сопоставления файлов по id
      // и показа во «Внешних»).
      drive_folder_id: f.id,
      sort_order: index,
    }))

    const { error: foldersError } = await supabase.from('folders').insert(folderRows)
    if (foldersError) {
      throw new DocumentKitError('Набор создан, но не удалось создать папки', foldersError)
    }
  }

  // 5. Файлы источника → source_documents (привязка к набору). Best-effort:
  // набор со структурой уже полезен, файлы можно подтянуть повторной синхронизацией.
  try {
    await syncSourceDocumentsFromDrive({
      projectId,
      workspaceId,
      sourceFolderId: folderId,
      documentKitId: kit.id,
      sourceName: structure.folderName?.trim() || null,
      groupByTopLevel: true,
    })
  } catch (error) {
    logger.error('Набор создан, но не удалось загрузить файлы из источника:', error)
  }

  return kit.id
}
