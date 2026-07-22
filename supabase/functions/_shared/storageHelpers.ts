/**
 * Shared Supabase Storage helpers.
 * Используют: compress-document, check-document, google-drive-export-documents,
 * export-to-drive (документы) + отправляющие функции мессенджера (вложения).
 *
 * Имена бакетов — только через STORAGE_BUCKETS (правило `storage.ts`).
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { storageDownload, storageUpload } from "./storage.ts";
import { STORAGE_BUCKETS, type StorageFileInfo } from "./buckets.ts";

export type { StorageFileInfo } from "./buckets.ts";
// Чистый резолв по embed'у (без запроса) — в client-free `buckets.ts`,
// реэкспорт здесь, чтобы у потребителей была одна точка входа.
export { attachmentLocationFromRow, type AttachmentRowWithFile } from "./buckets.ts";

/**
 * Resolve the actual bucket and storage path for a document file.
 * If `fileId` is provided, looks up the `files` table for the real location.
 * Falls back to `fallbackBucket` (default `document-files`) with `filePath`.
 */
export async function resolveFileLocation(
  supabase: SupabaseClient,
  filePath: string,
  fileId?: string | null,
  fallbackBucket: string = STORAGE_BUCKETS.documentFiles,
): Promise<StorageFileInfo> {
  let bucket = fallbackBucket;
  let storagePath = filePath;

  if (fileId) {
    const { data: fileRecord } = await supabase
      .from("files")
      .select("bucket, storage_path")
      .eq("id", fileId)
      .maybeSingle();

    if (fileRecord) {
      bucket = fileRecord.bucket;
      storagePath = fileRecord.storage_path;
    }
  }

  return { bucket, storagePath };
}

/**
 * Где физически лежит ВЛОЖЕНИЕ мессенджера (`message_attachments`).
 *
 * Источник правды — реестр `files` (там и бакет, и путь). Но часть строк его
 * не имеет: приём личного Telegram писал файл в `message-attachments` без
 * записи в реестр. Отсюда fallback именно на `message-attachments`, а НЕ на
 * `files`. Подробности инцидента — ledger 2026-07-22 (4).
 *
 * 🪤 Хардкод бакета в отправляющей функции = тихая потеря вложения (404 →
 * файл молча не уходит клиенту). Любой путь отправки вложения обязан резолвить
 * место здесь. Зеркало фронтового `src/services/files/resolveFileLocation.ts`.
 *
 * Для нескольких вложений одного сообщения — `attachmentLocationFromRow`
 * (один запрос вместо N, см. ниже).
 */
export function resolveAttachmentLocation(
  supabase: SupabaseClient,
  storagePath: string,
  fileId?: string | null,
): Promise<StorageFileInfo> {
  return resolveFileLocation(supabase, storagePath, fileId, STORAGE_BUCKETS.messageAttachments);
}

/**
 * Download a file from Supabase Storage.
 * Resolves the actual bucket/path via `files` table if `fileId` is provided.
 *
 * @returns Blob of the file data
 * @throws Error if download fails
 */
export async function downloadFile(
  supabase: SupabaseClient,
  filePath: string,
  fileId?: string | null,
): Promise<Blob> {
  const { bucket, storagePath } = await resolveFileLocation(supabase, filePath, fileId);

  const { data, error } = await storageDownload(supabase, bucket, storagePath);

  if (error || !data) {
    throw new Error(`Failed to download file: ${error?.message || "Unknown error"}`);
  }

  return data;
}

/**
 * Upload a file to Supabase Storage.
 *
 * @returns void (throws on error)
 */
export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  data: ArrayBuffer | Blob,
  contentType: string,
): Promise<void> {
  const { error } = await storageUpload(supabase, bucket, path, data, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}
