/**
 * Имена бакетов хранилища + чистый резолв места вложения — БЕЗ зависимостей
 * от supabase-клиента и сетевых импортов.
 *
 * Зеркало фронтового `src/lib/storage/buckets.ts` и по той же причине: `storage.ts`
 * тянет `r2.ts` → `https://esm.sh/aws4fetch`, поэтому его нельзя импортировать
 * из общего vitest. Всё, что должно быть покрыто тестами, живёт здесь.
 * Строковые литералы бакетов в коде запрещены — только эти константы.
 */

export const STORAGE_BUCKETS = {
  files: "files",
  documentFiles: "document-files",
  documentTemplates: "document-templates",
  messageAttachments: "message-attachments",
  participantAvatars: "participant-avatars",
  docbuilder: "docbuilder",
  docbuilderScreenshots: "docbuilder-screenshots",
  docbuilderCovers: "docbuilder-covers",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];
export type BucketRef = StorageBucket | (string & {});

export interface StorageFileInfo {
  bucket: string;
  storagePath: string;
}

/** Запись реестра `files`, пришедшая embed'ом. */
export interface EmbeddedFileRow {
  bucket: string | null;
  storage_path: string | null;
}

/**
 * Строка `message_attachments` с embed'ом реестра: `file:files(bucket, storage_path)`.
 *
 * 🪤 `file` объявлен и как объект, и как массив НЕ для красоты: PostgREST для
 * связи many-to-one отдаёт объект, но типы supabase-js в ряде версий выводят
 * массив. Полагаться на одну форму нельзя — при неверной догадке `bucket`
 * молча станет undefined, резолвер уйдёт в fallback и файл не найдётся.
 */
export interface AttachmentRowWithFile {
  storage_path: string;
  file?: EmbeddedFileRow | EmbeddedFileRow[] | null;
}

/**
 * Где физически лежит вложение — БЕЗ запроса: место берётся из embed'а реестра
 * `files`, пришедшего вместе со строкой вложения.
 *
 * 🪤 Fallback — `message-attachments`, а НЕ `files`: приём личного Telegram
 * писал файл туда, не регистрируя в реестре. Хардкод `files` в отправляющей
 * функции = тихая потеря вложения (404 → файл молча не уходит клиенту,
 * инцидент 2026-07-22). Запрашивать так:
 * `.select("file_name, mime_type, storage_path, file:files(bucket, storage_path)")`
 * — FK `message_attachments.file_id → files.id` существует, embed работает.
 *
 * Для одиночного вложения без embed'а — `resolveAttachmentLocation`
 * (`storageHelpers.ts`), он делает лукап сам.
 */
export function attachmentLocationFromRow(row: AttachmentRowWithFile): StorageFileInfo {
  const file = Array.isArray(row.file) ? row.file[0] : row.file;
  const bucket = file?.bucket;
  const path = file?.storage_path;
  if (bucket && path) return { bucket, storagePath: path };
  return { bucket: STORAGE_BUCKETS.messageAttachments, storagePath: row.storage_path };
}
