import { supabase } from '@/lib/supabase'
import { STORAGE_BUCKETS, createStorageSignedUrl, downloadFromStorage, removeFromStorage, uploadToStorage } from '@/lib/storage'
import { ConversationError } from '@/services/errors/AppError'
import { resolveFileLocation } from '@/services/files/resolveFileLocation'
import { logger } from '@/utils/logger'
import type { MessageAttachment } from './messengerService.types'

/** Signed URL lifetime for attachments (1 hour) */
const SIGNED_URL_EXPIRY_SEC = 3600

/**
 * Upload file attachments to Storage and create message_attachments records.
 *
 * Алгоритм:
 *  1. Параллельные uploads в Storage (как и раньше).
 *  2. Один batch-INSERT в files для всех записей.
 *  3. Один batch-INSERT в message_attachments для всех файлов.
 *
 * Зачем batch вместо N×INSERT: при N отдельных INSERT'ах realtime на
 * message_attachments стреляет N раз, и в баббле файлы появляются по
 * одному с задержкой. Batch — один realtime event, все файлы
 * отображаются разом.
 */
export async function uploadAttachments(
  files: File[],
  messageId: string,
  workspaceId: string,
  projectId: string,
): Promise<MessageAttachment[]> {
  const uploadedPaths: string[] = []

  try {
    // Шаг 1: параллельная загрузка файлов в Storage.
    const uploads = await Promise.all(
      files.map(async (file) => {
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
        const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
        const storagePath = `${workspaceId}/${projectId}/${messageId}/${safeFileName}`

        const { error: uploadError } = await uploadToStorage(STORAGE_BUCKETS.files, storagePath, file, {
            upsert: false,
            contentType: file.type || 'application/octet-stream',
          })

        if (uploadError)
          throw new ConversationError(`Ошибка загрузки файла ${file.name}: ${uploadError.message}`)

        uploadedPaths.push(storagePath)

        return {
          file,
          storagePath,
        }
      }),
    )

    // Шаг 2: batch INSERT в files. Один запрос — N записей. Returning id'ов
    // в том же порядке, что передавали (Supabase так и делает).
    const fileRows = uploads.map((u) => ({
      workspace_id: workspaceId,
      bucket: 'files',
      storage_path: u.storagePath,
      file_name: u.file.name,
      file_size: u.file.size,
      mime_type: u.file.type || 'application/octet-stream',
    }))

    const { data: fileRecords, error: filesError } = await supabase
      .from('files')
      .insert(fileRows)
      .select('id, storage_path')

    if (filesError || !fileRecords)
      throw new ConversationError(`Ошибка создания записей файлов: ${filesError?.message ?? 'unknown'}`)

    // Маппим path → id (чтобы устойчиво к смене порядка returning).
    const pathToFileId = new Map(fileRecords.map((r) => [r.storage_path as string, r.id as string]))

    // Шаг 3: batch INSERT в message_attachments — один realtime event на
    // все файлы вместо N. UI получит все вложения одним апдейтом.
    const attachmentRows = uploads.map((u) => ({
      message_id: messageId,
      file_name: u.file.name,
      file_size: u.file.size,
      mime_type: u.file.type || null,
      storage_path: u.storagePath,
      file_id: pathToFileId.get(u.storagePath) ?? null,
    }))

    const { data: attachments, error: insertError } = await supabase
      .from('message_attachments')
      .insert(attachmentRows)
      .select('*')

    if (insertError || !attachments)
      throw new ConversationError(`Ошибка сохранения вложений: ${insertError?.message ?? 'unknown'}`)

    return attachments as MessageAttachment[]
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase
        .from('message_attachments')
        .delete()
        .eq('message_id', messageId)
        .in('storage_path', uploadedPaths)
        .then(({ error: dbCleanupError }) => {
          if (dbCleanupError)
            logger.error('Ошибка очистки записей вложений при откате:', dbCleanupError)
        })
      await removeFromStorage(STORAGE_BUCKETS.files, uploadedPaths)
        .then(({ error: cleanupError }) => {
          if (cleanupError) logger.error('Ошибка очистки файлов вложений при откате:', cleanupError)
        })
    }
    throw error
  }
}

/**
 * Удалить ФИЗИЧЕСКИЙ файл вложения (storage + запись `files`), ЕСЛИ на него
 * больше никто не ссылается. Считает другие `message_attachments` (кроме самой
 * этой строки — по `id`) и `document_files`. Саму строку `message_attachments`
 * НЕ трогает — только физический файл. Общий код для удаления одного вложения и
 * для правки черновика (снятие галки с файла).
 *
 * Важно: исключение по `id` (а не по `message_id`) — корректно для удаления
 * ОДНОЙ строки вложения. Для удаления ВСЕГО сообщения используется отдельная
 * ветка в `deleteMessage` (исключение по `message_id`, чтобы не считать соседние
 * вложения того же сообщения ложными ссылками).
 */
export async function deleteAttachmentFileIfOrphaned(att: {
  id: string
  storage_path: string
  file_id: string | null
}): Promise<void> {
  if (att.file_id) {
    const { count: maCount } = await supabase
      .from('message_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', att.file_id)
      .neq('id', att.id)
    const { count: dfCount } = await supabase
      .from('document_files')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', att.file_id)
    if ((maCount || 0) + (dfCount || 0) === 0) {
      const { data: fileRecord } = await supabase
        .from('files')
        .select('bucket, storage_path')
        .eq('id', att.file_id)
        .maybeSingle()
      if (fileRecord) {
        await removeFromStorage(fileRecord.bucket, [fileRecord.storage_path])
      }
      await supabase.from('files').delete().eq('id', att.file_id)
    }
  } else {
    // Legacy-путь (file_id=null): файл лежит в bucket message-attachments по storage_path.
    await removeFromStorage(STORAGE_BUCKETS.messageAttachments, [att.storage_path])
  }
}

/** Тип внешнего канала, куда реально ушёл файл/сообщение (резолвится по полям треда). */
export type MessageChannelKind = 'wazzup' | 'mtproto' | 'business' | 'telegram_group' | 'none'

type DeleteAttachmentMessageCtx = {
  id: string
  thread_id: string | null
  content: string | null
  telegram_message_id: number | null
  telegram_message_ids: number[] | null
  telegram_chat_id: number | null
  wazzup_message_id: string | null
}

/** Контекст ОДНОГО вложения (с per-file внешними id, Стадия 2). */
type DeleteAttachmentFileCtx = {
  id: string
  storage_path: string
  file_id: string | null
  telegram_message_id: number | null
  wazzup_message_id: string | null
}

type DeleteAttachmentThreadCtx = {
  mtproto_session_user_id: string | null
  business_connection_id: string | null
  wazzup_channel_id: string | null
} | null

/**
 * Куда реально ушло сообщение/файл. У ИСХОДЯЩИХ `source='web'`, поэтому канал
 * определяется полями треда/сообщения, а не `source`. Порядок — как в триггере
 * `dispatch_message_to_channels`: wazzup → mtproto → business → группа.
 * Переиспользуется удалением одного файла и удалением всего сообщения.
 */
export function resolveMessageChannelKind(
  msg: { wazzup_message_id: string | null; telegram_chat_id: number | null },
  thread: { mtproto_session_user_id: string | null; business_connection_id: string | null } | null,
): MessageChannelKind {
  if (msg.wazzup_message_id) return 'wazzup'
  if (thread?.mtproto_session_user_id) return 'mtproto'
  if (thread?.business_connection_id) return 'business'
  if (msg.telegram_chat_id) return 'telegram_group'
  return 'none'
}

/**
 * Итог удаления одного вложения.
 * `channel`:
 *  - 'deleted' — файл убран и во внешнем канале;
 *  - 'kept' — убран только у нас, в канале остался (см. `reason`);
 *  - 'none' — внешнего канала нет (внутренний тред) — удаление у нас и есть всё.
 * `messageEmptied` — после удаления в сообщении не осталось ни текста, ни файлов,
 *  поэтому пустая запись удалена целиком (UI должен убрать сообщение).
 */
export type DeleteAttachmentResult = {
  channel: 'deleted' | 'kept' | 'none'
  reason?: string
  messageEmptied: boolean
}

/**
 * Удалить ОДИН файл во внешнем канале по его собственному адресу (per-file id).
 * Для одиночного файла адрес совпадает с адресом сообщения, поэтому работает и
 * для старых сообщений. Edge-функции возвращают `{ ok, reason }` — уважаем для
 * честного статуса (Telegram-бот отказывает после 48 ч, WhatsApp — после окна,
 * Business — при отсутствии права).
 */
async function deleteFileInChannel(
  kind: MessageChannelKind,
  msg: DeleteAttachmentMessageCtx,
  att: DeleteAttachmentFileCtx,
): Promise<{ ok: boolean; reason?: string }> {
  // Адрес(а) для удаления: per-file id (точечно) → иначе id сообщения (одиночный файл).
  const tgIds =
    att.telegram_message_id != null
      ? [att.telegram_message_id]
      : msg.telegram_message_ids && msg.telegram_message_ids.length > 0
        ? msg.telegram_message_ids
        : msg.telegram_message_id != null
          ? [msg.telegram_message_id]
          : []
  try {
    if (kind === 'telegram_group') {
      if (tgIds.length === 0 || msg.telegram_chat_id == null)
        return { ok: false, reason: 'нет данных для удаления в Telegram' }
      const { data, error } = await supabase.functions.invoke('telegram-delete-message', {
        body: { telegram_chat_id: msg.telegram_chat_id, telegram_message_ids: tgIds },
      })
      if (error) return { ok: false, reason: 'не удалось удалить в Telegram (возможно, старше 48 часов)' }
      if (data && data.ok === false)
        return { ok: false, reason: data.reason ?? 'Telegram не дал удалить (возможно, старше 48 часов)' }
      return { ok: true }
    }
    if (kind === 'mtproto') {
      if (tgIds.length === 0) return { ok: false, reason: 'нет данных для удаления в Telegram' }
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-delete', {
        body: { message_id: msg.id, telegram_message_ids: tgIds },
      })
      if (error) return { ok: false, reason: 'не удалось удалить в Telegram' }
      if (data && data.ok === false) return { ok: false, reason: data.reason ?? 'не удалось удалить в Telegram' }
      return { ok: true }
    }
    if (kind === 'wazzup') {
      const wid = att.wazzup_message_id ?? msg.wazzup_message_id
      const { data, error } = await supabase.functions.invoke('wazzup-delete', {
        body: { message_id: msg.id, wazzup_message_id: wid },
      })
      if (error) return { ok: false, reason: 'не удалось удалить в WhatsApp (возможно, истёк срок удаления)' }
      if (data && data.ok === false)
        return { ok: false, reason: data.reason ?? 'WhatsApp не дал удалить (возможно, истёк срок)' }
      return { ok: true }
    }
    if (kind === 'business') {
      if (tgIds.length === 0) return { ok: false, reason: 'нет данных для удаления в Business' }
      const { data, error } = await supabase.functions.invoke('telegram-business-delete', {
        body: { message_id: msg.id, telegram_message_ids: tgIds },
      })
      if (error) return { ok: false, reason: 'не удалось удалить в Telegram Business' }
      if (data && data.ok === false)
        return { ok: false, reason: data.reason ?? 'Telegram Business не дал удалить (возможно, нет права на удаление у бота)' }
      return { ok: true }
    }
    return { ok: false, reason: 'канал не поддерживает удаление' }
  } catch (e) {
    logger.error('deleteFileInChannel failed:', e)
    return { ok: false, reason: 'не удалось удалить в канале' }
  }
}

/**
 * Удалить ОДНО вложение сообщения.
 *
 * Всегда убираем файл у нас. Во внешнем канале удаляем, когда это безопасно:
 *  - Wazzup: подпись — отдельное сообщение, любой файл можно удалить точечно;
 *  - TG-группа / MTProto / Business: подпись «висит» на первом файле, поэтому при
 *    наличии текста файл в канале НЕ трогаем (можем задеть подпись) — оставляем + reason;
 *  - адрес файла берём из per-file id (Стадия 2), а для одиночного файла — из адреса
 *    сообщения (работает и для старых сообщений). Старый файл из мультифайла без
 *    адреса — только из сервиса + честная подсказка.
 *
 * Если после удаления сообщение пустое (нет текста и файлов) — удаляем его целиком.
 */
export async function deleteAttachment(
  attachmentId: string,
  messageId: string,
): Promise<DeleteAttachmentResult> {
  const { data: att, error: attErr } = await supabase
    .from('message_attachments')
    .select('id, storage_path, file_id, telegram_message_id, wazzup_message_id')
    .eq('id', attachmentId)
    .eq('message_id', messageId)
    .maybeSingle()
  if (attErr) throw new ConversationError(`Ошибка загрузки вложения: ${attErr.message}`)
  if (!att) return { channel: 'none', messageEmptied: false } // уже удалено
  const attachment = att as DeleteAttachmentFileCtx

  const { data: msg, error: msgErr } = await supabase
    .from('project_messages')
    .select('id, thread_id, content, telegram_message_id, telegram_message_ids, telegram_chat_id, wazzup_message_id')
    .eq('id', messageId)
    .single()
  if (msgErr) throw new ConversationError(`Ошибка загрузки сообщения: ${msgErr.message}`)
  const message = msg as DeleteAttachmentMessageCtx

  const { count: totalCount } = await supabase
    .from('message_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('message_id', messageId)
  const isSingle = (totalCount || 0) <= 1
  const hasText = !!(message.content && message.content.trim())

  let thread: DeleteAttachmentThreadCtx = null
  if (message.thread_id) {
    const { data } = await supabase
      .from('project_threads')
      .select('mtproto_session_user_id, business_connection_id, wazzup_channel_id')
      .eq('id', message.thread_id)
      .maybeSingle()
    thread = (data as DeleteAttachmentThreadCtx) ?? null
  }

  const kind = resolveMessageChannelKind(message, thread)

  let channel: DeleteAttachmentResult['channel'] = 'none'
  let reason: string | undefined
  if (kind === 'none') {
    channel = 'none'
  } else {
    // Wazzup — подпись отдельным сообщением, файл всегда безопасно удалить.
    // TG/MTProto/Business — подпись на первом файле, при тексте не рискуем.
    const captionSafe = kind === 'wazzup' || !hasText
    const perFileId = kind === 'wazzup' ? attachment.wazzup_message_id : attachment.telegram_message_id
    // Адрес файла: per-file id ИЛИ (для одиночного) адрес сообщения.
    const haveAddress = perFileId != null || isSingle
    if (!captionSafe) {
      channel = 'kept'
      reason = 'в сообщении есть текст — файл в канале удалить нельзя, не задев подпись'
    } else if (!haveAddress) {
      channel = 'kept'
      reason = 'файл отправлен до обновления — точечное удаление в канале недоступно'
    } else {
      const res = await deleteFileInChannel(kind, message, attachment)
      channel = res.ok ? 'deleted' : 'kept'
      reason = res.ok ? undefined : res.reason
    }
  }

  // Удаляем файл и запись у нас (порядок: сначала канал выше, потом наша БД).
  await deleteAttachmentFileIfOrphaned(attachment)
  await supabase.from('message_attachments').delete().eq('id', attachment.id)

  const { count: remaining } = await supabase
    .from('message_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('message_id', messageId)
  const messageEmptied = (remaining || 0) === 0 && !hasText
  if (messageEmptied) {
    await supabase.from('project_messages').delete().eq('id', messageId)
  } else {
    await supabase
      .from('project_messages')
      .update({ has_attachments: (remaining || 0) > 0 })
      .eq('id', messageId)
  }

  return { channel, reason, messageEmptied }
}

/**
 * Resolve bucket and path from file_id or fallback to legacy storage_path.
 * Легаси-вложения без file_id лежат в `message-attachments` — он и фолбэк.
 */
function resolveBucketAndPath(
  storagePath: string,
  fileId?: string | null,
): Promise<{ bucket: string; path: string }> {
  return resolveFileLocation(storagePath, fileId, STORAGE_BUCKETS.messageAttachments)
}

/**
 * Браузеры умеют показывать inline только ограниченный набор MIME.
 * Для всего остального лучше форсить download — иначе при `window.open(url)`
 * браузер откроет Save dialog с именем из URL (= storage_path),
 * пользователь видит кривое сгенерированное имя файла.
 */
export function canInlinePreview(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('text/')
  )
}

/**
 * Get signed URL для просмотра/скачивания файла.
 *
 * `download` — браузер сразу скачает файл с этим именем.
 * `inline` — файл открывается во вкладке, но под этим именем: иначе браузер
 * возьмёт имя из адреса (= storage_path) и покажет/скачает кривое имя.
 * Хранилище может inline-имя не поддерживать (Supabase Storage) — тогда
 * откатываемся на чистый signed URL: открыть получится, имя будет прежним.
 */
export async function getAttachmentUrl(
  storagePath: string,
  fileId?: string | null,
  options?: { download?: string | null; inline?: string | null },
): Promise<string> {
  const { bucket, path } = await resolveBucketAndPath(storagePath, fileId)
  const downloadName = options?.download
  const inlineName = options?.inline

  const signed = async (opts?: { download?: string; inline?: string }) => {
    const { data, error } = await createStorageSignedUrl(bucket, path, SIGNED_URL_EXPIRY_SEC, opts)
    if (error) throw new ConversationError(`Ошибка получения URL: ${error.message}`)
    return data.signedUrl
  }

  if (downloadName) return signed({ download: downloadName })

  let signedUrl: string
  if (inlineName) {
    try {
      signedUrl = await signed({ inline: inlineName })
    } catch {
      signedUrl = await signed()
    }
  } else {
    signedUrl = await signed()
  }

  const url = new URL(signedUrl)
  // Без downloadName удаляем param `download`, который Supabase иногда добавляет
  // по умолчанию — он бы превратил preview в скачивание.
  url.searchParams.delete('download')
  return url.toString()
}

/**
 * Download attachment as a File object (for re-editing drafts).
 */
export async function downloadAttachmentAsFile(
  storagePath: string,
  fileName: string,
  mimeType: string | null,
  fileId?: string | null,
): Promise<File> {
  const { bucket, path } = await resolveBucketAndPath(storagePath, fileId)
  const { data, error } = await downloadFromStorage(bucket, path)
  if (error) throw new ConversationError(`Ошибка скачивания файла: ${error.message}`)
  return new File([data], fileName, { type: mimeType || 'application/octet-stream' })
}

/**
 * Download attachment as blob URL (for image previews).
 * Caller MUST call URL.revokeObjectURL(url) on unmount.
 */
/** Скачивает вложение из Storage и отдаёт СЫРОЙ Blob (для упаковки в ZIP и т.п.). */
export async function fetchAttachmentBlob(
  storagePath: string,
  fileId?: string | null,
): Promise<Blob> {
  const { bucket, path } = await resolveBucketAndPath(storagePath, fileId)

  const { data, error } = await downloadFromStorage(bucket, path)

  if (error) throw new ConversationError(`Ошибка скачивания: ${error.message}`)

  return data
}

export async function downloadAttachmentBlob(
  storagePath: string,
  fileId?: string | null,
): Promise<string> {
  const blob = await fetchAttachmentBlob(storagePath, fileId)
  return URL.createObjectURL(blob)
}
