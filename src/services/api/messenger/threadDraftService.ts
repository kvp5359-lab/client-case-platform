/**
 * Черновики поля ввода на сервере — синхронизация между устройствами.
 *
 * Модель «local-first»: мгновенная запись остаётся в localStorage (работает
 * офлайн и без задержки), сервер — слой синхронизации с debounce. Если писать
 * ТОЛЬКО на сервер, при плохой связи теряются последние набранные слова, а ввод
 * начинает подтормаживать.
 *
 * Файлы черновика не перезагружаются при отправке: храним ссылку на уже
 * загруженный `files.id`, а `message_attachments` создаётся на тот же файл —
 * тот же механизм, что у пересылки сообщений (см. forwardedAttachments).
 */

import { supabase } from '@/lib/supabase'
import { STORAGE_BUCKETS, uploadToStorage, removeFromStorage } from '@/lib/storage'
import type { ForwardedAttachment } from './messengerService'

export type ThreadDraftFile = {
  /** id строки связи (для удаления конкретного файла из черновика). */
  id: string
  fileId: string
  storagePath: string
  fileName: string
  fileSize: number
  mimeType: string
}

export type ThreadDraft = {
  content: string
  files: ThreadDraftFile[]
}

/** Текст черновика треда + время правки (для сверки с локальной версией). */
export async function getThreadDraft(
  threadId: string,
  userId: string,
): Promise<{ content: string; updatedAt: string } | null> {
  const { data, error } = await supabase
    .from('thread_input_drafts')
    .select('content, updated_at')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? { content: data.content, updatedAt: data.updated_at } : null
}

/**
 * Сохранить текст черновика. Пустой текст удаляет строку — так «черновик есть»
 * равно «строка есть», без проверок на пустоту в фильтрах инбокса.
 */
export async function saveThreadDraft(
  threadId: string,
  userId: string,
  content: string,
): Promise<void> {
  if (!content.trim()) {
    await deleteThreadDraftText(threadId, userId)
    return
  }
  const { error } = await supabase
    .from('thread_input_drafts')
    .upsert(
      { thread_id: threadId, user_id: userId, content, updated_at: new Date().toISOString() },
      { onConflict: 'thread_id,user_id' },
    )
  if (error) throw error
}

/** Удалить только текст (файлы черновика остаются). */
export async function deleteThreadDraftText(threadId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('thread_input_drafts')
    .delete()
    .eq('thread_id', threadId)
    .eq('user_id', userId)
  if (error) throw error
}

/** Файлы черновика треда — в порядке прикрепления. */
export async function getThreadDraftFiles(
  threadId: string,
  userId: string,
): Promise<ThreadDraftFile[]> {
  const { data, error } = await supabase
    .from('thread_input_draft_files')
    .select('id, file_id, sort_order, files(storage_path, file_name, file_size, mime_type)')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .order('sort_order')
  if (error) throw error

  type Row = {
    id: string
    file_id: string
    files: {
      storage_path: string
      file_name: string
      file_size: number | null
      mime_type: string | null
    } | null
  }

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.files)
    .map((r) => ({
      id: r.id,
      fileId: r.file_id,
      storagePath: r.files!.storage_path,
      fileName: r.files!.file_name,
      fileSize: r.files!.file_size ?? 0,
      mimeType: r.files!.mime_type ?? 'application/octet-stream',
    }))
}

/**
 * Прикрепить файл к черновику: заливаем в Storage + заводим строку в `files`
 * (как обычное вложение) и связь с черновиком.
 *
 * Путь начинается с workspaceId — этого требуют политики Storage (первая папка
 * обязана быть воркспейсом, иначе 403).
 */
export async function addThreadDraftFile(
  file: File,
  threadId: string,
  userId: string,
  workspaceId: string,
  sortOrder = 0,
): Promise<ThreadDraftFile> {
  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const storagePath = `${workspaceId}/drafts/${threadId}/${userId}/${safeName}`

  const { error: uploadError } = await uploadToStorage(STORAGE_BUCKETS.files, storagePath, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })
  if (uploadError) throw new Error(`Не удалось загрузить файл ${file.name}: ${uploadError.message}`)

  try {
    const { data: fileRow, error: fileError } = await supabase
      .from('files')
      .insert({
        workspace_id: workspaceId,
        bucket: 'files',
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
      })
      .select('id')
      .single()
    if (fileError) throw fileError

    const { data: linkRow, error: linkError } = await supabase
      .from('thread_input_draft_files')
      .insert({
        thread_id: threadId,
        user_id: userId,
        file_id: fileRow.id,
        sort_order: sortOrder,
      })
      .select('id')
      .single()
    if (linkError) throw linkError

    return {
      id: linkRow.id,
      fileId: fileRow.id,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
    }
  } catch (e) {
    // Загруженный файл без записи в БД — мусор в хранилище, убираем сразу.
    await removeFromStorage(STORAGE_BUCKETS.files, [storagePath])
    throw e
  }
}

/** Отвязать файл от черновика (и удалить сам файл — он больше нигде не нужен). */
export async function removeThreadDraftFile(link: ThreadDraftFile): Promise<void> {
  const { error } = await supabase
    .from('thread_input_draft_files')
    .delete()
    .eq('id', link.id)
  if (error) throw error
  // files-строку и объект чистим следом: файл черновика ни на что больше не ссылается.
  await supabase.from('files').delete().eq('id', link.fileId)
  await removeFromStorage(STORAGE_BUCKETS.files, [link.storagePath])
}

/**
 * Убрать все файлы черновика — вместе с объектами в хранилище.
 *
 * Вызывается после отправки/сброса: отправленное сообщение загрузило
 * СОБСТВЕННЫЕ копии файлов, поэтому черновичные больше не нужны и иначе
 * остались бы мусором.
 */
export async function clearThreadDraftFilesWithStorage(
  threadId: string,
  userId: string,
): Promise<void> {
  const files = await getThreadDraftFiles(threadId, userId)
  const { error } = await supabase
    .from('thread_input_draft_files')
    .delete()
    .eq('thread_id', threadId)
    .eq('user_id', userId)
  if (error) throw error
  if (files.length === 0) return
  await supabase
    .from('files')
    .delete()
    .in('id', files.map((f) => f.fileId))
  await removeFromStorage(
    STORAGE_BUCKETS.files,
    files.map((f) => f.storagePath),
  )
}

/** Очистить черновик целиком: текст + файлы (с объектами в хранилище). */
export async function clearThreadDraft(threadId: string, userId: string): Promise<void> {
  await deleteThreadDraftText(threadId, userId)
  await clearThreadDraftFilesWithStorage(threadId, userId)
}

/** Файлы черновика → формат отправки (без повторной загрузки). */
export function draftFilesToForwarded(files: ThreadDraftFile[]): ForwardedAttachment[] {
  return files.map((f) => ({
    file_id: f.fileId,
    file_name: f.fileName,
    file_size: f.fileSize,
    mime_type: f.mimeType,
    storage_path: f.storagePath,
  }))
}

/** Треды, где у пользователя есть непустой черновик (текст ИЛИ файлы). */
export async function getMyDraftThreadIds(userId: string): Promise<string[]> {
  const [texts, files] = await Promise.all([
    supabase.from('thread_input_drafts').select('thread_id').eq('user_id', userId),
    supabase.from('thread_input_draft_files').select('thread_id').eq('user_id', userId),
  ])
  if (texts.error) throw texts.error
  if (files.error) throw files.error
  const ids = new Set<string>()
  for (const r of texts.data ?? []) ids.add(r.thread_id as string)
  for (const r of files.data ?? []) ids.add(r.thread_id as string)
  return [...ids]
}
