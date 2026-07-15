/**
 * Единый резолв «где физически лежит файл».
 *
 * Источник правды — реестр `files` (там и бакет, и путь). Но у части старых
 * записей file_id нет, есть только storage_path, а бакет подразумевался по
 * месту использования: у документов это был `document-files`, у вложений
 * мессенджера — `message-attachments`. Отсюда `fallbackBucket` — он нужен
 * ровно для этих легаси-записей.
 *
 * Общий, потому что документы и мессенджер резолвили файл идентичным кодом:
 * разъехавшиеся копии тихо ломали бы открытие/скачивание в одном из мест.
 */

import { supabase } from '@/lib/supabase'
import type { BucketRef } from '@/lib/storage'

export async function resolveFileLocation(
  storagePath: string,
  fileId: string | null | undefined,
  fallbackBucket: BucketRef,
): Promise<{ bucket: string; path: string }> {
  if (!fileId) return { bucket: fallbackBucket, path: storagePath }

  const { data: fileRecord } = await supabase
    .from('files')
    .select('bucket, storage_path')
    .eq('id', fileId)
    .single()

  if (!fileRecord) return { bucket: fallbackBucket, path: storagePath }

  return { bucket: fileRecord.bucket, path: fileRecord.storage_path }
}
