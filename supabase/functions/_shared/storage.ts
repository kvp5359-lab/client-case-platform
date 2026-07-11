/**
 * Единая точка доступа к файловому хранилищу (Edge Functions).
 *
 * Аналог фронтового `src/lib/storage/`. Цель — при переезде с Supabase Storage
 * на R2/B2 менять ВНУТРЕННОСТИ этого модуля, а не искать `.storage.from(...)`
 * по всем функциям. Клиент передаётся первым аргументом (в edge он называется
 * по-разному: service / sc / supabaseService / supabaseAdmin).
 *
 * Формы возврата совпадают с Supabase Storage (`{ data, error }`) — намеренно,
 * чтобы конверсия была безопасной. Имена бакетов — только через STORAGE_BUCKETS.
 *
 * Более высокоуровневые `resolveFileLocation`/`downloadFile`/`uploadFile`
 * (files-table-aware) живут в `storageHelpers.ts` — их не дублируем.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  isBucketOnR2,
  r2Upload,
  r2Download,
  r2CreateSignedUrl,
  r2GetPublicUrl,
  r2Remove,
  r2List,
} from "./r2.ts";

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

interface UploadOptions {
  cacheControl?: string;
  upsert?: boolean;
  contentType?: string;
}

/** Загрузить файл. Возвращает `{ data, error }`. */
export function storageUpload(
  client: SupabaseClient,
  bucket: BucketRef,
  // Тело известной длины (BufferSource/Blob) — без ReadableStream: R2 PUT
  // потокового тела без Content-Length падает 411 (см. r2Upload).
  path: string,
  data: ArrayBuffer | Blob | Uint8Array,
  options?: UploadOptions,
) {
  if (isBucketOnR2(bucket)) return r2Upload(bucket, path, data, options);
  return client.storage.from(bucket).upload(path, data, options);
}

/** Скачать файл как Blob. Возвращает `{ data, error }`. */
export function storageDownload(client: SupabaseClient, bucket: BucketRef, path: string) {
  if (isBucketOnR2(bucket)) return r2Download(bucket, path);
  return client.storage.from(bucket).download(path);
}

/** Подписанная ссылка (приватные бакеты). `expiresIn` — секунды. */
export function storageCreateSignedUrl(
  client: SupabaseClient,
  bucket: BucketRef,
  path: string,
  expiresIn: number,
  options?: { download?: string | boolean; transform?: Record<string, unknown> },
) {
  if (isBucketOnR2(bucket)) return r2CreateSignedUrl(bucket, path, expiresIn);
  return client.storage.from(bucket).createSignedUrl(path, expiresIn, options);
}

/** Публичная ссылка (публичные бакеты). Синхронно. */
export function storageGetPublicUrl(client: SupabaseClient, bucket: BucketRef, path: string) {
  if (isBucketOnR2(bucket)) return r2GetPublicUrl(bucket, path);
  return client.storage.from(bucket).getPublicUrl(path);
}

/** Удалить файлы по путям. Возвращает `{ data, error }`. */
export function storageRemove(client: SupabaseClient, bucket: BucketRef, paths: string[]) {
  if (isBucketOnR2(bucket)) return r2Remove(bucket, paths);
  return client.storage.from(bucket).remove(paths);
}

/** Список объектов по префиксу. */
export function storageList(
  client: SupabaseClient,
  bucket: BucketRef,
  prefix?: string,
  options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } },
) {
  if (isBucketOnR2(bucket)) return r2List(bucket, prefix);
  return client.storage.from(bucket).list(prefix, options);
}
