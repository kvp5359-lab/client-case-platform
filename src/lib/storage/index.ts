/**
 * Единая точка доступа к файловому хранилищу (фронтенд).
 *
 * ЗАЧЕМ: чтобы сменить бэкенд хранилища (например, уехать с Supabase Storage
 * на Cloudflare R2 / Backblaze B2) достаточно переписать ВНУТРЕННОСТИ этого
 * модуля, а не искать `supabase.storage` по всему коду. Все компоненты, хуки и
 * сервисы обращаются к файлам ТОЛЬКО через функции ниже.
 *
 * Возвращаемые формы совпадают с Supabase Storage (`{ data, error }`) — это
 * намеренно: конверсия существующего кода мгновенна и безопасна, а граница
 * абстракции всё равно проходит здесь. При переезде на R2 внутри функций
 * меняется реализация, сигнатуры — нет.
 *
 * Имена бакетов — только через `STORAGE_BUCKETS` (никаких строковых литералов
 * в коде), чтобы переименование/маппинг бакетов тоже жил в одном месте.
 */

import { supabase } from '@/lib/supabase'
import type { BucketRef } from './buckets'
import { isBucketOnR2 } from './backend'
import { r2Upload, r2Download, r2SignedUrl, r2PublicUrl, r2Remove, r2List } from './r2Client'

// Реэкспорт констант/типов бакетов (определены в client-free `./buckets`).
export { STORAGE_BUCKETS } from './buckets'
export type { StorageBucket, BucketRef } from './buckets'

type UploadOptions = {
  cacheControl?: string
  upsert?: boolean
  contentType?: string
}

/** Загрузить файл. Возвращает `{ data, error }` как Supabase. */
export function uploadToStorage(
  bucket: BucketRef,
  path: string,
  file: File | Blob | ArrayBuffer | Uint8Array,
  options?: UploadOptions,
) {
  if (isBucketOnR2(bucket)) return r2Upload(bucket, path, file, options)
  return supabase.storage.from(bucket).upload(path, file, options)
}

/** Скачать файл как Blob. Возвращает `{ data, error }`. */
export function downloadFromStorage(bucket: BucketRef, path: string) {
  if (isBucketOnR2(bucket)) return r2Download(bucket, path)
  return supabase.storage.from(bucket).download(path)
}

/** Создать подписанную ссылку (приватные бакеты). `expiresIn` — секунды. */
export function createStorageSignedUrl(
  bucket: BucketRef,
  path: string,
  expiresIn: number,
  options?: { download?: string | boolean; transform?: Record<string, unknown> },
) {
  if (isBucketOnR2(bucket)) return r2SignedUrl(bucket, path, expiresIn)
  return supabase.storage.from(bucket).createSignedUrl(path, expiresIn, options)
}

/** Публичная ссылка (только для публичных бакетов). Синхронно, как Supabase. */
export function getStoragePublicUrl(bucket: BucketRef, path: string) {
  if (isBucketOnR2(bucket)) return r2PublicUrl(bucket, path)
  return supabase.storage.from(bucket).getPublicUrl(path)
}

/** Удалить файлы по путям. Возвращает `{ data, error }`. */
export function removeFromStorage(bucket: BucketRef, paths: string[]) {
  if (isBucketOnR2(bucket)) return r2Remove(bucket, paths)
  return supabase.storage.from(bucket).remove(paths)
}

/** Список объектов в бакете по префиксу. */
export function listStorage(
  bucket: BucketRef,
  prefix?: string,
  options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } },
) {
  if (isBucketOnR2(bucket)) return r2List(bucket, prefix)
  return supabase.storage.from(bucket).list(prefix, options)
}
