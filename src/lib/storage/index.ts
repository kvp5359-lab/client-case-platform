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

/** Все бакеты хранилища. Строковые литералы бакетов в коде запрещены — только эти константы. */
export const STORAGE_BUCKETS = {
  /** Вложения сообщений + документы проектов (основной бакет). */
  files: 'files',
  /** Легаси-бакет документов проектов. */
  documentFiles: 'document-files',
  /** Шаблоны документов. */
  documentTemplates: 'document-templates',
  /** Вложения мессенджера (часть путей). */
  messageAttachments: 'message-attachments',
  /** Аватары участников (публичный). */
  participantAvatars: 'participant-avatars',
  /** Docbuilder — сгенерированные документы (публичный). */
  docbuilder: 'docbuilder',
  /** Docbuilder — скриншоты (публичный). */
  docbuilderScreenshots: 'docbuilder-screenshots',
  /** Docbuilder — обложки (публичный). */
  docbuilderCovers: 'docbuilder-covers',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]

/**
 * Ссылка на бакет: известная константа (с автодополнением) ЛИБО произвольная
 * строка — потому что часть бакетов приходит из БД (`files.bucket`).
 * `string & {}` сохраняет автоподсказку по константам, но принимает любую строку.
 */
export type BucketRef = StorageBucket | (string & {})

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
  return supabase.storage.from(bucket).upload(path, file, options)
}

/** Скачать файл как Blob. Возвращает `{ data, error }`. */
export function downloadFromStorage(bucket: BucketRef, path: string) {
  return supabase.storage.from(bucket).download(path)
}

/** Создать подписанную ссылку (приватные бакеты). `expiresIn` — секунды. */
export function createStorageSignedUrl(
  bucket: BucketRef,
  path: string,
  expiresIn: number,
  options?: { download?: string | boolean; transform?: Record<string, unknown> },
) {
  return supabase.storage.from(bucket).createSignedUrl(path, expiresIn, options)
}

/** Публичная ссылка (только для публичных бакетов). Синхронно, как Supabase. */
export function getStoragePublicUrl(bucket: BucketRef, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path)
}

/** Удалить файлы по путям. Возвращает `{ data, error }`. */
export function removeFromStorage(bucket: BucketRef, paths: string[]) {
  return supabase.storage.from(bucket).remove(paths)
}

/** Список объектов в бакете по префиксу. */
export function listStorage(
  bucket: BucketRef,
  prefix?: string,
  options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } },
) {
  return supabase.storage.from(bucket).list(prefix, options)
}
