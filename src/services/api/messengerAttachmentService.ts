import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'
import type { MessageAttachment } from './messengerService'

/** Signed URL lifetime for attachments (1 hour) */
const SIGNED_URL_EXPIRY_SEC = 3600

/**
 * Upload file attachments to Storage and create message_attachments records.
 * Parallel upload via Promise.all.
 */
export async function uploadAttachments(
  files: File[],
  messageId: string,
  workspaceId: string,
  projectId: string,
): Promise<MessageAttachment[]> {
  const uploadedPaths: string[] = []

  try {
    const results = await Promise.all(
      files.map(async (file) => {
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
        const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
        const storagePath = `${workspaceId}/${projectId}/${messageId}/${safeFileName}`

        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(storagePath, file, {
            upsert: false,
            contentType: file.type || 'application/octet-stream',
          })

        if (uploadError)
          throw new ConversationError(`Ошибка загрузки файла ${file.name}: ${uploadError.message}`)

        uploadedPaths.push(storagePath)

        const { data: fileRecord, error: fileRecordError } = await supabase
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

        if (fileRecordError)
          throw new ConversationError(`Ошибка создания записи файла: ${fileRecordError.message}`)

        const { data: attachment, error: insertError } = await supabase
          .from('message_attachments')
          .insert({
            message_id: messageId,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || null,
            storage_path: storagePath,
            file_id: fileRecord.id,
          })
          .select('*')
          .single()

        if (insertError)
          throw new ConversationError(`Ошибка сохранения вложения: ${insertError.message}`)

        return attachment as MessageAttachment
      }),
    )

    return results
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
      await supabase.storage
        .from('files')
        .remove(uploadedPaths)
        .then(({ error: cleanupError }) => {
          if (cleanupError) logger.error('Ошибка очистки файлов вложений при откате:', cleanupError)
        })
    }
    throw error
  }
}

/** Resolve bucket and path from file_id or fallback to legacy storage_path */
async function resolveBucketAndPath(
  storagePath: string,
  fileId?: string | null,
): Promise<{ bucket: string; path: string }> {
  let bucket = 'message-attachments'
  let path = storagePath
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
 * Get signed URL for inline viewing in browser.
 */
export async function getAttachmentUrl(
  storagePath: string,
  fileId?: string | null,
): Promise<string> {
  const { bucket, path } = await resolveBucketAndPath(storagePath, fileId)

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC)

  if (error) throw new ConversationError(`Ошибка получения URL: ${error.message}`)

  const url = new URL(data.signedUrl)
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
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw new ConversationError(`Ошибка скачивания файла: ${error.message}`)
  return new File([data], fileName, { type: mimeType || 'application/octet-stream' })
}

/**
 * Download attachment as blob URL (for image previews).
 * Caller MUST call URL.revokeObjectURL(url) on unmount.
 */
export async function downloadAttachmentBlob(
  storagePath: string,
  fileId?: string | null,
): Promise<string> {
  const { bucket, path } = await resolveBucketAndPath(storagePath, fileId)

  const { data, error } = await supabase.storage.from(bucket).download(path)

  if (error) throw new ConversationError(`Ошибка скачивания: ${error.message}`)

  return URL.createObjectURL(data)
}
