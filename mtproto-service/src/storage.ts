/**
 * Единая точка доступа к файловому хранилищу (mtproto-service).
 *
 * Аналог фронтового `src/lib/storage/` и edge `_shared/storage.ts`. При переезде
 * с Supabase Storage на R2/B2 меняются ВНУТРЕННОСТИ этого модуля, а не поиск
 * `.storage.from(...)` по хендлерам. Использует синглтон-клиент из `./db.js`.
 */

import { supabase } from "./db.js"
import { isBucketOnR2, r2Upload, r2Download, r2GetPublicUrl, r2Remove } from "./r2.js"

export const STORAGE_BUCKETS = {
  files: "files",
  documentFiles: "document-files",
  documentTemplates: "document-templates",
  messageAttachments: "message-attachments",
  participantAvatars: "participant-avatars",
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]
export type BucketRef = StorageBucket | (string & {})

interface UploadOptions {
  cacheControl?: string
  upsert?: boolean
  contentType?: string
}

export function storageUpload(
  bucket: BucketRef,
  path: string,
  data: ArrayBuffer | Blob | Buffer | Uint8Array,
  options?: UploadOptions,
) {
  if (isBucketOnR2(bucket)) return r2Upload(bucket, path, data, options)
  return supabase.storage.from(bucket).upload(path, data, options)
}

export function storageDownload(bucket: BucketRef, path: string) {
  if (isBucketOnR2(bucket)) return r2Download(bucket, path)
  return supabase.storage.from(bucket).download(path)
}

export function storageGetPublicUrl(bucket: BucketRef, path: string) {
  if (isBucketOnR2(bucket)) return r2GetPublicUrl(bucket, path)
  return supabase.storage.from(bucket).getPublicUrl(path)
}

export function storageRemove(bucket: BucketRef, paths: string[]) {
  if (isBucketOnR2(bucket)) return r2Remove(bucket, paths)
  return supabase.storage.from(bucket).remove(paths)
}
