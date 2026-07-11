/**
 * R2-ветка файлового адаптера (браузер).
 *
 * Секретные S3-ключи в браузер класть нельзя, поэтому все операции идут через
 * edge-функцию `storage-r2` (она проверяет доступ и выдаёт presigned-ссылку),
 * после чего браузер качает/льёт файл ПРЯМО в R2 по этой ссылке.
 *
 * Возвращаемые формы совпадают с Supabase Storage (`{ data, error }`), причём
 * это ДИСКРИМИНИРОВАННОЕ объединение (error===null ⇒ data не null) — чтобы
 * `index.ts` мог прозрачно ветвиться, а вызывающий код (`if (error) …; data.x`)
 * типизировался без правок.
 */

import { supabase } from '@/lib/supabase'
import type { BucketRef } from './buckets'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Публичные домены R2 ПО БАКЕТАМ. У R2 один custom-домен = один бакет
 * (домен указывает на корень бакета), поэтому карта `bucket → base`, а ссылка =
 * `<base>/<path>` (без имени бакета в пути). Формат env — список `bucket=url`
 * через запятую: `participant-avatars=https://cdn.clientcase.app,docbuilder=https://...`.
 */
const R2_PUBLIC_BASES: Record<string, string> = Object.fromEntries(
  (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('='))
    .map((pair) => {
      const i = pair.indexOf('=')
      return [pair.slice(0, i).trim(), pair.slice(i + 1).trim().replace(/\/+$/, '')]
    }),
)

type StorageError = { message: string }
/** error===null ⇒ data не null (как в supabase-js v2). */
type Res<T> = { data: T; error: null } | { data: null; error: StorageError }

/** Вызов edge-посредника storage-r2 с пользовательским JWT. */
async function callR2<T = unknown>(
  op: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: T & { error?: string; url?: string } }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch(`${SUPABASE_URL}/functions/v1/storage-r2`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ op, ...payload }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

function errFrom(status: number, body: { error?: string }): StorageError {
  return { message: body.error ? `${body.error} (${status})` : `storage-r2 ${status}` }
}

/** Загрузка: sign_put → прямой PUT в R2. */
export async function r2Upload(
  bucket: BucketRef,
  path: string,
  file: File | Blob | ArrayBuffer | Uint8Array,
  options?: { contentType?: string },
): Promise<Res<{ path: string }>> {
  const { status, body } = await callR2('sign_put', { bucket, path })
  if (!body.url) return { data: null, error: errFrom(status, body) }
  const contentType =
    options?.contentType ?? (file instanceof File ? file.type : undefined) ?? 'application/octet-stream'
  const putRes = await fetch(body.url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file as BodyInit,
  })
  if (!putRes.ok) return { data: null, error: { message: `R2 PUT ${putRes.status}` } }
  return { data: { path }, error: null }
}

/** Скачивание как Blob: sign_get → fetch. */
export async function r2Download(
  bucket: BucketRef,
  path: string,
): Promise<Res<Blob>> {
  const { status, body } = await callR2('sign_get', { bucket, path })
  if (!body.url) return { data: null, error: errFrom(status, body) }
  const res = await fetch(body.url)
  if (!res.ok) return { data: null, error: { message: `R2 GET ${res.status}` } }
  return { data: await res.blob(), error: null }
}

/** Подписанная ссылка (для <img src>/<a href>): sign_get → отдаём URL. */
export async function r2SignedUrl(
  bucket: BucketRef,
  path: string,
  expiresIn: number,
  options?: { download?: string | boolean },
): Promise<Res<{ signedUrl: string }>> {
  // download → response-content-disposition в presigned URL (файл скачается с
  // человеческим именем, паритет с Supabase createSignedUrl({ download })).
  const { status, body } = await callR2('sign_get', {
    bucket,
    path,
    expiresIn,
    ...(options?.download ? { download: options.download } : {}),
  })
  if (!body.url) return { data: null, error: errFrom(status, body) }
  return { data: { signedUrl: body.url }, error: null }
}

/** Публичная ссылка (публичные бакеты) — домен бакета из R2_PUBLIC_BASES. Синхронно, как Supabase. */
export function r2PublicUrl(bucket: BucketRef, path: string): { data: { publicUrl: string } } {
  const key = path.replace(/^\/+/, '')
  const base = R2_PUBLIC_BASES[bucket] ?? ''
  // Fail-fast: без домена получилась бы битая ссылка `/key`, которая молча
  // записалась бы в БД навсегда. Лучше бросить — вызывающий покажет ошибку.
  if (!base) {
    throw new Error(
      `R2 public base не задан для бакета "${bucket}" (NEXT_PUBLIC_R2_PUBLIC_BASE). ` +
        `Публичная ссылка не может быть построена.`,
    )
  }
  return { data: { publicUrl: `${base}/${key}` } }
}

/** Удаление файлов. */
export async function r2Remove(
  bucket: BucketRef,
  paths: string[],
): Promise<Res<unknown>> {
  const { status, body } = await callR2<{ results?: unknown }>('remove', { bucket, paths })
  if (status !== 200) return { data: null, error: errFrom(status, body) }
  return { data: (body as { results?: unknown }).results ?? {}, error: null }
}

/** Список ключей по префиксу. */
export async function r2List(
  bucket: BucketRef,
  prefix?: string,
): Promise<Res<{ name: string }[]>> {
  const { status, body } = await callR2<{ keys?: string[] }>('list', { bucket, prefix })
  if (status !== 200) return { data: null, error: errFrom(status, body) }
  const keys = (body as { keys?: string[] }).keys ?? []
  return { data: keys.map((name) => ({ name })), error: null }
}
