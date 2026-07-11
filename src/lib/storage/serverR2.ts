/**
 * Серверная (Node-runtime) ветка записи файлов в R2 — для кода вне браузера,
 * у которого НЕТ пользовательского JWT (Next API-роуты, напр. приём входящих
 * писем через Resend). Браузерный `r2Client` тут не годится: он ходит через
 * edge-посредник `storage-r2` с юзер-сессией, которой у webhook нет.
 *
 * Здесь ключи R2 берутся из серверного env (`R2_*`, НЕ `NEXT_PUBLIC_*`) и запись
 * идёт прямо в R2 по S3-протоколу (aws4fetch). Флаг переезда — тот же
 * `NEXT_PUBLIC_STORAGE_R2_BUCKETS` (через `isBucketOnR2`), чтобы бакет писался в
 * то же место, откуда фронт его читает.
 *
 * ⚠️ Требует в окружении Next-контейнера (`/opt/clientcase/.env`):
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
 * Без них PUT в R2 вернёт ошибку и вложение будет пропущено (как при любом
 * сбое загрузки) — данные не теряются молча в Supabase.
 */

import { AwsClient } from 'aws4fetch'
import { isBucketOnR2 } from './backend'
import type { BucketRef } from './buckets'

const R2_ENDPOINT = (process.env.R2_ENDPOINT ?? '').replace(/\/+$/, '')

const r2 = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  service: 's3',
  region: 'auto',
})

function objectUrl(bucket: string, path: string): string {
  // filter(Boolean) схлопывает пустые сегменты (`<ws>//<msg>` из личных диалогов
  // без проекта) — как rclone при копировании. Единый ключ на запись/чтение.
  const key = path.replace(/^\/+/, '').split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `${R2_ENDPOINT}/${bucket}/${key}`
}

/** Минимальный контракт service-клиента Supabase для fallback-ветки. */
type StorageCapableClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        data: ArrayBuffer | Blob | Uint8Array | Buffer,
        options?: { upsert?: boolean; contentType?: string },
      ): Promise<{ error: { message: string } | null }>
    }
  }
}

/**
 * Загрузка файла из серверного (Node) кода. Ветвится по флагу бакета:
 * R2 → прямой PUT (aws4fetch), иначе → Supabase Storage через переданный клиент.
 * Возвращает `{ error }` в форме supabase-js.
 */
export async function serverUploadToStorage(
  client: StorageCapableClient,
  bucket: BucketRef,
  path: string,
  data: Uint8Array | ArrayBuffer | Blob | Buffer,
  options?: { upsert?: boolean; contentType?: string },
): Promise<{ error: { message: string } | null }> {
  if (isBucketOnR2(bucket)) {
    const res = await r2.fetch(objectUrl(bucket, path), {
      method: 'PUT',
      headers: { 'Content-Type': options?.contentType ?? 'application/octet-stream' },
      body: data as BodyInit,
    })
    return res.ok ? { error: null } : { error: { message: `R2 PUT ${res.status}` } }
  }
  return client.storage.from(bucket).upload(path, data, options)
}
