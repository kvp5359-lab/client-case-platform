/**
 * Сервис: «Контекст проекта» — внутренние материалы команды.
 *
 * CRUD над project_context_items + загрузка файлов в bucket 'files'.
 * Сервис НЕ вызывает toast — выбрасывает ошибки, обработка в UI/хуках.
 */

import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { Database } from '@/types/database'

export type ProjectContextItem = Database['public']['Tables']['project_context_items']['Row']
export type ProjectContextItemType = ProjectContextItem['item_type']
export type ProjectContextExtractionStatus = ProjectContextItem['extraction_status']

export interface ProjectContextItemWithFile extends ProjectContextItem {
  file:
    | Pick<
        Database['public']['Tables']['files']['Row'],
        'id' | 'file_name' | 'file_size' | 'mime_type' | 'storage_path' | 'bucket'
      >
    | null
}

interface BaseCreateParams {
  workspaceId: string
  projectId: string
  name: string
}

interface CreateTextParams extends BaseCreateParams {
  contentHtml: string
}

interface CreateFileParams extends BaseCreateParams {
  file: File
  itemType?: 'file' | 'screenshot'
}

async function insertFileRecord(workspaceId: string, projectId: string, file: File) {
  const fileExt = file.name.includes('.') ? file.name.split('.').pop() : null
  const safeExt = fileExt ? `.${fileExt}` : ''
  const fileName = `${crypto.randomUUID()}${safeExt}`
  const storagePath = `${workspaceId}/${projectId}/context/${fileName}`

  const { error: uploadError } = await supabase.storage.from('files').upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadError) {
    throw new Error(`Не удалось загрузить файл: ${uploadError.message}`)
  }

  const { data: fileRecord, error: fileErr } = await supabase
    .from('files')
    .insert({
      workspace_id: workspaceId,
      bucket: 'files',
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
    })
    .select()
    .single()

  if (fileErr || !fileRecord) {
    try {
      await supabase.storage.from('files').remove([storagePath])
    } catch (cleanupErr) {
      logger.error('projectContextService cleanup failed', cleanupErr)
    }
    throw new Error(fileErr?.message || 'Не удалось создать запись файла')
  }
  return fileRecord
}

const SELECT_WITH_FILE = `
  *,
  file:files(id, file_name, file_size, mime_type, storage_path, bucket)
` as const

export async function listProjectContextItems(
  projectId: string,
): Promise<ProjectContextItemWithFile[]> {
  const { data, error } = await supabase
    .from('project_context_items')
    .select(SELECT_WITH_FILE)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ProjectContextItemWithFile[]
}

export async function createTextItem({
  workspaceId,
  projectId,
  name,
  contentHtml,
}: CreateTextParams): Promise<ProjectContextItemWithFile> {
  const { data, error } = await supabase
    .from('project_context_items')
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      name,
      item_type: 'text',
      content_html: contentHtml,
    })
    .select(SELECT_WITH_FILE)
    .single()

  if (error || !data) throw error ?? new Error('Не удалось создать заметку')
  return data as unknown as ProjectContextItemWithFile
}

export async function createFileItem({
  workspaceId,
  projectId,
  name,
  file,
  itemType = 'file',
}: CreateFileParams): Promise<ProjectContextItemWithFile> {
  const fileRecord = await insertFileRecord(workspaceId, projectId, file)

  const { data, error } = await supabase
    .from('project_context_items')
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      name,
      item_type: itemType,
      file_id: fileRecord.id,
    })
    .select(SELECT_WITH_FILE)
    .single()

  if (error || !data) {
    // cleanup: удалить файл и запись о нём
    try {
      await supabase.from('files').delete().eq('id', fileRecord.id)
      await supabase.storage.from('files').remove([fileRecord.storage_path])
    } catch (cleanupErr) {
      logger.error('projectContextService createFileItem cleanup failed', cleanupErr)
    }
    throw error ?? new Error('Не удалось сохранить запись')
  }

  const item = data as unknown as ProjectContextItemWithFile

  // Авто-извлечение текста: fire-and-forget. Если файл не поддерживается
  // (например, тип не аудио/видео/pdf/изображение) — runExtraction просто
  // выставит extraction_status='error', пользователю покажется бейдж ошибки.
  if (canAutoExtract(item)) {
    void runExtraction(item).catch((err) => {
      logger.warn('projectContext auto-extraction failed', err)
    })
  }

  return item
}

/** Можно ли запустить авто-извлечение для записи. */
function canAutoExtract(item: ProjectContextItemWithFile): boolean {
  if (!item.file_id || !item.file) return false
  const mime = item.file.mime_type || ''
  return (
    mime.startsWith('audio/') ||
    mime.startsWith('video/') ||
    mime === 'application/pdf' ||
    mime.startsWith('image/')
  )
}

export async function renameItem(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('project_context_items')
    .update({ name })
    .eq('id', id)
  if (error) throw error
}

export async function updateTextItem(id: string, contentHtml: string): Promise<void> {
  const { error } = await supabase
    .from('project_context_items')
    .update({ content_html: contentHtml })
    .eq('id', id)
  if (error) throw error
}

export async function softDeleteItem(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('project_context_items')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function restoreItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('project_context_items')
    .update({ is_deleted: false, deleted_at: null, deleted_by: null })
    .eq('id', id)
  if (error) throw error
}

export async function hardDeleteItem(id: string): Promise<void> {
  // получаем file_id и storage_path для очистки storage
  const { data: item } = await supabase
    .from('project_context_items')
    .select('file_id, file:files(storage_path)')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('project_context_items').delete().eq('id', id)
  if (error) throw error

  if (item?.file_id && item.file && 'storage_path' in item.file) {
    try {
      await supabase.from('files').delete().eq('id', item.file_id)
      await supabase.storage.from('files').remove([(item.file as { storage_path: string }).storage_path])
    } catch (cleanupErr) {
      logger.error('projectContextService hardDeleteItem cleanup failed', cleanupErr)
    }
  }
}

export interface RunExtractionResult {
  status: ProjectContextExtractionStatus
  extracted_text?: string | null
  error?: string
}

/**
 * Запустить извлечение текста: для аудио/видео — transcribe-audio,
 * для pdf/docx/изображений — extract-text. Результат пишется в extracted_text.
 *
 * Вызывает существующие edge functions с file_id (после расширения их API).
 */
export async function runExtraction(item: ProjectContextItemWithFile): Promise<RunExtractionResult> {
  if (!item.file_id || !item.file) {
    throw new Error('У записи нет файла для обработки')
  }
  const mime = item.file.mime_type || ''
  const isAudioVideo = mime.startsWith('audio/') || mime.startsWith('video/')
  const isDoc =
    mime === 'application/pdf' ||
    mime.includes('officedocument.wordprocessingml.document') ||
    mime === 'application/msword' ||
    mime.startsWith('image/')

  if (!isAudioVideo && !isDoc) {
    throw new Error('Тип файла не поддерживается для извлечения текста')
  }

  const fnName = isAudioVideo ? 'transcribe-audio' : 'extract-text'
  const kind: 'transcribe' | 'extract' = isAudioVideo ? 'transcribe' : 'extract'

  await supabase
    .from('project_context_items')
    .update({
      extraction_status: 'running',
      extraction_kind: kind,
      extraction_error: null,
      extraction_updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)

  try {
    const { data, error } = await supabase.functions.invoke(fnName, {
      body: { file_id: item.file_id },
    })
    if (error) throw error
    const extracted: string | null =
      (data as { text?: string; transcript?: string } | null)?.text ??
      (data as { text?: string; transcript?: string } | null)?.transcript ??
      null

    if (!extracted) {
      throw new Error('Edge function вернул пустой результат')
    }

    await supabase
      .from('project_context_items')
      .update({
        extracted_text: extracted,
        extraction_status: 'done',
        extraction_error: null,
        extraction_updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    return { status: 'done', extracted_text: extracted }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
    await supabase
      .from('project_context_items')
      .update({
        extraction_status: 'error',
        extraction_error: message,
        extraction_updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
    return { status: 'error', error: message }
  }
}
